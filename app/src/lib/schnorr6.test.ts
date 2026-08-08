/**
 * These tests are the contract between the off-chain signer and the on-chain verifier.
 *
 * `challenge6` reimplements a transcript that otherwise only exists inside the circuit,
 * so a pure-TypeScript round trip proves nothing on its own -- it would happily agree
 * with itself while disagreeing with the contract. Everything below therefore runs the
 * real compiled `Verify`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  ecAdd,
  ecMul,
  ecMulGenerator,
  type JubjubPoint,
} from '@midnight-ntwrk/compact-runtime';
import {
  JUBJUB_ORDER,
  TWO_248 as TWO_248_LITERAL,
  challenge6,
  deriveJubjubPublicKey,
  seedBytesToJubjubSecretScalar,
  signMessage6,
  verifyMessage6,
  type Message6,
} from './schnorr6.js';
import { historyToMessage, type MedicalHistory } from './record.js';
import { AdepeSimulator } from './simulator.js';
import type { AdepePrivateState, Credential } from './contract.js';

const seed = (byte: number) => new Uint8Array(32).fill(byte);

const ADMIN_SECRET = seed(1);
const ISSUER_SEED = seed(2);
const PATIENT_SECRET = seed(3);

const ISSUER_SK = seedBytesToJubjubSecretScalar(ISSUER_SEED);
const ISSUER_PK = deriveJubjubPublicKey(ISSUER_SK);

const TRIAL_ID = 42n;

/** Matches the trial opened in `openTrial` below: ages 18-75, no prior therapy. */
const ELIGIBLE: MedicalHistory = {
  age: 54n,
  nivolumab_counterindication: false,
  ipilinumab_counterindication: false,
  active_autoimmune_therapy: false,
  chemotherapy: false,
  immunotherapy: false,
};

const credentialFor = (history: MedicalHistory): Credential => ({
  history,
  signature: signMessage6(ISSUER_SK, historyToMessage(history)),
  issuerPublicKey: ISSUER_PK,
});

const patientState = (credential: Credential | null): AdepePrivateState => ({
  userSecret: PATIENT_SECRET,
  credential,
});

const adminState: AdepePrivateState = { userSecret: ADMIN_SECRET, credential: null };

/** Deploy, open one trial, and trust the issuer. */
const openTrial = (
  witnesses: ConstructorParameters<typeof AdepeSimulator>[1] = {},
): AdepeSimulator => {
  const sim = new AdepeSimulator(adminState, witnesses);
  sim.callAs(adminState, 'createTrial', TRIAL_ID, 18n, 75n, false, false, false, false, false);
  sim.callAs(adminState, 'registerProvider', ISSUER_PK);
  return sim;
};

const isEnrolled = (sim: AdepeSimulator): boolean =>
  sim.ledger().ElegiblePeople.lookup(TRIAL_ID).size() > 0n;

beforeAll(() => {
  // Circuits run locally against an in-memory ledger; nothing is submitted anywhere.
  setNetworkId('undeployed');
});

describe('off-chain signing against the compiled circuit', () => {
  it('accepts a signature the circuit also accepts', () => {
    const sim = openTrial();
    sim.callAs(patientState(credentialFor(ELIGIBLE)), 'Verify', TRIAL_ID);
    expect(isEnrolled(sim)).toBe(true);
  });

  it('verifies off-chain in agreement with the circuit', () => {
    const msg = historyToMessage(ELIGIBLE);
    expect(verifyMessage6(ISSUER_PK, msg, signMessage6(ISSUER_SK, msg))).toBe(true);
  });

  it('rejects a signature over a different record', () => {
    const credential = credentialFor(ELIGIBLE);
    // Same signature, one field flipped after the fact.
    const tampered: Credential = {
      ...credential,
      history: { ...ELIGIBLE, chemotherapy: true },
    };
    const sim = openTrial();
    expect(() => sim.callAs(patientState(tampered), 'Verify', TRIAL_ID)).toThrow(
      /Invalid attestation signature/,
    );
  });

  it('rejects a signature from an issuer the admin never registered', () => {
    const rogueSk = seedBytesToJubjubSecretScalar(seed(9));
    const msg = historyToMessage(ELIGIBLE);
    const sim = openTrial();
    // The signature itself is valid, so schnorrVerify passes; the provider check is what
    // stops it, and Verify returns silently rather than asserting.
    sim.callAs(
      patientState({
        history: ELIGIBLE,
        signature: signMessage6(rogueSk, msg),
        issuerPublicKey: deriveJubjubPublicKey(rogueSk),
      }),
      'Verify',
      TRIAL_ID,
    );
    expect(isEnrolled(sim)).toBe(false);
  });
});

/** The BLS12-381 scalar field, which `Field` values live in. */
const FIELD_MODULUS =
  52435875175126190479447740508185965837690552500527637822603658699938581184513n;

const modInverse = (value: bigint, modulus: bigint): bigint => {
  let [old_r, r] = [((value % modulus) + modulus) % modulus, modulus];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % modulus) + modulus) % modulus;
};

describe('challenge reduction soundness', () => {
  /**
   * The forgery that the `q < 116` bound in `schnorr.compact` exists to stop.
   *
   * A dishonest prover picks the challenge instead of deriving it: choose `c` and `s`
   * freely, then set `R = G*s - pk*c`, so `G*s == R + pk*c` holds by construction and the
   * curve check passes for a key they do not hold. All that stands in the way is the
   * reduction check `q * 2^248 + r == cFull`, and they control `q` and `r` because both
   * come from the `getSchnorrReduction` witness. Since that equation lives in the scalar
   * field, `q = (cFull - c) * (2^248)^-1 mod p` always exists -- so with `q` unbounded,
   * any `c` they like is admissible.
   *
   * Bounding `q` to `Uint<7>` with `q < 116` makes the pair unique, and the forged `q`
   * below is astronomically larger than 116.
   */
  it('rejects a forged signature built from a chosen challenge', () => {
    const chosenChallenge = 12345n;
    const response = 6789n;
    const victimPk: JubjubPoint = ISSUER_PK;
    // R = G*s - pk*c, i.e. G*s + pk*(order - c).
    const announcement = ecAdd(
      ecMulGenerator(response),
      ecMul(victimPk, JUBJUB_ORDER - chosenChallenge),
    );
    const msg: Message6 = historyToMessage(ELIGIBLE);

    // The honest transcript disagrees with the chosen challenge, so the attack depends
    // entirely on smuggling `chosenChallenge` through the reduction witness.
    expect(challenge6(announcement, victimPk, msg)).not.toBe(chosenChallenge);

    const forgedReduction = (
      { privateState }: { privateState: AdepePrivateState },
      cFull: bigint,
    ): [AdepePrivateState, [bigint, bigint]] => {
      const q =
        ((cFull - chosenChallenge) * modInverse(TWO_248_LITERAL, FIELD_MODULUS)) % FIELD_MODULUS;
      expect(q).toBeGreaterThan(116n); // the bound is what rejects this
      expect((q * TWO_248_LITERAL + chosenChallenge) % FIELD_MODULUS).toBe(cFull);
      return [privateState, [q, chosenChallenge]];
    };

    const sim = openTrial({ getSchnorrReduction: forgedReduction });
    expect(() =>
      sim.callAs(
        patientState({
          history: ELIGIBLE,
          signature: { announcement, response },
          issuerPublicKey: victimPk,
        }),
        'Verify',
        TRIAL_ID,
      ),
    ).toThrow();
    expect(isEnrolled(sim)).toBe(false);
  });
});
