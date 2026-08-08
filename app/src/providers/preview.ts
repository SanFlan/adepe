/**
 * The Preview testnet, through a connected Lace wallet.
 *
 * The other three modes own their ledger. This one does not: the contract is already
 * deployed, its trials were opened by whoever ran `scripts/deploy.ts`, and this app is one
 * of many possible clients. So `init` connects and reads, it does not create anything.
 *
 * Two things are worth knowing before using it:
 *
 *  - The wallet decides where transactions go. `getConfiguration()` supplies the indexer and
 *    the proof server, so the network is whatever Lace is pointed at, not whatever this app
 *    would prefer. If they disagree, that is reported rather than papered over.
 *  - Proving happens on a proof server the wallet nominates, which in practice is on the
 *    user's own machine. This mode is not a link you can send someone.
 *
 * Reads are cached. `TrialsProvider` is synchronous by design — an in-memory ledger has no
 * reason to be otherwise — so this keeps a snapshot and refreshes it after anything that
 * could change it.
 */

import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  Transaction,
  type Binding,
  type PreBinding,
  type Proof,
  type SignatureEnabled,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
// midnight-js-types declares these but does not export them, so they are reconstructed
// from the ledger's Transaction generic exactly as it does.
type UnboundTransaction = Transaction<SignatureEnabled, Proof, PreBinding>;
type FinalizedTransaction = Transaction<SignatureEnabled, Proof, Binding>;

import deployment from '../../../deployment.preview.json';
import { ledger, type AdepePrivateState, type Ledger } from '../lib/contract.js';
import { CompiledAdepeContract, type AdepeCircuitId } from '../lib/compiled.js';
import { issuerPublicKey } from '../lib/issuer.js';
import { isEnrolledIn, ledgerPanels, trialStates } from '../lib/ledger-view.js';
import { hexToBytes, type Profile } from '../lib/profiles.js';
import { trialById } from '../lib/trials.js';
import { BrowserZkConfigProvider } from '../lib/zk-config.js';
import { inMemoryPrivateStateProvider } from '../lib/private-state.js';
import { toCredential } from './credential.js';
import type {
  EnrollResult,
  LedgerPanel,
  ProviderStatus,
  TrialState,
  TrialsProvider,
} from './types.js';

/** The connector API this app speaks. Lace advertises its own in `apiVersion`. */
const SUPPORTED_MAJOR = 4;
const PRIVATE_STATE_ID = 'adepe-patient';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16)));

/** The first injected wallet whose connector major version we understand. */
const findWallet = (): InitialAPI | undefined =>
  Object.values(window.midnight ?? {}).find(
    (wallet): wallet is InitialAPI =>
      typeof wallet?.apiVersion === 'string' &&
      Number.parseInt(wallet.apiVersion.split('.')[0] ?? '', 10) === SUPPORTED_MAJOR,
  );

export class PreviewProvider implements TrialsProvider {
  readonly mode = 'preview' as const;

  private api: ConnectedAPI | null = null;
  private providers: Record<string, unknown> | null = null;
  private view: Ledger | null = null;
  private detail = 'Not connected';
  private ready = false;

  status(): ProviderStatus {
    return { ready: this.ready, detail: this.detail };
  }

  async init(): Promise<void> {
    if (this.ready) return;
    setNetworkId('preview');

    const wallet = findWallet();
    if (wallet === undefined) {
      this.detail =
        window.midnight === undefined
          ? 'No Midnight wallet found. Install Lace and reload.'
          : `No wallet speaking connector API ${SUPPORTED_MAJOR}.x. Update Lace and reload.`;
      return;
    }

    try {
      // Prompts the user. Rejecting is a normal outcome, not an error to swallow.
      this.api = await wallet.connect(deployment.networkId);
      const config = await this.api.getConfiguration();

      if (config.networkId !== deployment.networkId) {
        this.detail =
          `Lace is on '${config.networkId}' but the contract is deployed on ` +
          `'${deployment.networkId}'. Switch networks in the wallet and reload.`;
        return;
      }
      if (config.proverServerUri === undefined) {
        this.detail =
          'The wallet did not supply a proof server. Start one locally and set it in Lace.';
        return;
      }

      const addresses = await this.api.getShieldedAddresses();
      const zkConfigProvider = new BrowserZkConfigProvider<AdepeCircuitId>(
        `${window.location.origin}/zk`,
      );
      const connected = this.api;

      this.providers = {
        privateStateProvider: inMemoryPrivateStateProvider<AdepePrivateState>(),
        zkConfigProvider,
        proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
        publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
        walletProvider: {
          getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
          getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
          // The wallet adds inputs and pays fees; it never sees the private state.
          balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
            const balanced = await connected.balanceUnsealedTransaction(toHex(tx.serialize()));
            return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
              'signature',
              'proof',
              'binding',
              fromHex(balanced.tx),
            );
          },
        },
        midnightProvider: {
          submitTx: async (tx: FinalizedTransaction): Promise<string> => {
            await connected.submitTransaction(toHex(tx.serialize()));
            return tx.identifiers()[0]!;
          },
        },
      };

      await this.refresh();
      this.ready = true;
      this.detail = `Connected to ${config.networkId} · contract ${deployment.contractAddress.slice(0, 12)}…`;
    } catch (error) {
      this.detail = `Could not connect: ${(error as Error).message}`;
    }
  }

  /** Pull the contract's public state. Cheap, and the only way to see other people's calls. */
  private async refresh(): Promise<void> {
    const publicData = this.providers?.['publicDataProvider'] as
      | { queryContractState: (address: string) => Promise<{ data: unknown } | null> }
      | undefined;
    if (publicData === undefined) return;

    const state = await publicData.queryContractState(deployment.contractAddress);
    if (state === null) {
      throw new Error(`No contract at ${deployment.contractAddress}`);
    }
    this.view = ledger(state.data as never);
  }

  /** Reconnecting is the only "reset" available: the chain's state is not ours to clear. */
  async reset(): Promise<void> {
    if (!this.ready) return;
    await this.refresh();
  }

  listTrials(): readonly TrialState[] {
    return trialStates(this.view);
  }

  isEnrolled(profile: Profile, trialId: bigint): boolean {
    return isEnrolledIn(this.view, profile.userSecret, trialId);
  }

  async enroll(profile: Profile, trialId: bigint): Promise<EnrollResult> {
    if (!this.ready || this.providers === null) {
      return { outcome: 'error', message: this.detail };
    }
    const credential = toCredential(profile);
    if (credential === null) {
      return { outcome: 'no-credential', message: 'This profile holds no signed record yet.' };
    }
    if (this.isEnrolled(profile, trialId)) {
      return { outcome: 'already-enrolled', message: 'You already hold a place in this trial.' };
    }

    const privateState: AdepePrivateState = {
      userSecret: hexToBytes(profile.userSecret),
      credential,
    };

    try {
      // submitCallTx reads the stored private state and has no "initial" escape hatch, so
      // the patient's secrets are written immediately before the call.
      const store = this.providers['privateStateProvider'] as {
        set: (id: string, state: AdepePrivateState) => Promise<void>;
      };
      await store.set(PRIVATE_STATE_ID, privateState);

      await (submitCallTx as never as (p: unknown, o: unknown) => Promise<unknown>)(
        this.providers,
        {
          compiledContract: CompiledAdepeContract,
          contractAddress: deployment.contractAddress,
          privateStateId: PRIVATE_STATE_ID,
          circuitId: 'Verify' satisfies AdepeCircuitId,
          args: [trialId],
        },
      );
      await this.refresh();
    } catch (error) {
      return { outcome: 'error', message: (error as Error).message };
    }

    // `Verify` returns silently when the issuer is untrusted or the patient does not
    // qualify, so the transaction lands either way and the ledger is the only answer.
    if (this.isEnrolled(profile, trialId)) {
      return { outcome: 'enrolled', message: 'Accepted. Your place is recorded on chain.' };
    }

    const trusted =
      credential.issuerPublicKey.x === issuerPublicKey.x &&
      credential.issuerPublicKey.y === issuerPublicKey.y;
    if (!trusted) {
      return {
        outcome: 'untrusted-issuer',
        message: 'The signature is valid, but this issuer is not registered with the contract.',
      };
    }
    return {
      outcome: 'ineligible',
      message: `Your record does not meet ${trialById(trialId)?.code ?? 'this trial'}'s criteria.`,
    };
  }

  ledgerPanels(): readonly LedgerPanel[] {
    return ledgerPanels(this.view, [
      {
        title: 'deployment',
        note: 'Opened by whoever ran the deploy script. This app is only a client.',
        rows: [
          { label: 'network', value: deployment.networkId },
          {
            label: 'address',
            value: `${deployment.contractAddress.slice(0, 20)}…`,
            mono: true,
          },
        ],
      },
    ]);
  }
}
