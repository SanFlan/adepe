/**
 * Decode a stored credential back into the shape the witnesses hand to the circuit.
 *
 * Profiles are persisted as JSON, which has no bigint, so curve coordinates and the
 * response scalar are held as decimal strings. Every provider that runs the real contract
 * needs the same conversion.
 */

import type { Credential } from '../lib/contract.js';
import type { Profile } from '../lib/profiles.js';

export const toCredential = (profile: Profile): Credential | null => {
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
