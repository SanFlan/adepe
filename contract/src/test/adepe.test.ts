/**
 * The contract against a real network.
 *
 * `src/lib/*.test.ts` in ../app already runs the circuits in-process, which covers the
 * logic. What only a real network covers is the rest of the pipeline: proof generation on
 * the proof server, transaction submission, and the indexer's view of the resulting
 * ledger. So this test stays deliberately thin -- one pass down the happy path, plus the
 * two rejections that matter -- rather than restating the unit tests slowly.
 *
 * Local:   yarn env:up && yarn test:local
 * Preview: MIDNIGHT_PREVIEW_SEED=... yarn test:preview   (needs a funded seed)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { type EnvironmentConfiguration, waitForFunds } from '@midnight-ntwrk/testkit-js';
import pino from 'pino';

import { getConfig } from '../config.js';
import { MidnightWalletProvider, syncWallet, type WalletSecret } from '../wallet.js';
import { buildProviders, type HelloWorldProviders } from '../providers.js';
import {
  compiledContract,
  ledger,
  pureCircuits,
  zkConfigPath,
  type Contract,
  type Ledger,
} from '../../contracts/index.js';

// Reused from the app so the two halves of the protocol cannot drift apart.
import {
  deriveJubjubPublicKey,
  schnorrReduction,
  seedBytesToJubjubSecretScalar,
  signMessage6,
} from '../../../app/src/lib/schnorr6.js';
import { historyToMessage, type MedicalHistory } from '../../../app/src/lib/record.js';

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error WebSocket global assignment for apollo
globalThis.WebSocket = WebSocket;

const ALICE_LOCAL_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
/**
 * One private-state id per persona.
 *
 * `initialPrivateState` on a call is only consulted when nothing is stored yet, so
 * sharing a single id would silently reuse whichever secret the deploy wrote -- and every
 * "patient" call would run as the admin.
 */
const STATE_ID = {
  admin: 'AdepeAdminState',
  patient: 'AdepePatientState',
  rogue: 'AdepeRoguePatientState',
} as const;

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

function resolveSecret(net: string): WalletSecret {
  if (net === 'local') return { kind: 'seed', value: ALICE_LOCAL_SEED };

  const upper = net.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();

  if (mnemonic && seedHex) {
    throw new Error(`Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`);
  }
  if (mnemonic) return { kind: 'mnemonic', value: mnemonic };
  if (seedHex) {
    if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
      throw new Error(`${seedEnv} must be a hex string of even length (no 0x prefix).`);
    }
    return { kind: 'seed', value: seedHex };
  }
  throw new Error(
    `Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'. ` +
      `Set one in .env.${net} or the shell.`,
  );
}

// ---------------------------------------------------------------------------
// Private state
// ---------------------------------------------------------------------------

interface PatientState {
  userSecret: Uint8Array;
  history: MedicalHistory;
  signature: { announcement: { x: bigint; y: bigint }; response: bigint };
  issuerPublicKey: { x: bigint; y: bigint };
}

/** The clinic. On a real deployment this key would never be near a patient. */
const ISSUER_SECRET = seedBytesToJubjubSecretScalar(new Uint8Array(32).fill(2));
const ISSUER_PK = deriveJubjubPublicKey(ISSUER_SECRET);
const ROGUE_SECRET = seedBytesToJubjubSecretScalar(new Uint8Array(32).fill(9));
const ROGUE_PK = deriveJubjubPublicKey(ROGUE_SECRET);

/** Treatment-naive at 54: clears TRIAL_OPEN, fails TRIAL_SENIOR on age. */
const ELIGIBLE_HISTORY: MedicalHistory = {
  age: 54n,
  nivolumab_counterindication: false,
  ipilinumab_counterindication: false,
  active_autoimmune_therapy: false,
  chemotherapy: false,
  immunotherapy: false,
};

const TRIAL_OPEN = 1n; // ages 18-75, treatment-naive
const TRIAL_SENIOR = 2n; // ages 65-90, treatment-naive

const witnesses = {
  getUserSecret: ({ privateState }: WitnessContext<Ledger, PatientState>) =>
    [privateState, privateState.userSecret] as [PatientState, Uint8Array],

  getWitnessMedicalHistory: ({ privateState }: WitnessContext<Ledger, PatientState>) =>
    [
      privateState,
      [privateState.history, privateState.signature, privateState.issuerPublicKey],
    ] as [PatientState, [MedicalHistory, PatientState['signature'], PatientState['issuerPublicKey']]],

  getSchnorrReduction: (
    { privateState }: WitnessContext<Ledger, PatientState>,
    challengeHash: bigint,
  ) => [privateState, schnorrReduction(challengeHash)] as [PatientState, [bigint, bigint]],
};

const stateFor = (
  userSecret: Uint8Array,
  history: MedicalHistory,
  issuerSecret = ISSUER_SECRET,
  issuerPublicKey = ISSUER_PK,
): PatientState => ({
  userSecret,
  history,
  signature: signMessage6(issuerSecret, historyToMessage(history)),
  issuerPublicKey,
});

describe(`ADEPE (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: HelloWorldProviders;
  let contractAddress: ContractAddress;

  const config = getConfig();
  const secret = resolveSecret(network);
  const isRemote = network !== 'local';
  const syncTimeoutMs = Number(
    process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? (isRemote ? 60 * 60_000 : 10 * 60_000),
  );

  // Whoever deploys becomes contractAdmin, so admin calls reuse this secret.
  const ADMIN_SECRET = new Uint8Array(32).fill(1);
  const PATIENT_SECRET = new Uint8Array(32).fill(3);

  const compiled = compiledContract<PatientState>(witnesses as never);

  async function queryLedger() {
    const state = await providers.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
  }

  const call = async (
    circuitId: string,
    args: unknown[],
    privateState: PatientState,
    privateStateId: string,
  ): Promise<void> => {
    // submitCallTx reads the stored private state and has no "initial" escape hatch, so
    // the caller's secrets have to be written first. This is the client standing in for a
    // separate wallet: on chain each persona would have their own.
    await providers.privateStateProvider.set(privateStateId, privateState);
    await (submitCallTx as never as (p: unknown, o: unknown) => Promise<unknown>)(providers, {
      compiledContract: compiled,
      contractAddress,
      privateStateId,
      circuitId,
      args,
    });
  };

  beforeAll(async () => {
    setNetworkId(config.networkId);

    const envConfig: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };

    wallet = await MidnightWalletProvider.build(logger, envConfig, secret);
    await wallet.start();
    await syncWallet(logger, wallet.wallet, syncTimeoutMs);

    if (isRemote) {
      const nightBalance = await waitForFunds(
        wallet.wallet,
        envConfig,
        false,
        wallet.unshieldedKeystore,
      );
      logger.info(`Wallet NIGHT balance on '${network}': ${nightBalance}`);
    }

    providers = buildProviders(wallet, zkConfigPath, config);
  });

  afterAll(async () => {
    if (wallet) await wallet.stop();
  });

  it('deploys and records the deployer as admin', async () => {
    const deployed: DeployedContract<Contract<PatientState>> = await (
      deployContract as never as (p: unknown, o: unknown) => Promise<DeployedContract<Contract<PatientState>>>
    )(providers, {
      compiledContract: compiled,
      privateStateId: STATE_ID.admin,
      initialPrivateState: stateFor(ADMIN_SECRET, ELIGIBLE_HISTORY),
    });

    contractAddress = deployed.deployTxData.public.contractAddress;
    expect(contractAddress).toBeDefined();

    const state = await queryLedger();
    expect([...state.contractAdmin]).toEqual([
      ...pureCircuits.deriveAdminPublicKey(ADMIN_SECRET),
    ]);
  });

  it('opens two trials and registers the issuer', async () => {
    const admin = stateFor(ADMIN_SECRET, ELIGIBLE_HISTORY);
    await call('registerProvider', [ISSUER_PK], admin, STATE_ID.admin);
    await call('createTrial', [TRIAL_OPEN, 18n, 75n, false, false, false, false, false], admin, STATE_ID.admin);
    await call('createTrial', [TRIAL_SENIOR, 65n, 90n, false, false, false, false, false], admin, STATE_ID.admin);

    const state = await queryLedger();
    expect(state.providers.size()).toBe(1n);
    expect(state.ElegiblePeople.member(TRIAL_OPEN)).toBe(true);
    expect(state.ElegiblePeople.lookup(TRIAL_OPEN).size()).toBe(0n);
  });

  it('enrolls an eligible patient', async () => {
    await call('Verify', [TRIAL_OPEN], stateFor(PATIENT_SECRET, ELIGIBLE_HISTORY), STATE_ID.patient);

    const state = await queryLedger();
    const key = pureCircuits.enrollmentKey(PATIENT_SECRET, TRIAL_OPEN);
    expect(state.ElegiblePeople.lookup(TRIAL_OPEN).member(key)).toBe(true);
    expect(state.ElegiblePeople.lookup(TRIAL_OPEN).size()).toBe(1n);
  });

  it('leaves an ineligible patient out, without failing the transaction', async () => {
    // Verify returns silently rather than asserting, so this call succeeds and simply
    // records nothing. That is what keeps rejection indistinguishable on chain.
    await call('Verify', [TRIAL_SENIOR], stateFor(PATIENT_SECRET, ELIGIBLE_HISTORY), STATE_ID.patient);

    const state = await queryLedger();
    expect(state.ElegiblePeople.lookup(TRIAL_SENIOR).size()).toBe(0n);
  });

  it('ignores a valid signature from an unregistered issuer', async () => {
    await call(
      'Verify',
      [TRIAL_OPEN],
      stateFor(new Uint8Array(32).fill(4), ELIGIBLE_HISTORY, ROGUE_SECRET, ROGUE_PK),
      STATE_ID.rogue,
    );

    const state = await queryLedger();
    expect(state.ElegiblePeople.lookup(TRIAL_OPEN).size()).toBe(1n);
  });
});
