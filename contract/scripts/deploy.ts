/**
 * Deploy the contract and open the trial catalogue.
 *
 *   make deploy-preview          (or: MIDNIGHT_NETWORK=preview yarn deploy)
 *
 * Deliberately separate from the integration test. The test deploys a throwaway contract
 * and enrolls a patient to prove the flow works; this produces one long-lived deployment
 * with the catalogue open and nobody enrolled.
 *
 * The trials and the issuer key are imported from the app, not restated here, so the
 * deployed contract cannot drift from what the app shows.
 *
 * On the admin secret: the contract derives `contractAdmin` from `getUserSecret()`, so
 * whoever holds that secret can open trials and register issuers forever. The app hardcodes
 * one for the local modes, which is fine there and would be careless on a public network.
 * This script takes ADEPE_ADMIN_SECRET, or generates one and prints it once. The app never
 * needs it: the catalogue is already open by the time anyone loads the page.
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { waitForFunds, type EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';

import { getConfig } from '../src/config.js';
import { resolveWalletSecret } from '../src/secret.js';
import { MidnightWalletProvider, syncWallet } from '../src/wallet.js';
import { buildProviders } from '../src/providers.js';
import { compiledContract, ledger, zkConfigPath } from '../contracts/index.js';

import { TRIALS } from '../../app/src/lib/trials.js';
import { issuerPublicKey } from '../../app/src/lib/issuer.js';
import { schnorrReduction } from '../../app/src/lib/schnorr6.js';

// Apollo needs a global WebSocket for the indexer subscription.
// @ts-expect-error assigning the Node implementation onto globalThis
globalThis.WebSocket = WebSocket;

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'preview';

// Secrets live in .env.<network>, which is gitignored. Shell env still wins: anything
// already set is left alone.
try {
  process.loadEnvFile(fileURLToPath(new URL(`../.env.${network}`, import.meta.url)));
} catch {
  // No file is fine for local, and resolveWalletSecret says what is missing otherwise.
}
const PRIVATE_STATE_ID = 'AdepeDeployAdmin';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const adminSecret = (): { bytes: Uint8Array; generated: boolean } => {
  const supplied = process.env['ADEPE_ADMIN_SECRET']?.trim();
  if (supplied === undefined || supplied === '') {
    return { bytes: new Uint8Array(randomBytes(32)), generated: true };
  }
  if (!/^[0-9a-fA-F]{64}$/.test(supplied)) {
    throw new Error('ADEPE_ADMIN_SECRET must be 64 hex characters (32 bytes, no 0x prefix).');
  }
  return { bytes: fromHex(supplied), generated: false };
};

/** Only `getUserSecret` is ever called: this script runs admin circuits, never Verify. */
interface AdminState {
  userSecret: Uint8Array;
}

const witnesses = {
  getUserSecret: ({ privateState }: { privateState: AdminState }) =>
    [privateState, privateState.userSecret] as [AdminState, Uint8Array],

  getWitnessMedicalHistory: () => {
    throw new Error('The deploy script never calls Verify, so it holds no medical history.');
  },

  getSchnorrReduction: (
    { privateState }: { privateState: AdminState },
    challengeHash: bigint,
  ) => [privateState, schnorrReduction(challengeHash)] as [AdminState, [bigint, bigint]],
};

async function main(): Promise<void> {
  const config = getConfig();
  const secret = resolveWalletSecret(network);
  const admin = adminSecret();
  const state: AdminState = { userSecret: admin.bytes };

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

  logger.info(`Connecting to '${network}' (${config.node})`);
  const wallet = await MidnightWalletProvider.build(logger, envConfig, secret);
  await wallet.start();

  try {
    await syncWallet(logger, wallet.wallet, Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 60 * 60_000));

    if (network !== 'local') {
      // NIGHT to DUST registration. The seed must already be funded from the faucet.
      const balance = await waitForFunds(wallet.wallet, envConfig, false, wallet.unshieldedKeystore);
      logger.info(`Wallet NIGHT balance: ${balance}`);
    }

    const providers = buildProviders(wallet, zkConfigPath, config);
    const compiled = compiledContract<AdminState>(witnesses as never);

    logger.info('Deploying…');
    const deployed = await (deployContract as never as (p: unknown, o: unknown) => Promise<any>)(
      providers,
      {
        compiledContract: compiled,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: state,
      },
    );
    const contractAddress: string = deployed.deployTxData.public.contractAddress;
    logger.info(`Deployed at ${contractAddress}`);

    const call = async (circuitId: string, args: unknown[]) => {
      await (submitCallTx as never as (p: unknown, o: unknown) => Promise<unknown>)(providers, {
        compiledContract: compiled,
        contractAddress,
        privateStateId: PRIVATE_STATE_ID,
        circuitId,
        args,
      });
    };

    for (const trial of TRIALS) {
      const { criteria } = trial;
      logger.info(`Opening ${trial.code}…`);
      await call('createTrial', [
        trial.id,
        criteria.ageMin,
        criteria.ageMax,
        criteria.nivolumab_counterindication,
        criteria.ipilinumab_counterindication,
        criteria.active_autoimmune_therapy,
        criteria.chemotherapy,
        criteria.immunotherapy,
      ]);
    }

    logger.info('Registering the issuer…');
    await call('registerProvider', [issuerPublicKey]);

    const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
    if (contractState === null) throw new Error('Deployed contract not found by the indexer');
    const view = ledger(contractState.data);

    const openTrials = TRIALS.filter((trial) => view.ElegiblePeople.member(trial.id));
    if (openTrials.length !== TRIALS.length) {
      throw new Error(`Only ${openTrials.length} of ${TRIALS.length} trials are open`);
    }
    if (view.providers.size() !== 1n) {
      throw new Error(`Expected 1 registered provider, found ${view.providers.size()}`);
    }

    const record = {
      network,
      networkId: config.networkId,
      contractAddress,
      deployedAt: new Date().toISOString(),
      indexer: config.indexer,
      issuerPublicKey: { x: issuerPublicKey.x.toString(), y: issuerPublicKey.y.toString() },
      trials: TRIALS.map((trial) => ({ id: Number(trial.id), code: trial.code })),
    };
    const out = fileURLToPath(new URL(`../../deployment.${network}.json`, import.meta.url));
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);

    logger.info(`Wrote ${out}`);
    console.log(`\n  Contract address\n    ${contractAddress}\n`);
    console.log(`  ${openTrials.length} trials open, issuer registered.\n`);

    if (admin.generated) {
      console.log(
        '  Admin secret (generated, shown once — save it to open more trials later):\n' +
          `    ADEPE_ADMIN_SECRET=${toHex(admin.bytes)}\n`,
      );
    }
  } finally {
    await wallet.stop();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
