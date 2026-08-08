/**
 * The ledger as a plain object.
 *
 * No circuits run here: eligibility is evaluated in TypeScript and enrollment is a Set
 * insertion. What is *not* faked is the cryptography -- the issuer's signature is
 * verified with the same code the circuit's transcript is built from, and pseudonyms come
 * from the contract's own `enrollmentKey`. So this mode is honest about who signed what,
 * and dishonest only about proving it to anyone else.
 *
 * State persists in localStorage so a reload mid-demo does not lose the enrollments.
 */

import { pureCircuits } from '../lib/contract.js';
import { issuerPublicKey } from '../lib/issuer.js';
import { hexToBytes, type Profile } from '../lib/profiles.js';
import { historyToMessage } from '../lib/record.js';
import { verifyMessage6 } from '../lib/schnorr6.js';
import { TRIALS, isEligible, trialById } from '../lib/trials.js';
import type {
  EnrollResult,
  LedgerPanel,
  ProviderStatus,
  TrialState,
  TrialsProvider,
} from './types.js';

const STORAGE_KEY = 'adepe.mockledger.v1';

/** Mirrors the ledger declarations in `hello-world.compact`. */
interface MockLedger {
  /** trialID -> hex pseudonyms. */
  eligiblePeople: Record<string, string[]>;
  /** Registered issuer public keys, as "x:y". */
  providers: string[];
}

const pointKey = (point: { x: bigint; y: bigint }) => `${point.x}:${point.y}`;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const emptyLedger = (): MockLedger => ({
  eligiblePeople: Object.fromEntries(TRIALS.map((trial) => [String(trial.id), []])),
  providers: [pointKey(issuerPublicKey)],
});

/** Proving is instant here, which would misrepresent what the real thing costs. */
const PROVING_DELAY_MS = 1200;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockedProvider implements TrialsProvider {
  readonly mode = 'mocked' as const;
  private ledger: MockLedger = emptyLedger();

  status(): ProviderStatus {
    return { ready: true, detail: 'Signatures real, ledger simulated in localStorage' };
  }

  async init(): Promise<void> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      this.persist();
      return;
    }
    try {
      const parsed = JSON.parse(raw) as MockLedger;
      // Fill in trials added to the catalogue since this blob was written.
      this.ledger = {
        providers: parsed.providers ?? emptyLedger().providers,
        eligiblePeople: {
          ...emptyLedger().eligiblePeople,
          ...parsed.eligiblePeople,
        },
      };
    } catch {
      this.ledger = emptyLedger();
      this.persist();
    }
  }

  async reset(): Promise<void> {
    this.ledger = emptyLedger();
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.ledger));
  }

  private pseudonym(profile: Profile, trialId: bigint): string {
    return toHex(pureCircuits.enrollmentKey(hexToBytes(profile.userSecret), trialId));
  }

  listTrials(): readonly TrialState[] {
    return TRIALS.map((trial) => ({
      trial,
      open: true,
      enrolledCount: this.ledger.eligiblePeople[String(trial.id)]?.length ?? 0,
    }));
  }

  isEnrolled(profile: Profile, trialId: bigint): boolean {
    return (
      this.ledger.eligiblePeople[String(trialId)]?.includes(this.pseudonym(profile, trialId)) ??
      false
    );
  }

  async enroll(profile: Profile, trialId: bigint): Promise<EnrollResult> {
    const stored = profile.credential;
    if (stored === null) {
      return { outcome: 'no-credential', message: 'This profile holds no signed record yet.' };
    }
    if (this.isEnrolled(profile, trialId)) {
      return { outcome: 'already-enrolled', message: 'You already hold a place in this trial.' };
    }

    await pause(PROVING_DELAY_MS);

    const trial = trialById(trialId);
    if (trial === undefined) return { outcome: 'error', message: 'Unknown trial' };

    const publicKey = {
      x: BigInt(stored.issuerPublicKey.x),
      y: BigInt(stored.issuerPublicKey.y),
    };
    const signature = {
      announcement: {
        x: BigInt(stored.signature.announcement.x),
        y: BigInt(stored.signature.announcement.y),
      },
      response: BigInt(stored.signature.response),
    };

    // The same check `schnorrVerify<6>` performs in-circuit. A tampered record fails here
    // exactly as it would there.
    if (!verifyMessage6(publicKey, historyToMessage(stored.history), signature)) {
      return { outcome: 'error', message: 'The signature does not match this record.' };
    }
    if (!this.ledger.providers.includes(pointKey(publicKey))) {
      return {
        outcome: 'untrusted-issuer',
        message: 'The signature is valid, but this issuer is not registered with the contract.',
      };
    }
    if (!isEligible(trial.criteria, stored.history)) {
      return {
        outcome: 'ineligible',
        message: `Your record does not meet ${trial.code}'s criteria.`,
      };
    }

    this.ledger.eligiblePeople[String(trialId)]!.push(this.pseudonym(profile, trialId));
    this.persist();
    return { outcome: 'enrolled', message: 'Accepted. Your place is recorded on the ledger.' };
  }

  ledgerPanels(): readonly LedgerPanel[] {
    return [
      {
        title: 'providers',
        note: 'Issuers the contract will accept signatures from',
        rows: this.ledger.providers.map((key, index) => ({
          label: `#${index}`,
          value: `${key.slice(0, 12)}…`,
          mono: true,
        })),
      },
      {
        title: 'ElegiblePeople',
        note: 'Public. One pseudonym per enrollment — unlinkable across trials.',
        rows: TRIALS.flatMap((trial) => {
          const members = this.ledger.eligiblePeople[String(trial.id)] ?? [];
          if (members.length === 0) return [{ label: trial.code, value: 'empty' }];
          return members.map((key, index) => ({
            label: `${trial.code} #${index}`,
            value: `${key.slice(0, 12)}…`,
            mono: true,
          }));
        }),
      },
    ];
  }
}
