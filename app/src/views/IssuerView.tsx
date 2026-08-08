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
import { SIGNED_FIELDS, formatHealthRecord, historyToMessage, parseHealthRecord } from '../lib/record.js';
import { toStoredCredential, type Profile } from '../lib/profiles.js';

interface Props {
  profile: Profile;
  onIssued: (profile: Profile) => void;
}

export const IssuerView = ({ profile, onIssued }: Props) => {
  const [draft, setDraft] = useState(() => formatHealthRecord(profile.record));
  const [errors, setErrors] = useState<ReadonlyArray<{ path: string; message: string }>>([]);
  const [loadedFor, setLoadedFor] = useState(profile.id);

  // Follow the header's profile switcher without stomping an in-progress edit.
  if (loadedFor !== profile.id) {
    setLoadedFor(profile.id);
    setDraft(formatHealthRecord(profile.record));
    setErrors([]);
  }

  const parsed = parseHealthRecord(draft);

  const sign = (rogue: boolean) => {
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors([]);
    const { record } = parsed;
    const secret = rogue ? rogueSecret : issuerSecret;
    const publicKey = rogue ? roguePublicKey : issuerPublicKey;
    onIssued({
      ...profile,
      record,
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
          A registered clinical provider. The admin added this public key to the contract's{' '}
          <span className="mono">providers</span> set, which is the only reason a proof
          built from its signature is worth anything.
        </p>
        <dl className="kv">
          <dt>Jubjub public key</dt>
          <dd className="mono">{formatPoint(issuerPublicKey)}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Record for {profile.displayName}</h2>
        <p className="note">
          Only the six <span className="pill signed-badge">signed</span> fields below are
          covered by the signature and read by the contract. Everything else in this
          document is presentation — nobody attests to it, and the circuit never sees it.
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
                <span className="mono">{error.path || '(document)'}</span> — {error.message}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => sign(false)} disabled={!parsed.ok}>
            Sign as {ISSUER_NAME}
          </button>
          <button onClick={() => sign(true)} disabled={!parsed.ok}>
            Sign as {ROGUE_NAME}
          </button>
          <span className="note" style={{ margin: 0 }}>
            The second issuer is not registered — useful for showing what the contract does
            with a perfectly valid signature it has no reason to trust.
          </span>
        </div>
      </div>

      {parsed.ok ? (
        <div className="card">
          <h3>The six signed fields</h3>
          <p className="note">
            These become the <span className="mono">Vector&lt;6, Field&gt;</span> the
            Schnorr transcript is built over. The order is fixed by the circuit.
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
