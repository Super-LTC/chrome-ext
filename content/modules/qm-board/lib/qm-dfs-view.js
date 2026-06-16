/**
 * Derived numbers for the DFS grid tile. DFS is informational + higher-is-better,
 * so the tile leads with the rate and benchmarks it against the national average
 * (NOT a triggering count like the other tiles).
 *
 * Ported verbatim from qm-handoff/qm-dfs-view.ts (types stripped).
 *
 * @typedef {Object} DfsTileStats
 * @property {number|null} ratePct      Live rolling-12mo rate as a percent, 1 decimal (null when no discharges yet).
 * @property {number|null} vsNationalPts Points above (+) / below (−) the national avg (null when uncomparable).
 * @property {number} discharges        Discharge volume the rate is based on (live denominator).
 * @property {'good'|'bad'|'neutral'} tone good = at/above national, bad = below, neutral = can't compare.
 */

/**
 * @param {object} dfs QmFacilityDfsResponse
 * @returns {DfsTileStats}
 */
export function dfsTileStats(dfs) {
  const rate = dfs.live?.rate ?? null;
  const national = dfs.nationalRate ?? null;
  const discharges = dfs.live?.denominator ?? 0;
  const ratePct = rate == null ? null : Math.round(rate * 1000) / 10;
  const vsNationalPts =
    rate == null || national == null ? null : Math.round((rate - national) * 100);
  const tone = vsNationalPts == null ? 'neutral' : vsNationalPts >= 0 ? 'good' : 'bad';
  return { ratePct, vsNationalPts, discharges, tone };
}
