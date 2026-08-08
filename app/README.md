# ADEPE — app

A browser front end for the clinical-trial eligibility contract in `../contract`.

A patient holds a medical history signed by a clinical provider. To enroll in a trial
they prove, in zero knowledge, that the signed history meets that trial's criteria —
without revealing the history itself. The ledger ends up holding one opaque key per
enrollment and nothing else.

The compiled contract is generated output and is not committed, so compile it first:

```
cd ../contract && yarn install && yarn compile
cd ../app && npm install && npm run dev
```

`npm run dev`, `build` and `test` all check for the compiled contract first and tell you
what to run if it is missing.

## The three modes

Switch between them in the header. The views are written against a single
`TrialsProvider` interface (`src/providers/types.ts`), so what changes is only what is
real underneath.

| Mode | Signatures | Eligibility check | Ledger |
| --- | --- | --- | --- |
| **Mocked** | real | TypeScript | `localStorage` object |
| **Simulated** | real | the real compiled circuit | in-memory, real runtime |
| **Testnet** | — | — | not wired yet |

Simulated mode runs the actual circuits through the Compact runtime, so every `assert`
in `hello-world.compact` fires exactly as it would on chain. The only thing missing is
proof generation, which is what separates it from testnet.

Mocked mode fakes the ledger but **not** the cryptography: the issuer's Schnorr signature
is produced and verified with the same code the circuit's transcript is built from, and
pseudonyms come from the contract's own `enrollmentKey`. It is honest about who signed
what, and dishonest only about proving it to anyone else.

## What is actually signed

Only six fields — the ones `Verify` reads:

```
msg[0]  nivolumab_counterindication
msg[1]  ipilinumab_counterindication
msg[2]  active_autoimmune_therapy
msg[3]  chemotherapy
msg[4]  immunotherapy
msg[5]  age
```

Everything else in the record document (patient name, issuer, dates) is presentation.
Nobody attests to it and the circuit never sees it, so the UI marks the difference
rather than letting the two blur together.

The order is fixed by the circuit. `src/lib/schnorr6.ts` rebuilds the
`SchnorrHashInput<6>` transcript by hand, mirroring the generated
`_SchnorrHashInput_0` descriptor, because the published
`@midnight-ntwrk/midnight-did-jubjub-schnorr` helpers only handle a four-element digest.
If the message width or field order ever changes in the contract, that file must change
with it — `src/lib/schnorr6.test.ts` runs the real circuit to keep the two honest.

## Privacy properties worth pointing at

- The record never leaves the browser. Only a proof about it is submitted.
- Enrollment pseudonyms are derived per trial (`persistentHash([tag, sk, trialID])`), so
  the same patient appears under unrelated keys in different trials. A trial-independent
  key would let anyone join the public sets and reconstruct one person's trial history.
- Re-running `Verify` for the same patient and trial re-inserts the same key, so
  enrollment is idempotent without a separate nullifier.
- What the chain *does* reveal: that someone enrolled, and in which trial. Not who, and
  not why anyone was turned away — `Verify` returns silently when a patient does not
  qualify, so acceptance and rejection are not distinguishable from the fact that a
  transaction landed.

## Tests

```
npm test        # 32 tests
npm run typecheck
```

The ones that matter:

- `src/lib/schnorr6.test.ts` — pins the off-chain signer against the compiled circuit,
  and demonstrates the challenge-reduction forgery that the `q < 116` bound in
  `schnorr.compact` exists to stop. That test *passes against the fixed contract and
  fails against the unfixed one*, which is the only way to know the fix works.
- `src/lib/trials.test.ts` — runs every archetype against every trial through the real
  circuit and checks the UI's local eligibility prediction agrees with it.
- `src/providers/providers.test.ts` — holds mocked and simulated to the same assertions,
  since the promise of the mode switcher is that they behave identically.
- `src/App.test.tsx` — walks the demo path: sign a record, apply, get enrolled.

## Two things that only show up on a real network

Both were found by running `../contract`'s integration test against a local stack, and
neither is catchable by the in-memory tests:

1. **Nested `Map` writes are not provable.** The trial criteria originally lived in two
   enum-keyed ledgers of nested maps, and `createTrial` wrote into them with
   `outer.lookup(k).insert(k2, v)`. That runs fine in memory but the proof server rejects
   the transcript with *"Public transcript input mismatch"* — whether or not the inner map
   already exists. Inner **Set** writes are fine, which is why `Verify`'s
   `ElegiblePeople.lookup(id).insert(pk)` still works. The criteria are now one
   `Map<Uint<32>, TrialCriteria>` written in a single insert.
2. **`initialPrivateState` is initial, not an override.** `submitCallTx` reads whatever is
   stored under the private-state id and ignores `initialPrivateState` once something is
   there. Sharing one id across personas silently runs every call with the deployer's
   secret — which looks like success, because a transaction still lands and a key still
   gets inserted. It is just the wrong person's key.

## Layout

```
src/lib/         framework-free: signing, records, trials, profiles, the simulator
src/providers/   the three backings behind one interface
src/views/       React views
```
