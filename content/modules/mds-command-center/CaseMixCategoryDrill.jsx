import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchCaseMixRoster } from './hooks/useCaseMix.js';
import { filterCaseMixRoster } from './lib/case-mix-roster-filter.js';

/**
 * The residents inside one clinical category, opened INLINE beneath the mix bar
 * that was clicked.
 *
 * Inline rather than a modal, deliberately. A bar reading "Special Care High 23"
 * raises exactly one question — WHICH 23 — and answering it by covering the chart
 * that asked it makes you hold both in your head. The web surface does the same
 * thing under its Clinical category tile, so the gesture is already learned.
 *
 * Fetches the quarter's roster on open and filters client-side. That is a full
 * roster for a slice of it, which sounds wasteful until you notice the next
 * category the reader opens is served from the same response — and the endpoint
 * has no category parameter, so a narrower request does not exist.
 */
export function CaseMixCategoryDrill({
  quarter,
  category,
  label,
  facilityName,
  orgSlug,
  onOpenFullRoster,
}) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });

  useEffect(() => {
    let live = true;
    setState({ loading: true, error: null, rows: [] });
    fetchCaseMixRoster({ facilityName, orgSlug, quarter })
      .then((d) => live && setState({ loading: false, error: null, rows: d?.residents ?? [] }))
      .catch(
        (err) =>
          live && setState({ loading: false, error: err?.message || 'Failed to load', rows: [] })
      );
    return () => {
      live = false;
    };
  }, [quarter, category, facilityName, orgSlug]);

  const { rows, cohortCmi } = useMemo(
    () => filterCaseMixRoster(state.rows, { category }),
    [state.rows, category]
  );

  return (
    <div class="cmi-drill">
      {state.loading && <div class="cmi-drill__msg">Loading residents…</div>}
      {state.error && <div class="cmi-drill__msg">{state.error}</div>}

      {!state.loading && !state.error && (
        <>
          <div class="cmi-drill__head">
            <span class="cmi-drill__title">
              {label} · <b>{rows.length}</b> resident{rows.length === 1 ? '' : 's'}
              {cohortCmi != null && <> · avg CMI {cohortCmi.toFixed(2)}</>}
            </span>
            <button
              type="button"
              class="cmi-drill__all"
              onClick={onOpenFullRoster}
              data-track="case_mix_category_view_all"
            >
              See the whole quarter →
            </button>
          </div>

          {rows.length === 0 ? (
            <div class="cmi-drill__msg">No residents in this category.</div>
          ) : (
            <table class="cmi-drill__tbl">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Payer</th>
                  <th>Group</th>
                  <th class="cmi__r">CMI</th>
                  <th>Qualifying condition</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.patientId}>
                    <td class="cmi-drill__name">{r.patientName}</td>
                    <td class="cmi-drill__dim">{r.payer ?? '—'}</td>
                    <td class="cmi-drill__group">{r.currentGroup ?? '—'}</td>
                    <td class="cmi__r cmi-drill__cmi">
                      {r.currentCmi != null ? r.currentCmi.toFixed(2) : '—'}
                    </td>
                    <td class="cmi-drill__qual">{r.qualifier ?? '—'}</td>
                    <td class="cmi-drill__dim">
                      {/* Plain English. "Riding an earlier record" was jargon that
                          told the reader nothing about what to do next. */}
                      {r.status === 'none'
                        ? 'No assessment on file'
                        : r.status === 'carry'
                          ? `Last assessed ${r.currentArd ?? 'earlier'}`
                          : r.status === 'backward'
                            ? 'Counted back from a later admission'
                            : `Assessed ${r.currentArd ?? 'this quarter'}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
