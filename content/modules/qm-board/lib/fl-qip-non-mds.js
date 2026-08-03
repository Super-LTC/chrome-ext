/**
 * Florida QIP NON-MDS components — the other ~half of the 49 points, sourced
 * from CMS Care Compare + facility credentialing/staffing rather than MDS.
 *
 * Ported VERBATIM from superltc `core/services/qm-planner/qip/fl-qip-non-mds.ts`.
 * Not re-derived from how the UI behaves: this is the one place in the port
 * where getting the logic subtly wrong changes a number a customer reads and
 * acts on. The band thresholds and the tier→points mapping are the state's, not
 * ours to infer.
 *
 * WHY IT RUNS IN THE BROWSER AT ALL. The QIP facility view lets a user edit the
 * non-MDS inputs (accreditation, staffing tiers, hospitalizations) and shows the
 * projected total move immediately. That recompute is local for FEEDBACK only —
 * the same edit also PATCHes the server, which invalidates the `fl_qip`
 * precompute, and the server's number is what a reload shows. Both halves have
 * to stay wired or the figure changes under the user on refresh.
 *
 * Per the FHCA deck + SimpleLTC FQIP tool:
 *   CMS 5-Star (Non-QM):        3★=1, 4★=3, 5★=5 pts.
 *   Accreditations (Non-QM):    any of Governor's Gold Seal / Joint Commission /
 *                               AHCA Silver-or-Gold = 5 pts.
 *   Direct-Care Staffing:       percentile tier 1/2/3 (Medicaid cost report).
 *                               SimpleLTC shows "None" (no cost-report feed) →
 *                               we can BEAT them via facility input.
 *   Social-Work/Activity Staff: percentile tier 1/2/3. Same source, same input.
 *   Hospitalizations (QM band): claims measure, per-1,000 LS days. Lower better.
 *   RN Turnover (QM band):      PBJ turnover %. Lower better.
 *
 * THRESHOLDS captured Jul 2026 from SimpleLTC (SFY2028) — frozen, and they must
 * move together with the server's copy at rebasing.
 */
import { scoreFlQipBand } from './fl-qip-scorer.js';

/** Hospitalizations per 1,000 long-stay resident days — lower better. */
export const FL_HOSPITALIZATIONS_BAND = { t3: 1.27, t2: 1.71, t1: 2.18, direction: 'lower_better' };
/** Total RN turnover percent — lower better. */
export const FL_RN_TURNOVER_BAND = { t3: 27.8, t2: 39.55, t1: 52.4, direction: 'lower_better' };

/** CMS 5-Star → FL QIP points: 3★=1, 4★=3, 5★=5, below 3★ (or unknown)=0. Max 5. */
export function scoreFiveStar(overallStar) {
  if (overallStar == null) return 0;
  if (overallStar >= 5) return 5;
  if (overallStar >= 4) return 3;
  if (overallStar >= 3) return 1;
  return 0;
}

/** Any qualifying accreditation → 5 pts. */
export function scoreAccreditation(hasAny) {
  return hasAny ? 5 : 0;
}

/** Staffing percentile tier → points (1/2/3). Null/unknown → 0. Max 3. */
export function scoreStaffingTier(tier) {
  return tier ?? 0;
}

/**
 * @typedef {object} FlNonMdsInputs
 * @property {number|null} cmsOverallStar
 * @property {boolean} hasAccreditation
 * @property {1|2|3|null} directCareStaffingTier
 * @property {1|2|3|null} socialWorkActivityStaffingTier
 * @property {number|null} hospitalizationsPer1000
 * @property {number|null} rnTurnoverPct
 *
 * @param {FlNonMdsInputs} inputs
 */
export function scoreFlNonMds(inputs) {
  const fiveStar = scoreFiveStar(inputs.cmsOverallStar);
  const accreditation = scoreAccreditation(inputs.hasAccreditation);
  const directCareStaffing = scoreStaffingTier(inputs.directCareStaffingTier);
  const socialWorkActivityStaffing = scoreStaffingTier(inputs.socialWorkActivityStaffingTier);
  const hospitalizations =
    inputs.hospitalizationsPer1000 == null
      ? 0
      : scoreFlQipBand(inputs.hospitalizationsPer1000, FL_HOSPITALIZATIONS_BAND).points;
  const rnTurnover =
    inputs.rnTurnoverPct == null
      ? 0
      : scoreFlQipBand(inputs.rnTurnoverPct, FL_RN_TURNOVER_BAND).points;

  // Surfaced so the UI can prompt for the input rather than presenting a 0 as a
  // score. A missing feed and a genuinely zero score are different facts.
  const missing = [];
  if (inputs.cmsOverallStar == null) missing.push('cms_5_star');
  if (inputs.directCareStaffingTier == null) missing.push('direct_care_staffing');
  if (inputs.socialWorkActivityStaffingTier == null) missing.push('social_work_activity_staffing');
  if (inputs.hospitalizationsPer1000 == null) missing.push('hospitalizations');
  if (inputs.rnTurnoverPct == null) missing.push('rn_turnover');

  return {
    fiveStar,
    accreditation,
    directCareStaffing,
    socialWorkActivityStaffing,
    hospitalizations,
    rnTurnover,
    total:
      fiveStar + accreditation + directCareStaffing + socialWorkActivityStaffing
      + hospitalizations + rnTurnover,
    missing,
  };
}
