import { describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { credentialStatus, historyEquals, isUsable } from './credential-status.js';
import { ARCHETYPES, profileFromArchetype, toStoredCredential, type Profile } from './profiles.js';
import {
  ISSUER_NAME,
  ROGUE_NAME,
  issuerPublicKey,
  roguePublicKey,
  rogueSecret,
  signHistory,
} from './issuer.js';

setNetworkId('undeployed');

const base = () => profileFromArchetype(ARCHETYPES[0]!);

const sign = (profile: Profile, rogue = false): Profile => ({
  ...profile,
  credential: toStoredCredential(
    profile.record.history,
    signHistory(profile.record.history, rogue ? rogueSecret : undefined),
    rogue ? roguePublicKey : issuerPublicKey,
    rogue ? ROGUE_NAME : ISSUER_NAME,
  ),
});

describe('credentialStatus', () => {
  it('reports an unsigned profile', () => {
    expect(credentialStatus(base())).toBe('unsigned');
  });

  it('reports a good attestation', () => {
    expect(credentialStatus(sign(base()))).toBe('signed');
    expect(isUsable(credentialStatus(sign(base())))).toBe(true);
  });

  it('reports an unregistered issuer separately from a bad signature', () => {
    // The signature is perfectly valid; only the key is not trusted.
    expect(credentialStatus(sign(base(), true))).toBe('untrusted-issuer');
    expect(isUsable(credentialStatus(sign(base(), true)))).toBe(false);
  });

  it('notices a record edited after signing', () => {
    const profile = sign(base());
    const edited: Profile = {
      ...profile,
      record: {
        ...profile.record,
        history: { ...profile.record.history, chemotherapy: true },
      },
    };
    expect(credentialStatus(edited)).toBe('stale');
  });

  it('notices a signature that does not verify', () => {
    const profile = sign(base());
    const tampered: Profile = {
      ...profile,
      credential: {
        ...profile.credential!,
        signature: {
          ...profile.credential!.signature,
          response: String(BigInt(profile.credential!.signature.response) + 1n),
        },
      },
    };
    expect(credentialStatus(tampered)).toBe('invalid');
  });

  it('compares exactly the six signed fields', () => {
    const a = ARCHETYPES[0]!.history;
    expect(historyEquals(a, { ...a })).toBe(true);
    expect(historyEquals(a, { ...a, age: a.age + 1n })).toBe(false);
    expect(historyEquals(a, { ...a, immunotherapy: !a.immunotherapy })).toBe(false);
  });
});
