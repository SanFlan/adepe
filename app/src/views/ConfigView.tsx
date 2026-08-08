/**
 * Everything that belongs to the simulator rather than to the story.
 *
 * The mode switch and the ledger used to sit in the chrome: one in the top bar, one pinned
 * to the bottom of every screen. Both are worth showing on a screencast, and neither is
 * part of what a patient or a clinic does, so they live together here instead.
 *
 * Note this trades something away. The ledger drawer updated in place while you worked, so
 * you could watch a key land. Now you have to come here to look.
 */

import { useEffect, useState } from 'react';
import { MODES, type LedgerPanel, type Mode, type TrialsProvider } from '../providers/types.js';

interface Props {
  provider: TrialsProvider;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  revision: number;
  onReset: () => void;
}

export const ConfigView = ({ provider, mode, onModeChange, revision, onReset }: Props) => {
  const [panels, setPanels] = useState<readonly LedgerPanel[]>([]);

  useEffect(() => {
    setPanels(provider.ledgerPanels());
  }, [provider, revision]);

  const status = provider.status();

  return (
    <>
      <div className="card">
        <h2>Mode</h2>
        <p className="note">
          How much of the real system is running. Each step adds one thing to the one above
          it.
        </p>

        <div className="modes">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === mode ? 'mode is-active' : 'mode'}
              aria-pressed={entry.id === mode}
              onClick={() => onModeChange(entry.id)}
            >
              <strong>{entry.label}</strong>
              <span>{entry.blurb}</span>
            </button>
          ))}
        </div>

        <p className="note" style={{ marginTop: 14, marginBottom: 0 }}>
          <span className={`pill ${status.ready ? 'good' : 'warn'}`}>
            {status.ready ? 'ready' : 'unavailable'}
          </span>{' '}
          {status.detail}
        </p>
      </div>

      <div className="card">
        <h3>Ledger</h3>
        <p className="note" style={{ marginBottom: 0 }}>
          The public state. Everything here is visible to anyone.
        </p>

        <div className="ledger-panels">
          {panels.length === 0 ? <p className="note">Nothing on the ledger yet.</p> : null}
          {panels.map((panel) => (
            <section className="panel" key={panel.title}>
              <h5>{panel.title}</h5>
              {panel.note !== undefined ? <p className="note">{panel.note}</p> : null}
              <dl className="kv">
                {panel.rows.map((row, index) => (
                  <div key={`${row.label}-${index}`} style={{ display: 'contents' }}>
                    <dt>{row.label}</dt>
                    <dd className={row.mono === true ? 'mono' : undefined}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>Reset</h3>
            <p className="note" style={{ margin: '4px 0 0' }}>
              Clears every patient and every enrollment, then seeds two patients again.
              Useful between takes.
            </p>
          </div>
          <button onClick={onReset}>Reset demo</button>
        </div>
      </div>
    </>
  );
};
