/**
 * Simulator plumbing: who exists, and who you are currently acting as.
 *
 * These controls have no counterpart in the real system — every patient here would be a
 * separate person on a separate device holding a separate secret. They lived in the top
 * bar, which put demo scaffolding next to the mode switch and left no room to say what any
 * of it meant.
 *
 * Distinct from the Clinic roster, which is the issuer's view of the same people: this
 * page creates, selects and deletes them; that one attests to them.
 */

import {
  ARCHETYPES,
  profileFromArchetype,
  randomProfile,
  type Profile,
} from '../lib/profiles.js';
import {
  STATUS_LABEL,
  STATUS_TONE,
  credentialStatus,
} from '../lib/credential-status.js';

interface Props {
  profiles: readonly Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (profile: Profile) => void;
  onRemove: (profile: Profile) => void;
}

export const PatientsView = ({
  profiles,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
}: Props) => (
  <>
    <div className="card">
      <h2>Patients</h2>
      <p className="note" style={{ marginBottom: 0 }}>
        Everyone this simulator can act as. In reality each one is a different person on
        their own device with their own secret. There would be no way to switch between
        them, and no page like this.
      </p>
    </div>

    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0 }}>Roster</h3>
          <p className="note" style={{ margin: '4px 0 0' }}>
            {profiles.length} patients · acting as{' '}
            <strong>
              {profiles.find((profile) => profile.id === selectedId)?.displayName ?? 'nobody'}
            </strong>
          </p>
        </div>
        <div className="row">
          <button onClick={() => onAdd(randomProfile())}>+ Random patient</button>
          <select
            aria-label="add from archetype"
            value=""
            onChange={(event) => {
              const archetype = ARCHETYPES[Number(event.target.value)];
              if (archetype !== undefined) onAdd(profileFromArchetype(archetype));
            }}
          >
            <option value="">+ From archetype…</option>
            {ARCHETYPES.map((archetype, index) => (
              <option key={archetype.displayName} value={index}>
                {archetype.displayName} · {archetype.note}
              </option>
            ))}
          </select>
        </div>
      </div>

      <table className="roster">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Age</th>
            <th>Attestation</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const status = credentialStatus(profile);
            const active = profile.id === selectedId;
            return (
              <tr key={profile.id} className={active ? 'is-selected' : undefined}>
                <td>
                  {profile.displayName}
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {profile.record.patient.pseudonym}
                  </div>
                </td>
                <td className="mono">{String(profile.record.history.age)}</td>
                <td>
                  <span className={`pill ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
                </td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button
                      className={active ? undefined : 'primary'}
                      onClick={() => onSelect(profile.id)}
                      disabled={active}
                    >
                      {active ? 'Acting as' : 'Act as'}
                    </button>
                    <button
                      onClick={() => onRemove(profile)}
                      disabled={profiles.length < 2}
                      title={
                        profiles.length < 2 ? 'The last patient cannot be removed' : undefined
                      }
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="card">
      <h3>Archetypes</h3>
      <p className="note" style={{ marginBottom: 0 }}>
        The presets are picked so every trial has someone who qualifies and someone who does
        not. A demo that only ever shows acceptance proves nothing.
      </p>
    </div>
  </>
);
