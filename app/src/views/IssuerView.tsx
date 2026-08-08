/**
 * The clinic's desk.
 *
 * The point of showing this at all is that it is where the contract's trust comes from.
 * A patient signing their own record would prove nothing; the ZK proof is only worth
 * something because an issuer the contract knows about put their name to the six fields.
 */

import { useState } from 'react';
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
  SIGNED_FIELDS,
  formatHealthRecord,
  historyToMessage,
  parseHealthRecord,
  type HealthRecord,
} from '../lib/record.js';
import { toStoredCredential, type Profile } from '../lib/profiles.js';
import { STATUS_LABEL, STATUS_TONE, credentialStatus } from '../lib/credential-status.js';

interface Props {
  profile: Profile;
  onIssued: (profile: Profile) => void;
}

export const IssuerView = ({ profile, onIssued }: Props) => {
  const saved = formatHealthRecord(profile.record);
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<ReadonlyArray<{ path: string; message: string }>>([]);
  const [loadedFor, setLoadedFor] = useState(profile.id);

  // Follow the header's profile switcher without stomping an in-progress edit.
  if (loadedFor !== profile.id) {
    setLoadedFor(profile.id);
    setDraft(formatHealthRecord(profile.record));
    setErrors([]);
  }

  const parsed = parseHealthRecord(draft);
  const dirty = draft !== saved;
  const status = credentialStatus(profile);

  /**
   * Adopt an edited record, keeping the profile's display name in step with it.
   *
   * The document is the source of truth for who this is, so renaming the patient here has
   * to reach the header's switcher, the clinic roster and the phone's greeting. An empty
   * name would blank all three, so it falls back to the existing one.
   */
  const withRecord = (record: HealthRecord): Profile => ({
    ...profile,
    displayName: record.patient.displayName.trim() || profile.displayName,
    record,
  });

  /**
   * Persist the edit without touching the credential.
   *
   * Saving and attesting are different acts: a clerk corrects a record, an issuer vouches
   * for it. Keeping them apart is what lets a saved edit leave an existing attestation
   * behind -- it goes stale, and the Clinic view says so.
   */
  const save = (): boolean => {
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return false;
    }
    setErrors([]);
    onIssued(withRecord(parsed.record));
    return true;
  };

  const sign = (rogue: boolean) => {
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors([]);
    const { record } = parsed;
    const secret = rogue ? rogueSecret : issuerSecret;
    const publicKey = rogue ? roguePublicKey : issuerPublicKey;
    // Signing implies saving: the attestation must cover what is on file.
    onIssued({
      ...withRecord(record),
      credential: toStoredCredential(
        record.history,
        signHistory(record.history, secret),
        publicKey,
        rogue ? ROGUE_NAME : ISSUER_NAME,
      ),
    });
  };

  return (
    <>
      <div className="card">
        <h2>{ISSUER_NAME}</h2>
        <p className="note">
          A registered clinic. The admin added this key to the contract's{' '}
          <span className="mono">providers</span> set. That is the only reason a proof built
          on its signature counts.
        </p>
        <dl className="kv">
          <dt>Jubjub public key</dt>
          <dd className="mono">{formatPoint(issuerPublicKey)}</dd>
        </dl>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Record for {profile.displayName}</h2>
          <div className="row" style={{ gap: 8 }}>
            {dirty ? <span className="pill warn">unsaved changes</span> : null}
            <span className={`pill ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
          </div>
        </div>
        <p className="note">
          The signature covers only the six <span className="pill signed-badge">signed</span>{' '}
          fields below. Everything else is for display. Nobody attests to it and the circuit
          never sees it.
        </p>
        <textarea
          rows={20}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
        {errors.length > 0 ? (
          <ul className="errors">
            {errors.map((error) => (
              <li key={`${error.path}:${error.message}`}>
                <span className="mono">{error.path || '(document)'}</span>: {error.message}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="row" style={{ marginTop: 12 }}>
          <button
            className={dirty ? 'primary' : undefined}
            onClick={save}
            disabled={!dirty || !parsed.ok}
          >
            Save record
          </button>
          <button onClick={() => setDraft(saved)} disabled={!dirty}>
            Revert
          </button>
          <span className="muted">|</span>
          <button className={dirty ? undefined : 'primary'} onClick={() => sign(false)} disabled={!parsed.ok}>
            Save &amp; sign as {ISSUER_NAME}
          </button>
          <button onClick={() => sign(true)} disabled={!parsed.ok}>
            Save &amp; sign as {ROGUE_NAME}
          </button>
        </div>
        <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
          Save without signing and the old signature stays put. It now covers a record that
          changed, so it shows up as <em>record changed since signing</em>. A signature
          covers six specific values, not a person.
          {' '}
          {ROGUE_NAME} is not registered, so its signatures are valid and still refused.
        </p>
      </div>

      {parsed.ok ? (
        <div className="card">
          <h3>The six signed fields</h3>
          <p className="note">
            These become the <span className="mono">Vector&lt;6, Field&gt;</span> that the
            Schnorr signature covers. The circuit fixes the order.
          </p>
          <dl className="kv">
            {SIGNED_FIELDS.map((field, index) => (
              <div key={field.key} style={{ display: 'contents' }}>
                <dt>
                  msg[{index}] {field.label}
                </dt>
                <dd className="mono">
                  {String(historyToMessage(parsed.record.history)[index])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </>
  );
};
