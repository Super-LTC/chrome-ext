/**
 * FL QIP facility view-model — the CLIENT-SIDE RESCORE.
 *
 * Extracted from superltc `qm-fl-qip-view.tsx`, where `inputsToForm`/`withInputs`
 * sit inline. Pulled out here because this is the one place in the whole port
 * where the browser computes a number a customer reads and acts on, rather than
 * rendering one the server produced — so it gets tested directly instead of only
 * through the screen.
 *
 * ── The two-halves contract ─────────────────────────────────────────────────
 * Editing a non-MDS input does BOTH of these, and both are required:
 *
 *   1. `withInputs` re-scores locally, so the total moves as you type. Feedback.
 *   2. the same edit PATCHes the server, invalidating the `fl_qip` precompute.
 *      Truth.
 *
 * Drop (1) and the panel feels broken. Drop (2) and the number silently reverts
 * on the next load. They must agree, which is why the scoring here calls the
 * ported `scoreFlNonMds` rather than reimplementing the bands.
 */
import { scoreFlNonMds } from './fl-qip-non-mds.js';

/** The editable non-MDS input form — all fields resolved, never undefined. */
export function inputsToForm(i = {}) {
  return {
    hasAccreditation: i.hasAccreditation ?? false,
    directCareStaffingTier: i.directCareStaffingTier ?? null,
    socialWorkActivityStaffingTier: i.socialWorkActivityStaffingTier ?? null,
    hospitalizationsPer1000: i.hospitalizationsPer1000 ?? null,
    rnTurnoverSource: i.rnTurnoverSource ?? 'rn',
  };
}

/**
 * Re-score the non-MDS half + totals from edited inputs — optimistic, and
 * deliberately mirroring what the server will return.
 *
 * `coding` is untouched by non-MDS edits, so `...base` carries it through.
 */
export function withInputs(base, form) {
  const rnTurnoverPct = form.rnTurnoverSource === 'total' ? base.rnTurnoverPctTotal : base.rnTurnoverPctRn;
  const nonMds = scoreFlNonMds({
    cmsOverallStar: base.cmsOverallStar,
    hasAccreditation: form.hasAccreditation,
    directCareStaffingTier: form.directCareStaffingTier,
    socialWorkActivityStaffingTier: form.socialWorkActivityStaffingTier,
    hospitalizationsPer1000: form.hospitalizationsPer1000,
    rnTurnoverPct,
  });
  const projectedTotalPoints = base.projectedMdsPoints + nonMds.total;
  const officialTotalPoints = base.officialMdsPoints + nonMds.total;
  return {
    ...base,
    nonMds,
    projectedTotalPoints,
    officialTotalPoints,
    // Mirror the server's guard. This re-derivation runs on every what-if
    // keystroke, so without it a building with no MDS data flips back to
    // "qualifying" the moment someone touches an input — the same defect the
    // rollup refuses one layer up.
    projectedQualifying: !base.insufficientData && projectedTotalPoints >= base.floor,
    officialQualifying: officialTotalPoints >= base.floor,
    projectedPointsToQualify: Math.max(0, base.floor - projectedTotalPoints),
    officialPointsToQualify: Math.max(0, base.floor - officialTotalPoints),
    rnTurnoverSource: form.rnTurnoverSource,
    rnTurnoverPct,
    inputs: { ...form },
  };
}

/**
 * Adapt the server's `QipMeasureWhatIf` to the shape `MeasureDetail` reads.
 *
 * Pure renaming, and that is exactly why it is a tested function rather than an
 * object literal at the call site: `projectedNum`→`num` and `projectedDen`→`den`
 * are one transposition away from a rate that is silently inverted, and nothing
 * downstream would flag it — the what-if would just quietly recommend the wrong
 * thing.
 *
 * `adjusted` → `deferred` is the load-bearing one. A deferred measure's scored
 * rate is CMS's, so clearing residents cannot move it; `MeasureDetail` suppresses
 * the point estimate entirely when this is set. Lose the rename and a deferred
 * measure starts offering a what-if it has no right to.
 *
 * `priorYearRate` / `direction` are deliberately absent from the server shape.
 * `MeasureDetail` treats them as an optional refinement and falls back to the
 * supplied `improvementPct`, which is what preserves the 0.5 improvement rule.
 * `baseTotalPoints` / `floor` are carried through unused for now — the web shows
 * "this clears the floor" from them, which we do not yet.
 */
export function toMeasureDetailQip(whatIf) {
  if (!whatIf) return undefined;
  return {
    num: whatIf.projectedNum,
    den: whatIf.projectedDen,
    locked: whatIf.lockedNum,
    currentPoints: whatIf.currentPoints,
    improvementPct: whatIf.improvementPct,
    deferred: whatIf.adjusted,
    baseTotalPoints: whatIf.baseTotalPoints,
    floor: whatIf.floor,
  };
}
