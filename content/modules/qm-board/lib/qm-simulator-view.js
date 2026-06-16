/**
 * Per-measure "lever" for the what-if simulator: how many switches you can flip
 * in this group, and the points you'd free by flipping them all. Makes the group
 * header read "N movable · up to +Y pts" so cause→effect is legible. Pure so the
 * math is unit-tested; the component passes a `pointsAt` bound to the measure's
 * Five-Star scoring curve.
 *
 * Ported verbatim from qm-handoff/qm-simulator-view.ts (types stripped).
 *
 * @typedef {Object} GroupLeverInput
 * @property {number} numNow              Current numerator (residents triggering now).
 * @property {number} denNow              Current denominator (eligible residents).
 * @property {number} movableCurrent      Non-locked current triggers — the clearable switches.
 * @property {number} crossersTotal       All projected day-101 crossers for this measure.
 * @property {number} crossersPreventable Crossers that can still be prevented before day-101.
 * @property {(rate:number)=>number} pointsAt Measure's rate→points curve (lower rate = more points).
 *
 * @typedef {Object} GroupLever
 * @property {number} movableCount  Switches the user can flip (clearable triggers + preventable crossers).
 * @property {number} potentialPts  Points freed by flipping every movable switch (≥ 0, rounded).
 */

/**
 * @param {GroupLeverInput} i
 * @returns {GroupLever}
 */
export function groupLever(i) {
  const den = i.denNow + i.crossersTotal;
  // Worst case at quarter-close: nothing cleared, every crosser lands.
  const worstNum = i.numNow + i.crossersTotal;
  // Best case: clear all movable current triggers, prevent all preventable crossers.
  const bestNum = Math.max(0, i.numNow - i.movableCurrent) + (i.crossersTotal - i.crossersPreventable);
  const worstRate = den > 0 ? worstNum / den : 0;
  const bestRate = den > 0 ? bestNum / den : 0;
  const potentialPts = Math.max(0, Math.round(i.pointsAt(bestRate) - i.pointsAt(worstRate)));
  return { movableCount: i.movableCurrent + i.crossersPreventable, potentialPts };
}
