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

import { useEffect, useState, type ReactNode } from 'react';
import '../phone.css';
import type { EnrollResult, TrialsProvider, TrialState } from '../providers/types.js';
import type { Profile } from '../lib/profiles.js';
import { credentialStatus, isUsable, STATUS_LABEL } from '../lib/credential-status.js';
import { evaluateEligibility, isEligible, type Trial } from '../lib/trials.js';
import type { EnrollOutcome } from '../providers/types.js';
import { openPhoneWindow } from '../lib/kiosk.js';

/**
 * What a patient is told, as opposed to what the provider reports.
 *
 * Provider messages are written for whoever is running the simulator -- they mention
 * proof timings, issuer registration, ledger state. None of that belongs on a phone, so
 * outcomes are translated here and the technical wording stays on the desktop Trials tab.
 */
const PATIENT_MESSAGE: Record<EnrollOutcome, string> = {
  enrolled:
    'Success — your proof has been submitted. We’ll contact you promptly to continue with the trial process.',
  'already-enrolled': 'You already hold a place in this trial. We’ll be in touch.',
  ineligible:
    'This study isn’t a match for your record. Nothing about you was shared.',
  'untrusted-issuer':
    'This study doesn’t recognise the clinic that signed your record. Ask your clinic to issue it again.',
  'no-credential':
    'Your record hasn’t been signed by your clinic yet, so there’s nothing to prove.',
  error: 'Something went wrong submitting your application. Please try again.',
};

interface Props {
  provider: TrialsProvider;
  profile: Profile;
  revision: number;
  onLedgerChange: () => void;
  /** Rendered alone in a chromeless popup: drop the frame and the explanatory aside. */
  kiosk?: boolean;
}

type Screen = 'home' | 'trials' | 'applications';

const firstName = (displayName: string) => displayName.split(' ')[0] ?? displayName;

/** A fixed time, so screenshots and recordings stay reproducible. */
const STATUS_TIME = '9:41';

/**
 * Tab icons.
 *
 * Inline paths rather than emoji: emoji carry their own colour and cannot take the tint
 * on selection, which is the whole visual grammar of an iOS tab bar.
 */
const ICONS: Record<Screen, ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2 3 10.3V21h6.2v-6.1h5.6V21H21V10.3z" />
    </svg>
  ),
  trials: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3v5.1l4.6 8.4A3 3 0 0 1 16 21H8a3 3 0 0 1-2.6-4.5L10 8.1V3zm-2 2h-.9v3.6L7.9 14h8.2l-3.2-5.4V5z" />
    </svg>
  ),
  applications: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.2 4 5.6v6.1c0 4.6 3.2 8.7 8 10.1 4.8-1.4 8-5.5 8-10.1V5.6zm-1.2 13.4L7.4 12.2l1.5-1.5 1.9 1.9 4.3-4.3 1.5 1.5z" />
    </svg>
  ),
};

export const MobileView = ({
  provider,
  profile,
  revision,
  onLedgerChange,
  kiosk = false,
}: Props) => {
  const [screen, setScreen] = useState<Screen>('home');
  const [openTrial, setOpenTrial] = useState<bigint | null>(null);
  const [trials, setTrials] = useState<readonly TrialState[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, EnrollResult>>({});
  // A full-screen confirmation is worth interrupting for; the other outcomes are not.
  const [celebrating, setCelebrating] = useState<Trial | null>(null);

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
    if (result.outcome === 'enrolled') {
      const trial = trials.find((entry) => entry.trial.id === trialId)?.trial;
      if (trial !== undefined) setCelebrating(trial);
    }
  };

  // `trials` is empty on the first render, so an open trial can briefly resolve to nothing.
  const detail =
    openTrial === null
      ? null
      : (trials.find((entry) => entry.trial.id === openTrial) ?? null);
  const enrolled = trials.filter(({ trial }) => provider.isEnrolled(profile, trial.id));

  return (
    <div className={kiosk ? 'phone-stage is-kiosk' : 'phone-stage'}>
      <div className={kiosk ? 'phone is-kiosk' : 'phone'}>
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

        {celebrating !== null ? (
          <SubmittedSheet
            trial={celebrating}
            onDone={() => {
              setCelebrating(null);
              setOpenTrial(null);
              setScreen('applications');
            }}
          />
        ) : null}

        <nav className="phone-tabs">
          {(
            [
              ['home', 'Home'],
              ['trials', 'Trials'],
              ['applications', 'Mine'],
            ] as ReadonlyArray<[Screen, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              aria-selected={detail === null && screen === id}
              onClick={() => {
                setOpenTrial(null);
                setScreen(id);
              }}
            >
              <span className="phone-tab-icon">{ICONS[id]}</span>
              {label}
              {id === 'applications' && enrolled.length > 0 ? (
                <span className="phone-badge">{enrolled.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {kiosk ? null : (
      <aside className="phone-aside">
        <button className="primary" onClick={() => openPhoneWindow(provider.mode)}>
          Open as a standalone app ↗
        </button>
        <p className="note" style={{ marginTop: 10 }}>
          Opens a chromeless window with no address bar, sized to the screen. It follows
          the patient you pick here. In <strong>Mocked</strong> mode it also shares the
          ledger; the other modes keep theirs in memory, so the popup runs its own.
        </p>
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
      )}
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

      {result !== undefined && result.outcome !== 'enrolled' ? (
        <div className="phone-result bad">{PATIENT_MESSAGE[result.outcome]}</div>
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

/**
 * The confirmation.
 *
 * Deliberately the only interruption in the app. A patient has just handed over a
 * zero-knowledge proof of their medical eligibility; "Accepted, proof generated in 893ms"
 * is the wrong register entirely.
 */
const SubmittedSheet = ({ trial, onDone }: { trial: Trial; onDone: () => void }) => (
  <div className="phone-sheet" role="dialog" aria-label="Application submitted">
    <div className="tick">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="tick-ring" cx="32" cy="32" r="28" />
        <path className="tick-mark" d="M20 33.5 L28.5 42 L45 25" />
      </svg>
    </div>

    <h2>You’re all set</h2>
    <p className="phone-sheet-copy">{PATIENT_MESSAGE.enrolled}</p>

    <div className="phone-sheet-trial">
      <span className="phone-code">{trial.code}</span>
      <strong>{trial.title}</strong>
      <span className="phone-meta">{trial.sponsor}</span>
    </div>

    <p className="phone-sheet-fine">
      Your medical record stayed on this phone. The study received a proof that you
      qualify — not your history.
    </p>

    <button className="phone-cta" onClick={onDone}>
      Done
    </button>
  </div>
);

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
