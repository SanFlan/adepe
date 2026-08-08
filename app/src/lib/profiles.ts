/**
 * Patient profiles, held in localStorage.
 *
 * A profile is one person's whole private world: the secret that derives their
 * enrollment pseudonyms, the record document they hold, and the issuer's signature over
 * it if they have been granted one. On chain each of these would be a different wallet;
 * here they are entries in a list you can switch between, which is what makes the
 * privacy properties demonstrable from a single browser tab.
 */

import { formatHealthRecord, type HealthRecord, type MedicalHistory } from './record.js';
import type { SchnorrSignature } from './schnorr6.js';

const STORAGE_KEY = 'adepe.profiles.v1';

export interface StoredCredential {
  readonly history: MedicalHistory;
  readonly signature: { announcement: { x: string; y: string }; response: string };
  readonly issuerPublicKey: { x: string; y: string };
  readonly issuerName: string;
  readonly signedAt: string;
}

export interface Profile {
  readonly id: string;
  readonly displayName: string;
  /** Hex. Preimage of every pseudonym this patient enrolls under. */
  readonly userSecret: string;
  readonly record: HealthRecord;
  readonly credential: StoredCredential | null;
}

// ---------------------------------------------------------------------------
// Encoding
//
// JSON has no bigint, so histories are stored with a numeric age and curve points as
// decimal strings. These helpers are the only place that conversion happens.
// ---------------------------------------------------------------------------

export const toStoredCredential = (
  history: MedicalHistory,
  signature: SchnorrSignature,
  issuerPublicKey: { x: bigint; y: bigint },
  issuerName: string,
): StoredCredential => ({
  history,
  signature: {
    announcement: {
      x: signature.announcement.x.toString(),
      y: signature.announcement.y.toString(),
    },
    response: signature.response.toString(),
  },
  issuerPublicKey: {
    x: issuerPublicKey.x.toString(),
    y: issuerPublicKey.y.toString(),
  },
  issuerName,
  signedAt: new Date().toISOString(),
});

export const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const randomSecretHex = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

// ---------------------------------------------------------------------------
// Archetypes
//
// Chosen so that every trial in the catalogue has at least one patient who qualifies and
// one who does not. A demo that can only ever show acceptance is not a demo of a
// filter.
// ---------------------------------------------------------------------------

interface Archetype {
  readonly displayName: string;
  readonly note: string;
  readonly history: MedicalHistory;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    displayName: 'Marta Ilves',
    note: 'Treatment-naive, 54 — qualifies for HORIZON-1',
    history: {
      age: 54n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: false,
      immunotherapy: false,
    },
  },
  {
    displayName: 'Tomáš Řehák',
    note: 'Prior chemotherapy, 67 — qualifies for MERIDIAN-2',
    history: {
      age: 67n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: true,
      immunotherapy: false,
    },
  },
  {
    displayName: 'Aiko Tanaka',
    note: 'Ipilimumab counter-indication, 44 — qualifies for SOLSTICE-3',
    history: {
      age: 44n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: true,
      active_autoimmune_therapy: false,
      chemotherapy: false,
      immunotherapy: false,
    },
  },
  {
    displayName: 'Dele Okonkwo',
    note: 'Heavily pre-treated, 71 — qualifies for KEYSTONE-4',
    history: {
      age: 71n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: true,
      immunotherapy: true,
    },
  },
  {
    displayName: 'Ruth Halvorsen',
    note: 'Treatment-naive, 78 — qualifies for VANGUARD-5',
    history: {
      age: 78n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: false,
      chemotherapy: false,
      immunotherapy: false,
    },
  },
  {
    displayName: 'Ivan Petrov',
    note: 'Active autoimmune disease, 39 — qualifies for nothing',
    history: {
      age: 39n,
      nivolumab_counterindication: false,
      ipilinumab_counterindication: false,
      active_autoimmune_therapy: true,
      chemotherapy: false,
      immunotherapy: false,
    },
  },
];

const FIRST_NAMES = ['Lena', 'Omar', 'Sofia', 'Nils', 'Priya', 'Mateo', 'Hana', 'Yusuf'];
const LAST_NAMES = ['Vargas', 'Lindqvist', 'Okafor', 'Bianchi', 'Novak', 'Haddad'];

const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)]!;

const randomHistory = (): MedicalHistory => ({
  age: BigInt(18 + Math.floor(Math.random() * 72)),
  nivolumab_counterindication: Math.random() < 0.15,
  ipilinumab_counterindication: Math.random() < 0.2,
  active_autoimmune_therapy: Math.random() < 0.15,
  chemotherapy: Math.random() < 0.45,
  immunotherapy: Math.random() < 0.25,
});

const makeRecord = (displayName: string, history: MedicalHistory): HealthRecord => ({
  patient: {
    pseudonym: `PT-${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, '0')}`,
    displayName,
  },
  issuer: { name: 'Northgate Oncology', issuedAt: new Date().toISOString().slice(0, 10) },
  history,
});

const newProfile = (displayName: string, history: MedicalHistory): Profile => ({
  id: crypto.randomUUID(),
  displayName,
  userSecret: randomSecretHex(),
  record: makeRecord(displayName, history),
  credential: null,
});

export const profileFromArchetype = (archetype: Archetype): Profile =>
  newProfile(archetype.displayName, archetype.history);

export const randomProfile = (): Profile =>
  newProfile(`${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, randomHistory());

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface StoredShape {
  readonly profiles: readonly Profile[];
  readonly selectedId: string | null;
}

/** Revive `age`, which JSON flattened to a number. */
const reviveProfile = (raw: Profile): Profile => ({
  ...raw,
  record: {
    ...raw.record,
    history: { ...raw.record.history, age: BigInt(raw.record.history.age) },
  },
  credential:
    raw.credential === null
      ? null
      : {
          ...raw.credential,
          history: { ...raw.credential.history, age: BigInt(raw.credential.history.age) },
        },
});

const replacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value;

export const loadProfiles = (): StoredShape => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return seedProfiles();
  try {
    const parsed = JSON.parse(raw) as StoredShape;
    return { profiles: parsed.profiles.map(reviveProfile), selectedId: parsed.selectedId };
  } catch {
    // A corrupt or stale-schema blob should not brick the app mid-demo.
    return seedProfiles();
  }
};

export const saveProfiles = (state: StoredShape): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state, replacer));
};

/** The app opens with two patients rather than an empty list. */
const seedProfiles = (): StoredShape => {
  const profiles = [
    profileFromArchetype(ARCHETYPES[0]!),
    profileFromArchetype(ARCHETYPES[1]!),
  ];
  const state = { profiles, selectedId: profiles[0]!.id };
  saveProfiles(state);
  return state;
};

export const clearProfiles = (): void => localStorage.removeItem(STORAGE_KEY);

export const recordDocument = (profile: Profile): string => formatHealthRecord(profile.record);
