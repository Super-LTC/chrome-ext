/**
 * Per-resident DFS explorer (#54, in-house). The discharge score is the sum of
 * the resident's GG items; expected (target) is fixed (risk-adjusted from
 * admission). Nurses bump each item from its admission value to see what it
 * would take to clear the target — pure client math, no recompute server-side.
 *
 * Ported from qm-handoff/qm-dfs-explorer.reference.tsx → Preact + the qmc- CSS.
 */
import { useMemo, useState } from 'preact/hooks';
import { buildDfsStayItemRows } from '../lib/build-stay-item-rows.js';
import { X, Minus, Plus } from './icons.jsx';

const DFS_MAX = 60;

export function DfsExplorer({ resident, onClose }) {
  const rows = useMemo(
    () => buildDfsStayItemRows({ admission: resident.admissionItems, discharge: null }),
    [resident.admissionItems]
  );
  // Wheel locomotion counts GG0170R twice toward the total.
  const hasWheel = rows.some((r) => r.code === 'GG0170R');

  // GG items are 1–6 integers; imputed admission cells are continuous, so round
  // them to a whole step for the +/- explorer (it's a "what would it take" tool).
  const [values, setValues] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.code, Math.round(r.admission ?? 1)]))
  );

  const observed = useMemo(() => {
    let sum = rows.reduce((s, r) => s + (values[r.code] ?? 0), 0);
    if (hasWheel) sum += values['GG0170R'] ?? 0;
    return sum;
  }, [values, rows, hasWheel]);

  const target = resident.expected;
  const toGo = Math.round(target - observed);
  const hits = observed >= target;
  const dirty = rows.some((r) => (values[r.code] ?? 0) !== Math.round(r.admission ?? 0));

  const bump = (code, d) =>
    setValues((v) => ({ ...v, [code]: Math.max(1, Math.min(6, (v[code] ?? 1) + d)) }));
  const reset = () => setValues(Object.fromEntries(rows.map((r) => [r.code, Math.round(r.admission ?? 1)])));

  const observedW = Math.min(100, (observed / DFS_MAX) * 100);
  const targetL = Math.min(100, (target / DFS_MAX) * 100);

  return (
    <div className="qmc qmc-modal-overlay" onClick={onClose}>
      <div className="qmc-modal qmc-modal-in qmc-dfs-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="qmc-modal__head">
          <div style={{ minWidth: 0 }}>
            <div className="qmc-dfs-modal__title-row">
              <span className="qmc-modal__name">{resident.name}</span>
              <span className="qmc-tag qmc-tag--state">in-house · day {resident.daysOnStay}</span>
            </div>
            <p className="qmc-modal__meta">
              The discharge score is the sum of these GG items.{' '}
              <b>Bump the ones therapy can realistically move</b> to see what reaches the target.
            </p>
          </div>
          <button type="button" className="qmc-modal__close" onClick={onClose} aria-label="Close"><X /></button> {/* NO_TRACK */}
        </div>

        <div className="qmc-modal__body">
          {/* live total + bar */}
          <div className="qmc-dfs-explore__readout">
            <span className="qmc-dfs-explore__adm">Admission {Math.round(resident.entryScore)}</span>
            <span className="qmc-dfs-explore__total">
              {Math.round(observed)} <span className="qmc-dfs-explore__total-sub">/ target {Math.round(target)}</span>
            </span>
            <span className={`qmc-dfs-explore__verdict ${hits ? 'qmc-text--emerald' : 'qmc-text--amber'}`}>
              {hits ? '✓ hits target' : `+${Math.max(0, toGo)} to go`}
            </span>
          </div>
          <div className="qmc-dfs-bar">
            <div className="qmc-dfs-bar__track" />
            <div className={`qmc-dfs-bar__fill ${hits ? 'qmc-dfs-bar__fill--emerald' : 'qmc-dfs-bar__fill--amber'}`} style={{ width: `${observedW}%` }} />
            <div className="qmc-dfs-bar__target" style={{ left: `${targetL}%` }} />
          </div>

          {/* per-item controls */}
          <div className="qmc-dfs-items">
            {rows.map((r) => {
              const val = values[r.code] ?? 1;
              const moved = val !== Math.round(r.admission ?? 0);
              return (
                <div key={r.code} className="qmc-dfs-item">
                  <div className="qmc-dfs-item__label">
                    <div className="qmc-dfs-item__name">{r.label}</div>
                    <div className="qmc-dfs-item__adm">
                      adm {r.admission == null ? '—' : Math.round(r.admission)}
                      {r.admissionImputed && <span className="qmc-dfs-item__imp"> (imputed)</span>}
                    </div>
                  </div>
                  <div className="qmc-dfs-item__ctrl">
                    <button type="button" className="qmc-dfs-step" disabled={val <= 1} onClick={() => bump(r.code, -1)} aria-label={`Lower ${r.label}`}><Minus /></button> {/* NO_TRACK */}
                    <span className={`qmc-dfs-item__val ${moved ? 'qmc-text--violet' : ''}`}>{val}</span>
                    <button type="button" className="qmc-dfs-step" disabled={val >= 6} onClick={() => bump(r.code, 1)} aria-label={`Raise ${r.label}`}><Plus /></button> {/* NO_TRACK */}
                  </div>
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div className="qmc-dfs-explore__foot">
            <p className="qmc-dfs-explore__note">
              Exploratory — admission values are real (1 = dependent, 6 = independent); this is a
              "what would it take" tool, not a prediction.
            </p>
            {dirty && (
              <button type="button" className="qmc-dfs-explore__reset" onClick={reset}>Reset</button> /* NO_TRACK */
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
