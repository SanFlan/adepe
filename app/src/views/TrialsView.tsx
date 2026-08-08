/**
 * The desktop trial list.
 *
 * Laid out as full-width rows rather than a grid of cards: with six criteria and four
 * facts each, cards grew tall enough that two trials filled the screen and comparing them
 * meant scrolling. A row puts identity, criteria, enrolment and the action on one line, so
 * the whole catalogue is visible at once and the criteria columns line up between trials.
 */

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
    const timer = setTimeout(() => setBusy({ trialId, stage: 'Proving eligibility…' }), 400);
    const result = await provider.enroll(profile, trialId);
    clearTimeout(timer);
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
          page can tell you <em>why</em> you do not qualify. The contract deliberately never
          says that — it enrolls you, or it quietly does not.
        </p>
        {!signed ? (
          <p className="note" style={{ marginBottom: 0 }}>
            <span className="pill warn">no credential</span> This profile's record has not
            been signed yet. Visit the Clinic tab first.
          </p>
        ) : null}
      </div>

      <div className="trial-rows">
        <header className="trial-head">
          <span>Trial</span>
          <span>Criteria — hover for the requirement and your value</span>
          <span>Enrolled</span>
          <span />
        </header>

        {trials.map(({ trial, enrolledCount, open }) => {
          const criteria = evaluateEligibility(trial.criteria, history);
          const eligible = isEligible(trial.criteria, history);
          const enrolled = provider.isEnrolled(profile, trial.id);
          const result = results[String(trial.id)];
          const working = busy?.trialId === trial.id;
          const pct = Math.min(100, (enrolledCount / trial.targetEnrollment) * 100);

          return (
            <article className="trial" key={String(trial.id)}>
              <div className="trial-id">
                <div className="row" style={{ gap: 8 }}>
                  <span className="code">{trial.code}</span>
                  {enrolled ? (
                    <span className="pill good">enrolled</span>
                  ) : eligible ? (
                    <span className="pill good">eligible</span>
                  ) : (
                    <span className="pill bad">not eligible</span>
                  )}
                </div>
                <h4>{trial.title}</h4>
                <div className="trial-meta">
                  {trial.phase} · {trial.sites} sites · {trial.sponsor}
                </div>
                <div className="trial-meta">{trial.compensation}</div>
              </div>

              <div className="trial-criteria">
                {criteria.map((criterion) => (
                  <span
                    key={criterion.label}
                    className={`crit ${criterion.pass ? 'ok' : 'no'}`}
                    title={`${criterion.label}: requires ${criterion.required}, yours is ${criterion.actual}`}
                  >
                    {criterion.short}
                    <b>{criterion.pass ? '✓' : criterion.actual}</b>
                  </span>
                ))}
              </div>

              <div className="trial-count">
                <div className="mono">
                  {enrolledCount}
                  <span className="muted"> / {trial.targetEnrollment}</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${Math.max(pct, enrolledCount > 0 ? 2 : 0)}%` }} />
                </div>
              </div>

              <div className="trial-action">
                <button
                  className="primary"
                  disabled={!signed || !open || enrolled || busy !== null}
                  onClick={() => void apply(trial.id)}
                >
                  {working ? busy.stage : enrolled ? 'Place held' : 'Apply'}
                </button>
                {!open ? <span className="pill warn">not open</span> : null}
              </div>

              {result !== undefined ? (
                <div
                  className={`trial-result ${result.outcome === 'enrolled' ? 'enrolled' : 'rejected'}`}
                >
                  {result.message}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
};
