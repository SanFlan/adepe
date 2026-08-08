/**
 * The trial catalogue.
 *
 * Each entry pairs presentation detail with the exact restriction tuple `createTrial`
 * writes to the ledger, so there is one description of a trial rather than two that can
 * drift apart.
 *
 * A note on the booleans: `Verify` compares them for *equality*, so every criterion says
 * the value a participant must have. There is no "don't care" -- a trial that genuinely
 * does not mind about prior chemotherapy cannot express that, and must pick a side. The
 * UI should present these as requirements, not as filters.
 */

import type { MedicalHistory } from './record.js';

export interface TrialCriteria {
  readonly ageMin: bigint;
  readonly ageMax: bigint;
  readonly nivolumab_counterindication: boolean;
  readonly ipilinumab_counterindication: boolean;
  readonly active_autoimmune_therapy: boolean;
  readonly chemotherapy: boolean;
  readonly immunotherapy: boolean;
}

export interface Trial {
  readonly id: bigint;
  readonly code: string;
  readonly title: string;
  readonly sponsor: string;
  readonly phase: string;
  readonly sites: number;
  readonly compensation: string;
  readonly summary: string;
  readonly targetEnrollment: number;
  readonly criteria: TrialCriteria;
}

export const TRIALS: readonly Trial[] = [
  {
    id: 1n,
    code: 'HORIZON-1',
    title: 'First-line nivolumab in unresectable melanoma',
    sponsor: 'Northgate Oncology Network',
    phase: 'Phase III',
    sites: 24,
    compensation: 'Travel reimbursed, €80 per visit',
    summary:
      'Treatment-naive patients receiving single-agent nivolumab as first-line therapy.',
    targetEnrollment: 400,
    criteria: {
      ageMin: 18n,
      ageMax: 75n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: false,
      immunotherapy: false,
    },
  },
  {
    id: 2n,
    code: 'MERIDIAN-2',
    title: 'Second-line combination therapy after platinum chemotherapy',
    sponsor: 'Aurora Clinical Institute',
    phase: 'Phase II',
    sites: 11,
    compensation: 'Travel reimbursed, €120 per visit',
    summary:
      'Requires documented prior chemotherapy and no previous checkpoint inhibitor exposure.',
    targetEnrollment: 180,
    criteria: {
      ageMin: 18n,
      ageMax: 80n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: true,
      immunotherapy: false,
    },
  },
  {
    id: 3n,
    code: 'SOLSTICE-3',
    title: 'Ipilimumab-sparing regimen',
    sponsor: 'Meridian Cancer Consortium',
    phase: 'Phase II',
    sites: 7,
    compensation: 'Travel reimbursed',
    summary:
      'Designed specifically for patients with a documented ipilimumab counter-indication.',
    targetEnrollment: 90,
    criteria: {
      ageMin: 21n,
      ageMax: 70n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: true,
      active_autoimmune_therapy: false,
      chemotherapy: false,
      immunotherapy: false,
    },
  },
  {
    id: 4n,
    code: 'KEYSTONE-4',
    title: 'Checkpoint inhibitor re-challenge after progression',
    sponsor: 'Northgate Oncology Network',
    phase: 'Phase I/II',
    sites: 5,
    compensation: 'Travel reimbursed, €150 per visit',
    summary: 'For heavily pre-treated patients with both prior chemotherapy and prior immunotherapy.',
    targetEnrollment: 60,
    criteria: {
      ageMin: 30n,
      ageMax: 85n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: true,
      immunotherapy: true,
    },
  },
  {
    id: 5n,
    code: 'VANGUARD-5',
    title: 'Reduced-intensity immunotherapy in older adults',
    sponsor: 'Vanguard Geriatric Oncology',
    phase: 'Phase II',
    sites: 14,
    compensation: 'Travel and companion costs reimbursed',
    summary: 'Treatment-naive cohort aged 65 and over, with dose adjusted for tolerability.',
    targetEnrollment: 220,
    criteria: {
      ageMin: 65n,
      ageMax: 90n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: false,
      immunotherapy: false,
    },
  },
];

export const trialById = (id: bigint): Trial | undefined =>
  TRIALS.find((trial) => trial.id === id);

export interface CriterionResult {
  readonly label: string;
  readonly required: string;
  readonly actual: string;
  readonly pass: boolean;
}

const yesNo = (value: boolean) => (value ? 'yes' : 'no');

/**
 * Evaluate eligibility locally, mirroring `Verify`'s logic clause by clause.
 *
 * This runs on the patient's own device before anything is submitted, so the UI can say
 * *why* a patient does not qualify. The contract deliberately never reveals that -- it
 * enrolls or it silently does not.
 */
export const evaluateEligibility = (
  criteria: TrialCriteria,
  history: MedicalHistory,
): readonly CriterionResult[] => [
  {
    label: 'Age',
    required: `${criteria.ageMin}–${criteria.ageMax}`,
    actual: String(history.age),
    pass: history.age >= criteria.ageMin && history.age <= criteria.ageMax,
  },
  {
    label: 'Nivolumab counter-indication',
    required: yesNo(criteria.nivolumab_counterindication),
    actual: yesNo(history.nivolumab_counterindication),
    pass: history.nivolumab_counterindication === criteria.nivolumab_counterindication,
  },
  {
    label: 'Ipilimumab counter-indication',
    required: yesNo(criteria.ipilinumab_counterindication),
    actual: yesNo(history.ipilinumab_counterindication),
    pass: history.ipilinumab_counterindication === criteria.ipilinumab_counterindication,
  },
  {
    label: 'Active autoimmune disease',
    required: yesNo(criteria.active_autoimmune_therapy),
    actual: yesNo(history.active_autoimmune_therapy),
    pass: history.active_autoimmune_therapy === criteria.active_autoimmune_therapy,
  },
  {
    label: 'Prior chemotherapy',
    required: yesNo(criteria.chemotherapy),
    actual: yesNo(history.chemotherapy),
    pass: history.chemotherapy === criteria.chemotherapy,
  },
  {
    label: 'Prior immunotherapy',
    required: yesNo(criteria.immunotherapy),
    actual: yesNo(history.immunotherapy),
    pass: history.immunotherapy === criteria.immunotherapy,
  },
];

export const isEligible = (criteria: TrialCriteria, history: MedicalHistory): boolean =>
  evaluateEligibility(criteria, history).every((result) => result.pass);
