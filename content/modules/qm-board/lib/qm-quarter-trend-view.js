/**
 * QM quarter-trend view-model — pure reshape of the rolling /qm-planner/rolling
 * response into a single measure's 4-quarter rate history for the mini-trend
 * chart.
 *
 * The rolling engine already did all the counting (denominator-weighted
 * Σnum/Σden across the trailing 4 quarters, oldest-first). This module pulls ONE
 * measure's per-quarter {num,den,rate} out of `quarters[i].rates` and surfaces
 * the rolling weighted rate + a RAW last-vs-first direction. It does NOT decide
 * whether "up" is good or bad — the COMPONENT applies `higherIsBetter` for the
 * goodness coloring.
 *
 * Ported verbatim from core/services/qm-planner/qm-quarter-trend-view.ts; TS
 * types stripped. PURE — no Preact, no fetch, no Date.
 *
 * @typedef {import('./quarter-rates-view.js').QmRollingView} QmRollingView
 *
 * @typedef {Object} QuarterTrendPoint
 * @property {string} label
 * @property {number} rate
 * @property {number} num
 * @property {number} den
 * @property {boolean} present
 *
 * @typedef {Object} QuarterTrend
 * @property {QuarterTrendPoint[]} points  oldest→newest
 * @property {number} weightedRate
 * @property {number|null} firstRate
 * @property {number|null} lastRate
 * @property {'up'|'down'|'flat'} direction
 */

/**
 * Build the 4-quarter trend for one measure from the rolling response.
 *
 * @param {QmRollingView} rolling
 * @param {string} measureId
 * @returns {QuarterTrend}
 */
export function quarterTrendForMeasure(rolling, measureId) {
  const points = rolling.quarters.map((q) => {
    const cell = q.rates.find((r) => r.measureId === measureId);
    const present = !!cell && cell.denominator > 0;
    return {
      label: q.label,
      rate: present ? cell.rate : 0,
      num: cell?.numerator ?? 0,
      den: cell?.denominator ?? 0,
      present,
    };
  });

  const presentPoints = points.filter((p) => p.present);
  const firstRate = presentPoints.length ? presentPoints[0].rate : null;
  const lastRate = presentPoints.length
    ? presentPoints[presentPoints.length - 1].rate
    : null;

  let direction = 'flat';
  if (firstRate != null && lastRate != null) {
    if (lastRate > firstRate) direction = 'up';
    else if (lastRate < firstRate) direction = 'down';
  }

  const roll = rolling.rolling.find((r) => r.measureId === measureId);

  return {
    points,
    weightedRate: roll?.weightedRate ?? 0,
    firstRate,
    lastRate,
    direction,
  };
}
