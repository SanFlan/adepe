/**
 * The demo issuer: a clinic that attests to patients' medical histories.
 *
 * On a real deployment this key would live inside the provider's own systems and never
 * touch a patient's browser. Here it is a fixed seed so the public key is stable across
 * reloads and the admin can register it once. Keeping the issuer visible in the UI is
 * deliberate -- it is the reason the contract trusts anything at all, and hiding it would
 * make the demo look like patients self-certify.
 */

import { historyToMessage, type MedicalHistory } from './record.js';
import {
  deriveJubjubPublicKey,
  seedBytesToJubjubSecretScalar,
  signMessage6,
  type JubjubPoint,
  type SchnorrSignature,
} from './schnorr6.js';

const ISSUER_SEED = new Uint8Array(32).fill(2);

export const ISSUER_NAME = 'Northgate Oncology';

export const issuerSecret: bigint = seedBytesToJubjubSecretScalar(ISSUER_SEED);
export const issuerPublicKey: JubjubPoint = deriveJubjubPublicKey(issuerSecret);

/** An issuer nobody registered, for showing what an untrusted attestation looks like. */
export const ROGUE_NAME = 'Backstreet Diagnostics';
export const rogueSecret: bigint = seedBytesToJubjubSecretScalar(new Uint8Array(32).fill(9));
export const roguePublicKey: JubjubPoint = deriveJubjubPublicKey(rogueSecret);

export const signHistory = (
  history: MedicalHistory,
  secret: bigint = issuerSecret,
): SchnorrSignature => signMessage6(secret, historyToMessage(history));

/** Abbreviate a curve point for display. */
export const formatPoint = (point: JubjubPoint): string => {
  const x = point.x.toString(16).padStart(64, '0');
  return `${x.slice(0, 10)}…${x.slice(-8)}`;
};
