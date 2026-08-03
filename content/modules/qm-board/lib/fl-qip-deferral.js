/**
 * FL QIP deferral — which measures FL scores from CMS's published rate, and WHY.
 *
 * Ported verbatim from superltc `core/services/qm-planner/qip/fl-qip-deferral.ts`.
 *
 * ── Why this is its own module, on both sides ───────────────────────────────
 * On the web it exists separately because importing the DB-backed comparison
 * module into a client component broke the production build (#1070). The same
 * discipline applies here for a different reason: this file must stay
 * CONSTANTS-ONLY so the measure drill can import it without dragging scoring
 * logic into the lazy QM chunk. Verified on the source side — the original
 * imports nothing but a type.
 *
 * ── Why the reasons are strings and not a boolean ───────────────────────────
 * A resident roster shown under a deferred measure is our live MDS view — real
 * residents, real coding — but it is NOT the input CMS scored. A drill that lets
 * a reader believe otherwise manufactures exactly the confusion the deferral
 * exists to prevent, which is what #1068 was built to kill. So the banner quotes
 * the specific reason rather than saying "deferred": "risk-adjusted" and
 * "different cohort entirely" are different problems and lead to different
 * actions.
 */

/** @typedef {string} QmMeasureId */

/** Rendered verbatim in the drill-in banner. */
export const FL_QIP_DEFERRAL_REASONS = {
  antipsychotic_long:
    "CMS scores the Jan-2026 hybrid measure with Medicare/Medicaid pharmacy-claims data no MDS view contains",
  pressure_ulcer_long: 'CMS publishes a risk-adjusted rate an observed roster cannot reproduce',
  bb_new_worsened: 'CMS publishes a risk-adjusted rate an observed roster cannot reproduce',
  influenza_vaccine:
    'CMS scores the influenza-season cohort (Oct-Mar), a different population than any calendar quarter',
};

/**
 * Measures whose SCORED rate can't be reproduced from our quarterly MDS view, so
 * the official (CMS-published) number governs.
 *
 * Influenza is the least obvious of the four: CMS scores the INFLUENZA-SEASON
 * cohort (Oct-Mar; one roster serves Q1/Q2/Q3 alike) with positive polarity,
 * while ours is unvaccinated-among-quarterly-long-stay. That is a different
 * population AND the opposite direction — structurally non-comparable, not
 * merely noisy, so a projection from it would be wrong rather than imprecise.
 */
export const FL_ADJUSTED_MEASURES = new Set([
  'antipsychotic_long',   // claims-adjusted (Jan-2026 re-spec)
  'pressure_ulcer_long',  // risk-adjusted
  'bb_new_worsened',      // risk-adjusted
  'influenza_vaccine',    // season-cohort (SUP-275)
]);

/** The deferral reason for a measure, or undefined when FL scores it from our MDS. */
export const deferralReasonFor = (measureId) =>
  (FL_ADJUSTED_MEASURES.has(measureId) ? FL_QIP_DEFERRAL_REASONS[measureId] : undefined);

/**
 * Prefer the SERVER's wording; fall back to our copy.
 *
 * ── THIS FALLBACK IS TEMPORARY AND THIS WHOLE MODULE IS SCHEDULED FOR DELETION ─
 * superltc #1084 puts the reason on the wire in two places —
 * `FlQipComparisonMeasure.deferralReason` and `QuarterRatesView.scoringDeferrals`
 * — precisely so no client keeps its own copy of a string whose entire job is
 * saying "this number didn't come from where you think". Two copies that agree
 * today can disagree tomorrow, and stale provenance text is worse than none.
 *
 * The fallback exists only to bridge the deploy: until #1084 is out everywhere,
 * a payload without the field would render a banner with a blank reason, which is
 * the exact failure being eliminated.
 *
 * DELETE THIS MODULE once #1084 is deployed. Two things change at that point and
 * both are intended:
 *   - the drill's banner comes purely from `qr.scoringDeferrals`, so a FAILED
 *     quarter-rates fetch shows no banner. That's correct: there is no roster on
 *     screen to be misread, and the failure message says so.
 *   - `QipMeasureDrill`'s "shows the banner even when the roster fails to load"
 *     test asserts the bridge behaviour and should go with it.
 *
 * @param {string} measureId
 * @param {Record<string,string>|null|undefined} serverReasons  measureId → reason
 */
export function resolveDeferralReason(measureId, serverReasons) {
  if (serverReasons) return serverReasons[measureId];
  return deferralReasonFor(measureId);
}
