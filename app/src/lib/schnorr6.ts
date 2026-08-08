/**
 * Off-chain Jubjub Schnorr signing over a six-element message.
 *
 * The contract's `Verify` circuit signs `Vector<6, Field>` (five booleans then age,
 * fixed by `hello-world.compact`). The published helpers in
 * `@midnight-ntwrk/midnight-did-jubjub-schnorr` are hard-wired to a four-element digest,
 * and the `schnorrChallenge` pure circuit in `schnorr.compact` is both four-wide and not
 * re-exported through the contract's `PureCircuits`. So the challenge transcript is
 * rebuilt here.
 *
 * The `SchnorrHashInput6` descriptor below mirrors the generated `_SchnorrHashInput_0`
 * class in `contract/contracts/managed/hello-world/contract/index.js` field for field.
 * If the message width or field order in the circuit ever changes, this must change with
 * it, or every signature this module produces will be rejected. `schnorr6.test.ts` runs
 * the real compiled circuit to keep the two honest.
 */

import {
  CompactTypeField,
  CompactTypeVector,
  type CompactType,
  type JubjubPoint,
  ecAdd,
  ecMul,
  ecMulGenerator,
  jubjubPointX,
  jubjubPointY,
  transientHash,
} from '@midnight-ntwrk/compact-runtime';
import {
  JUBJUB_ORDER,
  TWO_248,
  deriveJubjubPublicKey,
  normalizeScalar,
  seedBytesToJubjubSecretScalar,
} from '@midnight-ntwrk/midnight-did-jubjub-schnorr';

/** The message the contract signs: five booleans as 0/1, then age. */
export type Message6 = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

export interface SchnorrSignature {
  announcement: JubjubPoint;
  response: bigint;
}

interface HashInput6 {
  ann_x: bigint;
  ann_y: bigint;
  pk_x: bigint;
  pk_y: bigint;
  msg: bigint[];
}

const msgType = new CompactTypeVector<bigint>(6, CompactTypeField);

/** Mirrors the generated `_SchnorrHashInput_0` for `n = 6`. */
const hashInput6Type: CompactType<HashInput6> = {
  alignment: () =>
    CompactTypeField.alignment()
      .concat(CompactTypeField.alignment())
      .concat(CompactTypeField.alignment())
      .concat(CompactTypeField.alignment())
      .concat(msgType.alignment()),
  toValue: (value) =>
    CompactTypeField.toValue(value.ann_x)
      .concat(CompactTypeField.toValue(value.ann_y))
      .concat(CompactTypeField.toValue(value.pk_x))
      .concat(CompactTypeField.toValue(value.pk_y))
      .concat(msgType.toValue(value.msg)),
  // Never used: we only ever hash. The generated version consumes a shared cursor, which
  // is not reproducible from the public API, so decoding is deliberately unsupported.
  fromValue: () => {
    throw new Error('hashInput6Type.fromValue is not supported');
  },
};

/**
 * The untruncated challenge, exactly as `schnorrVerify<6>` computes it in-circuit.
 */
export const challenge6Full = (
  announcement: JubjubPoint,
  publicKey: JubjubPoint,
  msg: Message6,
): bigint =>
  transientHash(hashInput6Type, {
    ann_x: jubjubPointX(announcement),
    ann_y: jubjubPointY(announcement),
    pk_x: jubjubPointX(publicKey),
    pk_y: jubjubPointY(publicKey),
    msg: [...msg],
  });

/**
 * The challenge scalar. The circuit reduces the transcript hash mod 2^248 so it lands
 * below the Jubjub subgroup order; signing must reduce identically.
 */
export const challenge6 = (
  announcement: JubjubPoint,
  publicKey: JubjubPoint,
  msg: Message6,
): bigint => challenge6Full(announcement, publicKey, msg) % TWO_248;

/**
 * The `getSchnorrReduction` witness: the quotient and remainder of dividing the
 * transcript hash by 2^248. The circuit checks `q < 116` and
 * `q * 2^248 + r == cFull`, which together pin a unique pair.
 */
export const schnorrReduction = (challengeHash: bigint): [bigint, bigint] => [
  challengeHash / TWO_248,
  challengeHash % TWO_248,
];

const randomScalar = (): bigint => {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  const nonce = value % JUBJUB_ORDER;
  // A zero nonce would publish R = identity and leak the secret key outright.
  return nonce === 0n ? 1n : nonce;
};

export const signMessage6 = (
  secretScalar: bigint,
  msg: Message6,
  nonce: bigint = randomScalar(),
): SchnorrSignature => {
  const sk = normalizeScalar(secretScalar);
  const publicKey = deriveJubjubPublicKey(sk);
  const announcement = ecMulGenerator(nonce);
  const c = challenge6(announcement, publicKey, msg);
  const response = (nonce + c * sk) % JUBJUB_ORDER;
  return { announcement, response };
};

export const signMessage6FromSeed = (
  seedBytes: Uint8Array,
  msg: Message6,
): SchnorrSignature => signMessage6(seedBytesToJubjubSecretScalar(seedBytes), msg);

/** The same check `schnorrVerify<6>` performs: `G*s == R + pk*c`. */
export const verifyMessage6 = (
  publicKey: JubjubPoint,
  msg: Message6,
  signature: SchnorrSignature,
): boolean => {
  const c = challenge6(signature.announcement, publicKey, msg);
  const lhs = ecMulGenerator(normalizeScalar(signature.response));
  const rhs = ecAdd(signature.announcement, ecMul(publicKey, c));
  return jubjubPointX(lhs) === jubjubPointX(rhs) && jubjubPointY(lhs) === jubjubPointY(rhs);
};

export { deriveJubjubPublicKey, seedBytesToJubjubSecretScalar, JUBJUB_ORDER, TWO_248 };
export type { JubjubPoint };
