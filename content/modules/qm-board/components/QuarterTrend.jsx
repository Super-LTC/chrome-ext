/**
 * QM 4-quarter trend — a compact mini bar-chart of one measure's windowed rate
 * across the trailing 4 quarters (oldest→newest), with the CMS denominator-
 * weighted rolling rate as a reference badge and a goodness-colored delta arrow.
 *
 * Ported from qm-quarter-trend.reference.tsx, adapted to Preact + `qmtrend-` CSS.
 * Pure presentational. Consumes the `QuarterTrend` view-model
 * (qm-quarter-trend-view.js) — no fetch, no business logic. The view-model
 * reports a RAW direction (last vs first rate); THIS component decides good/bad
 * with `higherIsBetter`: a beneficial move (down for the usual lower-is-better
 * QMs) is emerald, the wrong way is rose, flat is slate.
 */
import { ratePct } from '../lib/qm-view-model.js';
import { ArrowUp, ArrowDown, Minus, ChevronDown, ChevronRight } from './icons.jsx';

/** "2025Q3" → "Q3" (the bar label); falls back to the raw label if unparseable. */
function shortQuarter(label) {
  const m = label.match(/Q[1-4]$/);
  return m ? m[0] : label;
}

/** Goodness tone for a raw direction given the measure's polarity. */
function goodnessTone(direction, higherIsBetter) {
  if (direction === 'flat') return 'slate';
  const improving = higherIsBetter ? direction === 'up' : direction === 'down';
  return improving ? 'emerald' : 'rose';
}

/**
 * Compact, collapsed-by-default trend trigger: the most-recent-quarter change vs
 * the prior quarter ("up/down from last quarter") as a goodness-colored arrow +
 * delta. Click to expand the full 4-bar chart. Keeps the measure header quiet.
 */
export function QuarterTrendChip({ trend, higherIsBetter, expanded, onToggle }) {
  const present = trend.points.filter((p) => p.present);
  const last = present[present.length - 1];
  const prior = present[present.length - 2];
  const qoq = last && prior ? last.rate - prior.rate : null;
  const direction = qoq == null || qoq === 0 ? 'flat' : qoq > 0 ? 'up' : 'down';
  const tone = goodnessTone(direction, higherIsBetter);
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const Chev = expanded ? ChevronDown : ChevronRight;
  return (
    <button type="button" className="qmtrend-chip" onClick={onToggle} aria-expanded={expanded}> {/* NO_TRACK */}
      <span className="qmtrend-chip__label">4Q trend</span>
      <span className={`qmtrend-chip__delta qmc-text--${tone}`}>
        <Icon className="qmtrend-chip__icon" />
        {qoq == null ? '—' : direction === 'flat' ? 'flat' : `${(Math.abs(qoq) * 100).toFixed(1)}%`}
      </span>
      {prior && <span className="qmtrend-chip__vs">vs {shortQuarter(prior.label)}</span>}
      <Chev className="qmtrend-chip__chev" />
    </button>
  );
}

export function QuarterTrend({ trend, higherIsBetter, label }) {
  const { points, weightedRate, firstRate, lastRate, direction } = trend;
  // Normalize bar heights to the tallest present rate (so a 0.4 quarter fills the
  // track and the rest scale against it). All-zero → flat baseline.
  const maxRate = Math.max(0, ...points.filter((p) => p.present).map((p) => p.rate));

  // Goodness: beneficial move (down when lower-is-better, up when higher-is-
  // better) is emerald; wrong way is rose; flat is slate. The arrow tracks the
  // RAW direction; only the COLOR encodes good/bad.
  const isImproving = direction !== 'flat' && (higherIsBetter ? direction === 'up' : direction === 'down');
  const isWorsening = direction !== 'flat' && (higherIsBetter ? direction === 'down' : direction === 'up');
  const tone = isImproving ? 'emerald' : isWorsening ? 'rose' : 'slate';
  const DeltaIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const deltaPct = firstRate != null && lastRate != null ? Math.abs(lastRate - firstRate) * 100 : 0;

  return (
    <div className="qmtrend">
      <div className="qmtrend__head">
        <span className="qmtrend__title">{label ? `${label} · ` : ''}4-quarter trend</span>
        <span className="qmtrend__stats">
          <span className="qmtrend__weighted"><span className="qmtrend__weighted-lbl">4Q&nbsp;</span>{(weightedRate * 100).toFixed(1)}%</span>
          <span className={`qmtrend__delta qmc-text--${tone}`}>
            <DeltaIcon className="qmtrend__delta-icon" />
            {direction === 'flat' ? 'flat' : `${deltaPct.toFixed(1)}%`}
          </span>
        </span>
      </div>

      <div className="qmtrend__bars">
        {points.map((p, i) => {
          const pctLabel = ratePct(p.num, p.den).toFixed(1);
          const heightFrac = maxRate > 0 && p.present ? p.rate / maxRate : 0;
          const heightPx = p.present ? Math.max(3, Math.round(heightFrac * 36)) : 0;
          return (
            <div key={`${p.label}-${i}`} className="qmtrend__col">
              <div className="qmtrend__track" title={p.present ? `${p.label}: ${pctLabel}% (${p.num}/${p.den})` : `${p.label}: no applicable denominator`}>
                {p.present
                  ? <div className={`qmtrend__bar qmtrend__bar--${tone}`} style={{ height: `${heightPx}px` }} />
                  : <span className="qmtrend__gap">—</span>}
              </div>
              <span className="qmtrend__qlabel">{shortQuarter(p.label)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
