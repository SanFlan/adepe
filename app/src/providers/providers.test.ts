/**
 * Both providers, driven through the flow the demo actually follows.
 *
 * They are held to the same assertions on purpose: the promise of the mode switcher is
 * that the page behaves identically whichever one is underneath, and the only way that
 * stays true is to test them as one.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { MockedProvider } from './mocked.js';
import { SimulatedProvider } from './simulated.js';
import type { TrialsProvider } from './types.js';
import {
  ARCHETYPES,
  profileFromArchetype,
  toStoredCredential,
  type Profile,
} from '../lib/profiles.js';
import {
  ISSUER_NAME,
  ROGUE_NAME,
  issuerPublicKey,
  roguePublicKey,
  rogueSecret,
  signHistory,
} from '../lib/issuer.js';
import { TRIALS } from '../lib/trials.js';

setNetworkId('undeployed');

/** Marta is treatment-naive at 54: clears HORIZON-1, fails VANGUARD-5 on age. */
const MARTA = ARCHETYPES[0]!;
const HORIZON = TRIALS[0]!.id;
const VANGUARD = TRIALS[4]!.id;

const signedProfile = (rogue = false): Profile => {
  const profile = profileFromArchetype(MARTA);
  return {
    ...profile,
    credential: toStoredCredential(
      profile.record.history,
      signHistory(profile.record.history, rogue ? rogueSecret : undefined),
      rogue ? roguePublicKey : issuerPublicKey,
      rogue ? ROGUE_NAME : ISSUER_NAME,
    ),
  };
};

const cases: ReadonlyArray<[string, () => TrialsProvider]> = [
  ['mocked', () => new MockedProvider()],
  ['simulated', () => new SimulatedProvider()],
];

describe.each(cases)('%s provider', (_name, make) => {
  let provider: TrialsProvider;

  beforeEach(async () => {
    localStorage.clear();
    provider = make();
    await provider.init();
    await provider.reset();
  });

  it('reports ready and opens the whole catalogue', () => {
    expect(provider.status().ready).toBe(true);
    const trials = provider.listTrials();
    expect(trials).toHaveLength(TRIALS.length);
    expect(trials.every((entry) => entry.open)).toBe(true);
    expect(trials.every((entry) => entry.enrolledCount === 0)).toBe(true);
  });

  it('refuses a profile with no credential', async () => {
    const result = await provider.enroll(profileFromArchetype(MARTA), HORIZON);
    expect(result.outcome).toBe('no-credential');
  });

  it('enrolls an eligible patient and increments the public count', async () => {
    const profile = signedProfile();
    expect(provider.isEnrolled(profile, HORIZON)).toBe(false);

    const result = await provider.enroll(profile, HORIZON);
    expect(result.outcome).toBe('enrolled');
    expect(provider.isEnrolled(profile, HORIZON)).toBe(true);

    const trial = provider.listTrials().find((entry) => entry.trial.id === HORIZON);
    expect(trial?.enrolledCount).toBe(1);
  });

  it('does not enroll the same patient twice', async () => {
    const profile = signedProfile();
    await provider.enroll(profile, HORIZON);
    const second = await provider.enroll(profile, HORIZON);

    expect(second.outcome).toBe('already-enrolled');
    expect(
      provider.listTrials().find((entry) => entry.trial.id === HORIZON)?.enrolledCount,
    ).toBe(1);
  });

  it('turns away an ineligible patient without recording anything', async () => {
    const profile = signedProfile();
    const result = await provider.enroll(profile, VANGUARD);

    expect(result.outcome).toBe('ineligible');
    expect(provider.isEnrolled(profile, VANGUARD)).toBe(false);
    expect(
      provider.listTrials().find((entry) => entry.trial.id === VANGUARD)?.enrolledCount,
    ).toBe(0);
  });

  it('turns away a valid signature from an unregistered issuer', async () => {
    const result = await provider.enroll(signedProfile(true), HORIZON);
    expect(result.outcome).toBe('untrusted-issuer');
  });

  it('keeps two patients distinct in the same trial', async () => {
    const first = signedProfile();
    const second = signedProfile();

    await provider.enroll(first, HORIZON);
    await provider.enroll(second, HORIZON);

    expect(provider.isEnrolled(first, HORIZON)).toBe(true);
    expect(provider.isEnrolled(second, HORIZON)).toBe(true);
    expect(
      provider.listTrials().find((entry) => entry.trial.id === HORIZON)?.enrolledCount,
    ).toBe(2);
  });

  it('exposes only opaque keys on the ledger', async () => {
    await provider.enroll(signedProfile(), HORIZON);
    const panels = provider.ledgerPanels();
    const flat = JSON.stringify(panels);

    // Nothing identifying the patient or their history should be reachable from here.
    expect(flat).not.toContain('Marta');
    expect(flat).not.toContain('chemotherapy');
    expect(panels.some((panel) => panel.title === 'ElegiblePeople')).toBe(true);
  });
});
