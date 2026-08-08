/**
 * The real contract, running locally.
 *
 * Circuits execute through the Compact runtime against an in-memory ledger, so every
 * assert in `hello-world.compact` fires exactly as it would on chain. Only proof
 * generation is skipped -- which is the whole difference between this and `testnet`.
 */

import { pureCircuits, type AdepePrivateState, type Credential } from '../lib/contract.js';
import { AdepeSimulator } from '../lib/simulator.js';
import { ISSUER_NAME, formatPoint, issuerPublicKey } from '../lib/issuer.js';
import { hexToBytes, type Profile } from '../lib/profiles.js';
import { TRIALS, isEligible, trialById } from '../lib/trials.js';
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

const toCredential = (profile: Profile): Credential | null => {
  const stored = profile.credential;
  if (stored === null) return null;
  return {
    history: stored.history,
    signature: {
      announcement: {
        x: BigInt(stored.signature.announcement.x),
        y: BigInt(stored.signature.announcement.y),
      },
      response: BigInt(stored.signature.response),
    },
    issuerPublicKey: {
      x: BigInt(stored.issuerPublicKey.x),
      y: BigInt(stored.issuerPublicKey.y),
    },
  };
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

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
    const ledger = this.sim?.ledger();
    return TRIALS.map((trial) => ({
      trial,
      open: ledger?.ElegiblePeople.member(trial.id) ?? false,
      enrolledCount: ledger?.ElegiblePeople.member(trial.id)
        ? Number(ledger.ElegiblePeople.lookup(trial.id).size())
        : 0,
    }));
  }

  isEnrolled(profile: Profile, trialId: bigint): boolean {
    const ledger = this.sim?.ledger();
    if (ledger === undefined || !ledger.ElegiblePeople.member(trialId)) return false;
    const key = pureCircuits.enrollmentKey(hexToBytes(profile.userSecret), trialId);
    return ledger.ElegiblePeople.lookup(trialId).member(key);
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
    const ledger = this.sim?.ledger();
    if (ledger === undefined) return [];

    return [
      {
        title: 'providers',
        note: 'Issuers the contract will accept signatures from',
        rows: [...ledger.providers].map((point, index) => ({
          label: `#${index}`,
          value: formatPoint(point),
          mono: true,
        })),
      },
      {
        title: 'ElegiblePeople',
        note: 'Public. One pseudonym per enrollment — unlinkable across trials.',
        rows: TRIALS.flatMap((trial) => {
          if (!ledger.ElegiblePeople.member(trial.id)) return [];
          const members = [...ledger.ElegiblePeople.lookup(trial.id)];
          if (members.length === 0) {
            return [{ label: trial.code, value: 'empty' }];
          }
          return members.map((key, index) => ({
            label: `${trial.code} #${index}`,
            value: `${toHex(key).slice(0, 12)}…`,
            mono: true,
          }));
        }),
      },
      {
        title: 'contractAdmin',
        note: 'Set at deploy time from the deployer’s secret',
        rows: [{ label: 'key', value: `${toHex(ledger.contractAdmin).slice(0, 16)}…`, mono: true }],
      },
    ];
  }

  /** Exposed for the UI's local pre-check; the contract never reveals this. */
  static predictEligibility = isEligible;
  static issuerName = ISSUER_NAME;
}
