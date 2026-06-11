/**
 * QIP-by-state registry — each state Medicaid nursing-facility quality-incentive
 * program, reduced to the part we can actually drive: the MDS-derived measures
 * our QM engine computes. Pure data (no React) so the web app AND the Chrome
 * extension can both import it.
 *
 * IMPORTANT FRAMING (read before trusting a number on a screen):
 *  - We only encode the MDS-clinical measures we compute. Every program also has
 *    non-MDS components (staffing/PBJ, survey/satisfaction, occupancy, claims,
 *    credentialing) we CANNOT compute — listed in `nonMdsComponents` so the UI
 *    can say "clinical portion only," never imply it's the whole program score.
 *  - Money-bearing thresholds, pool sizes, and per-point $ are state- and
 *    program-year-specific and several are mid-litigation or sunsetting. Treat
 *    every $ as "verify against the official program packet before go-live."
 *  - `measures` = the state's QIP measures that map to a QmMeasureId WE evaluate.
 *    A measure being absent means either the state doesn't score it OR we don't
 *    have an evaluator for it (e.g. AL pneumococcal) — see `notes`.
 *
 * Research provenance: deep-researched June 10 2026 from state Medicaid agencies
 * (TX HHSC, OH ODM/ORC 5165.26, GA DCH, FL AHCA 59G-6.010, AL §40-26B-26,
 * TN QuILTSS rule 1200-13-02-.11, WI DHS Methods of Implementation). Source URL
 * per entry; confidence flags where the live numbers weren't fully confirmable.
 */
import type { QmMeasureId } from '@core/types/qm-planner.types';

export type QipScoringModel =
  | 'five_star_points_div20' //  OH: CMS Five-Star QM points ÷20, summed
  | 'met_or_improvement' //      TX: per-metric Met if beat benchmark OR own escalating baseline
  | 'decile_improvement' //      GA: YoY raw-rate change, decile-ranked in-state
  | 'percentile_bands' //        FL: state-percentile bands (90/75/50th) → 3/2/1 pts
  | 'national_avg_or_improvement' // AL: at/above national avg (tiered) OR 10% YoY improvement
  | 'benchmark_threshold' //     TN: achievement vs TennCare benchmark (+ lesser improvement credit)
  | 'none'; //                   WI: no CMS-QM-based program

export type QipComparison =
  | 'national_percentile' //          OH (Five-Star is national-cutpoint based)
  | 'state_percentile' //             FL
  | 'state_decile_improvement' //     GA
  | 'state_or_national_mean' //       TX (Texas mean Comp 1/4, national mean Comp 2/3) + own-baseline improvement
  | 'national_average' //             AL
  | 'benchmark' //                    TN (mix of national + TN benchmarks)
  | 'none'; //                        WI

export interface QipProgram {
  state: string; // 2-letter
  /** False ⇒ no CMS-QM Medicaid P4P in this state ⇒ no QIP toggle, fall back to Five-Star only. */
  active: boolean;
  programName: string;
  /** Most recent confirmed program/state-fiscal year. */
  programYear: string;
  scoring: QipScoringModel;
  comparison: QipComparison;
  /** MDS measures we evaluate that COUNT toward this state's QIP. */
  measures: QmMeasureId[];
  /** Program components we cannot compute from MDS (staffing/survey/claims/credentialing/occupancy). */
  nonMdsComponents: string[];
  /** Rough share of the program's total score that is the MDS-clinical slice we cover. */
  clinicalShare: 'all' | 'most' | 'about_half' | 'small';
  /** $ magnitude note — directional, verify before display. */
  pool: string;
  notes: string;
  sourceUrl: string;
  confidence: 'high' | 'medium' | 'low';
}

export const QIP_PROGRAMS: Record<string, QipProgram> = {
  OH: {
    state: 'OH',
    active: true,
    programName: 'Ohio NF Medicaid Quality Incentive',
    programYear: 'SFY2026',
    scoring: 'five_star_points_div20',
    comparison: 'national_percentile',
    measures: [
      'pressure_ulcer_long',
      'uti',
      'walk_indep_worsened',
      'catheter',
      'adl_decline',
      'falls_major_injury',
      'antipsychotic_long',
    ],
    nonMdsComponents: ['occupancy (3 pts)', 'total nurse staffing HPRD (PBJ)'],
    clinicalShare: 'most',
    pool: '$125M/yr statutory floor; ~$1.14/point (pool ÷ statewide points, moves yearly); ~10-13% of Medicaid reimbursement. In active litigation (~$1B owed).',
    notes:
      'Score = Σ(CMS Five-Star QM points ÷20) over these 7 + occupancy + staffing. 25th-percentile statewide floor zeros the whole payment (40th in SFY2027 per HB 184). Per-measure QIP points = measurePoints(id, rate)/20 from qm-five-star.ts. All 7 are Five-Star measures. Antipsychotic is now claims+MDS hybrid (Jan 2026) — our MDS half only.',
    sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-5165.26',
    confidence: 'high',
  },
  TX: {
    state: 'TX',
    active: true,
    programName: 'Texas QIPP',
    programYear: 'SFY2026 (Year 9)',
    scoring: 'met_or_improvement',
    comparison: 'state_or_national_mean',
    measures: [
      'falls_major_injury',
      'uti',
      'weight_loss',
      'antipsychotic_long',
      'walk_indep_worsened',
      'phq9_depression',
      'antianxiety_hypnotic_use',
      'bb_new_worsened',
      'pressure_ulcer_long',
      'catheter',
    ],
    nonMdsComponents: ['CNA/Licensed/Total nurse staffing HPRD (PBJ) — Component Two (20%)'],
    clinicalShare: 'most',
    pool: '~$1.75B+ statewide (Year 8 confirmed $1.75B). Paid via STAR+PLUS MCO PMPM. Private facilities (≥65% Medicaid days) only access Components 2+3 = 40% of pool; Components 1+4 are NSGO-only.',
    notes:
      'Per-metric Met/Not-Met: Met if beat the benchmark (TX mean for Comp 1/4, national mean for Comp 2/3) OR beat own escalating baseline (5/10/15/20% by quarter). Tiered fund release per component. 6 of these 10 are Five-Star; weight_loss, phq9_depression, antianxiety_hypnotic_use, bb_new_worsened are state-only (surface ONLY under TX-QIP lens). Antipsychotic respecified Jan 2026.',
    sourceUrl: 'https://www.hhs.texas.gov/providers/long-term-care-providers/nursing-facilities-nf/quality-incentive-payment-program-qipp',
    confidence: 'high',
  },
  GA: {
    state: 'GA',
    active: true,
    programName: 'Georgia Supplemental Quality Incentive Payment',
    programYear: 'SFY2027 (CY2026-vs-CY2025)',
    scoring: 'decile_improvement',
    comparison: 'state_decile_improvement',
    measures: ['weight_loss', 'uti', 'antipsychotic_long', 'falls_major_injury'],
    nonMdsComponents: [],
    clinicalShare: 'all',
    pool: '~$115M (SFY2022 appropriation; current-year total unconfirmed). Provider-assessment/UPL-funded, lump-sum by decile.',
    notes:
      'IMPROVEMENT-based: each measure’s YoY raw-rate change is decile-ranked among GA SNFs; lump-sum by decile, size-blind. Eligibility gate: ≥50% Medicaid long-term + good standing + improvement in ≥1 measure. All 4 are MDS so we cover the full scored set. Measure set shifted Oct 2023 (dropped pressure ulcer + antianxiety, added weight loss + falls). weight_loss is state-only (not Five-Star). NOTE the separate per-diem "Program B" (SPA 20-0011) scores different measures vs statewide average — not modeled here.',
    sourceUrl: 'https://dch.georgia.gov/providers/provider-types/nursing-home-providers/supplemental-quality-incentive-payments',
    confidence: 'high',
  },
  FL: {
    state: 'FL',
    active: true,
    programName: 'Florida NF-PPS Quality Incentive Program',
    programYear: 'Rate year Oct 1 2025 – Sep 30 2026',
    scoring: 'percentile_bands',
    comparison: 'state_percentile',
    measures: [
      'uti',
      'pressure_ulcer_long',
      'falls_major_injury',
      'antipsychotic_long',
      'antianxiety_hypnotic_use',
      'physical_restraints',
      'adl_decline',
      'influenza_vaccine',
      'low_risk_incontinence',
    ],
    nonMdsComponents: [
      'hospitalizations/1000d (claims)',
      'RN turnover (PBJ)',
      'direct-care / social-work / activity staffing',
      'credentialing (CMS 5-star, Gold Seal, Joint Commission, AHCA award)',
    ],
    clinicalShare: 'about_half',
    pool: '17.862% of Sept-2016 non-property payments (temporary; SUNSETS to 10% July 1 2026 unless extended). Competitive pool ÷ points × Medicaid days. 33%-of-points gate to receive any payment (→20th percentile after sunset).',
    notes:
      'State-percentile bands: ≥90th=3pts, 75-90th=2, 50-75th=1, <50th with ≥20% YoY improvement=0.5. "Falls" assumed = falls-with-major-injury (verify). Incontinence → low_risk_incontinence. Flu → influenza_vaccine. Antianxiety/Hypnotic + Hospitalizations + RN Turnover are NEW in the July-8-2025 rule. Max-points ("~49") and credentialing cap NOT confirmed — verify against AHCA QIP report.',
    sourceUrl: 'http://flrules.elaws.us/fac/59g-6.010',
    confidence: 'medium',
  },
  AL: {
    state: 'AL',
    active: true,
    programName: 'Alabama Medicaid NH Quality Incentive Program',
    programYear: '2025 rate year (SPA AL-24-0007)',
    scoring: 'national_avg_or_improvement',
    comparison: 'national_average',
    measures: ['influenza_vaccine', 'antipsychotic_long', 'physical_restraints', 'pressure_ulcer_short'],
    nonMdsComponents: ['Willingness-to-Recommend (NRC Health resident+family survey)'],
    clinicalShare: 'most',
    pool: '≥$5M/yr statutory floor. Pool ÷ points, weighted by Medicaid days, paid as a lump sum by Feb 1. Voluntary; 4-point floor to earn anything.',
    notes:
      'Each measure scored vs CMS national average (tiered: at/above, +20%, +40% better) OR 0.75 pts for 10% YoY improvement. 5 MDS measures total: flu, PNEUMOCOCCAL (we have no evaluator — GAP), antipsychotic_long, physical_restraints, pressure_ulcer_short (SHORT-stay, not long). Plus the satisfaction survey (non-MDS). Pneumococcal would need a new evaluator to fully cover AL.',
    sourceUrl: 'https://law.justia.com/codes/alabama/title-40/chapter-26b/article-2/section-40-26b-26/',
    confidence: 'medium',
  },
  TN: {
    state: 'TN',
    active: true,
    programName: 'TennCare QuILTSS NF Value-Based Purchasing',
    programYear: 'QuILTSS #18 (CY2025 → rates Jul 1 2026)',
    scoring: 'benchmark_threshold',
    comparison: 'benchmark',
    measures: ['antipsychotic_long', 'antipsychotic_new', 'uti'],
    nonMdsComponents: [
      'Satisfaction (resident/family/staff CoreQ) — 35 pts',
      'Culture change / quality of life (QBlue) — 30 pts',
      'Staffing (RN/NA HPRD, retention, consistent assignment, training) — 25 pts',
      'Bonus accreditations — 10 pts',
    ],
    clinicalShare: 'small',
    pool: '≥$40M or 4% of NF expenditures (→10% cap); ~$10.55/Medicaid-day in the worked example. Tier multipliers + per-diem add-on.',
    notes:
      'Clinical Performance is only 10 of 110 points — our 3 measures (antipsychotic_long, antipsychotic_new, uti) are the entire MDS slice; the other 100 pts are survey/staffing we cannot compute. QIP view here MUST be clearly labeled "clinical portion only." Exact numeric clinical benchmarks are not public (in facility score reports).',
    sourceUrl: 'https://publications.tnsosfiles.com/rules/1200/1200-13/1200-13-02.20221004.pdf',
    confidence: 'high',
  },
  WI: {
    state: 'WI',
    active: false,
    programName: 'Wisconsin — no CMS-QM Medicaid P4P',
    programYear: 'SFY2026',
    scoring: 'none',
    comparison: 'none',
    measures: [],
    nonMdsComponents: ['Behavioral/Cognitive-Impairment acuity incentive (raw MDS Section E/D/GG items — not a Five-Star QM scorecard)'],
    clinicalShare: 'small',
    pool: 'n/a (Beh/CI is a per-day acuity add-on: $7.27 × access + $0.69 × improvement, not a QM bonus).',
    notes:
      'Wisconsin does NOT score the CMS Five-Star QMs for payment. The only MDS-quality-adjacent lever is the Beh/CI acuity/improvement incentive, which maps to none of our measure IDs. Show Five-Star only; no QIP toggle.',
    sourceUrl: 'https://www.forwardhealth.wi.gov/wiportal/content/provider/medicaid/NursingFacility/MethodsOfImplementation.pdf.spage',
    confidence: 'high',
  },
};

/** Program for a state (case-insensitive 2-letter), or null if we have no entry. */
export function qipForState(state: string | null | undefined): QipProgram | null {
  if (!state) return null;
  return QIP_PROGRAMS[state.toUpperCase()] ?? null;
}

/** The set of MDS measures that count toward a state's QIP (empty if no active program). */
export function qipMeasureSet(state: string | null | undefined): Set<QmMeasureId> {
  const p = qipForState(state);
  return new Set(p?.active ? p.measures : []);
}

/** Does this state have an active QIP toggle worth showing? */
export function hasActiveQip(state: string | null | undefined): boolean {
  return qipForState(state)?.active ?? false;
}
