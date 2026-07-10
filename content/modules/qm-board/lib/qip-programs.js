/**
 * QIP-by-state registry — each state Medicaid nursing-facility quality-incentive
 * program, reduced to the MDS-derived measures our QM engine computes. Pure data.
 *
 * Ported from web/components/quality-measures/qip-programs.ts (PR #649).
 *
 * FRAMING: we only encode the MDS-clinical measures we compute. Every program
 * also has non-MDS components (staffing/survey/claims/credentialing) we cannot
 * compute — listed in `nonMdsComponents` so the UI can say "clinical portion
 * only," never imply it's the whole program score. Dollar figures are
 * directional; verify against the official program packet before display.
 */

export const QIP_PROGRAMS = {
  OH: {
    state: 'OH', active: true,
    programName: 'Ohio NF Medicaid Quality Incentive', programYear: 'SFY2026',
    scoring: 'five_star_points_div20', comparison: 'national_percentile',
    measures: ['pressure_ulcer_long', 'uti', 'walk_indep_worsened', 'catheter', 'adl_decline', 'falls_major_injury', 'antipsychotic_long'],
    nonMdsComponents: ['occupancy (3 pts)', 'total nurse staffing HPRD (PBJ)'],
    clinicalShare: 'most',
    pool: '$125M/yr statutory floor; ~$1.14/point; ~10-13% of Medicaid reimbursement. In active litigation.',
    notes: 'Score = Σ(CMS Five-Star QM points ÷20) over these 7 + occupancy + staffing. All 7 are Five-Star measures.',
    sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-5165.26', confidence: 'high',
  },
  TX: {
    state: 'TX', active: true,
    programName: 'Texas QIPP', programYear: 'SFY2026 (Year 9)',
    scoring: 'met_or_improvement', comparison: 'state_or_national_mean',
    measures: ['falls_major_injury', 'uti', 'weight_loss', 'antipsychotic_long', 'walk_indep_worsened', 'phq9_depression', 'antianxiety_hypnotic_use', 'bb_new_worsened', 'pressure_ulcer_long', 'catheter'],
    nonMdsComponents: ['CNA/Licensed/Total nurse staffing HPRD (PBJ) — Component Two (20%)'],
    clinicalShare: 'most',
    pool: '~$1.75B+ statewide. Paid via STAR+PLUS MCO PMPM.',
    notes: 'Per-metric Met/Not-Met vs benchmark or own escalating baseline. 6 of these 10 are Five-Star; weight_loss, phq9_depression, antianxiety_hypnotic_use, bb_new_worsened are state-only.',
    sourceUrl: 'https://www.hhs.texas.gov/providers/long-term-care-providers/nursing-facilities-nf/quality-incentive-payment-program-qipp', confidence: 'high',
  },
  GA: {
    state: 'GA', active: true,
    programName: 'Georgia Supplemental Quality Incentive Payment', programYear: 'SFY2027 (CY2026-vs-CY2025)',
    scoring: 'decile_improvement', comparison: 'state_decile_improvement',
    measures: ['weight_loss', 'uti', 'antipsychotic_long', 'falls_major_injury'],
    nonMdsComponents: [],
    clinicalShare: 'all',
    pool: '~$115M. Provider-assessment/UPL-funded, lump-sum by decile.',
    notes: 'IMPROVEMENT-based: each measure’s YoY raw-rate change is decile-ranked among GA SNFs. All 4 are MDS. weight_loss is state-only.',
    sourceUrl: 'https://dch.georgia.gov/providers/provider-types/nursing-home-providers/supplemental-quality-incentive-payments', confidence: 'high',
  },
  FL: {
    state: 'FL', active: true,
    programName: 'Florida NF-PPS Quality Incentive Program', programYear: 'Rate year Oct 1 2025 – Sep 30 2026',
    scoring: 'percentile_bands', comparison: 'state_percentile',
    measures: ['uti', 'pressure_ulcer_long', 'falls_major_injury', 'antipsychotic_long', 'antianxiety_hypnotic_use', 'physical_restraints', 'adl_decline', 'influenza_vaccine', 'low_risk_incontinence'],
    nonMdsComponents: ['hospitalizations/1000d (claims)', 'RN turnover (PBJ)', 'direct-care / social-work / activity staffing', 'credentialing (CMS 5-star, Gold Seal, Joint Commission, AHCA award)'],
    clinicalShare: 'about_half',
    pool: '17.862% of Sept-2016 non-property payments (SUNSETS to 10% July 1 2026 unless extended).',
    notes: 'State-percentile bands: ≥90th=3pts, 75-90th=2, 50-75th=1. Several measures NEW in the July-8-2025 rule. Max-points not confirmed.',
    sourceUrl: 'http://flrules.elaws.us/fac/59g-6.010', confidence: 'medium',
  },
  AL: {
    state: 'AL', active: true,
    programName: 'Alabama Medicaid NH Quality Incentive Program', programYear: '2025 rate year (SPA AL-24-0007)',
    scoring: 'national_avg_or_improvement', comparison: 'national_average',
    measures: ['influenza_vaccine', 'antipsychotic_long', 'physical_restraints', 'pressure_ulcer_short'],
    nonMdsComponents: ['Willingness-to-Recommend (NRC Health resident+family survey)'],
    clinicalShare: 'most',
    pool: '≥$5M/yr statutory floor. Pool ÷ points, weighted by Medicaid days.',
    notes: 'Each measure scored vs CMS national average OR 0.75 pts for 10% YoY improvement. Pneumococcal (no evaluator — GAP). pressure_ulcer_short is SHORT-stay.',
    sourceUrl: 'https://law.justia.com/codes/alabama/title-40/chapter-26b/article-2/section-40-26b-26/', confidence: 'medium',
  },
  TN: {
    state: 'TN', active: true,
    programName: 'TennCare QuILTSS NF Value-Based Purchasing', programYear: 'QuILTSS #18 (CY2025 → rates Jul 1 2026)',
    scoring: 'benchmark_threshold', comparison: 'benchmark',
    measures: ['antipsychotic_long', 'antipsychotic_new', 'uti'],
    nonMdsComponents: ['Satisfaction (CoreQ) — 35 pts', 'Culture change / quality of life (QBlue) — 30 pts', 'Staffing — 25 pts', 'Bonus accreditations — 10 pts'],
    clinicalShare: 'small',
    pool: '≥$40M or 4% of NF expenditures. ~$10.55/Medicaid-day in the worked example.',
    notes: 'Clinical Performance is only 10 of 110 points — our 3 measures are the entire MDS slice; the other 100 pts are survey/staffing. MUST be labeled "clinical portion only."',
    sourceUrl: 'https://publications.tnsosfiles.com/rules/1200/1200-13/1200-13-02.20221004.pdf', confidence: 'high',
  },
  WI: {
    state: 'WI', active: false,
    programName: 'Wisconsin — no CMS-QM Medicaid P4P', programYear: 'SFY2026',
    scoring: 'none', comparison: 'none',
    measures: [],
    nonMdsComponents: ['Behavioral/Cognitive-Impairment acuity incentive (raw MDS items — not a Five-Star QM scorecard)'],
    clinicalShare: 'small',
    pool: 'n/a (Beh/CI is a per-day acuity add-on).',
    notes: 'Wisconsin does NOT score the CMS Five-Star QMs for payment. Show Five-Star only; no QIP toggle.',
    sourceUrl: 'https://www.forwardhealth.wi.gov/wiportal/content/provider/medicaid/NursingFacility/MethodsOfImplementation.pdf.spage', confidence: 'high',
  },
};

/** Program for a state (case-insensitive 2-letter), or null if we have no entry. */
export function qipForState(state) {
  if (!state) return null;
  return QIP_PROGRAMS[String(state).toUpperCase()] ?? null;
}

/** The set of MDS measures that count toward a state's QIP (empty if no active program). */
export function qipMeasureSet(state) {
  const p = qipForState(state);
  return new Set(p?.active ? p.measures : []);
}

/** Does this state have an active QIP toggle worth showing? */
export function hasActiveQip(state) {
  return qipForState(state)?.active ?? false;
}

/**
 * States for which the full Official-vs-Projected QIP SCORER is built (percentile
 * bands + official CMS path + non-MDS inputs). The regional QIP toggle only lights
 * up here — NOT on `hasActiveQip`, which is true for every state with a program on
 * paper (OH/TX/GA…) even though we've only built the FL scorer. Gating on
 * `hasActiveQip` is what made an Ohio facility show the Florida QIP view.
 * Mirrors web/components/quality-measures/qip-programs.ts. Add a state's scorer →
 * add it here → its toggle appears. Registry-driven, no FL hardcode.
 */
const QIP_SCORER_STATES = new Set(['FL']);
export function hasQipScorer(state) {
  return !!state && QIP_SCORER_STATES.has(String(state).toUpperCase());
}

/** Short display label for a state's QIP program, e.g. "Florida QIP". Null if no program. */
const QIP_STATE_NAMES = {
  FL: 'Florida', GA: 'Georgia', AL: 'Alabama', TN: 'Tennessee', TX: 'Texas', OH: 'Ohio', WI: 'Wisconsin',
};
export function qipDisplayLabel(state) {
  const p = qipForState(state);
  if (!p) return null;
  return `${QIP_STATE_NAMES[p.state] ?? p.state} QIP`;
}
