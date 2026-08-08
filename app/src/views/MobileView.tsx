/**
 * The patient's phone.
 *
 * Everything else in this app is a control room -- issuer desks, ledger drawers, mode
 * switches -- which is the opposite of what a patient would ever see. This view is what
 * the product actually is: a person on a phone, deciding whether to apply to a trial,
 * whose medical history never leaves the device.
 *
 * It is not a mockup. Applying here goes through the same `TrialsProvider` as the desktop
 * Trials tab, so in `proofs` mode the spinner is waiting on a real proof server, and the
 * enrollment it produces shows up in the Overview and the ledger drawer.
 */

import { useEffect, useState } from 'react';
import type { EnrollResult, TrialsProvider, TrialState } from '../providers/types.js';
import type { Profile } from '../lib/profiles.js';
import { credentialStatus, isUsable, STATUS_LABEL } from '../lib/credential-status.js';
import { evaluateEligibility, isEligible, type Trial } from '../lib/trials.js';

interface Props {
  provider: TrialsProvider;
  profile: Profile;
  revision: number;
  onLedgerChange: () => void;
}

type Screen = 'home' | 'trials' | 'applications';

const firstName = (displayName: string) => displayName.split(' ')[0] ?? displayName;

/** A fixed time, so screenshots and recordings stay reproducible. */
const STATUS_TIME = '9:41';

export const MobileView = ({ provider, profile, revision, onLedgerChange }: Props) => {
  const [screen, setScreen] = useState<Screen>('home');
  const [openTrial, setOpenTrial] = useState<bigint | null>(null);
  const [trials, setTrials] = useState<readonly TrialState[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, EnrollResult>>({});

  useEffect(() => {
    setTrials(provider.listTrials());
  }, [provider, revision]);

  const status = credentialStatus(profile);
  const usable = isUsable(status);
  const history = profile.credential?.history ?? profile.record.history;

  const apply = async (trialId: bigint) => {
    setStage('Preparing your proof…');
    const timer = setTimeout(() => setStage('Proving eligibility…'), 500);
    const result = await provider.enroll(profile, trialId);
    clearTimeout(timer);
    setStage(null);
    setResults((previous) => ({ ...previous, [String(trialId)]: result }));
    onLedgerChange();
  };

  // `trials` is empty on the first render, so an open trial can briefly resolve to nothing.
  const detail =
    openTrial === null
      ? null
      : (trials.find((entry) => entry.trial.id === openTrial) ?? null);
  const enrolled = trials.filter(({ trial }) => provider.isEnrolled(profile, trial.id));

  return (
    <div className="phone-stage">
      <div className="phone">
        <div className="phone-status">
          <span>{STATUS_TIME}</span>
          <span className="phone-notch" />
          <span className="phone-signal">
            {provider.mode} ▲ ▮
          </span>
        </div>

        <div className="phone-screen">
          {detail !== null ? (
            <TrialDetail
              entry={detail}
              history={history}
              usable={usable}
              enrolled={provider.isEnrolled(profile, detail.trial.id)}
              result={results[String(detail.trial.id)]}
              stage={stage}
              onBack={() => setOpenTrial(null)}
              onApply={() => void apply(detail.trial.id)}
            />
          ) : screen === 'home' ? (
            <Home profile={profile} statusLabel={STATUS_LABEL[status]} usable={usable} />
          ) : screen === 'trials' ? (
            <TrialList
              trials={trials}
              history={history}
              onOpen={(id) => setOpenTrial(id)}
              isEnrolled={(id) => provider.isEnrolled(profile, id)}
            />
          ) : (
            <Applications entries={enrolled} />
          )}
        </div>

        <nav className="phone-tabs">
          {(
            [
              ['home', 'Home', '🏠'],
              ['trials', 'Trials', '🔬'],
              ['applications', 'Mine', '✓'],
            ] as ReadonlyArray<[Screen, string, string]>
          ).map(([id, label, icon]) => (
            <button
              key={id}
              aria-selected={detail === null && screen === id}
              onClick={() => {
                setOpenTrial(null);
                setScreen(id);
              }}
            >
              <span className="phone-tab-icon">{icon}</span>
              {label}
              {id === 'applications' && enrolled.length > 0 ? (
                <span className="phone-badge">{enrolled.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      <aside className="phone-aside">
        <h3>What the phone is really doing</h3>
        <p className="note">
          This is not a mockup. Tapping Apply runs the same provider as the desktop Trials
          tab — in <strong>Local proofs</strong> mode that spinner is a proof server
          working, and the enrolment lands in the Overview and the ledger drawer.
        </p>
        <p className="note">
          The record itself never moves. What leaves the device is a proof that the six
          attested fields satisfy a trial's criteria, plus which trial was applied to.
        </p>
        <p className="note">
          Switch patients and modes from the bar at the top — those controls belong to the
          simulator, not to the patient.
        </p>
      </aside>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const Home = ({
  profile,
  statusLabel,
  usable,
}: {
  profile: Profile;
  statusLabel: string;
  usable: boolean;
}) => (
  <>
    <h1 className="phone-h1">Hello, {firstName(profile.displayName)}</h1>
    <p className="phone-sub">Your health record lives on this phone. Nowhere else.</p>

    <section className={`passport ${usable ? 'is-valid' : 'is-invalid'}`}>
      <header>
        <span>Health passport</span>
        <span className="passport-dot">{usable ? '✓' : '!'}</span>
      </header>
      <strong>{profile.record.patient.displayName}</strong>
      <div className="passport-id">{profile.record.patient.pseudonym}</div>
      <footer>
        {profile.credential === null ? (
          <span>Not yet signed by your clinic</span>
        ) : (
          <span>
            {statusLabel} · {profile.credential.issuerName}
          </span>
        )}
      </footer>
    </section>

    {!usable ? (
      <div className="phone-callout">
        Your clinic needs to attest to your record before you can apply to anything. In this
        simulator, do that from the <strong>Clinic</strong> tab.
      </div>
    ) : (
      <div className="phone-callout is-quiet">
        Applying shares a proof, never your record. A trial learns only that you qualify.
      </div>
    )}
  </>
);

const TrialList = ({
  trials,
  history,
  onOpen,
  isEnrolled,
}: {
  trials: readonly TrialState[];
  history: Parameters<typeof isEligible>[1];
  onOpen: (id: bigint) => void;
  isEnrolled: (id: bigint) => boolean;
}) => (
  <>
    <h1 className="phone-h1">Trials</h1>
    <p className="phone-sub">Checked against your record, on this device.</p>
    {trials.map(({ trial }) => {
      const eligible = isEligible(trial.criteria, history);
      const already = isEnrolled(trial.id);
      return (
        <button className="phone-card" key={String(trial.id)} onClick={() => onOpen(trial.id)}>
          <div className="phone-card-top">
            <span className="phone-code">{trial.code}</span>
            <span className={`phone-chip ${already ? 'good' : eligible ? 'good' : 'bad'}`}>
              {already ? 'applied' : eligible ? 'you may qualify' : 'not a match'}
            </span>
          </div>
          <strong>{trial.title}</strong>
          <span className="phone-meta">
            {trial.phase} · {trial.sponsor}
          </span>
        </button>
      );
    })}
  </>
);

const TrialDetail = ({
  entry,
  history,
  usable,
  enrolled,
  result,
  stage,
  onBack,
  onApply,
}: {
  entry: TrialState;
  history: Parameters<typeof isEligible>[1];
  usable: boolean;
  enrolled: boolean;
  result: EnrollResult | undefined;
  stage: string | null;
  onBack: () => void;
  onApply: () => void;
}) => {
  const { trial } = entry;
  const criteria = evaluateEligibility(trial.criteria, history);
  const eligible = criteria.every((criterion) => criterion.pass);

  return (
    <>
      <button className="phone-back" onClick={onBack}>
        ‹ Trials
      </button>
      <span className="phone-code">{trial.code}</span>
      <h1 className="phone-h1">{trial.title}</h1>
      <p className="phone-sub">{trial.summary}</p>

      <dl className="phone-facts">
        <div>
          <dt>Sponsor</dt>
          <dd>{trial.sponsor}</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>{trial.phase}</dd>
        </div>
        <div>
          <dt>Sites</dt>
          <dd>{trial.sites}</dd>
        </div>
        <div>
          <dt>Compensation</dt>
          <dd>{trial.compensation}</dd>
        </div>
      </dl>

      <h2 className="phone-h2">Eligibility</h2>
      <ul className="phone-criteria">
        {criteria.map((criterion) => (
          <li key={criterion.label} className={criterion.pass ? 'ok' : 'no'}>
            <span>{criterion.pass ? '✓' : '✕'}</span>
            {criterion.label}
            <em>{criterion.required}</em>
          </li>
        ))}
      </ul>
      <p className="phone-fineprint">
        Checked on your phone. None of this was sent anywhere.
      </p>

      {result !== undefined ? (
        <div className={`phone-result ${result.outcome === 'enrolled' ? 'good' : 'bad'}`}>
          {result.message}
        </div>
      ) : null}

      <button
        className="phone-cta"
        disabled={!usable || !eligible || enrolled || stage !== null}
        onClick={onApply}
      >
        {stage !== null
          ? stage
          : enrolled
            ? 'You have a place'
            : !usable
              ? 'Record not signed yet'
              : eligible
                ? 'Apply privately'
                : 'You do not match this trial'}
      </button>
    </>
  );
};

const Applications = ({ entries }: { entries: readonly TrialState[] }) => (
  <>
    <h1 className="phone-h1">My applications</h1>
    {entries.length === 0 ? (
      <p className="phone-sub">
        Nothing yet. Trials you are accepted to will appear here.
      </p>
    ) : (
      <>
        <p className="phone-sub">
          You hold a place in {entries.length} trial{entries.length === 1 ? '' : 's'}.
        </p>
        {entries.map(({ trial }: { trial: Trial }) => (
          <div className="phone-card is-static" key={String(trial.id)}>
            <div className="phone-card-top">
              <span className="phone-code">{trial.code}</span>
              <span className="phone-chip good">enrolled</span>
            </div>
            <strong>{trial.title}</strong>
            <span className="phone-meta">{trial.sponsor}</span>
          </div>
        ))}
        <div className="phone-callout is-quiet">
          Each place is held under a different pseudonym, so nobody can tell these are the
          same person.
        </div>
      </>
    )}
  </>
);
