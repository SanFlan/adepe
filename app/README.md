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

## The four modes

Switch between them in the header. The views are written against a single
`TrialsProvider` interface (`src/providers/types.ts`), so what changes is only what is
real underneath.

Each step adds exactly one thing to the one before it.

| Mode | Circuits | Proofs | Ledger |
| --- | --- | --- | --- |
| **Mocked** | TypeScript stand-in | none | `localStorage` object |
| **Simulated** | real, in-process | none | in-memory |
| **Local proofs** | real, in-process | **real**, local proof server | in-memory |
| **Preview testnet** | real | real | the chain — not wired yet |

Signatures are real in every mode.

Simulated mode runs the actual circuits through the Compact runtime, so every `assert`
in `hello-world.compact` fires exactly as it would on chain. The only thing missing is
proof generation, which is what separates it from local-proofs mode.

Mocked mode fakes the ledger but **not** the cryptography: the issuer's Schnorr signature
is produced and verified with the same code the circuit's transcript is built from, and
pseudonyms come from the contract's own `enrollmentKey`. It is honest about who signed
what, and dishonest only about proving it to anyone else.

### Local proofs

Every call builds an unproven transaction and sends it to a proof server, which generates
a genuine proof against the compiled circuit's proving key. What is skipped is everything
after: no wallet balances it, no node accepts it, no indexer reports it — the resulting
contract state is adopted in memory instead. The proof is generated and then discarded;
its only role is to demonstrate the circuit is satisfiable with those private inputs.

It needs Docker but no wallet and no funded account:

```
cd ../contract && docker compose up -d --wait proof-server
```

The proving keys are served from `public/zk`, refreshed by `npm run sync:zk` on every
dev/build so they cannot go stale against a recompiled contract. Point elsewhere with
`VITE_PROOF_SERVER=http://host:6300 npm run dev`.

This is the step that makes the cost visible: proving takes a real second or so, which
every other local mode hides.

## The views

- **Patient app** — a phone, from the patient's side. Not a mockup: tapping Apply runs the
  same `TrialsProvider` as the desktop Trials tab, so in Local proofs mode that spinner is
  a proof server working, and the enrolment lands in Overview and the ledger drawer. This
  is what the product actually is; everything else here is a control room.
- **Trials** — the same flow as full-width rows, with every criterion evaluated and the
  columns aligned between trials so the catalogue can be compared at a glance.
- **Credential** — the same credential the phone shows as a passport, with the
  cryptography exposed: the six values the circuit receives, and the signature over them.
- **Clinic** — one issuer, the whole patient roster, with per-row attestation status. The
  header's patient switcher does not apply here; a clinic sees everyone.
- **Record editor** — edit and sign one document at a time, following the header's
  selected patient.
- **Overview** — what the world can see: counts per trial and nothing else.

A collapsible ledger drawer sits under every view.

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
npm test        # 53 tests (6 need a proof server)
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
- `src/App.test.tsx` — walks the demo path twice: once on the desktop tabs, once through
  the phone (passport → trial list → detail → apply → "Mine"), plus the clinic roster.
- `src/providers/localProofs.test.ts` — drives the local-proofs provider against a real
  proof server. **Skipped** (not silently passed) when the server is unreachable, so a
  green run without it visibly reports 6 skipped. `ADEPE_REQUIRE_PROOF_SERVER=1` turns
  that into a failure.

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
src/providers/   the four backings behind one interface
src/views/       React views
```
