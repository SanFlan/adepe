# ADEPE

Privacy preserving clinical trial eligibility, on Midnight.

A patient holds a medical history signed by their clinic. To apply to a trial they prove,
in zero knowledge, that the signed history meets that trial's criteria — without revealing
the history. What lands on the ledger is one opaque key per enrollment and nothing else.

## How it works

1. **A clinic signs.** A registered provider signs six fields of a patient's medical
   history with a Jubjub Schnorr signature. The signature covers those six values and
   nothing else in the document.
2. **The patient holds it.** The record and the signature live on the patient's device.
3. **The patient proves.** Applying to a trial runs a circuit that checks the signature
   against a provider the contract trusts, checks the six fields against that trial's
   criteria, and proves both without disclosing either.
4. **The contract records a pseudonym.** Derived from the patient's secret *and* the trial
   id, so the same person appears under unrelated keys in different trials and the public
   sets cannot be joined.

The chain learns that somebody enrolled, and in which trial. Not who, and not why anyone
was turned away — `Verify` returns silently when a patient does not qualify, so acceptance
and rejection are indistinguishable from the fact that a transaction landed.

## Quick start

```
make install     # contract and app dependencies
make dev         # compiles the contract if needed, then serves the app
```

Then open the printed URL. `make help` lists everything.

For real proofs (optional, needs Docker):

```
make proof-server
```

and pick **Local proofs** in the app's Config tab.

## Modes

Each step adds one thing to the one above it. Switch between them in the Config tab.

| Mode | Circuits | Proofs | Ledger |
| --- | --- | --- | --- |
| **Mocked** | TypeScript stand-in | none | `localStorage` |
| **Simulated** | real, in-process | none | in memory |
| **Local proofs** | real, in-process | **real**, local proof server | in memory |
| **Preview testnet** | real | real | the deployed contract, via Lace |

Signatures are real in every mode, including Mocked. It fakes the ledger, not the
cryptography.

## Layout

```
contract/   the Compact contract, its tests, and a Node harness that deploys to a network
app/        the browser app: four modes behind one provider interface
```

`app/README.md` goes into more detail on the views and the off-chain signing layer.

## Tests

```
make test            # 64 app tests
make test-contract   # integration test against a local network, needs Docker
```

The ones worth knowing about:

- `app/src/lib/schnorr6.test.ts` pins the off-chain signer against the compiled circuit and
  demonstrates a signature forgery that the contract's current code rejects. It passes
  against the fixed contract and fails against the unfixed one.
- `app/src/lib/trials.test.ts` runs every archetype against every trial through the real
  circuit, checking the UI's local eligibility prediction agrees with the contract.
- `app/src/providers/localProofs.test.ts` drives the local-proofs provider against a real
  proof server. It is *skipped*, not silently passed, when the server is unreachable.
- `contract/src/test/adepe.test.ts` deploys to a real network and runs the whole flow with
  real proofs.

## Three things we found in the contract

**The Schnorr verification was vacuous.** `getSchnorrReduction` returned an unbounded
`Field` quotient, and `q * 2^248 + r == cFull` is an equation in the scalar field, so a
prover could pick any `r` and solve for `q`. That made the challenge attacker-chosen and
forging a signature for any registered issuer trivial. Fixed by bounding `q` to `Uint<7>`
with `q < 116`, which pins a unique pair.

**Nested `Map` writes are not provable.** `outer.lookup(k).insert(k2, v)` runs fine under
the in-memory runtime but the proof server rejects the transcript. Inner *Set* writes are
fine. The trial criteria were flattened into a single struct-valued map.

**`initialPrivateState` is initial, not an override.** `submitCallTx` ignores it once
something is stored under that private-state id, so sharing one id across personas silently
runs every call as the deployer. It looks like success: a transaction lands and a key is
inserted, just the wrong person's.

## Before any public deployment

Two secrets are hardcoded in the app bundle. Both are deliberate — the simulator has to act
as everyone — and both stop being acceptable the moment this is deployed somewhere public.

**The admin secret** is `new Uint8Array(32).fill(1)`, in `app/src/providers/simulated.ts`
and `app/src/providers/localProofs.ts`. The contract derives `contractAdmin` from
`getUserSecret()`, so anyone who reads the shipped JavaScript would be admin of any contract
deployed with it. This is fine for the local modes, where the ledger is in memory and there
is nothing to administer. It is handled for preview: `scripts/deploy.ts` generates its own
admin secret rather than using this one — see below.

**The issuer's signing key** is a fixed seed in `app/src/lib/issuer.ts`, and this one is
still open. The clinic's private key is in the bundle, so anyone can mint credentials the
contract accepts — including on the preview deployment. It is the more serious of the two,
because it forges the very attestations the whole design rests on. Closing it needs the
clinic to sign somewhere the patient's browser cannot reach, which means a service rather
than a page.

## Live on preview

```
d2141a7567bca6c04d6a9e2b1a5113ca5c382a82270c32009ca8532130142043
```

Five trials open, one registered issuer. Read the public state yourself, with no wallet and
no proof server:

```
make status-preview
```

That query is exactly what any observer of the chain can run, which is the point: it shows
counts and pseudonyms, and nothing about who enrolled or why anyone was turned away.

`deployment.preview.json` records the address, the indexer URL, the issuer key and the trial
ids. To deploy another one, `make deploy-preview` with a funded seed in
`contract/.env.preview` as `MIDNIGHT_PREVIEW_SEED=…` (that file is gitignored).

The admin secret for this deployment was generated at deploy time rather than taken from the
app, so the key that can open trials and register issuers is **not** in the shipped
JavaScript. It is in `contract/.env.preview` as `ADEPE_ADMIN_SECRET`, and nowhere else.

## Using Preview testnet mode

Needs three things, and the mode says which one is missing rather than failing later:

1. **Lace**, speaking connector API 4.x, set to the Preview network.
2. **A funded wallet.** Each application is a transaction the patient pays for.
3. **A local proof server** — `make proof-server` — configured in Lace. The wallet
   nominates the prover, and in practice that is your own machine. This mode is therefore
   not a link you can send someone.

Expect roughly 20 seconds per application against roughly 800ms in Local proofs, because
the wait is now block time rather than proving.

The app is only a client here. It does not deploy, and it cannot open trials: the contract
already exists and its admin secret is not in the bundle. Enrollment pseudonyms come from
the patient's secret, not the wallet, so one funded wallet can apply as every patient in
the roster.

**Unverified.** Every failure path is covered by tests with a fake wallet — no wallet,
wrong connector version, wrong network, missing proof server, rejected connection — but the
successful path has never been run against real Lace. Treat the first attempt as a test.

## Environment

`contract/.env.example` and `app/.env.example` list every variable with instructions.
Copy the one you need:

```
cp contract/.env.example contract/.env.preview
```

Nothing is required for local development. A seed is needed only to deploy or to run the
integration test against a public network.

## Not done yet

- The issuer's signing key is still in the app bundle. See above.
