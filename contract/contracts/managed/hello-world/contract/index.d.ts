import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum BoolRestrictions { NIVOLUMAB_COUNTER_INDICATION = 0,
                               IPILINUMAB_COUNTER_INDICATION = 1,
                               ACTIVE_AUTOIMMUNE_DISEASE = 2,
                               CHEMOTHERAPY = 3,
                               IMMUNOTHERAPY = 4
}

export enum MinMaxRestrictions { AGE = 0 }

export type Witnesses<PS> = {
  getSchnorrReduction(context: __compactRuntime.WitnessContext<Ledger, PS>,
                      challengeHash_0: bigint): [PS, [bigint, bigint]];
  getUserSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getWitnessMedicalHistory(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, [{ age: bigint,
                                                                                          nivolumab_counterindication: boolean,
                                                                                          ipilinumab_counterindication: boolean,
                                                                                          active_autoimmune_therapy: boolean,
                                                                                          chemotherapy: boolean,
                                                                                          immunotherapy: boolean
                                                                                        },
                                                                                        { announcement: __compactRuntime.JubjubPoint,
                                                                                          response: bigint
                                                                                        },
                                                                                        __compactRuntime.JubjubPoint]];
}

export type ImpureCircuits<PS> = {
  registerProvider(context: __compactRuntime.CircuitContext<PS>,
                   providerPk_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, []>;
  removeProvider(context: __compactRuntime.CircuitContext<PS>,
                 providerPk_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, []>;
  Verify(context: __compactRuntime.CircuitContext<PS>, trialID_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerProvider(context: __compactRuntime.CircuitContext<PS>,
                   providerPk_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, []>;
  removeProvider(context: __compactRuntime.CircuitContext<PS>,
                 providerPk_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, []>;
  Verify(context: __compactRuntime.CircuitContext<PS>, trialID_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  deriveAdminPublicKey(sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  deriveAdminPublicKey(context: __compactRuntime.CircuitContext<PS>,
                       sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerProvider(context: __compactRuntime.CircuitContext<PS>,
                   providerPk_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, []>;
  removeProvider(context: __compactRuntime.CircuitContext<PS>,
                 providerPk_0: __compactRuntime.JubjubPoint): __compactRuntime.CircuitResults<PS, []>;
  Verify(context: __compactRuntime.CircuitContext<PS>, trialID_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  TrialBoolRestrictions: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): {
      isEmpty(): boolean;
      size(): bigint;
      member(key_1: BoolRestrictions): boolean;
      lookup(key_1: BoolRestrictions): boolean;
      [Symbol.iterator](): Iterator<[BoolRestrictions, boolean]>
    }
  };
  TrialMinMaxRestrictions: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): {
      isEmpty(): boolean;
      size(): bigint;
      member(key_1: MinMaxRestrictions): boolean;
      lookup(key_1: MinMaxRestrictions): [bigint, bigint];
      [Symbol.iterator](): Iterator<[MinMaxRestrictions, [bigint, bigint]]>
    }
  };
  ElegiblePeople: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): {
      isEmpty(): boolean;
      size(): bigint;
      member(elem_0: Uint8Array): boolean;
      [Symbol.iterator](): Iterator<Uint8Array>
    }
  };
  readonly contractAdmin: Uint8Array;
  providers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: __compactRuntime.JubjubPoint): boolean;
    [Symbol.iterator](): Iterator<__compactRuntime.JubjubPoint>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
