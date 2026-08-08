/**
 * The UI tells a patient whether they appear eligible before anything is submitted.
 * That prediction is a reimplementation of `Verify`'s logic, so it can drift. This runs
 * every archetype against every trial through the real circuit and checks the two agree.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { TRIALS, isEligible } from './trials.js';
import { ARCHETYPES } from './profiles.js';
import { historyToMessage } from './record.js';
import {
  deriveJubjubPublicKey,
  seedBytesToJubjubSecretScalar,
  signMessage6,
} from './schnorr6.js';
import { AdepeSimulator } from './simulator.js';
import type { AdepePrivateState } from './contract.js';

const ISSUER_SK = seedBytesToJubjubSecretScalar(new Uint8Array(32).fill(2));
const ISSUER_PK = deriveJubjubPublicKey(ISSUER_SK);
const adminState: AdepePrivateState = {
  userSecret: new Uint8Array(32).fill(1),
  credential: null,
};

beforeAll(() => setNetworkId('undeployed'));

/** Deploy with the whole catalogue open and the issuer trusted. */
const deployCatalogue = (): AdepeSimulator => {
  const sim = new AdepeSimulator(adminState);
  sim.callAs(adminState, 'registerProvider', ISSUER_PK);
  for (const trial of TRIALS) {
    const { criteria } = trial;
    sim.callAs(
      adminState,
      'createTrial',
      trial.id,
      criteria.ageMin,
      criteria.ageMax,
      criteria.nivolumab_counterindication,
      criteria.ipilinumab_counterindication,
      criteria.active_autoimmune_therapy,
      criteria.chemotherapy,
      criteria.immunotherapy,
    );
  }
  return sim;
};

describe('trial catalogue', () => {
  it('predicts eligibility exactly as the circuit decides it', () => {
    const sim = deployCatalogue();

    for (const [index, archetype] of ARCHETYPES.entries()) {
      const state: AdepePrivateState = {
        // A distinct secret per patient, so their pseudonyms differ.
        userSecret: new Uint8Array(32).fill(index + 10),
        credential: {
          history: archetype.history,
          signature: signMessage6(ISSUER_SK, historyToMessage(archetype.history)),
          issuerPublicKey: ISSUER_PK,
        },
      };

      for (const trial of TRIALS) {
        const before = sim.ledger().ElegiblePeople.lookup(trial.id).size();
        sim.callAs(state, 'Verify', trial.id);
        const after = sim.ledger().ElegiblePeople.lookup(trial.id).size();

        expect(
          after > before,
          `${archetype.displayName} vs ${trial.code}`,
        ).toBe(isEligible(trial.criteria, archetype.history));
      }
    }
  });

  it('gives every trial at least one eligible and one ineligible archetype', () => {
    for (const trial of TRIALS) {
      const outcomes = ARCHETYPES.map((a) => isEligible(trial.criteria, a.history));
      expect(outcomes, `${trial.code} has no eligible archetype`).toContain(true);
      expect(outcomes, `${trial.code} rejects nobody`).toContain(false);
    }
  });

  it('enrolls a patient at most once per trial', () => {
    const sim = deployCatalogue();
    const marta = ARCHETYPES[0]!;
    const state: AdepePrivateState = {
      userSecret: new Uint8Array(32).fill(7),
      credential: {
        history: marta.history,
        signature: signMessage6(ISSUER_SK, historyToMessage(marta.history)),
        issuerPublicKey: ISSUER_PK,
      },
    };

    sim.callAs(state, 'Verify', 1n);
    sim.callAs(state, 'Verify', 1n);
    expect(sim.ledger().ElegiblePeople.lookup(1n).size()).toBe(1n);
  });

  it('gives the same patient an unlinkable pseudonym in each trial', () => {
    const sim = deployCatalogue();
    // Treatment-naive at 70: inside HORIZON-1's 18-75 and VANGUARD-5's 65-90, so this
    // patient clears both. That overlap is precisely the case a trial-independent
    // pseudonym would expose -- one observer could join the two public sets and learn
    // that a single person is in both.
    const history = {
      age: 70n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: false,
      immunotherapy: false,
    };
    const state: AdepePrivateState = {
      userSecret: new Uint8Array(32).fill(8),
      credential: {
        history,
        signature: signMessage6(ISSUER_SK, historyToMessage(history)),
        issuerPublicKey: ISSUER_PK,
      },
    };

    const cleared = TRIALS.filter((t) => isEligible(t.criteria, history));
    expect(cleared.length).toBeGreaterThanOrEqual(2);

    const keys = cleared.map((trial) => {
      sim.callAs(state, 'Verify', trial.id);
      const members = [...sim.ledger().ElegiblePeople.lookup(trial.id)];
      expect(members).toHaveLength(1);
      return Array.from(members[0]!, (b) => b.toString(16).padStart(2, '0')).join('');
    });

    expect(new Set(keys).size, 'same key reused across trials').toBe(keys.length);
  });
});
