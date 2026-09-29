/**
 * QIP-by-state registry — each state Medicaid nursing-facility quality-incentive
 * program, reduced to the MDS-derived measures our QM engine computes. Pure data.
 *
 * A HAND PORT of superltc web/components/quality-measures/qip-programs.ts. Every
 * field of every state is copied from that file — keep it that way. The copy
 * drifted once already (Texas and Florida kept the retired N033 antianxiety and
 * N025 incontinence measures after the web moved to N036 / N046), and
 * `__tests__/qip-programs.test.js` pins the measure lists so it can't do so
 * silently again. When the web registry changes, change this file and that test.
 *
 * FRAMING: we only encode the MDS-clinical measures we compute. Every program
 * also has non-MDS components (staffing/survey/claims/credentialing) we cannot
 * compute — listed in `nonMdsComponents` so the UI can say "clinical portion
 * only," never imply it's the whole program score. Dollar figures are
 * directional; verify against the official program packet before display.
 *
 * Florida's `programYear` and `pool` are DERIVED on the web from
 * core/services/qm-planner/qip/fl/fl-qip-year-rules.ts (one row per rate year,
 * keyed on FL_CURRENT_RATE_YEAR). The extension can't import from superltc, so
 * the strings below are that function's output for the 2026-10-01 rate year.
 * Re-copy both when the web moves FL_CURRENT_RATE_YEAR.
 */

export const QIP_PROGRAMS = {
  OH: {
    state: 'OH', active: true,
    programName: 'Ohio NF Medicaid Quality Incentive', programYear: 'SFY2026',
    scoring: 'five_star_points_div20', comparison: 'national_percentile',
    measures: ['pressure_ulcer_long', 'uti', 'walk_indep_worsened', 'catheter', 'adl_decline', 'falls_major_injury', 'antipsychotic_long'],
    nonMdsComponents: ['occupancy (3 pts)', 'total nurse staffing HPRD (PBJ)'],
    clinicalShare: 'most',
    pool: '$125M/yr statutory add-on + 5.2% of base rates; value per point READ from ODM rate reports: $0.94 (SFY2024), $1.20 (SFY2025), $1.14 (SFY2026); floats inversely with the state average score. $875M back-pay appropriated after LeadingAge Ohio v. ODM.',
    notes: 'Score = Σ(CMS Five-Star QM points ÷20) over these 7 + staffing (100-pt decile scale, quintile → ÷20, max 5) + occupancy (3). Lowest CMS band on a metric = 0 for that metric. Below the statewide 25th percentile of metric points (struck July 1, reused at midyear; 32.0 in SFY2026, 35.75 in SFY2027) = all metric points zero, occupancy still paid. Two scoring points a year, not quarterly. Scorer: core/services/qm-planner/qip/oh/. Antipsychotic is claims+MDS hybrid (Jan 2026) — carry CMS\'s value.',
    sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-5165.26', confidence: 'high',
  },
  TX: {
    state: 'TX', active: true,
    programName: 'Texas QIPP', programYear: 'SFY2026 (Year 9)',
    scoring: 'met_or_improvement', comparison: 'state_or_national_mean',
    // antianxiety_hypnotic_rate is N036 (the Care-Compare variant) — the metric
    // HHSC names for Component 3. NOT antianxiety_hypnotic_use (N033), an
    // iQIES survey-only measure whose broad Dx exclusions hide the residents
    // most likely to be on the drug.
    measures: ['falls_major_injury', 'uti', 'weight_loss', 'antipsychotic_long', 'walk_indep_worsened', 'phq9_depression', 'antianxiety_hypnotic_rate', 'bb_new_worsened', 'pressure_ulcer_long', 'catheter'],
    nonMdsComponents: ['CNA/Licensed/Total nurse staffing HPRD (PBJ) — Component Two (20%)'],
    clinicalShare: 'most',
    pool: '~$1.75B+ statewide (Year 8 confirmed $1.75B). Paid via STAR+PLUS MCO PMPM. Private facilities (≥65% Medicaid days) only access Components 2+3 = 40% of pool; Components 1+4 are NSGO-only.',
    notes: 'Per-metric Met/Not-Met: Met if beat the benchmark (TX mean for Comp 1/4, national mean for Comp 2/3) OR beat own escalating baseline (5/10/15/20% by quarter). Tiered fund release per component. 6 of these 10 are Five-Star; weight_loss, phq9_depression, antianxiety_hypnotic_rate, bb_new_worsened are state-only (surface ONLY under TX-QIP lens). Antipsychotic respecified Jan 2026.',
    sourceUrl: 'https://www.hhs.texas.gov/providers/long-term-care-providers/nursing-facilities-nf/quality-incentive-payment-program-qipp', confidence: 'high',
  },
  GA: {
    state: 'GA', active: true,
    programName: 'Georgia Supplemental Quality Incentive Payment', programYear: 'SFY2027 (CY2026-vs-CY2025)',
    scoring: 'decile_improvement', comparison: 'state_decile_improvement',
    measures: ['weight_loss', 'uti', 'antipsychotic_long', 'falls_major_injury'],
    nonMdsComponents: [],
    clinicalShare: 'all',
    pool: '~$115M (SFY2022 appropriation; current-year total unconfirmed). Provider-assessment/UPL-funded, lump-sum by decile.',
    notes: 'IMPROVEMENT-based: each measure’s YoY raw-rate change is decile-ranked among GA SNFs; lump-sum by decile, size-blind. Eligibility gate: ≥50% Medicaid long-term + good standing + improvement in ≥1 measure. All 4 are MDS so we cover the full scored set. Measure set shifted Oct 2023 (dropped pressure ulcer + antianxiety, added weight loss + falls). weight_loss is state-only (not Five-Star). NOTE the separate per-diem "Program B" (SPA 20-0011) scores different measures vs statewide average — not modeled here.',
    sourceUrl: 'https://dch.georgia.gov/providers/provider-types/nursing-home-providers/supplemental-quality-incentive-payments', confidence: 'high',
  },
  FL: {
    state: 'FL', active: true,
    programName: 'Florida NF-PPS Quality Incentive Program',
    programYear: 'Rate year 2026-10-01 – 2027-09-30 (SFY2027); earlier years in `fl/fl-qip-year-rules.ts`',
    scoring: 'percentile_bands', comparison: 'state_percentile',
    // N036 antianxiety_hypnotic_rate (not N033 _use) and N046 bb_new_worsened
    // (not the retired N025 low_risk_incontinence) — verified against AHCA's
    // own measure list; see `notes`.
    measures: ['uti', 'pressure_ulcer_long', 'falls_major_injury', 'antipsychotic_long', 'antianxiety_hypnotic_rate', 'physical_restraints', 'adl_decline', 'influenza_vaccine', 'bb_new_worsened'],
    nonMdsComponents: ['hospitalizations/1000d (claims)', 'RN turnover (PBJ)', 'direct-care / social-work / activity staffing', 'credentialing (CMS 5-star, Gold Seal, Joint Commission, AHCA award)'],
    clinicalShare: 'about_half',
    // The 17.862% did NOT sunset to 10% on July 1 2026: ch. 2026-233 s. 66 /
    // ch. 2026-236 s. 11 replaced it the same day with a higher figure.
    pool: '18.1373% of Sept-2016 non-property payments (ch. 2026-233, s. 66 / ch. 2026-236, s. 11, Laws of Fla. — 18.1373 percent (eff. 7/1/2026)). Competitive pool ÷ points × Medicaid days. Gate: 33 percent of all available points in the Medicaid Quality Incentive Program. Earlier and later rate years, with their chapter-law citations, are in `core/services/qm-planner/qip/fl/fl-qip-year-rules.ts`.',
    notes: 'State-percentile bands: ≥90th=3pts, 75-90th=2, 50-75th=1, <50th with ≥20% YoY improvement=0.5. Measure→ID mappings VERIFIED Jul-3-2026 against the live SimpleLTC FQIP tool (Lilac / Regents Park Winter Park) + FHCA "Medicaid VBP" deck: Falls=N013 falls_major_injury; Flu=N016 influenza_vaccine; UTI=N024 uti; Restraint=N027 physical_restraints; ADL=N028 adl_decline; Antianxiety/Hypnotic=N036 antianxiety_hypnotic_rate (Care-Compare variant WITH J1400/hospice exclusion — NOT N033 antianxiety_hypnotic_use); PU=N045 pressure_ulcer_long; Incontinence=N046 bb_new_worsened (New/Worsened Bowel-Bladder — NOT the retired N025 low_risk_incontinence); Antipsychotic=N047 antipsychotic_long. Performance period is CALENDAR-YTD cumulative (Jan 1→current qtr, Σnum/Σden), NOT trailing-4Q. Qualifying floor (AHCA\'s "lower limit") is PUBLISHED per rate year, not derived: 16.5 / 16 / 16.5 for Oct 2023 / 2024 / 2025 (AHCA Quality Incentive Report and Trends, Oct 2025, Tables II/IV/VI) against a constant 49-point maximum — 33% × 49 = 16.17 matches none of them, so the published number wins. Non-MDS (hospitalizations=claims, RN turnover=PBJ, 5-star, accreditation, staffing) come from NHC/Care-Compare. Max points = 49, CONFIRMED (AHCA Oct-2025 report, "a maximum of 49 total quality points"; Plan V.B.5.a "Total Quality Points Possible ... 49"). CMS 5-star scale 1/3/5 and the 5-point accreditation award confirmed against the same Plan section. See .context/fl-qip-recon-and-scope.md.',
    sourceUrl: 'https://www.flsenate.gov/Laws/Statutes/2026/409.908', confidence: 'high',
  },
  AL: {
    state: 'AL', active: true,
    programName: 'Alabama Medicaid NH Quality Incentive Program', programYear: '2025 rate year (SPA AL-24-0007)',
    scoring: 'national_avg_or_improvement', comparison: 'national_average',
    measures: ['influenza_vaccine', 'antipsychotic_long', 'physical_restraints', 'pressure_ulcer_short'],
    nonMdsComponents: ['Willingness-to-Recommend (NRC Health resident+family survey)'],
    clinicalShare: 'most',
    pool: '≥$5M/yr statutory floor. Pool ÷ points, weighted by Medicaid days, paid as a lump sum by Feb 1. Voluntary; 4-point floor to earn anything.',
    notes: 'Each measure scored vs CMS national average (tiered: at/above, +20%, +40% better) OR 0.75 pts for 10% YoY improvement. 5 MDS measures total: flu, PNEUMOCOCCAL (we have no evaluator — GAP), antipsychotic_long, physical_restraints, pressure_ulcer_short (SHORT-stay, not long). Plus the satisfaction survey (non-MDS). Pneumococcal would need a new evaluator to fully cover AL.',
    sourceUrl: 'https://law.justia.com/codes/alabama/title-40/chapter-26b/article-2/section-40-26b-26/', confidence: 'medium',
  },
  TN: {
    state: 'TN', active: true,
    programName: 'TennCare QuILTSS NF Value-Based Purchasing', programYear: 'QuILTSS #18 (CY2025 → rates Jul 1 2026)',
    scoring: 'benchmark_threshold', comparison: 'benchmark',
    measures: ['antipsychotic_long', 'antipsychotic_new', 'uti'],
    nonMdsComponents: ['Satisfaction (resident/family/staff CoreQ) — 35 pts', 'Culture change / quality of life (QBlue) — 30 pts', 'Staffing (RN/NA HPRD, retention, consistent assignment, training) — 25 pts', 'Bonus accreditations — 10 pts'],
    clinicalShare: 'small',
    pool: '≥$40M or 4% of NF expenditures (→10% cap); ~$10.55/Medicaid-day in the worked example. Tier multipliers + per-diem add-on.',
    notes: 'Clinical Performance is only 10 of 110 points — our 3 measures (antipsychotic_long, antipsychotic_new, uti) are the entire MDS slice; the other 100 pts are survey/staffing we cannot compute. QIP view here MUST be clearly labeled "clinical portion only." Exact numeric clinical benchmarks are not public (in facility score reports).',
    sourceUrl: 'https://publications.tnsosfiles.com/rules/1200/1200-13/1200-13-02.20221004.pdf', confidence: 'high',
  },
  WI: {
    state: 'WI', active: false,
    programName: 'Wisconsin — no CMS-QM Medicaid P4P', programYear: 'SFY2026',
    scoring: 'none', comparison: 'none',
    measures: [],
    nonMdsComponents: ['Behavioral/Cognitive-Impairment acuity incentive (raw MDS Section E/D/GG items — not a Five-Star QM scorecard)'],
    clinicalShare: 'small',
    pool: 'n/a (Beh/CI is a per-day acuity add-on: $7.27 × access + $0.69 × improvement, not a QM bonus).',
    notes: 'Wisconsin does NOT score the CMS Five-Star QMs for payment. The only MDS-quality-adjacent lever is the Beh/CI acuity/improvement incentive, which maps to none of our measure IDs. Show Five-Star only; no QIP toggle.',
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
 * bands + official CMS path + non-MDS inputs). The QIP destination and the QIP
 * lens only light up here — NOT on `hasActiveQip`, which is true for every state
 * with a program on paper (OH/TX/GA/AL/TN) even though we've only built the FL
 * scorer. Gating on `hasActiveQip` is what made an Ohio facility show the Florida
 * QIP view. Mirrors web/components/quality-measures/qip-programs.ts. Add a state's
 * scorer → add it here → its toggle appears. Registry-driven, no FL hardcode.
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
