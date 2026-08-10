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

**The issuer's signing key** is still open. It can be set with `VITE_ISSUER_SEED` so it need
not be committed, but that is hygiene rather than a fix: Vite inlines every `VITE_` variable
into the bundle, so the clinic's private key ships to every visitor regardless and anyone
can mint credentials the contract accepts, including on the preview deployment. It is the
more serious of the two, because it forges the very attestations the whole design rests on.

Closing it means the clinic signing somewhere the patient's browser cannot reach — a service
that takes a record and returns a signature. The app is already shaped for that: signing is
one call behind `signHistory`, and everything downstream only ever sees the signature.

Note the deployed contract trusts exactly one issuer, so changing the seed means deploying
again. Preview mode compares the two keys at connect time and refuses to start if they
disagree, rather than letting every application fail as "untrusted issuer" after proving and
paying.

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

## Hosted demo

The app is a static bundle, so it hosts anywhere. It is currently on a
[sprite](https://sprites.dev):

```
https://hackbuenosaires-260808-adepe-fsfr.sprites.app         the app
https://hackbuenosaires-260808-adepe-fsfr.sprites.app/pitch   the deck
https://hackbuenosaires-260808-adepe-fsfr.sprites.app/pitch/pitch.pdf   the deck as a PDF
```

`pitch.html` sits at the repository root, outside the build, so the deploy script uploads
it separately and serves it at `/pitch`. That works only because it is a single
self-contained file.

`pitch.pdf` is that same file printed — eight landscape 16:9 pages, one per slide, from the
deck's own `@media print` rules. `make pitch-pdf` renders it with headless Chrome, and the
deploy re-renders it every time so the deck and the PDF cannot drift apart. The deck links
to it from the middle of its top bar.

Deploy or redeploy with:

```
make deploy-sprite SPRITE=<name> PUBLIC=1
```

Safe to repeat. The same name redeploys in place and keeps its URL; a new name creates a
new sprite. Drop `PUBLIC=1` and the URL stays behind Sprites sign-in, which is the default
for a fresh sprite. `scripts/deploy-sprite.sh` documents the details.

The build happens **here**, not there: compiling the contract needs the Compact compiler,
which the sprite does not have. Only `app/dist` is uploaded. It is served by
`scripts/serve.mjs`, which exists because a stock static server gets two things wrong —
WASM must arrive as `application/wasm` or `instantiateStreaming` rejects it, and the
proving keys under `zk/` have no extension a mime table recognizes. It runs as a sprite
*service*, so it survives reboots and a paused sprite wakes on the first request.

**The sprite has no environment of its own, and no secrets.** No repository, no toolchain,
no `.env`. That makes the split worth stating plainly:

- Every `VITE_` variable in `app/.env.local` is inlined into the bundle **at build time,
  on this machine**, and is then public — readable by any visitor. `VITE_ISSUER_SEED` is
  one of these. Changing one means building and deploying again.
- `contract/.env.preview` — the funded seed, and `ADEPE_ADMIN_SECRET` — is read only by
  the Node scripts under `contract/`. The build never touches it and it never leaves this
  machine. Changing it changes nothing about what is deployed.

What that costs, for a link you send someone: **Mocked** and **Simulated** work for anyone
who opens it, and are what a visitor sees by default. **Local proofs** and **Preview
testnet** still need a proof server on the visitor's own machine — Preview also needs Lace
— so those two modes do not travel over a URL. That is a property of the modes, not of the
hosting.

And the warning in *Before any public deployment* is no longer hypothetical while this URL
is up: the issuer signing key is in the bundle, so anyone can mint credentials the preview
contract accepts.

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

## License

Apache License 2.0. See [LICENSE](LICENSE).

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
