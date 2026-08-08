import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
  type Witnesses,
} from './managed/hello-world/contract/index.js';
import { Contract, type Witnesses } from './managed/hello-world/contract/index.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'hello-world');

const base = CompiledContract.make('HelloWorldContract', Contract);

/**
 * The contract with no witness implementations.
 *
 * Only `registerProvider`, `removeProvider` and `createTrial` can be called this way, and
 * only if the caller does not need `getUserSecret` -- which they do, for the admin check.
 * In practice every circuit needs witnesses, so prefer {@link compiledContract}.
 */
export const CompiledHelloWorldContract = base.pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

/**
 * The contract bound to a caller's witnesses.
 *
 * Every circuit reads `getUserSecret`, and `Verify` additionally needs the signed record
 * and the Schnorr reduction, so the caller has to supply all three.
 */
export const compiledContract = <PS>(witnesses: Witnesses<PS>) =>
  base.pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
