import { useEffect, useState } from 'react';
import type { EnrollResult, TrialsProvider, TrialState } from '../providers/types.js';
import type { Profile } from '../lib/profiles.js';
import { evaluateEligibility, isEligible } from '../lib/trials.js';

interface Props {
  provider: TrialsProvider;
  profile: Profile;
  revision: number;
  onLedgerChange: () => void;
}

type Busy = { trialId: bigint; stage: string } | null;

export const TrialsView = ({ provider, profile, revision, onLedgerChange }: Props) => {
  const [trials, setTrials] = useState<readonly TrialState[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [results, setResults] = useState<Record<string, EnrollResult>>({});

  useEffect(() => {
    setTrials(provider.listTrials());
  }, [provider, revision]);

  const history = profile.credential?.history ?? profile.record.history;
  const signed = profile.credential !== null;

  const apply = async (trialId: bigint) => {
    setBusy({ trialId, stage: 'Building the witness…' });
    // The stage labels track what the circuit actually does, in order.
    setTimeout(() => setBusy({ trialId, stage: 'Proving eligibility…' }), 400);
    const result = await provider.enroll(profile, trialId);
    setBusy(null);
    setResults((previous) => ({ ...previous, [String(trialId)]: result }));
    onLedgerChange();
  };

  return (
    <>
      <div className="card">
        <h2>Open trials</h2>
        <p className="note">
          Eligibility is checked here on your device before anything is submitted, so this
          page can tell you <em>why</em> you do not qualify. The contract deliberately
          never says that — it enrolls you, or it quietly does not.
        </p>
        {!signed ? (
          <p className="note">
            <span className="pill warn">no credential</span> This profile's record has not
            been signed yet. Visit the Issuer tab first.
          </p>
        ) : null}
      </div>

      <div className="grid">
        {trials.map(({ trial, enrolledCount, open }) => {
          const criteria = evaluateEligibility(trial.criteria, history);
          const eligible = isEligible(trial.criteria, history);
          const enrolled = provider.isEnrolled(profile, trial.id);
          const result = results[String(trial.id)];
          const working = busy?.trialId === trial.id;

          return (
            <article className="trial" key={String(trial.id)}>
              <header>
                <div>
                  <div className="code">{trial.code}</div>
                  <h4>{trial.title}</h4>
                </div>
                {enrolled ? (
                  <span className="pill good">enrolled</span>
                ) : eligible ? (
                  <span className="pill good">appears eligible</span>
                ) : (
                  <span className="pill bad">not eligible</span>
                )}
              </header>

              <div className="muted" style={{ fontSize: 13 }}>
                {trial.summary}
              </div>

              <dl className="kv">
                <dt>Sponsor</dt>
                <dd>{trial.sponsor}</dd>
                <dt>Phase</dt>
                <dd>
                  {trial.phase} · {trial.sites} sites
                </dd>
                <dt>Compensation</dt>
                <dd>{trial.compensation}</dd>
                <dt>Enrolled</dt>
                <dd>
                  {enrolledCount} of {trial.targetEnrollment}
                </dd>
              </dl>

              <div className="criteria">
                {criteria.map((criterion) => (
                  <div key={criterion.label}>
                    <span className="muted">{criterion.label}</span>
                    <span className="muted">{criterion.required}</span>
                    <span className={criterion.pass ? 'ok' : 'no'}>
                      {criterion.pass ? '✓' : `✗ ${criterion.actual}`}
                    </span>
                  </div>
                ))}
              </div>

              {result !== undefined ? (
                <div
                  className={`result ${result.outcome === 'enrolled' ? 'enrolled' : 'rejected'}`}
                >
                  {result.message}
                </div>
              ) : null}

              <div className="row">
                <button
                  className="primary"
                  disabled={!signed || !open || enrolled || busy !== null}
                  onClick={() => void apply(trial.id)}
                >
                  {working ? busy.stage : enrolled ? 'Place held' : 'Apply'}
                </button>
                {!open ? <span className="pill warn">not open on ledger</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
};
