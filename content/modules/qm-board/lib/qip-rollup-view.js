/**
 * QIP rollup view-model — how a building stands against the qualifying floor.
 *
 * Extracted from superltc `qip-rollup.tsx` (where it is inline) because these
 * two functions encode product decisions that were learned from real portfolio
 * data, and both are easy to "simplify" into something wrong:
 *
 *  1. A BUILDING WITH NO MDS IS NOT RANKED. An empty denominator makes every
 *     adverse measure read as a flawless 0%, so a building with no assessments
 *     posts ~24 points. On a real 62-building portfolio the top scorer was an
 *     archived building with zero MDS. `unscored` is therefore checked BEFORE any
 *     distance reading, and the UI prints em-dashes rather than the number such a
 *     building nominally computed.
 *
 *  2. "BELOW THE FLOOR" IS TWO DIFFERENT PROBLEMS. Some buildings are under it
 *     because nobody entered a Medicaid cost-report staffing tier; others are
 *     under it on care. The responses are unrelated — a data-entry task versus a
 *     clinical one — and a single count always reads as the second. So `pending`
 *     (below the floor, but the CEILING clears it) is split from `short`
 *     (still below with every missing input credited in full).
 *
 * `ceiling` credits every un-entered input at the BEST tier, which makes it an
 * upper bound rather than a forecast — hence the copy says "could clear", never
 * "clears".
 */

/** Within this many points of the floor counts as the bubble. */
const BUBBLE_POINTS = 2;

/**
 * @typedef {'error'|'unscored'|'pending'|'short'|'bubble'|'safe'} QipStandingKind
 *
 * @param {object} f  QipRollupFacility
 * @param {number} floor
 * @returns {{kind: QipStandingKind, gap: number}}
 */
export function standing(f, floor) {
  const gap = f.projected.points - floor;
  if (f.error) return { kind: 'error', gap: 0 };
  // Before any distance reading — see (1) above.
  if (f.insufficientData) return { kind: 'unscored', gap: 0 };
  if (gap < 0) {
    return f.ceiling >= floor ? { kind: 'pending', gap } : { kind: 'short', gap };
  }
  // Ties go to at-risk, matching the Five-Star board.
  if (gap <= BUBBLE_POINTS) return { kind: 'bubble', gap };
  return { kind: 'safe', gap };
}

/** @param {QipStandingKind} kind */
export function standingText(kind, gap, floor) {
  if (kind === 'error') return 'score unavailable';
  if (kind === 'unscored') return 'no MDS this program year — not scored';
  // "COULD clear", not "clears": the ceiling credits every un-entered input at
  // the BEST tier, so it is an upper bound. Promising the clear here would
  // reintroduce the optimism this split exists to remove.
  if (kind === 'pending') return `${Math.abs(gap).toFixed(1)} pts under — could clear on inputs`;
  if (kind === 'short') return `${Math.abs(gap).toFixed(1)} pts below the ${floor} floor`;
  if (kind === 'bubble') return `${gap.toFixed(1)} pts above the floor — on the bubble`;
  return `${gap.toFixed(1)} pts above the floor`;
}

/**
 * Worst standing first — the board opens on what needs attention.
 *
 * Unscored and failed buildings sink to the bottom regardless of the points they
 * nominally computed: an unmeasured building is not a leader, and sorting it by
 * its phantom score is the same bug as ranking it.
 */
export function orderFacilities(facilities) {
  const rank = (f) => (f.error ? 2 : f.insufficientData ? 1 : 0);
  return [...facilities].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (rank(a) > 0) return a.name.localeCompare(b.name);
    return (a.projected.points - a.floor) - (b.projected.points - b.floor);
  });
}
