/**
 * The local-proofs provider, against a real proof server.
 *
 * The browser injects a fetch-backed ZK config provider; here it is the filesystem one, so
 * the same provider code runs under vitest. Requires:
 *
 *   cd ../contract && docker compose up -d --wait proof-server
 *
 * Skipped when the proof server is unreachable, so `npm test` stays offline by default.
 * Set ADEPE_REQUIRE_PROOF_SERVER=1 to make that a failure instead.
 *
 * Runs in the node environment, not jsdom. The proof client type-checks its payload with
 * `instanceof Uint8Array`, and jsdom's realm has its own Uint8Array, so a jsdom run fails
 * with "expected Uint8Array" before it ever reaches the proof server. A browser has only
 * one realm, so this is a test-harness concern rather than a bug in the provider.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { resolve } from 'node:path';

import { LocalProofsProvider } from './localProofs.js';
import type { AdepeCircuitId } from '../lib/compiled.js';
import { ARCHETYPES, profileFromArchetype, toStoredCredential, type Profile } from '../lib/profiles.js';
import {
  ISSUER_NAME,
  ROGUE_NAME,
  issuerPublicKey,
  roguePublicKey,
  rogueSecret,
  signHistory,
} from '../lib/issuer.js';
import { TRIALS } from '../lib/trials.js';

const PROOF_SERVER = 'http://127.0.0.1:6300';
// Resolved from the package root: under the jsdom environment `import.meta.url` is an
// http URL, not a file one.
const zkConfigPath = resolve(process.cwd(), '../contract/contracts/managed/hello-world');

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

const proofServerUp = async (): Promise<boolean> => {
  try {
    const response = await fetch(PROOF_SERVER, { signal: AbortSignal.timeout(2000) });
    return response.status < 600;
  } catch {
    return false;
  }
};

// Probed at module load so the suite can be *skipped* rather than silently passing.
// A test that returns early on a missing dependency still reports green, which is
// indistinguishable from one that actually ran.
const online = await proofServerUp();

if (!online && process.env['ADEPE_REQUIRE_PROOF_SERVER'] === '1') {
  throw new Error(
    `Proof server unreachable at ${PROOF_SERVER}. ` +
      'Start it: cd ../contract && docker compose up -d --wait proof-server',
  );
}

describe.skipIf(!online)('local-proofs provider', () => {
  let provider: LocalProofsProvider;

  beforeAll(async () => {
    setNetworkId('undeployed');
    provider = new LocalProofsProvider(
      new NodeZkConfigProvider<AdepeCircuitId>(zkConfigPath),
      PROOF_SERVER,
    );
    // Proves five createTrial calls and one registerProvider.
    await provider.init();
  }, 300_000);

  it('comes up ready with the catalogue open', () => {
    expect(provider.status().ready).toBe(true);
    const trials = provider.listTrials();
    expect(trials).toHaveLength(TRIALS.length);
    expect(trials.every((entry) => entry.open)).toBe(true);
  });

  it('records that proofs were actually generated', () => {
    // init() proved six calls; a real proof takes real time.
    expect(provider.lastProofDuration()).toBeGreaterThan(0);
  });

  it('enrolls an eligible patient behind a real proof', async () => {
    const profile = signedProfile();

    const result = await provider.enroll(profile, HORIZON);
    expect(result.outcome).toBe('enrolled');
    expect(provider.isEnrolled(profile, HORIZON)).toBe(true);
    expect(
      provider.listTrials().find((entry) => entry.trial.id === HORIZON)?.enrolledCount,
    ).toBe(1);
  }, 120_000);

  it('turns away an ineligible patient', async () => {
    const result = await provider.enroll(signedProfile(), VANGUARD);
    expect(result.outcome).toBe('ineligible');
    expect(
      provider.listTrials().find((entry) => entry.trial.id === VANGUARD)?.enrolledCount,
    ).toBe(0);
  }, 120_000);

  it('turns away a valid signature from an unregistered issuer', async () => {
    const result = await provider.enroll(signedProfile(true), HORIZON);
    expect(result.outcome).toBe('untrusted-issuer');
  }, 120_000);

  it('does not enroll the same patient twice', async () => {
    const profile = signedProfile();
    await provider.enroll(profile, HORIZON);
    const second = await provider.enroll(profile, HORIZON);
    expect(second.outcome).toBe('already-enrolled');
  }, 180_000);
});
