/**
 * Pure five-star predictor — anchor + live-MDS delta.
 *
 * We can't reconstruct the CMS QM star bottom-up: the claims measures, DFS, and
 * short-stay pressure-ulcer inputs aren't cleanly published as five-star inputs.
 * So we ANCHOR on CMS's published star (taken at its band midpoint) and shift it
 * by the points delta of only the MDS measures we compute live:
 *
 *     delta = pointsForRate(rateNow) − pointsForRate(rateAtAnchor)
 *
 * Because both points come from OUR observed rate, the risk-adjustment offset
 * (the gap between our observed rate and CMS's adjusted rate) cancels in the
 * subtraction — so the predicted shift stays honest even for risk-adjusted
 * measures. Claims + measures we can't compute stay frozen (Δ=0). The shifted
 * points are mapped back to a star band.
 *
 * Ported verbatim from the web app (core/services/qm-planner/five-star-predictor.ts);
 * TS types stripped for the JS bundle. The card + simulator re-run predictStars
 * on the client for the what-if (same pattern as the measure-detail what-if).
 */
import {
  fiveStarMeasure,
  pointsForRate,
  starsForScore,
  SHORT_STAY_SCALE,
  QM_RATING_THRESHOLDS,
} from './five-star-scoring.js';

/**
 * Where a score sits relative to the star bands — for "N pts from the next star".
 * Returns { star, pointsToNext (null at 5★), nextStar }.
 */
export function starProgress(axis, score) {
  const bands = QM_RATING_THRESHOLDS[axis];
  const star = starsForScore(axis, score);
  const next = bands.find((b) => b.stars === star + 1);
  return {
    star,
    nextStar: next ? next.stars : null,
    pointsToNext: next ? Math.max(0, Math.ceil(next.min - score)) : null,
  };
}

function bandMidpoint(axis, star) {
  const b = QM_RATING_THRESHOLDS[axis].find((x) => x.stars === star);
  return b ? (b.min + b.max) / 2 : 0;
}

/**
 * The MDS QM measurement window the published star reflects, derived from CMS's
 * `processing_date`. CMS's five-star MDS measures are a four-quarter average that
 * lags the refresh by ~2 quarters, so we step back `lagQuarters` from the
 * processing date and snap to that quarter's end — the `asOf` we replay OUR rate
 * at so the delta (our-now − our-then) is apples-to-apples. Pure: takes the date
 * in, never reads the clock.
 */
export const CMS_MDS_LAG_QUARTERS = 2;
export function cmsWindowEndFor(processingDate, lagQuarters = CMS_MDS_LAG_QUARTERS) {
  const d = new Date(`${processingDate.slice(0, 10)}T00:00:00Z`);
  let year = d.getUTCFullYear();
  let q = Math.floor(d.getUTCMonth() / 3) - lagQuarters; // 0..3 quarter index, stepped back
  while (q < 0) {
    q += 4;
    year -= 1;
  }
  const lastMonth = [3, 6, 9, 12][q]; // Mar, Jun, Sep, Dec (1-indexed)
  const lastDay = [31, 30, 30, 31][q];
  return `${year}-${String(lastMonth).padStart(2, '0')}-${lastDay}`;
}

/** Sum of per-measure point deltas for one stay (skips claims + non-five-star ids). */
function stayPointsDelta(pairs, stay) {
  let d = 0;
  for (const p of pairs) {
    const spec = fiveStarMeasure(p.id);
    if (!spec || spec.claimsBased || spec.stay !== stay) continue;
    d += pointsForRate(spec, p.rateNow) - pointsForRate(spec, p.rateAtAnchor);
  }
  return d;
}

function mk(axis, star, delta) {
  if (star == null) {
    return { axis, anchorStar: null, predictedStar: null, trend: 'unknown', pointsDelta: delta, score: null };
  }
  const score = bandMidpoint(axis, star) + delta;
  const predicted = starsForScore(axis, score);
  return {
    axis,
    anchorStar: star,
    predictedStar: predicted,
    trend: predicted > star ? 'up' : predicted < star ? 'down' : 'flat',
    pointsDelta: delta,
    score,
  };
}

/**
 * Predict the long-stay, short-stay, and overall QM stars from the published
 * anchor and the live-MDS rate pairs. The overall axis is anchored on the
 * published `qm_rating` and shifted by both stays' deltas.
 *
 * anchor = { qm, ls, ss, overall } (each star 1..5 or null);
 * pairs  = [{ id, rateNow, rateAtAnchor }] (proportions 0..1).
 */
export function predictStars(anchor, pairs) {
  const lsDelta = stayPointsDelta(pairs, 'long');
  const ssDeltaScaled = stayPointsDelta(pairs, 'short') * SHORT_STAY_SCALE;
  return {
    ls: mk('long', anchor.ls, lsDelta),
    ss: mk('short', anchor.ss, ssDeltaScaled),
    overall: mk('overall', anchor.qm, lsDelta + ssDeltaScaled),
  };
}
