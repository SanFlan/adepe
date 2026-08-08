/**
 * The contract, running for real against an in-memory ledger.
 *
 * Every circuit call goes through the actual Compact runtime, so every `assert` fires
 * exactly as it would on chain; only proof generation is skipped. Private state is
 * swapped per call, which is what lets one page act as the admin, the issuer and several
 * patients in turn -- on chain each of those would be a separate prover with separate
 * secrets.
 */

import {
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, type AdepePrivateState, type Ledger } from './contract.js';
import { adepeWitnesses } from './witnesses.js';

export class AdepeSimulator {
  private readonly contract: Contract<AdepePrivateState>;
  private context: CircuitContext<AdepePrivateState>;

  /**
   * Deploying runs the constructor, which stamps the deployer's derived key into
   * `contractAdmin`. Whoever deploys is the only account that can register providers or
   * open trials thereafter.
   */
  constructor(
    adminState: AdepePrivateState,
    /** Overridden only by tests that need to model a dishonest prover. */
    witnesses: Partial<typeof adepeWitnesses> = {},
  ) {
    this.contract = new Contract<AdepePrivateState>({ ...adepeWitnesses, ...witnesses });
    const { currentPrivateState, currentContractState, currentZswapLocalState } =
      this.contract.initialState(
        createConstructorContext(adminState, '0'.repeat(64)),
      );
    this.context = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    } as CircuitContext<AdepePrivateState>;
  }

  ledger(): Ledger {
    return ledger(this.context.currentQueryContext.state);
  }

  /**
   * Call a circuit as a given party.
   *
   * The ledger carries over between calls; the private state does not. A throw leaves
   * the ledger untouched, matching a transaction that fails to prove and never lands.
   */
  callAs<K extends keyof Contract<AdepePrivateState>['impureCircuits']>(
    privateState: AdepePrivateState,
    circuit: K,
    ...args: unknown[]
  ): void {
    const impure = this.contract.impureCircuits as unknown as Record<
      string,
      (
        context: CircuitContext<AdepePrivateState>,
        ...rest: unknown[]
      ) => { context: CircuitContext<AdepePrivateState> }
    >;
    const { context } = impure[circuit as string]!(
      { ...this.context, currentPrivateState: privateState },
      ...args,
    );
    this.context = context;
  }
}
