/**
 * The credential with the cryptography exposed.
 *
 * The patient-facing version of this is the passport card on the Patient app: name,
 * issuer, whether it is valid. Repeating that here made this page read as a second, worse
 * patient home. What it is actually for is everything the passport deliberately hides --
 * the six field values as the circuit receives them, the announcement point and response
 * scalar, and which part of the document the signature does not cover.
 */

import { SIGNED_FIELDS, formatHealthRecord, historyToMessage } from '../lib/record.js';
import { STATUS_LABEL, STATUS_TONE, credentialStatus } from '../lib/credential-status.js';
import type { Profile } from '../lib/profiles.js';

const abbreviate = (decimal: string) => {
  const hex = BigInt(decimal).toString(16).padStart(64, '0');
  return `${hex.slice(0, 16)}…${hex.slice(-12)}`;
};

export const CredentialView = ({ profile }: { profile: Profile }) => {
  const credential = profile.credential;
  const status = credentialStatus(profile);

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Credential held by {profile.displayName}</h2>
          <span className={`pill ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
          The patient sees this as a passport card on the <strong>Patient App</strong>.
          Here it is the same credential with the cryptography shown. None of it is ever
          transmitted.
        </p>
      </div>

      {credential === null ? (
        <div className="card">
          <h3>Nothing to inspect</h3>
          <p className="note" style={{ marginBottom: 0 }}>
            This record is not signed, so there is no credential yet. Sign it on the{' '}
            <strong>Clinic</strong> tab.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <h3>The signed message</h3>
            <p className="note">
              Six values, in the order the circuit reads them. The signature covers exactly
              this vector. Nothing else in the document is signed.
            </p>
            <dl className="kv">
              {SIGNED_FIELDS.map((field, index) => (
                <div key={field.key} style={{ display: 'contents' }}>
                  <dt>
                    msg[{index}] {field.label}
                  </dt>
                  <dd className="mono">
                    {String(historyToMessage(credential.history)[index])}
                    <span className="muted">
                      {' '}
                      ({String(credential.history[field.key])})
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card">
            <h3>Signature</h3>
            <p className="note">
              Jubjub Schnorr. The circuit rebuilds the challenge from the announcement, the
              issuer key and the message above, then checks G·s = R + pk·c.
            </p>
            <dl className="kv">
              <dt>Issued by</dt>
              <dd>
                {credential.issuerName}
                {status === 'untrusted-issuer' ? (
                  <span className="pill bad" style={{ marginLeft: 8 }}>
                    not in the providers set
                  </span>
                ) : null}
              </dd>
              <dt>Signed at</dt>
              <dd>{new Date(credential.signedAt).toLocaleString()}</dd>
              <dt>Issuer key (pk.x)</dt>
              <dd className="mono">{abbreviate(credential.issuerPublicKey.x)}</dd>
              <dt>Announcement (R.x)</dt>
              <dd className="mono">{abbreviate(credential.signature.announcement.x)}</dd>
              <dt>Announcement (R.y)</dt>
              <dd className="mono">{abbreviate(credential.signature.announcement.y)}</dd>
              <dt>Response (s)</dt>
              <dd className="mono">{abbreviate(credential.signature.response)}</dd>
            </dl>
          </div>
        </>
      )}

      <div className="card">
        <h3>The document</h3>
        <p className="note">
          Only <span className="mono">history</span> is signed. The patient and issuer
          blocks are for display. Nobody signed them and the circuit never sees them.
        </p>
        <textarea rows={16} readOnly value={formatHealthRecord(profile.record)} />
      </div>

      <div className="card">
        <h3>Enrollment secret</h3>
        <p className="note" style={{ marginBottom: 0 }}>
          Never leaves the device. Each trial gets its own pseudonym, derived from this
          secret plus the trial id. That is what keeps enrollments unlinkable.
          <br />
          <span className="mono">{profile.userSecret.slice(0, 24)}…</span>
        </p>
      </div>
    </>
  );
};
