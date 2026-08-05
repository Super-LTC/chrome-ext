import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { buildCaseMixTrend } from './lib/case-mix-trend-view.js';
import { CaseMixRosterModal } from './CaseMixRosterModal.jsx';

/**
 * Case Mix tab — one building's Medicaid CMI, its trend, and the residents behind it.
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
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * No override editing. The web surface lets an org admin overrule a projected
 * group; that needs a write route, permission plumbing and supersession UI, and
 * none of it belongs on a read-while-you-code surface.
 *
 * No portfolio. This is ONE building — the one whose PCC page you are on.
 */
export function CaseMixView({ data, facilityName, orgSlug, onRetry }) {
  /** 'capture' leads; 'payable' is the money. See the docblock. */
  const [population, setPopulation] = useState('capture');
  const [drillQuarter, setDrillQuarter] = useState(null);

  const rows = (population === 'payable' ? data?.payable : data?.capture) ?? [];
  const trend = useMemo(() => buildCaseMixTrend(rows), [rows]);
  const latest = rows[rows.length - 1] ?? null;
  const recon = population === 'payable' ? data?.reconciliation?.medicaid : null;
  const period = data?.period ?? {};

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

  return (
    <div class="cmi">
      {/* ── the number ───────────────────────────────────────────── */}
      <div class="cmi__headline">
        <div class="cmi__headline-main">
          <div class="cmi__eyebrow">
            {population === 'payable' ? 'Payable Medicaid CMI' : 'Captured this quarter'}
            {latest?.inProgress && <span class="cmi__chip cmi__chip--open">open</span>}
          </div>
          <div class="cmi__value">
            {latest?.medicaidCmi != null ? latest.medicaidCmi.toFixed(4) : '—'}
          </div>
          <div class="cmi__sub">
            {/* NEVER say "picture date" unless the server says the period rule was
                actually read for this state. A Texas building was once shown Ohio
                statute by name; `period.boundaryLabel` is what prevents a repeat. */}
            {period.boundaryLabel ?? 'Quarter end'} {latest?.pictureDate ?? '—'}
            {' · '}
            <b>{latest?.medicaidScored ?? 0}</b> counted of <b>{latest?.residents ?? 0}</b> on census
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
      </div>

      {/* ── the trend ────────────────────────────────────────────── */}
      <div class="cmi__trend">
        <div class="cmi__trend-head">
          <span class="cmi__trend-title">{rows.length}-quarter trend</span>
          <span class={`cmi__trend-delta cmi__trend-delta--${trend.direction}`}>
            {trend.direction === 'flat' ? 'flat' : trend.direction === 'up' ? '▲' : '▼'}
            {trend.delta != null && trend.direction !== 'flat' ? Math.abs(trend.delta).toFixed(4) : ''}
          </span>
        </div>
        <div class="cmi__bars">
          {trend.points.map((p) => (
            <div key={p.quarter} class="cmi__col">
              <button
                type="button"
                class="cmi__track"
                title={
                  p.present
                    ? `${p.quarter}: ${p.value.toFixed(4)} · ${p.scored} scored${p.carryForward ? ` · ${p.carryForward} on an earlier record` : ''}`
                    : `${p.quarter}: nothing scoreable`
                }
                onClick={() => p.present && setDrillQuarter(p.quarter)}
                data-track="case_mix_quarter_drill"
              >
                {p.present ? (
                  <div
                    class={`cmi__bar${p.inProgress ? ' cmi__bar--open' : ''}`}
                    style={{ height: `${Math.max(3, Math.round(p.heightFrac * 44))}px` }}
                  />
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
        </div>
      </div>

      {/* ── the work list ────────────────────────────────────────── */}
      {latest?.inProgress && latest.carryForward > 0 && (
        <button
          type="button"
          class="cmi__worklist"
          onClick={() => setDrillQuarter(latest.quarter)}
          data-track="case_mix_worklist_open"
        >
          <b>{latest.carryForward}</b> resident{latest.carryForward === 1 ? '' : 's'} still scored on an
          earlier record this quarter
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
          onClose={() => setDrillQuarter(null)}
        />
      )}
    </div>
  );
}
