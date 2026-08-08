/**
 * The demo issuer: a clinic that attests to patients' medical histories.
 *
 * On a real deployment this key lives inside the provider's own systems and never touches a
 * patient's browser: the app would send a record to the clinic and receive a signature
 * back. Here the browser signs, because there is no clinic to ask.
 *
 * The seed comes from VITE_ISSUER_SEED when set, so it need not be committed and a
 * deployment can use its own. **This does not make it secret.** Vite inlines every VITE_*
 * variable into the bundle at build time, so the key ships to every visitor either way and
 * anyone can mint credentials the contract accepts. Moving it out of source control is
 * hygiene, not a fix; the fix is a service that holds the key.
 *
 * Keeping the issuer visible in the UI is deliberate. It is the reason the contract trusts
 * anything at all, and hiding it would make the demo look like patients self-certify.
 */

import { historyToMessage, type MedicalHistory } from './record.js';
import {
  deriveJubjubPublicKey,
  seedBytesToJubjubSecretScalar,
  signMessage6,
  type JubjubPoint,
  type SchnorrSignature,
} from './schnorr6.js';

/** Used when VITE_ISSUER_SEED is unset, so a fresh clone runs with no configuration. */
const DEMO_SEED = new Uint8Array(32).fill(2);

const seedFromEnv = (): Uint8Array => {
  const configured = (import.meta.env['VITE_ISSUER_SEED'] as string | undefined)?.trim();
  if (configured === undefined || configured === '') return DEMO_SEED;

  if (!/^[0-9a-fA-F]{64}$/.test(configured)) {
    // Falling back silently would produce credentials the contract rejects, with nothing
    // pointing at the typo that caused it.
    throw new Error('VITE_ISSUER_SEED must be 64 hex characters (32 bytes, no 0x prefix).');
  }
  return new Uint8Array((configured.match(/../g) ?? []).map((byte) => parseInt(byte, 16)));
};

const ISSUER_SEED = seedFromEnv();

/** Whether the issuer is the built-in demo one. Shown in the UI so it is never a surprise. */
export const usingDemoIssuerKey = ISSUER_SEED === DEMO_SEED;

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
