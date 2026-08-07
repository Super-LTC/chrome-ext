import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchCaseMixRoster } from './hooks/useCaseMix.js';
import {
  filterCaseMixRoster,
  describeCaseMixCohort,
  sortCaseMixRoster,
  RECORD_FILTERS,
  BASIS_FILTERS,
} from './lib/case-mix-roster-filter.js';

/** Header label → sort key. `null` = not sortable (Projected is a forecast, and
 *  ranking by it invites reading the model as a leaderboard). */
const COLUMNS = [
  { key: 'name', label: 'Resident' },
  { key: 'counts', label: 'Counts', cls: 'cmi-tbl__c' },
  { key: 'category', label: 'Category' },
  { key: 'prior', label: 'Prior' },
  { key: 'current', label: 'Current' },
  { key: 'change', label: 'Change', cls: 'cmi-tbl__r' },
  { key: null, label: 'Projected', projectedOnly: true },
  { key: 'qualifier', label: 'Qualifying condition' },
  { key: 'record', label: 'Record' },
];

/**
 * The residents behind one quarter's CMI.
 *
 * ── THE FILTER BAR IS THE POINT, NOT DECORATION ───────────────────────────
 *
 * This mirrors the web residents page: search, a RECORD filter (which assessment
 * is each resident scored off) and a BASIS filter (do they count toward the rate,
 * and if not why). Between them they answer every question the deleted
 * Capture/Payable toggle used to gesture at, and they answer it with names
 * attached instead of a second abstract number.
 *
 * `cohortCmi` in the header is what makes that true. Pick "Assessed this quarter"
 * and the number shown IS the old capture score. That is the whole migration
 * path, and it is why the toggle could go.
 *
 * Filtering is client-side over the roster already in hand — the endpoint returns
 * the full census for the quarter, and every filter is a subset of it. Exact
 * rather than approximate because each predicate reads the same field the engine
 * gated on; see the module docblock in `case-mix-roster-filter.js`.
 *
 * READ ONLY. The web surface lets an org admin override a projected group; this
 * one does not, which keeps a write route, permission plumbing and supersession
 * UI off a surface someone is using with a chart open.
 *
 * The PROJECTED column only exists on an OPEN quarter, and the SERVER enforces
 * that — it strips `projected` from a closed quarter rather than trusting each
 * client to remember, because the web surface shipped that bug once.
 */
/**
 * The payer chip's hover — which payer, and AS OF WHEN.
 *
 * `payerAsOf` null means the census did not reach back to the ARD and the engine
 * fell back to today's payer. That is the one case where the verdict on this row
 * can still move as PCC is updated, so it says so rather than staying silent and
 * letting the reader assume the date was checked.
 */
function payerTitle(r) {
  if (!r.payerAsOf) return `${r.payer} — today's payer; no census record back to the assessment`;
  return `${r.payer}, as of ${r.payerAsOf} — the payer in force on this resident's ARD, which is what Ohio scores on`;
}

export function CaseMixRosterModal({ quarter, facilityName, orgSlug, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [record, setRecord] = useState('any');
  // Opens on the payable set — that is the number the header quotes and the
  // one people came to read. 'All' made the first thing on screen a population
  // nobody asked for.
  const [basis, setBasis] = useState('counts');
  const [search, setSearch] = useState('');
  // Opens on the biggest CMI — the residents carrying the building, which is
  // what people scan a roster for first.
  const [sort, setSort] = useState({ column: 'current', direction: 'desc' });

  useEffect(() => {
    let live = true;
    setState({ loading: true, error: null, data: null });
    fetchCaseMixRoster({ facilityName, orgSlug, quarter })
      .then((d) => live && setState({ loading: false, error: null, data: d }))
      .catch(
        (err) =>
          live && setState({ loading: false, error: err?.message || 'Failed to load', data: null })
      );
    return () => {
      live = false;
    };
  }, [quarter, facilityName, orgSlug]);

  const all = state.data?.residents ?? [];
  const filtered = useMemo(
    () => filterCaseMixRoster(all, { record, basis, search }),
    [all, record, basis, search]
  );
  const rows = useMemo(
    () => sortCaseMixRoster(filtered.rows, sort.column, sort.direction),
    [filtered.rows, sort]
  );
  const showProjected = state.data?.inProgress === true;
  const cohortNote = describeCaseMixCohort(record, basis);

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
                {/* The cohort's own score, which is what replaced the Capture
                    headline — filter to "Assessed this quarter" to get it. */}
                <b>{rows.length}</b> of {all.length} on census
                {filtered.cohortCmi != null && (
                  <>
                    <span class="cmi__sep">·</span>
                    CMI <b>{filtered.cohortCmi.toFixed(4)}</b> over {filtered.cohortScored}
                  </>
                )}
                {cohortNote && <span class="cmi-modal__cohort"> — {cohortNote}</span>}
              </div>
            )}
          </div>
          <button
            type="button"
            class="cmi-modal__close"
            onClick={onClose}
            data-track="case_mix_roster_close"
          >
            ✕
          </button>
        </div>

        {state.data && (
          <div class="cmi-modal__filters">
            <input
              type="search"
              class="cmi-modal__search"
              placeholder="Search resident…"
              value={search}
              onInput={(e) => setSearch(e.target.value)}
              data-track="case_mix_roster_search"
            />
            <div class="cmi__toggle cmi__toggle--filter" role="group" aria-label="Record">
              {RECORD_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  class={`cmi__toggle-btn${record === f.key ? ' cmi__toggle-btn--active' : ''}`}
                  onClick={() => setRecord(f.key)}
                  data-track={`case_mix_roster_record_${f.key}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div class="cmi__toggle cmi__toggle--filter" role="group" aria-label="Counts basis">
              {BASIS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  class={`cmi__toggle-btn${basis === f.key ? ' cmi__toggle-btn--active' : ''}`}
                  onClick={() => setBasis(f.key)}
                  data-track={`case_mix_roster_basis_${f.key}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
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
              <div class="mds-cc__state-text">No residents match these filters.</div>
            </div>
          )}

          {!state.loading && !state.error && rows.length > 0 && (
            <table class="cmi-tbl">
              <thead>
                <tr>
                  {COLUMNS.filter((c) => !c.projectedOnly || showProjected).map((c) => (
                    <th key={c.label} class={c.cls}>
                      {c.key ? (
                        <button
                          type="button"
                          class={`cmi-tbl__sort${sort.column === c.key ? ' cmi-tbl__sort--active' : ''}`}
                          onClick={() =>
                            setSort((s2) =>
                              s2.column === c.key
                                ? { column: c.key, direction: s2.direction === 'desc' ? 'asc' : 'desc' }
                                : { column: c.key, direction: 'desc' }
                            )
                          }
                          data-track={`case_mix_roster_sort_${c.key}`}
                        >
                          {c.label}
                          <span class="cmi-tbl__sort-glyph">
                            {sort.column === c.key ? (sort.direction === 'desc' ? '▼' : '▲') : '↕'}
                          </span>
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.patientId}>
                    <td class="cmi-tbl__name">
                      {r.patientName}
                      {r.payer && (
                        // WHEN, not just what. Ohio reads the payer as of the ARD of
                        // the assessment being scored, so a resident who has since
                        // moved to Medicare A still shows the payer that governed
                        // this record. Without the date the row looks simply wrong to
                        // anyone checking it against PCC today.
                        <span class="cmi-tbl__payer" title={payerTitle(r)}>
                          {r.payer}
                        </span>
                      )}
                    </td>
                    <td class="cmi-tbl__c" title={r.countsReason ?? undefined}>
                      {r.needsReview ? (
                        <span class="cmi-tbl__badge cmi-tbl__badge--review">?</span>
                      ) : r.counts ? (
                        <span class="cmi-tbl__badge cmi-tbl__badge--yes">Y</span>
                      ) : r.pendingMedicaid ? (
                        <span
                          class="cmi-tbl__badge cmi-tbl__badge--pending"
                          title="Medicaid application pending — Ohio backdates eligibility, so this converts if it clears"
                        >
                          P
                        </span>
                      ) : (
                        <span class="cmi-tbl__badge">N</span>
                      )}
                    </td>
                    <td class="cmi-tbl__cat">
                      {r.nursingCategory ?? <span class="cmi-tbl__dot">—</span>}
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
                        not. A projection in rose would be indistinguishable from
                        a real drop. */}
                    <td class="cmi-tbl__r">
                      {r.delta != null && Math.abs(r.delta) >= 0.005 ? (
                        <span class={`cmi-tbl__delta cmi-tbl__delta--${r.delta > 0 ? 'up' : 'down'}`}>
                          {r.delta > 0 ? '▲' : '▼'}
                          {Math.abs(r.delta).toFixed(2)}
                        </span>
                      ) : (
                        <span class="cmi-tbl__dot">·</span>
                      )}
                      {showProjected &&
                        r.projected?.basisMatches &&
                        r.projected?.changed &&
                        r.projected?.delta != null &&
                        Math.abs(r.projected.delta) >= 0.005 && (
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
                        {/* Shown ONLY when the projection starts from the group in
                            the Current column AND the engine says it moved. The
                            projection re-derives its own current with the
                            classifier, which disagrees with the record's HIPPS on
                            12.5% of residents — rendering it anyway produced 72
                            phantom jumps out of 97, e.g. a ventilator resident
                            "gaining" 1.87 CMI. */}
                        {r.projected?.group && r.projected.basisMatches && r.projected.changed ? (
                          <span
                            class={`cmi-tbl__proj${r.projected.isOverride ? ' cmi-tbl__proj--set' : ''}`}
                            title={(r.projected.drops ?? [])
                              .map((d) => `${d.label} — ${d.reason}`)
                              .join('\n')}
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
                      {/* Only when the SUBCATEGORY changed — not the label.
                          Multi-part categories report a part name, so one Special
                          Care High read "COPD falls to Shortness of breath when
                          lying flat": two halves of a single qualifier
                          (I6200 AND J1100C) shown as a swap. And the verb follows
                          the direction rather than always saying "falls". */}
                      {showProjected &&
                        r.projected?.basisMatches &&
                        r.projected?.changed &&
                        r.projected?.qualifierChanged && (
                          <span class="cmi-tbl__falls">
                            {' '}
                            {(r.projected.delta ?? 0) > 0 ? 'becomes' : 'falls to'}{' '}
                            {r.projected.qualifier ?? 'nothing qualifying'}
                          </span>
                        )}
                    </td>
                    <td class="cmi-tbl__dim">
                      {/* Plain English — "riding an earlier record" told the
                          reader nothing about what to do next. */}
                      {r.status === 'none'
                        ? 'No assessment on file'
                        : r.status === 'carry'
                          ? 'Scored off an older assessment'
                          : r.status === 'backward'
                            ? 'Counted back from a later admission'
                            : 'Assessed this quarter'}
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
