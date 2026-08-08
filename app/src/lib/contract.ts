/**
 * The compiled contract, and the private state its witnesses read from.
 *
 * Imported from `managed/` directly rather than through `contract/contracts/index.ts`,
 * which pulls in `node:path` and a Node-only zk-config path and so cannot be bundled for
 * the browser.
 */

import type { JubjubPoint } from '@midnight-ntwrk/compact-runtime';

export {
  Contract,
  ledger,
  pureCircuits,
} from '../../../contract/contracts/managed/hello-world/contract/index.js';
export type {
  Ledger,
  Witnesses,
  ImpureCircuits,
} from '../../../contract/contracts/managed/hello-world/contract/index.js';

import type { MedicalHistory } from './record.js';
import type { SchnorrSignature } from './schnorr6.js';

/** What the contract's witnesses can see. Never leaves the browser. */
export interface AdepePrivateState {
  /** Preimage of the enrollment pseudonym, and of the admin key for whoever deployed. */
  readonly userSecret: Uint8Array;
  /** The signed record this patient holds, if an issuer has granted one. */
  readonly credential: Credential | null;
}

export interface Credential {
  readonly history: MedicalHistory;
  readonly signature: SchnorrSignature;
  readonly issuerPublicKey: JubjubPoint;
}

/** The shape `getWitnessMedicalHistory` must return. */
export type MedicalHistoryWitness = [MedicalHistory, SchnorrSignature, JubjubPoint];
