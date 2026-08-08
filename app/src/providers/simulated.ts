/**
 * The real contract, running locally.
 *
 * Circuits execute through the Compact runtime against an in-memory ledger, so every
 * assert in `hello-world.compact` fires exactly as it would on chain. Only proof
 * generation is skipped -- which is the whole difference between this and `testnet`.
 */

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { AdepePrivateState } from '../lib/contract.js';
import { AdepeSimulator } from '../lib/simulator.js';
import { ISSUER_NAME, issuerPublicKey } from '../lib/issuer.js';
import { isEnrolledIn, ledgerPanels, trialStates } from '../lib/ledger-view.js';
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

/** The admin is the page itself: it deploys, so it owns the contract. */
const ADMIN_STATE: AdepePrivateState = {
  userSecret: new Uint8Array(32).fill(1),
  credential: null,
};

export class SimulatedProvider implements TrialsProvider {
  readonly mode = 'simulated' as const;
  private sim: AdepeSimulator | null = null;

  status(): ProviderStatus {
    return this.sim === null
      ? { ready: false, detail: 'Not deployed yet' }
      : { ready: true, detail: 'Real circuits, in-memory ledger' };
  }

  async init(): Promise<void> {
    if (this.sim !== null) return;
    // Nothing is submitted anywhere; the preview provider is the only one that is not
    // 'undeployed', and it sets its own.
    setNetworkId('undeployed');
    const sim = new AdepeSimulator(ADMIN_STATE);
    sim.callAs(ADMIN_STATE, 'registerProvider', issuerPublicKey);
    for (const { id, criteria } of TRIALS) {
      sim.callAs(
        ADMIN_STATE,
        'createTrial',
        id,
        criteria.ageMin,
        criteria.ageMax,
        criteria.nivolumab_counterindication,
        criteria.ipilinumab_counterindication,
        criteria.active_autoimmune_therapy,
        criteria.chemotherapy,
        criteria.immunotherapy,
      );
    }
    this.sim = sim;
  }

  async reset(): Promise<void> {
    this.sim = null;
    await this.init();
  }

  listTrials(): readonly TrialState[] {
    return trialStates(this.sim?.ledger() ?? null);
  }

  isEnrolled(profile: Profile, trialId: bigint): boolean {
    return isEnrolledIn(this.sim?.ledger() ?? null, profile.userSecret, trialId);
  }

  /**
   * `Verify` returns silently when the issuer is untrusted or the patient does not
   * qualify -- the transaction succeeds either way. So the outcome has to be read back
   * off the ledger rather than inferred from the call not throwing.
   */
  async enroll(profile: Profile, trialId: bigint): Promise<EnrollResult> {
    if (this.sim === null) return { outcome: 'error', message: 'Not deployed yet' };
    const credential = toCredential(profile);
    if (credential === null) {
      return { outcome: 'no-credential', message: 'This profile holds no signed record yet.' };
    }
    if (this.isEnrolled(profile, trialId)) {
      return { outcome: 'already-enrolled', message: 'You already hold a place in this trial.' };
    }

    const state: AdepePrivateState = {
      userSecret: hexToBytes(profile.userSecret),
      credential,
    };

    try {
      this.sim.callAs(state, 'Verify', trialId);
    } catch (error) {
      return { outcome: 'error', message: (error as Error).message };
    }

    if (this.isEnrolled(profile, trialId)) {
      return { outcome: 'enrolled', message: 'Accepted. Your place is recorded on the ledger.' };
    }

    const trial = trialById(trialId);
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
      message:
        trial === undefined
          ? 'Not eligible.'
          : `Your record does not meet ${trial.code}'s criteria.`,
    };
  }

  ledgerPanels(): readonly LedgerPanel[] {
    return ledgerPanels(this.sim?.ledger() ?? null);
  }

  /** Exposed for the UI's local pre-check; the contract never reveals this. */
  static predictEligibility = isEligible;
  static issuerName = ISSUER_NAME;
}
