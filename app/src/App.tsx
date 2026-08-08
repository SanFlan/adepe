import { useCallback, useEffect, useMemo, useState } from 'react';
import { MockedProvider } from './providers/mocked.js';
import { SimulatedProvider } from './providers/simulated.js';
import { LocalProofsProvider } from './providers/localProofs.js';
import { PreviewProvider } from './providers/preview.js';
import { BrowserZkConfigProvider } from './lib/zk-config.js';
import { initialMode, isKiosk } from './lib/kiosk.js';
import { MODES, type Mode, type TrialsProvider } from './providers/types.js';
import { clearProfiles, loadProfiles, saveProfiles, type Profile } from './lib/profiles.js';
import { IssuerView } from './views/IssuerView.js';
import { ClinicView } from './views/ClinicView.js';
import { PatientsView } from './views/PatientsView.js';
import { MobileView } from './views/MobileView.js';
import { TrialsView } from './views/TrialsView.js';
import { CredentialView } from './views/CredentialView.js';
import { OverviewView } from './views/OverviewView.js';
import { ConfigView } from './views/ConfigView.js';

type Tab =
  | 'overview'
  | 'phone'
  | 'trials'
  | 'credential'
  | 'clinic'
  | 'issuer'
  | 'patients'
  | 'config';

const TABS: ReadonlyArray<[Tab, string]> = [
  ['overview', 'Overview'],
  ['phone', 'Patient App'],
  ['trials', 'Trials'],
  ['credential', 'Credential'],
  ['clinic', 'Clinic'],
  // Named for what it does rather than who does it: "Issuer" alongside "Clinic" reads as
  // two names for the same thing.
  ['issuer', 'Record Editor'],
  // Last two, because they are simulator scaffolding rather than part of the story.
  ['patients', 'Patients'],
  ['config', 'Config'],
];

const DEFAULT_TAB: Tab = 'overview';

/**
 * The open tab lives in the URL hash, so a refresh — or a shared link — lands where you
 * left off. `replaceState` rather than assigning `location.hash`, which would push a
 * history entry per click and make Back walk the tab bar.
 */
const tabFromHash = (): Tab => {
  const requested = window.location.hash.replace(/^#/, '');
  return TABS.some(([id]) => id === requested) ? (requested as Tab) : DEFAULT_TAB;
};

/**
 * Where the browser fetches proving keys, and where it sends them to be proved.
 *
 * Both are overridable so the same build can point at a proof server that is not on
 * localhost, without a rebuild.
 */
const ZK_BASE = `${window.location.origin}/zk`;
const PROOF_SERVER =
  (import.meta.env['VITE_PROOF_SERVER'] as string | undefined) ?? 'http://127.0.0.1:6300';

const makeProvider = (mode: Mode): TrialsProvider => {
  switch (mode) {
    case 'mocked':
      return new MockedProvider();
    case 'simulated':
      return new SimulatedProvider();
    case 'proofs':
      return new LocalProofsProvider(new BrowserZkConfigProvider(ZK_BASE), PROOF_SERVER);
    case 'preview':
      return new PreviewProvider();
  }
};

export const App = () => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [provider, setProvider] = useState<TrialsProvider | null>(null);
  const [profiles, setProfiles] = useState<readonly Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bumped whenever the ledger changes, to pull fresh reads out of the provider.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const read = () => {
      const stored = loadProfiles();
      setProfiles(stored.profiles);
      setSelectedId(stored.selectedId ?? stored.profiles[0]?.id ?? null);
    };
    read();
    // Fires in *other* windows on the same origin, which is what lets the kiosk popup
    // follow the patient switcher in the window that opened it.
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const next = makeProvider(mode);
    setProvider(null);
    void next.init().then(() => {
      if (!cancelled) {
        setProvider(next);
        setRevision((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  /**
   * Keep the URL saying where you are: the tab in the hash, the mode in a query parameter.
   *
   * The mode was the one piece of state that reset on every refresh, which is a good way to
   * believe you are on a testnet while running against a local object. `replaceState` rather
   * than assignment, so Back does not walk the tab bar.
   */
  useEffect(() => {
    if (isKiosk()) return;
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    url.hash = tab;
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.history.replaceState(null, '', next);
    }
  }, [tab, mode]);

  // Back/forward, and anyone editing the hash by hand.
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const persist = useCallback((next: readonly Profile[], nextSelected: string | null) => {
    setProfiles(next);
    setSelectedId(nextSelected);
    saveProfiles({ profiles: next, selectedId: nextSelected });
  }, []);

  const updateProfile = useCallback(
    (updated: Profile) => {
      persist(
        profiles.map((profile) => (profile.id === updated.id ? updated : profile)),
        selectedId,
      );
    },
    [persist, profiles, selectedId],
  );

  /**
   * Apply several profile updates at once.
   *
   * Calling `updateProfile` in a loop would not work: each call maps over the `profiles`
   * captured in its closure, so every write but the last would be discarded.
   */
  const updateProfiles = useCallback(
    (updated: readonly Profile[]) => {
      const byId = new Map(updated.map((profile) => [profile.id, profile]));
      persist(
        profiles.map((profile) => byId.get(profile.id) ?? profile),
        selectedId,
      );
    },
    [persist, profiles, selectedId],
  );

  const addProfile = useCallback(
    (profile: Profile) => persist([...profiles, profile], profile.id),
    [persist, profiles],
  );

  const removeProfile = useCallback(
    (target: Profile) => {
      const next = profiles.filter((profile) => profile.id !== target.id);
      // Removing whoever you were acting as has to leave you acting as somebody.
      persist(next, target.id === selectedId ? (next[0]?.id ?? null) : selectedId);
    },
    [persist, profiles, selectedId],
  );

  const resetAll = useCallback(async () => {
    clearProfiles();
    await provider?.reset();
    const stored = loadProfiles();
    setProfiles(stored.profiles);
    setSelectedId(stored.selectedId);
    setRevision((value) => value + 1);
  }, [provider]);

  const status = provider?.status();

  if (isKiosk()) {
    return (
      <div className="kiosk">
        {provider === null || selected === null ? (
          <p className="note">Starting…</p>
        ) : (
          <MobileView
            provider={provider}
            profile={selected}
            revision={revision}
            onLedgerChange={() => setRevision((value) => value + 1)}
            kiosk
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          ADEPE<span>privacy preserving clinical trial eligibility</span>
        </div>
        <div className="spacer" />

        <label className="field">
          patient
          <select
            aria-label="patient"
            value={selectedId ?? ''}
            onChange={(event) => persist(profiles, event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName}
                {profile.credential === null ? ' (unsigned)' : ''}
              </option>
            ))}
          </select>
        </label>

        {/*
          Not a control, a label. With the switch living in Config, nothing else on screen
          said which mode was running, and "it worked on testnet" is an easy thing to
          believe while pointed at a local object. Clicking it goes to the switch.
        */}
        <button
          className="mode-badge"
          onClick={() => setTab('config')}
          title="Change this in Config"
        >
          {MODES.find((entry) => entry.id === mode)?.label ?? mode}
        </button>
      </div>

      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <main>
        {status !== undefined && !status.ready ? (
          <div className="card">
            <h2>{MODES.find((entry) => entry.id === mode)?.label} mode is not available</h2>
            <p className="note">{status.detail}</p>
          </div>
        ) : null}

        {provider === null ? (
          <div className="card">
            <p className="note">Starting {mode} mode…</p>
          </div>
        ) : selected === null ? (
          <div className="card">
            <p className="note">No patient profiles. Add one from the header.</p>
          </div>
        ) : tab === 'phone' ? (
          <MobileView
            provider={provider}
            profile={selected}
            revision={revision}
            onLedgerChange={() => setRevision((value) => value + 1)}
          />
        ) : tab === 'trials' ? (
          <TrialsView
            provider={provider}
            profile={selected}
            revision={revision}
            onLedgerChange={() => setRevision((value) => value + 1)}
          />
        ) : tab === 'credential' ? (
          <CredentialView profile={selected} />
        ) : tab === 'config' ? (
          <ConfigView
            provider={provider}
            mode={mode}
            onModeChange={setMode}
            revision={revision}
            onReset={() => void resetAll()}
          />
        ) : tab === 'patients' ? (
          <PatientsView
            profiles={profiles}
            selectedId={selectedId}
            onSelect={(id) => persist(profiles, id)}
            onAdd={addProfile}
            onRemove={removeProfile}
          />
        ) : tab === 'clinic' ? (
          <ClinicView
            profiles={profiles}
            selectedId={selectedId}
            onUpdate={updateProfile}
            onUpdateMany={updateProfiles}
          />
        ) : tab === 'issuer' ? (
          <IssuerView profile={selected} onIssued={updateProfile} />
        ) : (
          <OverviewView provider={provider} revision={revision} />
        )}
      </main>

    </>
  );
};
