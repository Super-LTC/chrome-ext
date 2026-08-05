import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { buildCaseMixTrend } from './lib/case-mix-trend-view.js';
import { CaseMixRosterModal } from './CaseMixRosterModal.jsx';
import { CaseMixCategoryDrill } from './CaseMixCategoryDrill.jsx';

/**
 * Case Mix tab — one building's Ohio Medicaid CMI, its trend, its clinical mix,
 * and the residents behind it.
 *
 * ── WHY THERE ARE NO TOGGLES ABOVE THE TREND ──────────────────────────────
 *
 * There were three, and all three are gone. Each removal was a decision, so:
 *
 * CAPTURE / PAYABLE. Two parallel CMI scores over two populations, sitting next
 * to a measure toggle, with nothing saying which axis you were moving. "Capture"
 * meant "only residents assessed inside this quarter" — a question about the
 * LIST, which is where it now lives: filter the roster to "Assessed this
 * quarter" and its cohort CMI is that number, beside the names it came from.
 *
 * ALL RESIDENTS. The all-payer score does not pay anything. Ohio sets the rate
 * off the Medicaid score; the Total is published alongside it (OAC 5160-3-43.3)
 * and is useful for exactly one job — checking our engine against ODM's report,
 * which is a desk task, not a coding-surface one. It stays on web. Its one
 * genuinely load-bearing fact — that all-payer reconciles to ODM EXACTLY while
 * Medicaid runs ~0.03 high — survives in the reconciliation hover, which is
 * where a caveat about accuracy belongs anyway.
 *
 * + PENDINGS. Not a third score, a fact ABOUT the Medicaid score. Ohio backdates
 * eligibility, so a pending application converts retroactively. It reads as one
 * sentence under the number ("5 pending — worth +0.03 if they clear") and is more
 * actionable there than as a mode you have to discover.
 *
 * What replaced them is quarter pills, which change WHICH quarter the tab
 * describes rather than what the number means.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * No override editing — that needs a write route, permissions and supersession
 * UI, none of which belongs on a read-while-you-code surface. No portfolio: this
 * is the one building whose PCC page you are on.
 *
 * NO ROLLED-UP PROJECTED CMI. Averaging the per-resident projections into a
 * forecast was measured end-to-end and is WORSE than doing nothing
 * (carry-forward MAE 0.0257 / bias +0.0184; projection mean MAE 0.0395 / bias
 * −0.0235), because the model only ever drops a group while the largest source of
 * real gains is residents acquiring a condition absent from today's record. The
 * open quarter instead shows the measured drift band: carry-forward understated
 * the settled score in 28 of 28 backtested cells, so it is a FLOOR.
 *
 * OHIO ONLY, FOR NOW, ON PURPOSE. The nursing classifier is federal PDPM, but the
 * measurement PERIOD is not — and Ohio's is the only one read from the
 * rate-setting rule and reconciled against the state's own report. The gate is
 * server-side in CASE_MIX_QUARTERLY_SUPPORTED_STATES; states join it after their
 * rule is read, not before.
 */
export function CaseMixView({ data, facilityName, orgSlug, onRetry }) {
  const rows = data?.payable ?? [];

  /** Which quarter the whole tab describes. Null means "the newest". */
  const [quarter, setQuarter] = useState(null);
  /** Bars read shape; the table reads values. */
  const [view, setView] = useState('chart');
  /** A clinical category expanded inline, or null. */
  const [openCategory, setOpenCategory] = useState(null);
  /** The full roster drill, opened from the header button, a bar, or the work list. */
  const [drillQuarter, setDrillQuarter] = useState(null);

  const trend = useMemo(() => buildCaseMixTrend(rows, { metric: 'medicaidCmi' }), [rows]);
  const period = data?.period ?? {};

  const selected =
    (quarter && rows.find((r) => r.quarter === quarter)) || rows[rows.length - 1] || null;
  const selectedPoint =
    (quarter && trend.points.find((p) => p.quarter === quarter)) ||
    trend.points[trend.points.length - 1] ||
    null;

  if (!rows.length) {
    return (
      <div class="mds-cc__state-container">
        <div class="mds-cc__state-icon">📊</div>
        <div class="mds-cc__state-text">No case-mix quarters for this building yet.</div>
        {onRetry && (
          <button type="button" class="mds-cc__retry-btn" onClick={onRetry} data-track="case_mix_retry">
            Retry
          </button>
        )}
      </div>
    );
  }

  const drift = selectedPoint?.drift ?? null;
  const recon = data?.reconciliation?.medicaid ?? null;
  const composition = selectedPoint?.composition ?? null;
  const span = trend.top - trend.baseline;
  const pct = (v) => (span > 0 ? ((v - trend.baseline) / span) * 100 : 0);
  // What the pendings are worth, as a delta rather than a rival score.
  const pendingLift =
    selected?.medicaidWithPendingCmi != null && selected?.medicaidCmi != null
      ? +(selected.medicaidWithPendingCmi - selected.medicaidCmi).toFixed(4)
      : null;

  const pickQuarter = (q) => {
    setQuarter(q);
    setOpenCategory(null); // a category drill belongs to the quarter that opened it
  };

  return (
    <div class="cmi">
      {/* ── the number ───────────────────────────────────────────── */}
      <div class="cmi__headline">
        <div class="cmi__headline-main">
          <div class="cmi__eyebrow">
            {period.verified ? 'OH Medicaid case mix' : 'Medicaid case mix'}
            {selected?.inProgress && <span class="cmi__chip cmi__chip--open">open</span>}
          </div>
          <div class="cmi__value-row">
            <span class="cmi__value">
              {selectedPoint?.value != null ? selectedPoint.value.toFixed(4) : '—'}
            </span>
            {drift && selectedPoint?.value != null && (
              <span
                class="cmi__drift"
                title={`Backtested on ${data?.driftProvenance?.population ?? '17 Ohio buildings'}: carry-forward understated the settled score in ${data?.driftProvenance?.cellsAgreeing ?? '28 of 28'} measured cells. Measured at ${drift.bracket.join(' and ')} days out; ${drift.daysRemaining} days remain.${drift.extrapolated ? ' This lead is outside the measured range — treat it as a direction.' : ''}`}
              >
                <span class="cmi__drift-arrow">↗</span>
                likely {(selectedPoint.value + drift.low).toFixed(2)}–
                {(selectedPoint.value + drift.high).toFixed(2)} by quarter end
              </span>
            )}
          </div>
          <div class="cmi__sub">
            {/* NEVER say "picture date" unless the server says this state's rule
                was actually read. A Texas building was once shown Ohio statute by
                name; `period.boundaryLabel` is what prevents a repeat. */}
            {period.boundaryLabel ?? 'Quarter end'} {selected?.pictureDate ?? '—'} · the payable score
            — residents Ohio pays you for
          </div>
          <div class="cmi__counts">
            <b>{selectedPoint?.scored ?? 0}</b> counted
            <span class="cmi__sep">·</span>
            <b>{selected?.residents ?? 0}</b> on census
          </div>
          {/* A census with nothing scoreable renders a bare "—", which reads as
              broken. It is not: the tab is gated on the STATE having a verified
              rule, not on the building having synced MDS data, so an Ohio
              building we have never synced lands here with residents and no
              records. Found on a real building (31 on census, 0 scoreable,
              `last_active_patients_sync` NULL). Say which it is. */}
          {selected?.residents > 0 && (selectedPoint?.scored ?? 0) === 0 && (
            <div class="cmi__nodata">
              No MDS records synced for this building yet — the census is here, the
              assessments are not, so there is nothing to score.
            </div>
          )}
          {/* Pendings as a fact about the number, not a rival to it. */}
          {selected?.pendingMedicaid > 0 && (
            <div class="cmi__pending">
              <b>{selected.pendingMedicaid}</b> Medicaid application
              {selected.pendingMedicaid === 1 ? '' : 's'} pending
              {/* Only when it rounds to something. "+0.00 if they clear" is a
                  number that says nothing — the count alone is the point. */}
              {pendingLift != null && Math.abs(pendingLift) >= 0.005 && (
                <>
                  {' '}
                  — worth {pendingLift > 0 ? '+' : ''}
                  {pendingLift.toFixed(2)} if they clear
                </>
              )}
            </div>
          )}
          {/* How close this lands against ODM's own report. The all-payer
              comparison lives in the hover because it is the EVIDENCE for this
              caveat, not a number anyone should have to toggle to. */}
          {recon && (
            <div class="cmi__recon" title={recon.detail}>
              {recon.chip}
            </div>
          )}
        </div>

        <div class="cmi__headline-right">
          <div class="cmi__quarters" role="group" aria-label="Quarter">
            {trend.points.map((p) => (
              <button
                key={p.quarter}
                type="button"
                class={`cmi__qpill${p.quarter === selected?.quarter ? ' cmi__qpill--active' : ''}`}
                onClick={() => pickQuarter(p.quarter)}
                data-track="case_mix_quarter_pill"
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            class="cmi__residents-btn"
            onClick={() => setDrillQuarter(selected?.quarter)}
            data-track="case_mix_residents_open"
          >
            This quarter&rsquo;s residents →
          </button>
        </div>
      </div>

      {/* ── the trend ────────────────────────────────────────────── */}
      <div class="cmi__trend">
        <div class="cmi__trend-head">
          <span class="cmi__trend-title">Quarterly CMI</span>
          <div class="cmi__trend-right">
            <span class={`cmi__trend-delta cmi__trend-delta--${trend.direction}`}>
              {trend.direction === 'flat' ? 'flat' : trend.direction === 'up' ? '▲' : '▼'}
              {trend.delta != null && trend.direction !== 'flat'
                ? Math.abs(trend.delta).toFixed(4)
                : ''}
            </span>
            <div class="cmi__toggle cmi__toggle--view" role="group" aria-label="Trend view">
              <button
                type="button"
                class={`cmi__toggle-btn${view === 'chart' ? ' cmi__toggle-btn--active' : ''}`}
                onClick={() => setView('chart')}
                data-track="case_mix_view_chart"
              >
                Chart
              </button>
              <button
                type="button"
                class={`cmi__toggle-btn${view === 'table' ? ' cmi__toggle-btn--active' : ''}`}
                onClick={() => setView('table')}
                data-track="case_mix_view_table"
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {view === 'chart' ? (
          <div class="cmi__chart">
            {/* The Y axis carries numbers, so the zoom caption below is concrete
                rather than a disclaimer you take on faith. */}
            <div class="cmi__plot">
              <div class="cmi__yaxis">
                {trend.ticks.map((t) => (
                  <span key={t} class="cmi__ytick" style={{ bottom: `${pct(t)}%` }}>
                    {t.toFixed(2)}
                  </span>
                ))}
              </div>
              <div class="cmi__grid">
                {trend.ticks.map((t) => (
                  <span key={t} class="cmi__gridline" style={{ bottom: `${pct(t)}%` }} />
                ))}
                {trend.avgFrac != null && (
                  <span
                    class="cmi__avgline"
                    style={{ bottom: `${trend.avgFrac * 100}%` }}
                    title="Average of the CLOSED quarters — the open one is partial and runs low, so it is left out"
                  >
                    <span class="cmi__avglabel">avg {trend.avg.toFixed(2)}</span>
                  </span>
                )}
                <div class="cmi__bars">
                  {trend.points.map((p) => (
                    <button
                      key={p.quarter}
                      type="button"
                      class={`cmi__col${p.quarter === selected?.quarter ? ' cmi__col--selected' : ''}`}
                      onClick={() => p.present && pickQuarter(p.quarter)}
                      title={
                        p.present
                          ? `${p.quarter}: ${p.value.toFixed(4)} · ${p.scored} counted`
                          : `${p.quarter}: nothing scoreable`
                      }
                      data-track="case_mix_quarter_bar"
                    >
                      <span class={`cmi__barval${p.present ? '' : ' cmi__barval--none'}`}>
                        {p.present ? p.value.toFixed(2) : '—'}
                      </span>
                      {p.present ? (
                        <span class="cmi__barwrap">
                          {p.driftFrac != null && (
                            <span
                              class="cmi__drift-cap"
                              style={{ height: `${(p.driftFrac - p.heightFrac) * 100}%` }}
                            />
                          )}
                          <span
                            class={`cmi__bar${p.inProgress ? ' cmi__bar--open' : ''}`}
                            style={{ height: `${Math.max(2, p.heightFrac * 100)}%` }}
                          />
                        </span>
                      ) : (
                        <span class="cmi__gap">—</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div class="cmi__xaxis">
              {trend.points.map((p) => (
                <span key={p.quarter} class="cmi__qlabel">
                  {p.label}
                </span>
              ))}
            </div>
            {/* THE AXIS IS TRUNCATED AND MUST SAY SO. A CMI moves inside a narrow
                band, so bars scaled from zero are indistinguishable — but then
                height is a comparison BETWEEN quarters, not a magnitude, and a
                chart that hides its floor is the oldest chart lie there is. */}
            <div class="cmi__axis-note">
              Axis is zoomed to {trend.baseline.toFixed(2)}–{trend.top.toFixed(2)}, not zero-based —
              differences read larger than they are.
              {drift && ' Dashed cap on the open quarter is measured drift, not a forecast.'}
            </div>
          </div>
        ) : (
          <table class="cmi__qtable">
            <thead>
              <tr>
                <th>Quarter</th>
                <th class="cmi__r">CMI</th>
                <th class="cmi__r">Change</th>
                <th class="cmi__r">Counted</th>
                <th class="cmi__r">Census</th>
                <th class="cmi__r">On an older record</th>
              </tr>
            </thead>
            <tbody>
              {trend.rows.map((r) => (
                <tr
                  key={r.quarter}
                  class={`cmi__qrow${r.present ? '' : ' cmi__qrow--empty'}${r.quarter === selected?.quarter ? ' cmi__qrow--selected' : ''}`}
                  onClick={() => r.present && pickQuarter(r.quarter)}
                  data-track="case_mix_quarter_row"
                >
                  <td>
                    {r.label}
                    {r.inProgress && <span class="cmi__chip cmi__chip--open">open</span>}
                  </td>
                  <td class="cmi__r cmi__qtable-strong">{r.present ? r.value.toFixed(4) : '—'}</td>
                  <td class="cmi__r">
                    {r.change != null && Math.abs(r.change) >= 0.0005 ? (
                      <span
                        class={`cmi__trend-delta cmi__trend-delta--${r.change > 0 ? 'up' : 'down'}`}
                      >
                        {r.change > 0 ? '▲' : '▼'}
                        {Math.abs(r.change).toFixed(4)}
                      </span>
                    ) : (
                      <span class="cmi__dot">·</span>
                    )}
                  </td>
                  <td class="cmi__r">{r.present ? r.scored : '—'}</td>
                  <td class="cmi__r cmi__dim">{r.residents || '—'}</td>
                  <td class="cmi__r cmi__dim">
                    {r.carryForward || <span class="cmi__dot">·</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── what the building is made of ─────────────────────────── */}
      {composition?.slices?.length > 0 && (
        <div class="cmi__mix">
          <div class="cmi__mix-head">
            <span class="cmi__trend-title">Clinical mix · {selectedPoint.label}</span>
            <span class="cmi__mix-total">{composition.total} residents</span>
          </div>
          {composition.slices.map((s) => (
            <div key={s.key}>
              <button
                type="button"
                class={`cmi__mix-row${openCategory === s.key ? ' cmi__mix-row--open' : ''}`}
                onClick={() => setOpenCategory(openCategory === s.key ? null : s.key)}
                data-track="case_mix_category_drill"
              >
                <span class="cmi__mix-chevron">{openCategory === s.key ? '⌄' : '›'}</span>
                <span class="cmi__mix-label">{s.label}</span>
                <span class="cmi__mix-n">{s.n}</span>
                <span class="cmi__mix-bar-track">
                  <span
                    class={`cmi__mix-bar cmi__mix-bar--${s.key.toLowerCase()}`}
                    style={{ width: `${Math.max(2, Math.round(s.share * 100))}%` }}
                  />
                </span>
                <span
                  class="cmi__mix-cmi"
                  title={
                    s.groups?.length
                      ? s.groups.map((g) => `${g.group} · ${g.count}`).join('\n')
                      : undefined
                  }
                >
                  {s.cmi != null ? s.cmi.toFixed(2) : '—'}
                </span>
              </button>
              {openCategory === s.key && (
                <CaseMixCategoryDrill
                  quarter={selected.quarter}
                  category={s.key}
                  label={s.label}
                  facilityName={facilityName}
                  orgSlug={orgSlug}
                  onOpenFullRoster={() => setDrillQuarter(selected.quarter)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── the work list ────────────────────────────────────────── */}
      {selected?.inProgress && selected.carryForward > 0 && (
        <button
          type="button"
          class="cmi__worklist"
          onClick={() => setDrillQuarter(selected.quarter)}
          data-track="case_mix_worklist_open"
        >
          <b>{selected.carryForward}</b> resident
          {selected.carryForward === 1 ? '' : 's'} have no {selectedPoint?.label} assessment yet —
          still scored off an older one
        </button>
      )}

      {selected?.needsReview > 0 && (
        <div class="cmi__review">
          <b>{selected.needsReview}</b> resident{selected.needsReview === 1 ? '' : 's'} have a payer we
          could not classify — scored neither way.
        </div>
      )}

      {drillQuarter && (
        <CaseMixRosterModal
          quarter={drillQuarter}
          facilityName={facilityName}
          orgSlug={orgSlug}
          onClose={() => setDrillQuarter(null)}
        />
      )}
    </div>
  );
}
