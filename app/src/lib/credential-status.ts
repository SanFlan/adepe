/**
 * What state a patient's credential is in, from the outside.
 *
 * Four things can be wrong with a held credential, and they are worth distinguishing
 * because they fail at different points: an unsigned or stale record never gets as far as
 * the circuit, a bad signature is caught by `schnorrVerify`, and an untrusted issuer
 * passes the signature check and is rejected by the `providers` membership test.
 */

import { issuerPublicKey } from './issuer.js';
import type { Profile } from './profiles.js';
import { historyToMessage, type MedicalHistory } from './record.js';
import { verifyMessage6 } from './schnorr6.js';

export type CredentialStatus =
  | 'unsigned'
  | 'stale'
  | 'invalid'
  | 'untrusted-issuer'
  | 'signed';

export const historyEquals = (a: MedicalHistory, b: MedicalHistory): boolean =>
  a.age === b.age &&
  a.nivolumab_counterindication === b.nivolumab_counterindication &&
  a.ipilinumab_counterindication === b.ipilinumab_counterindication &&
  a.active_autoimmune_therapy === b.active_autoimmune_therapy &&
  a.chemotherapy === b.chemotherapy &&
  a.immunotherapy === b.immunotherapy;

export const credentialStatus = (profile: Profile): CredentialStatus => {
  const stored = profile.credential;
  if (stored === null) return 'unsigned';

  // The document was edited after signing, so the attestation covers something else.
  if (!historyEquals(stored.history, profile.record.history)) return 'stale';

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
  if (!verifyMessage6(publicKey, historyToMessage(stored.history), signature)) {
    return 'invalid';
  }

  const trusted = publicKey.x === issuerPublicKey.x && publicKey.y === issuerPublicKey.y;
  return trusted ? 'signed' : 'untrusted-issuer';
};

export const STATUS_LABEL: Record<CredentialStatus, string> = {
  unsigned: 'not signed',
  stale: 'record changed since signing',
  invalid: 'signature does not verify',
  'untrusted-issuer': 'signed by an unregistered issuer',
  signed: 'signed',
};

/** Maps onto the `.pill` tone classes in app.css. */
export const STATUS_TONE: Record<CredentialStatus, 'good' | 'warn' | 'bad' | ''> = {
  unsigned: '',
  stale: 'warn',
  invalid: 'bad',
  'untrusted-issuer': 'bad',
  signed: 'good',
};

/** Whether this credential would be accepted, before eligibility is even considered. */
export const isUsable = (status: CredentialStatus): boolean => status === 'signed';
