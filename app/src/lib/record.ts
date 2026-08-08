/**
 * The health record document, and the part of it the issuer's signature covers.
 *
 * Only the six `history` fields are signed, because those are the six the contract's
 * `Verify` circuit reads. Everything else in the document is presentation: useful for
 * making the demo legible, but not attested to by anyone. The UI must say which is
 * which rather than let the two blur together.
 */

import type { Message6 } from './schnorr6.js';

/** Mirrors the `MedicalHistory` struct in `hello-world.compact`. */
export interface MedicalHistory {
  age: bigint;
  nivolumab_counterindication: boolean;
  ipilinumab_counterindication: boolean;
  active_autoimmune_therapy: boolean;
  chemotherapy: boolean;
  immunotherapy: boolean;
}

export interface HealthRecord {
  patient: { pseudonym: string; displayName: string };
  issuer: { name: string; issuedAt: string };
  history: MedicalHistory;
}

/** The six signed fields, in the order the UI should present them. */
export const SIGNED_FIELDS = [
  { key: 'nivolumab_counterindication', label: 'Nivolumab counter-indication' },
  { key: 'ipilinumab_counterindication', label: 'Ipilimumab counter-indication' },
  { key: 'active_autoimmune_therapy', label: 'Active autoimmune disease' },
  { key: 'chemotherapy', label: 'Prior chemotherapy' },
  { key: 'immunotherapy', label: 'Prior immunotherapy' },
  { key: 'age', label: 'Age' },
] as const satisfies ReadonlyArray<{ key: keyof MedicalHistory; label: string }>;

const MAX_AGE = 65535n; // Uint<16> in the contract.

/**
 * The signed message.
 *
 * The order is fixed by `hello-world.compact` -- five booleans, then age -- and must not
 * be rearranged for readability. A mismatch here produces signatures that verify
 * off-chain and fail in-circuit, which is a miserable thing to debug.
 */
export const historyToMessage = (history: MedicalHistory): Message6 => [
  history.nivolumab_counterindication ? 1n : 0n,
  history.ipilinumab_counterindication ? 1n : 0n,
  history.active_autoimmune_therapy ? 1n : 0n,
  history.chemotherapy ? 1n : 0n,
  history.immunotherapy ? 1n : 0n,
  history.age,
];

export type ParseResult =
  | { ok: true; record: HealthRecord }
  | { ok: false; errors: ReadonlyArray<{ path: string; message: string }> };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parse a pasted document, collecting every problem rather than throwing on the first,
 * so the editor can show them all at once.
 */
export const parseHealthRecord = (input: string): ParseResult => {
  const errors: Array<{ path: string; message: string }> = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, errors: [{ path: '', message: (error as Error).message }] };
  }

  if (!isObject(parsed)) {
    return { ok: false, errors: [{ path: '', message: 'Expected a JSON object' }] };
  }

  const str = (container: unknown, path: string, fallback: string): string => {
    if (!isObject(container)) return fallback;
    const key = path.split('.').at(-1)!;
    const value = container[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string') {
      errors.push({ path, message: 'Expected a string' });
      return fallback;
    }
    return value;
  };

  const history = parsed['history'];
  if (!isObject(history)) {
    errors.push({ path: 'history', message: 'Missing the signed "history" object' });
    return { ok: false, errors };
  }

  const bool = (key: keyof MedicalHistory): boolean => {
    const value = history[key];
    if (typeof value !== 'boolean') {
      errors.push({ path: `history.${key}`, message: 'Expected true or false' });
      return false;
    }
    return value;
  };

  const age = ((): bigint => {
    const value = history['age'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({ path: 'history.age', message: 'Expected a whole number' });
      return 0n;
    }
    if (value < 0 || BigInt(value) > MAX_AGE) {
      errors.push({ path: 'history.age', message: `Expected 0..${MAX_AGE}` });
      return 0n;
    }
    return BigInt(value);
  })();

  const record: HealthRecord = {
    patient: {
      pseudonym: str(parsed['patient'], 'patient.pseudonym', ''),
      displayName: str(parsed['patient'], 'patient.displayName', 'Unnamed patient'),
    },
    issuer: {
      name: str(parsed['issuer'], 'issuer.name', 'Unknown issuer'),
      issuedAt: str(parsed['issuer'], 'issuer.issuedAt', ''),
    },
    history: {
      age,
      nivolumab_counterindication: bool('nivolumab_counterindication'),
      ipilinumab_counterindication: bool('ipilinumab_counterindication'),
      active_autoimmune_therapy: bool('active_autoimmune_therapy'),
      chemotherapy: bool('chemotherapy'),
      immunotherapy: bool('immunotherapy'),
    },
  };

  return errors.length > 0 ? { ok: false, errors } : { ok: true, record };
};

/** Render a record back to the document form, with `age` as a plain JSON number. */
export const formatHealthRecord = (record: HealthRecord): string =>
  JSON.stringify(
    {
      patient: record.patient,
      issuer: record.issuer,
      history: { ...record.history, age: Number(record.history.age) },
    },
    null,
    2,
  );
