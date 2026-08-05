import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fetchCaseMixRoster } from './hooks/useCaseMix.js';

/**
 * The residents behind one quarter's CMI. Centered modal over the tab — a
 * quarterly roster is ~80 rows, which is too much for the inline expand the
 * Assessments tab uses.
 *
 * READ ONLY. No override editing on this surface; see CaseMixView.
 *
 * The PROJECTED column only exists on an OPEN quarter, and the server is what
 * enforces that — it strips `projected` from a closed quarter's rows rather than
 * trusting each client to remember. This renders whatever it is given.
 */
export function CaseMixRosterModal({ quarter, facilityName, orgSlug, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

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

  const rows = state.data?.residents ?? [];
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
          <div>
            <div class="cmi-modal__title">{quarter} residents</div>
            {state.data && (
              <div class="cmi-modal__sub">
                {rows.length} on census · picture {state.data.pictureDate}
              </div>
            )}
          </div>
          <button type="button" class="cmi-modal__close" onClick={onClose} data-track="case_mix_roster_close">
            ✕
          </button>
        </div>

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

          {!state.loading && !state.error && (
            <table class="cmi-tbl">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th class="cmi-tbl__c">Counts</th>
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
                      ) : (
                        <span class="cmi-tbl__badge">N</span>
                      )}
                    </td>
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
                              : 'Projected change at the next assessment — an estimate'
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
