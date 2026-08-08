/**
 * One interface, three backings.
 *
 * `mocked` keeps a ledger-shaped object in memory, `simulated` runs the real circuits
 * against an in-memory ledger, and `testnet` would talk to Preview. The views are written
 * against this interface alone so switching modes changes what is real underneath without
 * changing what the page does.
 */

import type { Profile } from '../lib/profiles.js';
import type { Trial } from '../lib/trials.js';

export type Mode = 'mocked' | 'simulated' | 'proofs' | 'preview';

/**
 * The four modes, in order of how much of the real system each one runs.
 *
 * Each step adds exactly one thing: `simulated` adds the circuits, `proofs` adds proof
 * generation, `preview` adds a wallet and a chain.
 */
export const MODES: ReadonlyArray<{ id: Mode; label: string; blurb: string }> = [
  {
    id: 'mocked',
    label: 'Mocked',
    blurb: 'Signatures are real; the ledger is a plain object. Nothing proves anything.',
  },
  {
    id: 'simulated',
    label: 'Simulated',
    blurb: 'The real compiled circuits run locally. Every assert fires; the proof is skipped.',
  },
  {
    id: 'proofs',
    label: 'Local proofs',
    blurb:
      'Real zero-knowledge proofs from a local proof server. Nothing is submitted anywhere.',
  },
  {
    id: 'preview',
    label: 'Preview testnet',
    blurb: 'The Preview network, through a connected Lace wallet.',
  },
];

export interface ProviderStatus {
  readonly ready: boolean;
  readonly detail: string;
}

export interface TrialState {
  readonly trial: Trial;
  readonly enrolledCount: number;
  /** Whether the trial has been opened on the ledger yet. */
  readonly open: boolean;
}

export type EnrollOutcome =
  | 'enrolled'
  | 'already-enrolled'
  | 'ineligible'
  | 'untrusted-issuer'
  | 'no-credential'
  | 'error';

export interface EnrollResult {
  readonly outcome: EnrollOutcome;
  readonly message: string;
}

/** A read-only view of ledger state, for the drawer. */
export interface LedgerRow {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}

export interface LedgerPanel {
  readonly title: string;
  readonly note?: string;
  readonly rows: readonly LedgerRow[];
}

export interface TrialsProvider {
  readonly mode: Mode;
  status(): ProviderStatus;
  /** Deploy, open the catalogue, and register the demo issuer. Idempotent. */
  init(): Promise<void>;
  listTrials(): readonly TrialState[];
  /** Read the ledger to see whether this profile already holds a place. */
  isEnrolled(profile: Profile, trialId: bigint): boolean;
  enroll(profile: Profile, trialId: bigint): Promise<EnrollResult>;
  ledgerPanels(): readonly LedgerPanel[];
  reset(): Promise<void>;
}
