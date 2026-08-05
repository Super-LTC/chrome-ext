/**
 * Filter a quarter's roster down to the population + measure on screen.
 *
 * ── WHY THIS IS CLIENT-SIDE AND STILL EXACT ───────────────────────────────
 *
 * The roster endpoint returns EVERY resident on the census for one quarter, with
 * the record each one rides. The tab's two toggles are then just subsets of that,
 * so switching them refetches nothing.
 *
 * That is only safe because the fields it filters on are the same ones the score
 * itself gated on, not lookalikes:
 *
 *   status === 'locked'  is the `assessed_in_period` gate. Both the roster and
 *                        the quarter score call one `recordTiming`, deliberately,
 *                        "so the roster and the score it drills into must never
 *                        disagree about which residents were assessed".
 *   counts               is the payer tree's own verdict — the exact predicate
 *                        `medicaidCmi` averaged over.
 *   pendingMedicaid      is the exact set `medicaidWithPendingCmi` adds.
 *
 * So the count this returns should equal the denominator in the headline above
 * it. If those two ever disagree, this file is wrong — not the header.
 *
 * ── WHAT "SCOREABLE" MEANS ────────────────────────────────────────────────
 *
 * A resident with no `currentGroup` has no record in effect at all. They are on
 * the census, they are in `residents`, and they are in NO average. They are kept
 * out of every population here for that reason, and the modal shows them under
 * its own "no scoreable record" heading rather than smuggling them into a count.
 *
 * Pure — no Preact, no fetch, no DOM. Unit-tested in ./__tests__.
 */

/** Residents assessed INSIDE the quarter, per the score's own timing gate. */
const ASSESSED_IN_PERIOD = 'locked';

export const CASE_MIX_POPULATIONS = ['payable', 'capture'];
export const CASE_MIX_MEASURES = ['medicaidCmi', 'allCmi', 'medicaidWithPendingCmi'];

/** Has a record in effect that can be scored at all. */
export function isScoreable(row) {
  return row != null && row.currentGroup != null;
}

/**
 * @param {Array<object>} rows        roster residents, as the API returns them
 * @param {{population?: string, measure?: string}} opts
 * @returns {{rows: Array<object>, scoreable: number, unscoreable: number}}
 */
export function filterCaseMixRoster(rows, opts = {}) {
  const population = CASE_MIX_POPULATIONS.includes(opts.population) ? opts.population : 'payable';
  const measure = CASE_MIX_MEASURES.includes(opts.measure) ? opts.measure : 'medicaidCmi';
  const all = Array.isArray(rows) ? rows : [];

  const scoreable = all.filter(isScoreable);

  const inPopulation =
    population === 'capture'
      ? scoreable.filter((r) => r.status === ASSESSED_IN_PERIOD)
      : scoreable;

  const inMeasure = inPopulation.filter((r) => {
    if (measure === 'allCmi') return true;
    if (measure === 'medicaidWithPendingCmi') return r.counts === true || r.pendingMedicaid === true;
    return r.counts === true;
  });

  return {
    rows: inMeasure,
    scoreable: inPopulation.length,
    /** On the census with no record in effect — in no average, shown separately. */
    unscoreable: all.length - scoreable.length,
  };
}

/**
 * One line of plain English naming the population currently on screen.
 *
 * The toggle labels alone do not teach: "Capture" and "Payable" are our words,
 * not the customer's, and the first thing asked on seeing them was what the
 * difference is. This is rendered inline, NOT as a hover — a tooltip that
 * explains the primary control is a tooltip nobody reads.
 */
export function describeCaseMixPopulation(population, measure, opts = {}) {
  const boundary = opts.boundaryLabel ? opts.boundaryLabel.toLowerCase() : 'quarter end';
  const measureText =
    measure === 'allCmi'
      ? 'every resident with a scoreable record, whatever their payer'
      : measure === 'medicaidWithPendingCmi'
        ? 'residents the state pays for, plus everyone whose Medicaid application is still pending'
        : 'only residents the state actually pays for';

  return population === 'capture'
    ? `Capture — only residents assessed INSIDE this quarter, counting ${measureText}. It tracks what was coded, and it is not the score your state publishes.`
    : `Payable — the record in effect on the ${boundary}, counting ${measureText}. This is what the state pays on.`;
}
