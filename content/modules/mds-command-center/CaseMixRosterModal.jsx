import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchCaseMixRoster } from './hooks/useCaseMix.js';
import {
  filterCaseMixRoster,
  describeCaseMixPopulation,
} from './lib/case-mix-roster-filter.js';

const MEASURES = [
  { key: 'medicaidCmi', label: 'Medicaid' },
  { key: 'allCmi', label: 'All residents' },
  { key: 'medicaidWithPendingCmi', label: '+ pendings' },
];

/**
 * The residents behind one quarter's CMI. Centered modal over the tab — a
 * quarterly roster is ~80 rows, which is too much for the inline expand the
 * Assessments tab uses.
 *
 * READ ONLY. No override editing on this surface; see CaseMixView.
 *
 * ── THE TOGGLES ARE HERE TOO, AND THEY DO NOT REFETCH ─────────────────────
 *
 * It opens on whatever population and measure the tab was showing, so the roster
 * you land on is the one behind the number you clicked. Changing either re-filters
 * the rows already in hand — the endpoint returns the whole census for the
 * quarter, and the two toggles are subsets of it.
 *
 * That is exact rather than approximate because `filterCaseMixRoster` keys on the
 * same fields the score gated on: `status === 'locked'` IS the assessed-in-period
 * gate, and `counts` IS the payer tree's verdict. The count in this header should
 * therefore equal the denominator in the tab header for the same two toggles. If
 * it ever doesn't, the filter is wrong, not the header.
 *
 * The PROJECTED column only exists on an OPEN quarter, and the server is what
 * enforces that — it strips `projected` from a closed quarter's rows rather than
 * trusting each client to remember. This renders whatever it is given.
 */
export function CaseMixRosterModal({
  quarter,
  facilityName,
  orgSlug,
  boundaryLabel,
  initialPopulation = 'payable',
  initialMeasure = 'medicaidCmi',
  onClose,
}) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [population, setPopulation] = useState(initialPopulation);
  const [measure, setMeasure] = useState(initialMeasure);

  useEffect(() => {
    let live = true;
    setState({ loading: true, error: null, data: null });
    fetchCaseMixRoster({ facilityName, orgSlug, quarter })
      .then((d) => live && setState({ loading: false, error: null, data: d }))
      .catch((err) => live && setState({ loading: false, error: err?.message || 'Failed to load', data: null }));
    return () => {
      live = false;
    };
  }, [quarter, facilityName, orgSlug]);

  const all = state.data?.residents ?? [];
  const filtered = useMemo(
    () => filterCaseMixRoster(all, { population, measure }),
    [all, population, measure]
  );
  const rows = filtered.rows;
  const showProjected = state.data?.inProgress === true;

  return (
    <div class="cmi-modal__overlay" onClick={onClose}>
      <div
        class="cmi-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Residents in ${quarter}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="cmi-modal__head">
          <div class="cmi-modal__head-main">
            <div class="cmi-modal__title">{quarter} residents</div>
            {state.data && (
              <div class="cmi-modal__sub">
                <b>{rows.length}</b> in this view · {all.length} on census · picture{' '}
                {state.data.pictureDate}
                {filtered.unscoreable > 0 && (
                  <span> · {filtered.unscoreable} with no scoreable record</span>
                )}
              </div>
            )}
          </div>
          <div class="cmi-modal__head-right">
            <div class="cmi__toggle-stack">
              <div class="cmi__toggle" role="group" aria-label="Population">
                <button
                  type="button"
                  class={`cmi__toggle-btn${population === 'capture' ? ' cmi__toggle-btn--active' : ''}`}
                  onClick={() => setPopulation('capture')}
                  title="Only residents assessed inside the quarter"
                  data-track="case_mix_roster_population_capture"
                >
                  Capture
                </button>
                <button
                  type="button"
                  class={`cmi__toggle-btn${population === 'payable' ? ' cmi__toggle-btn--active' : ''}`}
                  onClick={() => setPopulation('payable')}
                  title="The record in effect on the picture date"
                  data-track="case_mix_roster_population_payable"
                >
                  Payable
                </button>
              </div>
              <div class="cmi__toggle cmi__toggle--measure" role="group" aria-label="Measure">
                {MEASURES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    class={`cmi__toggle-btn${measure === m.key ? ' cmi__toggle-btn--active' : ''}`}
                    onClick={() => setMeasure(m.key)}
                    data-track={`case_mix_roster_measure_${m.key}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" class="cmi-modal__close" onClick={onClose} data-track="case_mix_roster_close">
              ✕
            </button>
          </div>
        </div>

        {state.data && (
          <div class="cmi-modal__explain">
            {describeCaseMixPopulation(population, measure, { boundaryLabel })}
          </div>
        )}

        <div class="cmi-modal__body">
          {state.loading && (
            <div class="mds-cc__state-container">
              <div class="mds-cc__spinner" />
              <div class="mds-cc__state-text">Loading residents…</div>
            </div>
          )}

          {state.error && (
            <div class="mds-cc__state-container">
              <div class="mds-cc__state-icon">⚠️</div>
              <div class="mds-cc__state-text">{state.error}</div>
            </div>
          )}

          {!state.loading && !state.error && rows.length === 0 && (
            <div class="mds-cc__state-container">
              <div class="mds-cc__state-icon">🔍</div>
              <div class="mds-cc__state-text">
                No residents in this view.
                {population === 'capture' && (
                  <span> Nobody has been assessed inside {quarter} yet.</span>
                )}
              </div>
            </div>
          )}

          {!state.loading && !state.error && rows.length > 0 && (
            <table class="cmi-tbl">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th class="cmi-tbl__c">Counts</th>
                  <th>Category</th>
                  <th>Prior</th>
                  <th>Current</th>
                  <th class="cmi-tbl__r">Change</th>
                  {showProjected && <th>Projected</th>}
                  <th>Qualifying condition</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.patientId}>
                    <td class="cmi-tbl__name">
                      {r.patientName}
                      {r.payer && <span class="cmi-tbl__payer">{r.payer}</span>}
                    </td>
                    <td class="cmi-tbl__c" title={r.countsReason ?? undefined}>
                      {r.needsReview ? (
                        <span class="cmi-tbl__badge cmi-tbl__badge--review">?</span>
                      ) : r.counts ? (
                        <span class="cmi-tbl__badge cmi-tbl__badge--yes">Y</span>
                      ) : r.pendingMedicaid ? (
                        <span class="cmi-tbl__badge cmi-tbl__badge--pending" title="Medicaid application pending">
                          P
                        </span>
                      ) : (
                        <span class="cmi-tbl__badge">N</span>
                      )}
                    </td>
                    <td class="cmi-tbl__cat">{r.nursingCategory ?? <span class="cmi-tbl__dot">—</span>}</td>
                    <td class="cmi-tbl__dim">
                      {r.priorGroup ? `${r.priorGroup} · ${r.priorCmi?.toFixed(2)}` : '—'}
                    </td>
                    <td class="cmi-tbl__strong">
                      {r.currentGroup ? `${r.currentGroup} · ${r.currentCmi?.toFixed(2)}` : '—'}
                    </td>
                    {/* Realized on top, projected beneath in a DIFFERENT colour.
                        Same ▲/▼ glyph because it is the same kind of quantity;
                        emerald/rose means it happened, amber/violet means it has
                        not. A projection rendering in rose would be
                        indistinguishable from a real drop. */}
                    <td class="cmi-tbl__r">
                      {r.delta != null && Math.abs(r.delta) >= 0.005 ? (
                        <span class={`cmi-tbl__delta cmi-tbl__delta--${r.delta > 0 ? 'up' : 'down'}`}>
                          {r.delta > 0 ? '▲' : '▼'}
                          {Math.abs(r.delta).toFixed(2)}
                        </span>
                      ) : (
                        <span class="cmi-tbl__dot">·</span>
                      )}
                      {showProjected && r.projected?.delta != null && Math.abs(r.projected.delta) >= 0.005 && (
                        <div
                          class={`cmi-tbl__delta cmi-tbl__delta--proj${r.projected.isOverride ? ' cmi-tbl__delta--set' : ''}`}
                          title={
                            r.projected.isOverride
                              ? 'Projected change — set by a person'
                              : 'Projected change at the next assessment — an estimate. Right about a third of the time on the residents where it fires; never summed into the building score.'
                          }
                        >
                          {r.projected.delta > 0 ? '▲' : '▼'}
                          {Math.abs(r.projected.delta).toFixed(2)}
                        </div>
                      )}
                    </td>
                    {showProjected && (
                      <td>
                        {r.projected?.group ? (
                          <span
                            class={`cmi-tbl__proj${r.projected.isOverride ? ' cmi-tbl__proj--set' : ''}`}
                            title={(r.projected.drops ?? []).map((d) => `${d.label} — ${d.reason}`).join('\n')}
                          >
                            {r.projected.group}
                            {r.projected.cmi != null && ` · ${r.projected.cmi.toFixed(2)}`}
                          </span>
                        ) : (
                          <span class="cmi-tbl__dot">—</span>
                        )}
                      </td>
                    )}
                    <td class="cmi-tbl__qual">
                      {r.qualifier ?? <span class="cmi-tbl__dot">—</span>}
                      {/* Words, not an arrow. "X → Y" made the arrow carry the
                          whole sentence and it read as a range. */}
                      {showProjected && r.projected?.group && r.projected.group !== r.currentGroup && (
                        <span class="cmi-tbl__falls">
                          {' '}falls to {r.projected.qualifier ?? 'nothing qualifying'}
                        </span>
                      )}
                    </td>
                    <td class="cmi-tbl__dim">
                      {r.status === 'none'
                        ? 'no scoreable record'
                        : r.status === 'carry'
                          ? 'earlier record'
                          : r.status === 'backward'
                            ? 'counted back'
                            : 'assessed'}
                      {r.currentArd && <div class="cmi-tbl__ard">ARD {r.currentArd}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
