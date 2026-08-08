/**
 * Real zero-knowledge proofs, no chain.
 *
 * Every call builds an unproven transaction and sends it to a proof server, which
 * generates a genuine proof against the compiled circuit's proving key. What is skipped is
 * everything after: no wallet balances it, no node accepts it, no indexer reports it. The
 * resulting contract state is adopted in memory instead.
 *
 * That makes this the honest middle step between `simulated` (circuits run, nothing is
 * proved) and a network mode (proved, balanced, submitted). It needs no wallet and no
 * funding, so it works on any machine with Docker, and it surfaces the one cost the other
 * local modes hide: proving takes real time.
 */

import {
  ChargedState,
  createConstructorContext,
  type ContractState,
  type StateValue,
} from '@midnight-ntwrk/compact-runtime';
import { createUnprovenCallTxFromInitialStates } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import {
  LedgerParameters,
  ZswapChainState,
  ZswapSecretKeys,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { ProofProvider, ZKConfigProvider } from '@midnight-ntwrk/midnight-js-types';

import { Contract, ledger, pureCircuits, type AdepePrivateState } from '../lib/contract.js';
import { CompiledAdepeContract, type AdepeCircuitId } from '../lib/compiled.js';
import { adepeWitnesses } from '../lib/witnesses.js';
import { issuerPublicKey, formatPoint } from '../lib/issuer.js';
import { hexToBytes, type Profile } from '../lib/profiles.js';
import { TRIALS, isEligible, trialById } from '../lib/trials.js';
import { toCredential } from './credential.js';
import type {
  EnrollResult,
  LedgerPanel,
  ProviderStatus,
  TrialState,
  TrialsProvider,
} from './types.js';

const ADMIN_STATE: AdepePrivateState = {
  userSecret: new Uint8Array(32).fill(1),
  credential: null,
};

/**
 * A fixed address and key material.
 *
 * Nothing here is submitted, so these only have to be well-formed: no chain ever sees the
 * address, and no coins are ever spent.
 */
const CONTRACT_ADDRESS = '0'.repeat(64);
const ZSWAP_KEYS = ZswapSecretKeys.fromSeed(new Uint8Array(32).fill(5));

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export class LocalProofsProvider implements TrialsProvider {
  readonly mode = 'proofs' as const;

  private readonly contract = new Contract<AdepePrivateState>(adepeWitnesses);
  private readonly proofProvider: ProofProvider;
  private contractState: ContractState | null = null;
  private lastProofMs: number | null = null;
  private failure: string | null = null;

  constructor(
    private readonly zkConfigProvider: ZKConfigProvider<AdepeCircuitId>,
    private readonly proofServerUrl: string,
  ) {
    this.proofProvider = httpClientProofProvider(proofServerUrl, zkConfigProvider);
  }

  status(): ProviderStatus {
    if (this.failure !== null) return { ready: false, detail: this.failure };
    const proved =
      this.lastProofMs === null ? '' : ` · last proof ${Math.round(this.lastProofMs)}ms`;
    return this.contractState === null
      ? { ready: false, detail: `Starting against ${this.proofServerUrl}` }
      : { ready: true, detail: `Real proofs via ${this.proofServerUrl}${proved}` };
  }

  /** Milliseconds the proof server took on the most recent call, for the UI. */
  lastProofDuration(): number | null {
    return this.lastProofMs;
  }

  async init(): Promise<void> {
    if (this.contractState !== null) return;

    const { currentContractState } = this.contract.initialState(
      createConstructorContext(ADMIN_STATE, CONTRACT_ADDRESS),
    );
    this.contractState = currentContractState;

    try {
      for (const { id, criteria } of TRIALS) {
        await this.prove('createTrial', ADMIN_STATE, [
          id,
          criteria.ageMin,
          criteria.ageMax,
          criteria.nivolumab_counterindication,
          criteria.ipilinumab_counterindication,
          criteria.active_autoimmune_therapy,
          criteria.chemotherapy,
          criteria.immunotherapy,
        ]);
      }
      await this.prove('registerProvider', ADMIN_STATE, [issuerPublicKey]);
    } catch (error) {
      this.contractState = null;
      this.failure =
        `Could not reach the proof server at ${this.proofServerUrl}. ` +
        'Start it with: cd contract && docker compose up -d --wait proof-server. ' +
        `(${(error as Error).message})`;
    }
  }

  async reset(): Promise<void> {
    this.contractState = null;
    this.failure = null;
    this.lastProofMs = null;
    await this.init();
  }

  /**
   * Build the transaction, prove it for real, and adopt the resulting state.
   *
   * The proof is generated and then dropped: with nothing to submit it to, its only role
   * is to demonstrate that the circuit is satisfiable with these private inputs. The state
   * transition comes from the local execution that produced the transaction.
   */
  private async prove(
    circuitId: AdepeCircuitId,
    privateState: AdepePrivateState,
    args: unknown[],
  ): Promise<void> {
    const unsubmitted = await (
      createUnprovenCallTxFromInitialStates as never as (
        z: unknown,
        o: unknown,
        e: unknown,
      ) => Promise<{
        private: { unprovenTx: unknown };
        public: { nextContractState: StateValue };
      }>
    )(
      this.zkConfigProvider,
      {
        compiledContract: CompiledAdepeContract,
        circuitId,
        args,
        contractAddress: CONTRACT_ADDRESS,
        coinPublicKey: ZSWAP_KEYS.coinPublicKey,
        initialContractState: this.contractState,
        initialZswapChainState: new ZswapChainState(),
        ledgerParameters: LedgerParameters.initialParameters(),
        initialPrivateState: privateState,
      },
      ZSWAP_KEYS.encryptionPublicKey,
    );

    const started = performance.now();
    await this.proofProvider.proveTx(unsubmitted.private.unprovenTx as never);
    this.lastProofMs = performance.now() - started;

    // `nextContractState` is a bare StateValue, but the next call needs a full
    // ContractState -- the one carrying the operations and verifier keys. On chain the
    // node folds one into the other; with no node here, do it directly.
    const next = this.contractState!;
    next.data = new ChargedState(unsubmitted.public.nextContractState);
    this.contractState = next;
  }

  private ledgerView() {
    return this.contractState === null ? null : ledger(this.contractState.data);
  }

  listTrials(): readonly TrialState[] {
    const view = this.ledgerView();
    return TRIALS.map((trial) => ({
      trial,
      open: view?.ElegiblePeople.member(trial.id) ?? false,
      enrolledCount: view?.ElegiblePeople.member(trial.id)
        ? Number(view.ElegiblePeople.lookup(trial.id).size())
        : 0,
    }));
  }

  isEnrolled(profile: Profile, trialId: bigint): boolean {
    const view = this.ledgerView();
    if (view === null || !view.ElegiblePeople.member(trialId)) return false;
    const key = pureCircuits.enrollmentKey(hexToBytes(profile.userSecret), trialId);
    return view.ElegiblePeople.lookup(trialId).member(key);
  }

  async enroll(profile: Profile, trialId: bigint): Promise<EnrollResult> {
    if (this.contractState === null) {
      return { outcome: 'error', message: this.failure ?? 'Not started yet' };
    }
    const credential = toCredential(profile);
    if (credential === null) {
      return { outcome: 'no-credential', message: 'This profile holds no signed record yet.' };
    }
    if (this.isEnrolled(profile, trialId)) {
      return { outcome: 'already-enrolled', message: 'You already hold a place in this trial.' };
    }

    try {
      await this.prove(
        'Verify',
        { userSecret: hexToBytes(profile.userSecret), credential },
        [trialId],
      );
    } catch (error) {
      return { outcome: 'error', message: (error as Error).message };
    }

    if (this.isEnrolled(profile, trialId)) {
      return {
        outcome: 'enrolled',
        message: `Accepted, with a real proof generated in ${Math.round(this.lastProofMs ?? 0)}ms.`,
      };
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
    const view = this.ledgerView();
    if (view === null) return [];

    return [
      {
        title: 'proving',
        note: `Proof server at ${this.proofServerUrl}. Proofs are generated, then discarded — there is no chain to submit them to.`,
        rows: [
          {
            label: 'last proof',
            value: this.lastProofMs === null ? '—' : `${Math.round(this.lastProofMs)}ms`,
          },
        ],
      },
      {
        title: 'providers',
        note: 'Issuers the contract will accept signatures from',
        rows: [...view.providers].map((point, index) => ({
          label: `#${index}`,
          value: formatPoint(point),
          mono: true,
        })),
      },
      {
        title: 'ElegiblePeople',
        note: 'Public. One pseudonym per enrollment — unlinkable across trials.',
        rows: TRIALS.flatMap((trial) => {
          if (!view.ElegiblePeople.member(trial.id)) return [];
          const members = [...view.ElegiblePeople.lookup(trial.id)];
          if (members.length === 0) return [{ label: trial.code, value: 'empty' }];
          return members.map((key, index) => ({
            label: `${trial.code} #${index}`,
            value: `${toHex(key).slice(0, 12)}…`,
            mono: true,
          }));
        }),
      },
    ];
  }

  static predictEligibility = isEligible;
}
