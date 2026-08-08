import { SIGNED_FIELDS, formatHealthRecord, historyToMessage } from '../lib/record.js';
import type { Profile } from '../lib/profiles.js';

const abbreviate = (decimal: string) => {
  const hex = BigInt(decimal).toString(16).padStart(64, '0');
  return `${hex.slice(0, 12)}…${hex.slice(-10)}`;
};

export const CredentialView = ({ profile }: { profile: Profile }) => {
  const credential = profile.credential;

  return (
    <>
      <div className="card">
        <h2>{profile.displayName}</h2>
        <p className="note">
          Everything on this page lives in your browser. The record is never transmitted;
          only a proof about it is.
        </p>
        <dl className="kv">
          <dt>Pseudonym</dt>
          <dd className="mono">{profile.record.patient.pseudonym}</dd>
          <dt>Secret (nullifier preimage)</dt>
          <dd className="mono">{profile.userSecret.slice(0, 16)}…</dd>
        </dl>
      </div>

      {credential === null ? (
        <div className="card">
          <h3>No credential</h3>
          <p className="note">
            This record has not been signed. Until an issuer signs it, there is nothing to
            prove — the contract only accepts histories attested by a registered provider.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <h3>Credential</h3>
            <dl className="kv">
              <dt>Issued by</dt>
              <dd>{credential.issuerName}</dd>
              <dt>Signed at</dt>
              <dd>{new Date(credential.signedAt).toLocaleString()}</dd>
              <dt>Issuer key</dt>
              <dd className="mono">{abbreviate(credential.issuerPublicKey.x)}</dd>
              <dt>R.x</dt>
              <dd className="mono">{abbreviate(credential.signature.announcement.x)}</dd>
              <dt>R.y</dt>
              <dd className="mono">{abbreviate(credential.signature.announcement.y)}</dd>
              <dt>s</dt>
              <dd className="mono">{abbreviate(credential.signature.response)}</dd>
            </dl>
          </div>

          <div className="card">
            <h3>Signed fields</h3>
            <p className="note">
              The only six values the contract reads. Any change to them invalidates the
              signature.
            </p>
            <dl className="kv">
              {SIGNED_FIELDS.map((field, index) => (
                <div key={field.key} style={{ display: 'contents' }}>
                  <dt>{field.label}</dt>
                  <dd className="mono">{String(historyToMessage(credential.history)[index])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}

      <div className="card">
        <h3>Document</h3>
        <p className="note">
          Fields outside <span className="mono">history</span> are unsigned presentation
          only.
        </p>
        <textarea rows={16} readOnly value={formatHealthRecord(profile.record)} />
      </div>
    </>
  );
};
