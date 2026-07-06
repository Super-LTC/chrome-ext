/**
 * Florida QIP percentile-band scorer — ported VERBATIM from the server
 * (core/services/qm-planner/qip/fl-qip-scorer.ts). Kept byte-for-byte in parity
 * so the extension can recompute band points client-side for the measure what-if
 * without a round-trip. The FL QIP payload is the oracle: for every measure,
 * `scoreFlQipMeasure(rate)` reproduces the payload's `projectedPoints` from its
 * `projectedRate` — see __tests__/fl-qip-scorer.test.js.
 *
 * Outcome measures score lower-is-better; influenza is higher-is-better. Points:
 * best band = 3, middle = 2, entry = 1; below entry = 0, UNLESS ≥20% YoY
 * improvement → 0.5. THRESHOLDS ARE FROZEN SFY2028 VALUES — if the server table
 * changes at rebasing, update this one too.
 */

/** Frozen FL QIP thresholds (best→entry) + direction. Mirror of FL_QIP_THRESHOLDS. */
export const FL_QIP_THRESHOLDS = {
  antipsychotic_long: { t3: 2.36, t2: 4.68, t1: 8.27, direction: 'lower_better' },
  antianxiety_hypnotic_rate: { t3: 12.03, t2: 16.06, t1: 20.7, direction: 'lower_better' },
  uti: { t3: 0.0, t2: 0.12, t1: 0.72, direction: 'lower_better' },
  pressure_ulcer_long: { t3: 2.46, t2: 3.71, t1: 5.37, direction: 'lower_better' },
  falls_major_injury: { t3: 0.59, t2: 1.3, t1: 2.41, direction: 'lower_better' },
  adl_decline: { t3: 4.66, t2: 7.09, t1: 10.85, direction: 'lower_better' },
  bb_new_worsened: { t3: 4.21, t2: 8.0, t1: 14.74, direction: 'lower_better' },
  physical_restraints: { t3: 0.0, t2: 0.0, t1: 0.0, direction: 'lower_better' },
  influenza_vaccine: { t3: 100.0, t2: 100.0, t1: 100.0, direction: 'higher_better' },
};

export const FL_QIP_IMPROVEMENT_PCT = 20;
export const FL_QIP_IMPROVEMENT_POINTS = 0.5;

const meets = (rate, t, dir) => (dir === 'lower_better' ? rate <= t : rate >= t);

/**
 * Core band scorer. 3/2/1 by band, plus 0.5 for ≥20% YoY improvement below entry.
 * @returns {{ points: number, band: '90th'|'75th'|'50th'|'improvement'|'below', fromImprovement: boolean }}
 */
export function scoreFlQipBand(rate, spec, yoyImprovementPct = null) {
  if (meets(rate, spec.t3, spec.direction)) return { points: 3, band: '90th', fromImprovement: false };
  if (meets(rate, spec.t2, spec.direction)) return { points: 2, band: '75th', fromImprovement: false };
  if (meets(rate, spec.t1, spec.direction)) return { points: 1, band: '50th', fromImprovement: false };
  if (yoyImprovementPct != null && yoyImprovementPct >= FL_QIP_IMPROVEMENT_PCT) {
    return { points: FL_QIP_IMPROVEMENT_POINTS, band: 'improvement', fromImprovement: true };
  }
  return { points: 0, band: 'below', fromImprovement: false };
}

/** Score one FL measure from its YTD rate (percent) + optional YoY improvement. */
export function scoreFlQipMeasure(measureId, rate, yoyImprovementPct = null) {
  const th = FL_QIP_THRESHOLDS[measureId];
  if (!th) return null; // not FL-scored
  const b = scoreFlQipBand(rate, th, yoyImprovementPct);
  return { measureId, rate, points: b.points, band: b.band, fromImprovement: b.fromImprovement };
}

/** Human-readable band label for the UI. */
export function flQipBandLabel(band) {
  return { '90th': '90th+ pctile', '75th': '75th pctile', '50th': '50th pctile', improvement: '≥20% improved', below: 'below entry band' }[band] ?? band;
}

/**
 * Direction-aware YoY improvement % (positive = better) from a rate + prior-year
 * rate — matches the server's `improvementPct` definition so the 0.5 rule holds
 * as the what-if lowers the rate.
 */
export function flQipImprovementPct(rate, priorYearRate, direction) {
  if (priorYearRate == null || priorYearRate <= 0) return null;
  return direction === 'higher_better'
    ? ((rate - priorYearRate) / priorYearRate) * 100
    : ((priorYearRate - rate) / priorYearRate) * 100;
}
