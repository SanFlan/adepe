/**
 * The Preview testnet, through a connected Lace wallet. Not wired yet.
 *
 * This exists as a real module rather than a missing case so the mode switcher stays
 * honest: selecting Testnet reports precisely what is missing instead of throwing.
 *
 * What it needs:
 *  - a wallet connection (the Lace connector, via `@midnight-ntwrk/dapp-connector-api`)
 *  - `FetchZkConfigProvider` instead of the Node one, serving `contract/contracts/managed`
 *  - a proof server (`docker compose up proof-server` in `contract/`, port 6300)
 *  - a deployed contract address, plus a funded admin to open the trials once
 * `contract/src/config.ts` already carries the Preview endpoints.
 */

import type { Profile } from '../lib/profiles.js';
import { TRIALS } from '../lib/trials.js';
import type {
  EnrollResult,
  LedgerPanel,
  ProviderStatus,
  TrialState,
  TrialsProvider,
} from './types.js';

const UNAVAILABLE =
  'Preview needs a connected Lace wallet, a running proof server and a deployed contract address.';

export class PreviewProvider implements TrialsProvider {
  readonly mode = 'preview' as const;

  status(): ProviderStatus {
    return { ready: false, detail: UNAVAILABLE };
  }

  async init(): Promise<void> {
    // Intentionally does nothing: status() is what the UI reads.
  }

  async reset(): Promise<void> {}

  listTrials(): readonly TrialState[] {
    return TRIALS.map((trial) => ({ trial, enrolledCount: 0, open: false }));
  }

  isEnrolled(_profile: Profile, _trialId: bigint): boolean {
    return false;
  }

  async enroll(_profile: Profile, _trialId: bigint): Promise<EnrollResult> {
    return { outcome: 'error', message: UNAVAILABLE };
  }

  ledgerPanels(): readonly LedgerPanel[] {
    return [{ title: 'ledger', note: UNAVAILABLE, rows: [] }];
  }
}
