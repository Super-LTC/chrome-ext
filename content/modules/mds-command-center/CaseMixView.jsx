import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { buildCaseMixTrend } from './lib/case-mix-trend-view.js';
import { describeCaseMixPopulation } from './lib/case-mix-roster-filter.js';
import { CaseMixRosterModal } from './CaseMixRosterModal.jsx';

/** The three scores, mirroring the web surface. */
const MEASURES = [
  { key: 'medicaidCmi', label: 'Medicaid', hint: 'The payable score — residents the state counts', track: 'case_mix_measure_medicaid' },
  { key: 'allCmi', label: 'All residents', hint: 'Every resident on the census, regardless of payer', track: 'case_mix_measure_all' },
  { key: 'medicaidWithPendingCmi', label: '+ pendings', hint: 'Forecast — assumes every pending Medicaid application is approved', track: 'case_mix_measure_pending' },
];
const MEASURE_LABEL = {
  medicaidCmi: 'Medicaid CMI',
  allCmi: 'All-resident CMI',
  medicaidWithPendingCmi: 'Medicaid CMI + pendings',
};

/**
 * Case Mix tab — one building's Medicaid CMI, its trend, its clinical mix, and
 * the residents behind it.
 *
 * ── THE TWO POPULATIONS ARE A TOGGLE, NOT A CHOICE WE MAKE FOR THEM ───────
 *
 * Two people at the same customer read the same building differently and neither
 * number answers the other's question:
 *
 *   Payable  the record IN EFFECT on the picture date — what ODM publishes and
 *            what sets the rate.
 *   Capture  only residents ASSESSED inside the quarter. The payable score
 *            cannot answer this: carried-forward records make a quarter with
 *            ZERO new assessments look identical to a quarter of diligent work.
 *
 * Capture leads here because the extension is a coding surface — whoever is
 * looking has a chart open — but both ship, because picking one makes the tab
 * useless to whichever of them did not get picked.
 *
 * Both words are OURS, not the customer's, so `describeCaseMixPopulation` spells
 * the active one out in a sentence under the number. That line is not decoration:
 * the first question asked of this tab was what the two words mean.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * No override editing. The web surface lets an org admin overrule a projected
 * group; that needs a write route, permission plumbing and supersession UI, and
 * none of it belongs on a read-while-you-code surface.
 *
 * No portfolio. This is ONE building — the one whose PCC page you are on.
 *
 * NO ROLLED-UP PROJECTED CMI, AND THAT IS A MEASUREMENT, NOT AN OMISSION. The
 * obvious way to make an open quarter look less alarming is to average the
 * per-resident projections into a forecast. That was measured end-to-end on
 * 10,654 transitions and it is WORSE than doing nothing:
 *
 *     carry-forward    MAE 0.0257   bias +0.0184
 *     projection mean  MAE 0.0395   bias −0.0235
 *
 * The model only ever drops a group, because the biggest real source of gains is
 * residents with no qualifying condition acquiring one — evidence that is not in
 * today's record. So the honest answer to "the open quarter looks scary" is the
 * drift band: carry-forward understated the settled score in 28 of 28 backtested
 * cells, so the live number is a FLOOR and we say by how much. See
 * `case-mix-open-quarter-drift.ts`.
 *
 * OHIO ONLY, FOR NOW, AND ON PURPOSE. The long-term plan is a universal CMI —
 * the nursing classifier is federal PDPM and every state's regional wants their
 * number. What is NOT universal is the measurement period, and Ohio's is the only
 * one we have actually read from the rate-setting rule and reconciled against the
 * state's own report (ODM Preliminary II, 168 residents, zero group mismatches).
 * TX / WI / GA / NY are case-mix with UNCONFIRMED periods; rendering a confident
 * number computed the wrong way is worse than rendering nothing. The gate lives
 * server-side in CASE_MIX_QUARTERLY_SUPPORTED_STATES — one array, and each state
 * joins it after its rule is read, not before.
 */
export function CaseMixView({ data, facilityName, orgSlug, onRetry }) {
  /** 'capture' leads; 'payable' is the money. See the docblock. */
  const [population, setPopulation] = useState('capture');
  /** Which score, mirroring the web surface's three. */
  const [measure, setMeasure] = useState('medicaidCmi');
  /** Bars read shape; the table reads values and is where drilling is obvious. */
  const [view, setView] = useState('chart');
  const [drillQuarter, setDrillQuarter] = useState(null);

  const rows = (population === 'payable' ? data?.payable : data?.capture) ?? [];
  const trend = useMemo(() => buildCaseMixTrend(rows, { metric: measure }), [rows, measure]);
  const latest = rows[rows.length - 1] ?? null;
  const latestPoint = trend.points[trend.points.length - 1] ?? null;
  const recon =
    population === 'payable'
      ? measure === 'allCmi'
        ? data?.reconciliation?.total
        : data?.reconciliation?.medicaid
      : null;
  const period = data?.period ?? {};

  // CARRY-FORWARD COMES FROM `payable`, ALWAYS — never from the active toggle.
  // Capture only contains residents assessed INSIDE the quarter, so by
  // construction none of them are riding an older record and its carryForward is
  // structurally 0 for every building (verified across six Ohio facilities).
  // Reading it from the active population meant the work list — the single most
  // actionable thing here — silently never rendered on the DEFAULT view.
  const payableLatest = data?.payable?.[data.payable.length - 1] ?? null;

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

  const openDrift = latestPoint?.drift ?? null;

  return (
    <div class="cmi">
      {/* ── the number ───────────────────────────────────────────── */}
      <div class="cmi__headline">
        <div class="cmi__headline-main">
          <div class="cmi__eyebrow">
            {MEASURE_LABEL[measure]} · {population === 'payable' ? 'payable' : 'captured'}
            {latest?.inProgress && <span class="cmi__chip cmi__chip--open">open</span>}
          </div>
          <div class="cmi__value-row">
            <span class="cmi__value">
              {latestPoint?.value != null ? latestPoint.value.toFixed(4) : '—'}
            </span>
            {/* The measured floor, stated as a range and never as a point. */}
            {openDrift && latestPoint?.value != null && (
              <span
                class="cmi__drift"
                title={`Backtested on ${data?.driftProvenance?.population ?? '17 Ohio buildings'}: carry-forward understated the settled score in ${data?.driftProvenance?.cellsAgreeing ?? '28 of 28'} measured cells. Measured at ${openDrift.bracket.join(' and ')} days out; ${openDrift.daysRemaining} days remain.${openDrift.extrapolated ? ' This lead is outside the measured range — treat it as a direction.' : ''}`}
              >
                <span class="cmi__drift-arrow">↗</span>
                likely {(latestPoint.value + openDrift.low).toFixed(2)}–
                {(latestPoint.value + openDrift.high).toFixed(2)} by quarter end
              </span>
            )}
          </div>
          <div class="cmi__sub">
            {/* NEVER say "picture date" unless the server says the period rule was
                actually read for this state. A Texas building was once shown Ohio
                statute by name; `period.boundaryLabel` is what prevents a repeat. */}
            {period.boundaryLabel ?? 'Quarter end'} {latest?.pictureDate ?? '—'}
            {' · '}
            {/* The denominator follows the MEASURE — all-payer counts everyone
                scoreable, the Medicaid measures only the payable set. Quoting
                the wrong one makes a building look like it lost thirty
                residents on a toggle. */}
            <b>{latestPoint?.scored ?? 0}</b> counted of <b>{latest?.residents ?? 0}</b> on census
            {measure === 'medicaidWithPendingCmi' && latest?.pendingMedicaid > 0 && (
              <span> · assumes {latest.pendingMedicaid} pending approve</span>
            )}
          </div>
          {/* Spelled out, not hovered. "Capture" and "Payable" are our words. */}
          <div class="cmi__explain">
            {describeCaseMixPopulation(population, measure, {
              boundaryLabel: period.boundaryLabel,
            })}
          </div>
          {/* How close this actually lands against ODM's own report. Only Ohio has
              been reconciled at all, and the two scores are NOT equally good —
              all-payer reconciles, Medicaid runs about 0.03 high. */}
          {recon && (
            <div class="cmi__recon" title={recon.detail}>
              {recon.chip}
            </div>
          )}
        </div>

        <div class="cmi__toggle-stack">
          <div class="cmi__toggle" role="group" aria-label="Population">
            <button
              type="button"
              class={`cmi__toggle-btn${population === 'capture' ? ' cmi__toggle-btn--active' : ''}`}
              onClick={() => setPopulation('capture')}
              title="Only residents assessed inside the quarter — what has actually been coded"
              data-track="case_mix_population_capture"
            >
              Capture
            </button>
            <button
              type="button"
              class={`cmi__toggle-btn${population === 'payable' ? ' cmi__toggle-btn--active' : ''}`}
              onClick={() => setPopulation('payable')}
              title="The record in effect on the picture date — what the state pays on"
              data-track="case_mix_population_payable"
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
                title={m.hint}
                data-track={m.track}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── the trend ────────────────────────────────────────────── */}
      <div class="cmi__trend">
        <div class="cmi__trend-head">
          <span class="cmi__trend-title">{rows.length}-quarter trend</span>
          <div class="cmi__trend-right">
            <span class={`cmi__trend-delta cmi__trend-delta--${trend.direction}`}>
              {trend.direction === 'flat' ? 'flat' : trend.direction === 'up' ? '▲' : '▼'}
              {trend.delta != null && trend.direction !== 'flat' ? Math.abs(trend.delta).toFixed(4) : ''}
            </span>
            <div class="cmi__toggle cmi__toggle--view" role="group" aria-label="Trend view">
              <button
                type="button"
                class={`cmi__toggle-btn${view === 'chart' ? ' cmi__toggle-btn--active' : ''}`}
                onClick={() => setView('chart')}
                title="Bars — shape at a glance"
                data-track="case_mix_view_chart"
              >
                Chart
              </button>
              <button
                type="button"
                class={`cmi__toggle-btn${view === 'table' ? ' cmi__toggle-btn--active' : ''}`}
                onClick={() => setView('table')}
                title="Every quarter's numbers, newest first"
                data-track="case_mix_view_table"
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {view === 'chart' ? (
          <div class="cmi__chart">
            <div class="cmi__bars">
              {trend.points.map((p) => (
                <div key={p.quarter} class="cmi__col">
                  {/* The value, always. A bar you have to hover to read is a bar
                      that gets read wrong. */}
                  <span class={`cmi__barval${p.present ? '' : ' cmi__barval--none'}`}>
                    {p.present ? p.value.toFixed(2) : '—'}
                  </span>
                  <button
                    type="button"
                    class="cmi__track"
                    title={
                      p.present
                        ? `${p.quarter}: ${p.value.toFixed(4)} · ${p.scored} scored${p.carryForward ? ` · ${p.carryForward} on an earlier record` : ''} — click for residents`
                        : `${p.quarter}: nothing scoreable`
                    }
                    onClick={() => p.present && setDrillQuarter(p.quarter)}
                    data-track="case_mix_quarter_drill"
                  >
                    {p.present ? (
                      <div class="cmi__stack">
                        {/* Drift is drawn as a hollow cap ABOVE the solid bar, so
                            it can never be mistaken for measured height. */}
                        {p.driftFrac != null && (
                          <div
                            class="cmi__drift-cap"
                            style={{
                              height: `${Math.round((p.driftFrac - p.heightFrac) * 44)}px`,
                            }}
                          />
                        )}
                        <div
                          class={`cmi__bar${p.inProgress ? ' cmi__bar--open' : ''}`}
                          style={{ height: `${Math.max(3, Math.round(p.heightFrac * 44))}px` }}
                        />
                      </div>
                    ) : (
                      <span class="cmi__gap">—</span>
                    )}
                  </button>
                  <span class="cmi__qlabel">{p.label}</span>
                </div>
              ))}
            </div>
            {/* THE AXIS IS TRUNCATED AND MUST SAY SO. A CMI moves inside a narrow band
                (a real building runs 1.35–1.48), so bars scaled from zero are
                indistinguishable. Scaled to the visible range they read — but then bar
                height is a comparison BETWEEN quarters, not a magnitude, and a chart
                that hides its floor is the oldest chart lie there is. */}
            <div class="cmi__axis-note">
              bars scaled {trend.baseline.toFixed(2)}–{trend.top.toFixed(2)}, not from zero
              {openDrift && <span> · hollow cap = measured drift, not a forecast</span>}
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
                <th class="cmi__r">On earlier record</th>
              </tr>
            </thead>
            <tbody>
              {trend.rows.map((r) => (
                <tr
                  key={r.quarter}
                  class={`cmi__qrow${r.present ? '' : ' cmi__qrow--empty'}`}
                  onClick={() => r.present && setDrillQuarter(r.quarter)}
                  title={r.present ? 'Click for this quarter’s residents' : 'Nothing scoreable this quarter'}
                  data-track="case_mix_quarter_drill_row"
                >
                  <td>
                    {r.label}
                    {r.inProgress && <span class="cmi__chip cmi__chip--open">open</span>}
                  </td>
                  <td class="cmi__r cmi__qtable-strong">
                    {r.present ? r.value.toFixed(4) : '—'}
                  </td>
                  <td class="cmi__r">
                    {r.change != null && Math.abs(r.change) >= 0.0005 ? (
                      <span class={`cmi__trend-delta cmi__trend-delta--${r.change > 0 ? 'up' : 'down'}`}>
                        {r.change > 0 ? '▲' : '▼'}
                        {Math.abs(r.change).toFixed(4)}
                      </span>
                    ) : (
                      <span class="cmi__dot">·</span>
                    )}
                  </td>
                  <td class="cmi__r">{r.present ? r.scored : '—'}</td>
                  <td class="cmi__r cmi__dim">{r.residents || '—'}</td>
                  <td class="cmi__r cmi__dim">{r.carryForward || <span class="cmi__dot">·</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div class="cmi__hint">Click any quarter to see the residents behind it.</div>
      </div>

      {/* ── what the building is made of ─────────────────────────── */}
      {latestPoint?.composition?.slices?.length > 0 && (
        <div class="cmi__mix">
          <div class="cmi__mix-head">
            <span class="cmi__trend-title">Clinical mix · {latestPoint.label}</span>
            {/* The fold's own total, which is that measure's denominator by
                construction. Printed so it can be checked against the headline. */}
            <span class="cmi__mix-total">{latestPoint.composition.total} residents</span>
          </div>
          {latestPoint.composition.slices.map((s) => (
            <div key={s.key} class="cmi__mix-row">
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
            </div>
          ))}
        </div>
      )}

      {/* ── the work list ────────────────────────────────────────── */}
      {payableLatest?.inProgress && payableLatest.carryForward > 0 && (
        <button
          type="button"
          class="cmi__worklist"
          onClick={() => setDrillQuarter(payableLatest.quarter)}
          data-track="case_mix_worklist_open"
        >
          <b>{payableLatest.carryForward}</b> resident
          {payableLatest.carryForward === 1 ? '' : 's'} still scored on an earlier record this quarter
        </button>
      )}

      {latest?.needsReview > 0 && (
        <div class="cmi__review">
          <b>{latest.needsReview}</b> resident{latest.needsReview === 1 ? '' : 's'} have a payer we could
          not classify — scored neither way.
        </div>
      )}

      {drillQuarter && (
        <CaseMixRosterModal
          quarter={drillQuarter}
          facilityName={facilityName}
          orgSlug={orgSlug}
          boundaryLabel={period.boundaryLabel}
          initialPopulation={population}
          initialMeasure={measure}
          onClose={() => setDrillQuarter(null)}
        />
      )}
    </div>
  );
}
