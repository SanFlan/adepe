/**
 * The clinic's desk: one issuer, many patients.
 *
 * This is the shape the real relationship has -- a provider attests to a roster of people
 * -- and it is deliberately separate from the Record editor, which works on one document
 * at a time and follows the header's patient switcher. Here the patient switcher is
 * irrelevant: the clinic sees everyone at once and signs whoever walks in.
 *
 * Signing as the unregistered issuer is offered per row because the interesting failure is
 * not a broken signature but a perfectly valid one the contract has no reason to trust.
 */

import { useMemo, useState } from 'react';
import {
  ISSUER_NAME,
  ROGUE_NAME,
  formatPoint,
  issuerPublicKey,
  issuerSecret,
  roguePublicKey,
  rogueSecret,
  signHistory,
} from '../lib/issuer.js';
import {
  STATUS_LABEL,
  STATUS_TONE,
  credentialStatus,
  isUsable,
} from '../lib/credential-status.js';
import { toStoredCredential, type Profile } from '../lib/profiles.js';
import { SIGNED_FIELDS } from '../lib/record.js';

interface Props {
  profiles: readonly Profile[];
  selectedId: string | null;
  onUpdate: (profile: Profile) => void;
  onUpdateMany: (profiles: readonly Profile[]) => void;
}

type IssuerChoice = 'trusted' | 'rogue';

const summarise = (profile: Profile): string => {
  const { history } = profile.record;
  const flags = SIGNED_FIELDS.filter(
    (field) => field.key !== 'age' && history[field.key] === true,
  ).map((field) => field.label.replace(' counter-indication', ' c/i'));
  return flags.length === 0 ? 'no flags' : flags.join(', ');
};

export const ClinicView = ({ profiles, selectedId, onUpdate, onUpdateMany }: Props) => {
  const [issuer, setIssuer] = useState<IssuerChoice>('trusted');
  const [justSigned, setJustSigned] = useState<string | null>(null);

  const rogue = issuer === 'rogue';
  const name = rogue ? ROGUE_NAME : ISSUER_NAME;
  const publicKey = rogue ? roguePublicKey : issuerPublicKey;

  const signed = (profile: Profile): Profile => ({
    ...profile,
    credential: toStoredCredential(
      // Sign what the record currently says, which is what clears a stale credential.
      profile.record.history,
      signHistory(profile.record.history, rogue ? rogueSecret : issuerSecret),
      publicKey,
      name,
    ),
  });

  const sign = (profile: Profile) => {
    onUpdate(signed(profile));
    setJustSigned(profile.id);
  };

  const signAll = (batch: readonly Profile[]) => {
    onUpdateMany(batch.map(signed));
    setJustSigned(null);
  };

  const clear = (profile: Profile) => {
    onUpdate({ ...profile, credential: null });
    setJustSigned(null);
  };

  // Each status check verifies a Schnorr signature, so compute them once per render
  // rather than once in the filter below and again in every row.
  const statuses = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, credentialStatus(profile)])),
    [profiles],
  );
  const pending = profiles.filter((profile) => !isUsable(statuses.get(profile.id)!));

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{name}</h2>
            <p className="note" style={{ marginBottom: 0 }}>
              {rogue
                ? 'Not in the contract’s providers set. Its signatures verify perfectly and are still refused.'
                : 'Registered with the contract. This key is the reason a proof means anything.'}
            </p>
          </div>
          <label className="field">
            acting as
            <select
              value={issuer}
              onChange={(event) => setIssuer(event.target.value as IssuerChoice)}
            >
              <option value="trusted">{ISSUER_NAME} (registered)</option>
              <option value="rogue">{ROGUE_NAME} (not registered)</option>
            </select>
          </label>
        </div>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Jubjub public key</dt>
          <dd className="mono">{formatPoint(publicKey)}</dd>
        </dl>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>Patient roster</h3>
            <p className="note" style={{ margin: '4px 0 0' }}>
              {profiles.length} patients · {pending.length} awaiting a usable attestation
            </p>
          </div>
          <button
            className="primary"
            disabled={pending.length === 0}
            onClick={() => signAll(pending)}
          >
            Sign all {pending.length > 0 ? `(${pending.length})` : ''}
          </button>
        </div>

        <table className="roster">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Age</th>
              <th>Flags</th>
              <th>Attestation</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const status = statuses.get(profile.id)!;
              const tone = STATUS_TONE[status];
              return (
                <tr
                  key={profile.id}
                  className={profile.id === selectedId ? 'is-selected' : undefined}
                >
                  <td>
                    {profile.displayName}
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {profile.record.patient.pseudonym}
                    </div>
                  </td>
                  <td className="mono">{String(profile.record.history.age)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {summarise(profile)}
                  </td>
                  <td>
                    <span className={`pill ${tone}`}>{STATUS_LABEL[status]}</span>
                    {profile.credential !== null ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                        by {profile.credential.issuerName}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button onClick={() => sign(profile)}>
                        {profile.credential === null ? 'Sign' : 'Re-sign'}
                      </button>
                      <button
                        onClick={() => clear(profile)}
                        disabled={profile.credential === null}
                      >
                        Clear
                      </button>
                    </div>
                    {justSigned === profile.id && profile.credential !== null ? (
                      <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>
                        s = {BigInt(profile.credential!.signature.response)
                          .toString(16)
                          .slice(0, 14)}
                        …
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>
          Signing covers only the six fields the contract reads. Editing a record afterwards
          leaves the attestation behind — it shows here as <em>record changed since
          signing</em>, and the circuit would reject it.
        </p>
      </div>
    </>
  );
};
