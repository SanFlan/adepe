/**
 * The public ledger, on tap.
 *
 * Kept out of the main flow because a patient would never see it, but a demo needs it:
 * it is the only way to show that what lands on chain really is just a set of opaque
 * keys.
 */

import { useEffect, useState } from 'react';
import type { LedgerPanel, TrialsProvider } from '../providers/types.js';

interface Props {
  provider: TrialsProvider;
  revision: number;
}

export const LedgerDrawer = ({ provider, revision }: Props) => {
  const [open, setOpen] = useState(false);
  const [panels, setPanels] = useState<readonly LedgerPanel[]>([]);

  useEffect(() => {
    setPanels(provider.ledgerPanels());
  }, [provider, revision, open]);

  return (
    <div className="drawer">
      <header onClick={() => setOpen(!open)}>
        <strong>{open ? '▾' : '▸'} Ledger</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          {provider.mode} · {provider.status().detail}
        </span>
      </header>
      {open ? (
        <div className="body">
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
      ) : null}
    </div>
  );
};
