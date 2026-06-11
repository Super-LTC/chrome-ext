/**
 * CMS Five-Star QM scoring — per-measure rate→points + star thresholds.
 *
 * Transcribed from the CMS Five-Star Technical Users' Guide (April 2026),
 * Appendix Table A3 (per-measure cut-points) + Table 5 (rating thresholds).
 * Source PDF: .context/attachments/.../five-star-users-guide-april-2026.pdf
 *
 * What this can and can't do (be honest in the UI):
 *  - The 10 MDS measures' points ARE computable here. 5 of them are NOT risk-
 *    adjusted (ADL, antipsychotic-long, UTI, falls-major, antipsychotic-new) so
 *    our observed rate == CMS's rate → EXACT points. The other 5 ARE risk-
 *    adjusted (walk, pressure-ulcer-long, catheter, discharge-function,
 *    pressure-ulcer-short) so our observed rate ≈ but ≠ CMS's adjusted rate →
 *    APPROXIMATE points.
 *  - The 5 claims-based measures (LS hospitalizations + ED; SS rehosp + ED +
 *    community-discharge) need Medicare claims we don't have → UNKNOWN. They
 *    are listed here (for the best/worst-case star RANGE) but never "scored".
 *
 * Points: 150-pt measures use deciles (15→150 in 15s); 100-pt use quintiles
 * (20→100 in 20s). More points = better. Lower rate is better for every
 * measure EXCEPT discharge-function & community-discharge (higher is better).
 */
import type { QmMeasureId } from '@core/types/qm-planner.types';

export type FiveStarStay = 'long' | 'short';

export interface PointTier {
  points: number;
  min: number;
  max: number;
}

export interface FiveStarMeasure {
  /** Our evaluator id, or null for claims measures we can't compute. */
  id: QmMeasureId | null;
  /** Claims measures have no QmMeasureId — a stable key for them. */
  key: string;
  label: string;
  stay: FiveStarStay;
  maxPoints: 100 | 150;
  /** true → higher rate scores more points (discharge-fn, community-discharge). */
  higherIsBetter: boolean;
  /** true → our observed MDS rate ≈ but ≠ the CMS risk-adjusted rate. */
  riskAdjusted: boolean;
  /** true → claims-based, NOT computable from MDS. */
  claimsBased: boolean;
  /** A3 cut-points, ordered highest-points → lowest. */
  tiers: PointTier[];
}

// Helper to build a tier list from rows [points, min, max].
const T = (rows: Array<[number, number, number]>): PointTier[] =>
  rows.map(([points, min, max]) => ({ points, min, max }));

export const FIVE_STAR_MEASURES: FiveStarMeasure[] = [
  // ── Long-stay MDS ─────────────────────────────────────────────────────────
  {
    id: 'adl_decline', key: 'ls_adl', label: 'Need for help with ADLs increased',
    stay: 'long', maxPoints: 150, higherIsBetter: false, riskAdjusted: false, claimsBased: false,
    tiers: T([[150,0.0000,0.0662],[135,0.0663,0.0966],[120,0.0967,0.1220],[105,0.1221,0.1463],[90,0.1464,0.1702],[75,0.1703,0.1961],[60,0.1962,0.2245],[45,0.2246,0.2574],[30,0.2575,0.3019],[15,0.3020,1.0000]]),
  },
  {
    id: 'antipsychotic_long', key: 'ls_antipsych', label: 'Antipsychotic medication',
    stay: 'long', maxPoints: 150, higherIsBetter: false, riskAdjusted: false, claimsBased: false,
    tiers: T([[150,0.0000,0.0426],[135,0.0427,0.0682],[120,0.0683,0.0920],[105,0.0921,0.1140],[90,0.1141,0.1364],[75,0.1365,0.1613],[60,0.1614,0.1899],[45,0.1900,0.2264],[30,0.2265,0.2836],[15,0.2837,1.0000]]),
  },
  {
    id: 'walk_indep_worsened', key: 'ls_walk', label: 'Ability to walk independently worsened',
    stay: 'long', maxPoints: 150, higherIsBetter: false, riskAdjusted: true, claimsBased: false,
    tiers: T([[150,0.0000,0.0830],[135,0.0831,0.1235],[120,0.1236,0.1559],[105,0.1560,0.1866],[90,0.1867,0.2168],[75,0.2169,0.2491],[60,0.2492,0.2845],[45,0.2846,0.3286],[30,0.3287,0.3904],[15,0.3905,1.0000]]),
  },
  {
    id: 'pressure_ulcer_long', key: 'ls_pu', label: 'Pressure ulcers',
    stay: 'long', maxPoints: 100, higherIsBetter: false, riskAdjusted: true, claimsBased: false,
    tiers: T([[100,0.0000,0.0288],[80,0.0289,0.0445],[60,0.0446,0.0597],[40,0.0598,0.0797],[20,0.0798,1.0000]]),
  },
  {
    id: 'catheter', key: 'ls_catheter', label: 'Catheter inserted & left in bladder',
    stay: 'long', maxPoints: 100, higherIsBetter: false, riskAdjusted: true, claimsBased: false,
    tiers: T([[100,0.0000,0.0050],[80,0.0051,0.0126],[60,0.0127,0.0217],[40,0.0218,0.0356],[20,0.0357,1.0000]]),
  },
  {
    id: 'uti', key: 'ls_uti', label: 'Urinary tract infection',
    stay: 'long', maxPoints: 100, higherIsBetter: false, riskAdjusted: false, claimsBased: false,
    tiers: T([[100,0.0000,0.0070],[80,0.0071,0.0160],[60,0.0161,0.0272],[40,0.0273,0.0452],[20,0.0453,1.0000]]),
  },
  {
    id: 'falls_major_injury', key: 'ls_falls', label: 'One or more falls with major injury',
    stay: 'long', maxPoints: 100, higherIsBetter: false, riskAdjusted: false, claimsBased: false,
    tiers: T([[100,0.0000,0.0134],[80,0.0135,0.0246],[60,0.0247,0.0356],[40,0.0357,0.0514],[20,0.0515,1.0000]]),
  },
  {
    id: null, key: 'ls_hosp', label: 'Hospitalizations per 1,000 days',
    stay: 'long', maxPoints: 150, higherIsBetter: false, riskAdjusted: true, claimsBased: true,
    tiers: T([[150,0.0000,0.7179],[135,0.7180,0.9433],[120,0.9434,1.1024],[105,1.1025,1.2549],[90,1.2550,1.4058],[75,1.4059,1.5573],[60,1.5574,1.7184],[45,1.7185,1.9283],[30,1.9284,2.2685],[15,2.2686,1000.0]]),
  },
  {
    id: null, key: 'ls_ed', label: 'Outpatient ED visits per 1,000 days',
    stay: 'long', maxPoints: 150, higherIsBetter: false, riskAdjusted: true, claimsBased: true,
    tiers: T([[150,0.0000,0.4741],[135,0.4742,0.6661],[120,0.6662,0.8288],[105,0.8289,0.9853],[90,0.9854,1.1590],[75,1.1591,1.3672],[60,1.3673,1.6026],[45,1.6027,1.9055],[30,1.9056,2.4707],[15,2.4708,1000.0]]),
  },
  // ── Short-stay MDS ────────────────────────────────────────────────────────
  {
    id: 'discharge_function', key: 'ss_dfs', label: 'At/above expected self-care & mobility at discharge',
    stay: 'short', maxPoints: 150, higherIsBetter: true, riskAdjusted: true, claimsBased: false,
    tiers: T([[150,0.7074,1.0000],[135,0.6480,0.7073],[120,0.6035,0.6479],[105,0.5661,0.6034],[90,0.5301,0.5660],[75,0.4931,0.5300],[60,0.4498,0.4930],[45,0.3995,0.4497],[30,0.3309,0.3994],[15,0.0000,0.3308]]),
  },
  {
    id: 'pressure_ulcer_short', key: 'ss_pu', label: 'New or worsened pressure ulcers',
    stay: 'short', maxPoints: 100, higherIsBetter: false, riskAdjusted: true, claimsBased: false,
    tiers: T([[100,0.0000,0.0000],[80,0.0001,0.0219],[60,0.0220,0.0395],[40,0.0396,0.0647],[20,0.0648,1.0000]]),
  },
  {
    id: 'antipsychotic_new', key: 'ss_antipsych', label: 'Antipsychotic medication for the first time',
    stay: 'short', maxPoints: 100, higherIsBetter: false, riskAdjusted: false, claimsBased: false,
    tiers: T([[100,0.0000,0.0000],[80,0.0001,0.0096],[60,0.0097,0.0168],[40,0.0169,0.0289],[20,0.0290,1.0000]]),
  },
  {
    id: null, key: 'ss_community', label: 'Successful return to home & community',
    stay: 'short', maxPoints: 150, higherIsBetter: true, riskAdjusted: true, claimsBased: true,
    tiers: T([[150,0.6336,1.0000],[135,0.5976,0.6335],[120,0.5697,0.5975],[105,0.5453,0.5696],[90,0.5173,0.5452],[75,0.4917,0.5172],[60,0.4609,0.4916],[45,0.4262,0.4608],[30,0.3763,0.4261],[15,0.0000,0.3762]]),
  },
  {
    id: null, key: 'ss_rehosp', label: 'Re-hospitalized after admission',
    stay: 'short', maxPoints: 150, higherIsBetter: false, riskAdjusted: true, claimsBased: true,
    tiers: T([[150,0.0000,0.1303],[135,0.1304,0.1555],[120,0.1556,0.1711],[105,0.1712,0.1845],[90,0.1846,0.1973],[75,0.1974,0.2096],[60,0.2097,0.2232],[45,0.2233,0.2381],[30,0.2382,0.2637],[15,0.2638,1.0000]]),
  },
  {
    id: null, key: 'ss_ed', label: 'Outpatient ED visit',
    stay: 'short', maxPoints: 150, higherIsBetter: false, riskAdjusted: true, claimsBased: true,
    tiers: T([[150,0.0000,0.0409],[135,0.0410,0.0558],[120,0.0559,0.0665],[105,0.0666,0.0770],[90,0.0771,0.0866],[75,0.0867,0.0974],[60,0.0975,0.1093],[45,0.1094,0.1255],[30,0.1256,0.1489],[15,0.1490,1.0000]]),
  },
];

const BY_ID = new Map<QmMeasureId, FiveStarMeasure>();
for (const m of FIVE_STAR_MEASURES) if (m.id) BY_ID.set(m.id, m);

export function fiveStarMeasure(id: QmMeasureId): FiveStarMeasure | undefined {
  return BY_ID.get(id);
}

/**
 * Points a measure earns at a given observed rate. Returns the highest-points
 * tier whose range the rate satisfies (directional: rate ≤ max for lower-is-
 * better, rate ≥ min for higher-is-better). Falls back to the lowest tier.
 */
export function pointsForRate(spec: FiveStarMeasure, rate: number): number {
  for (const t of spec.tiers) {
    if (spec.higherIsBetter ? rate >= t.min : rate <= t.max) return t.points;
  }
  return spec.tiers[spec.tiers.length - 1].points;
}

/** Convenience: points for one of our MDS measures by id (undefined if not Five-Star). */
export function measurePoints(id: QmMeasureId, rate: number): number | undefined {
  const spec = BY_ID.get(id);
  return spec ? pointsForRate(spec, rate) : undefined;
}

/**
 * The next-better tier's boundary and the rate delta to reach it — drives
 * "you're 0.4% from +15 pts" coaching. Returns null at the top tier.
 */
export function nextTier(
  spec: FiveStarMeasure,
  rate: number
): { points: number; needRate: number; delta: number } | null {
  const current = pointsForRate(spec, rate);
  // tiers are ordered best→worst; the better tier is the one just above current.
  const idx = spec.tiers.findIndex((t) => t.points === current);
  if (idx <= 0) return null; // already top tier
  const better = spec.tiers[idx - 1];
  const needRate = spec.higherIsBetter ? better.min : better.max;
  const delta = spec.higherIsBetter ? needRate - rate : rate - needRate;
  return { points: better.points, needRate, delta };
}

// ── Table 5: rating thresholds (as of January 2025) ─────────────────────────
export interface StarBand {
  stars: number;
  min: number;
  max: number;
}
export const QM_RATING_THRESHOLDS: Record<'long' | 'short' | 'overall', StarBand[]> = {
  long: [
    { stars: 1, min: 155, max: 465 },
    { stars: 2, min: 466, max: 565 },
    { stars: 3, min: 566, max: 640 },
    { stars: 4, min: 641, max: 735 },
    { stars: 5, min: 736, max: 1150 },
  ],
  short: [
    { stars: 1, min: 144, max: 438 },
    { stars: 2, min: 439, max: 525 },
    { stars: 3, min: 526, max: 625 },
    { stars: 4, min: 626, max: 719 },
    { stars: 5, min: 720, max: 1150 },
  ],
  overall: [
    { stars: 1, min: 299, max: 904 },
    { stars: 2, min: 905, max: 1091 },
    { stars: 3, min: 1092, max: 1266 },
    { stars: 4, min: 1267, max: 1455 },
    { stars: 5, min: 1456, max: 2300 },
  ],
};

/** Short-stay raw points are scaled by 1150/800 before applying thresholds. */
export const SHORT_STAY_SCALE = 1150 / 800;

export function starsForScore(kind: 'long' | 'short' | 'overall', score: number): number {
  for (const b of QM_RATING_THRESHOLDS[kind]) {
    if (score >= b.min && score <= b.max) return b.stars;
  }
  return score < QM_RATING_THRESHOLDS[kind][0].min ? 1 : 5;
}
