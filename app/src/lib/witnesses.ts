/**
 * The three witnesses the contract declares.
 *
 * Each returns the private state unchanged: nothing the contract does needs to mutate
 * it, so the identity return keeps the runtime's state-threading honest without
 * pretending there is more going on.
 */

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { AdepePrivateState, Ledger, MedicalHistoryWitness } from './contract.js';
import { schnorrReduction } from './schnorr6.js';

type Ctx = WitnessContext<Ledger, AdepePrivateState>;

export const adepeWitnesses = {
  getUserSecret: ({ privateState }: Ctx): [AdepePrivateState, Uint8Array] => [
    privateState,
    privateState.userSecret,
  ],

  getWitnessMedicalHistory: ({
    privateState,
  }: Ctx): [AdepePrivateState, MedicalHistoryWitness] => {
    const { credential } = privateState;
    if (credential === null) {
      throw new Error('This profile holds no signed record yet — have the issuer sign one first.');
    }
    return [
      privateState,
      [credential.history, credential.signature, credential.issuerPublicKey],
    ];
  },

  getSchnorrReduction: (
    { privateState }: Ctx,
    challengeHash: bigint,
  ): [AdepePrivateState, [bigint, bigint]] => [privateState, schnorrReduction(challengeHash)],
};
