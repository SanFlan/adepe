import { useEffect, useState } from 'react';
import type { TrialsProvider, TrialState } from '../providers/types.js';

interface Props {
  provider: TrialsProvider;
  revision: number;
}

export const OverviewView = ({ provider, revision }: Props) => {
  const [trials, setTrials] = useState<readonly TrialState[]>([]);

  useEffect(() => {
    setTrials(provider.listTrials());
  }, [provider, revision]);

  const total = trials.reduce((sum, entry) => sum + entry.enrolledCount, 0);

  return (
    <>
      <div className="card">
        <h2>What the world can see</h2>
        <p className="note">
          This is the whole of the public record: how many people hold a place in each
          trial. Not who they are, not what their history says, and not why anyone was
          turned away. Because each enrollment uses a pseudonym derived from the trial as
          well as the patient, two entries in different trials cannot be linked to the same
          person.
        </p>
        <div className="row">
          <span className="pill">{total} enrollments</span>
          <span className="pill">{trials.length} trials</span>
          <span className="pill">{provider.mode} mode</span>
        </div>
      </div>

      {trials.map(({ trial, enrolledCount }) => {
        const pct = Math.min(100, (enrolledCount / trial.targetEnrollment) * 100);
        return (
          <div className="card" key={String(trial.id)}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="code mono" style={{ fontSize: 13 }}>
                  {trial.code}
                </div>
                <strong>{trial.title}</strong>
              </div>
              <div className="mono">
                {enrolledCount} / {trial.targetEnrollment}
              </div>
            </div>
            <div className="bar" style={{ marginTop: 10 }}>
              <div style={{ width: `${Math.max(pct, enrolledCount > 0 ? 1.5 : 0)}%` }} />
            </div>
          </div>
        );
      })}
    </>
  );
};
