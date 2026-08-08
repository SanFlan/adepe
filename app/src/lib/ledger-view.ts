/**
 * Reading the contract's public state.
 *
 * Three providers run the real contract — simulated, local proofs, and preview — and all
 * three answered "which trials are open", "am I enrolled" and "what does the ledger hold"
 * with their own copies of the same code. The copies had already drifted slightly. This is
 * the one implementation.
 *
 * Everything here takes a decoded `Ledger` and is synchronous, which is what lets a network
 * provider satisfy the same interface as an in-memory one: it keeps a snapshot and refreshes
 * it, rather than making every read async.
 */

import { pureCircuits, type Ledger } from './contract.js';
import { formatPoint } from './issuer.js';
import { hexToBytes } from './profiles.js';
import { TRIALS } from './trials.js';
import type { LedgerPanel, TrialState } from '../providers/types.js';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** A trial exists on the ledger once `createTrial` has opened its enrollment set. */
export const trialStates = (view: Ledger | null): readonly TrialState[] =>
  TRIALS.map((trial) => {
    const open = view?.ElegiblePeople.member(trial.id) ?? false;
    return {
      trial,
      open,
      enrolledCount: open ? Number(view!.ElegiblePeople.lookup(trial.id).size()) : 0,
    };
  });

/**
 * Whether this patient already holds a place.
 *
 * The pseudonym comes from the contract's own `enrollmentKey`, so this asks the ledger the
 * same question the circuit would rather than tracking enrollments on the side.
 */
export const isEnrolledIn = (
  view: Ledger | null,
  userSecretHex: string,
  trialId: bigint,
): boolean => {
  if (view === null || !view.ElegiblePeople.member(trialId)) return false;
  const key = pureCircuits.enrollmentKey(hexToBytes(userSecretHex), trialId);
  return view.ElegiblePeople.lookup(trialId).member(key);
};

export const ledgerPanels = (
  view: Ledger | null,
  extra: readonly LedgerPanel[] = [],
): readonly LedgerPanel[] => {
  if (view === null) return [...extra];

  return [
    ...extra,
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
      note: 'Public. One pseudonym per enrollment, unlinkable across trials.',
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
    {
      title: 'contractAdmin',
      note: 'Set at deploy time from the deployer’s secret',
      rows: [
        { label: 'key', value: `${toHex(view.contractAdmin).slice(0, 16)}…`, mono: true },
      ],
    },
  ];
};
