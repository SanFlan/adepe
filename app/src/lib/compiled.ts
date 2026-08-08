/**
 * The contract wrapped for the midnight-js transaction machinery.
 *
 * The Node-side equivalent lives in `contract/contracts/index.ts`, but that module pulls
 * in `node:path` for the zk-config directory, which cannot be bundled for the browser. The
 * assets are located over HTTP here instead, so only the contract binding is shared.
 */

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract, type AdepePrivateState } from './contract.js';
import { adepeWitnesses } from './witnesses.js';

export const CompiledAdepeContract = CompiledContract.make(
  'AdepeContract',
  Contract,
).pipe(CompiledContract.withWitnesses(adepeWitnesses as never));

export type AdepeCircuitId =
  | 'registerProvider'
  | 'removeProvider'
  | 'createTrial'
  | 'Verify';

export type { AdepePrivateState };
