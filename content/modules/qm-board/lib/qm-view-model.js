/**
 * QM Command Center view-model — framework-free presentation logic.
 *
 * Ported verbatim from the web app
 * (web/components/quality-measures/qm-view-model.ts, PR #626). Everything here
 * is pure (no Preact, no fetch) so it can be unit-tested via
 * scripts/test-qm-view-model.mjs. The components import these helpers; the test
 * imports them too. Keep it pure. TS types stripped for the JS bundle.
 */

// ── Bucketing ───────────────────────────────────────────────────────────────
/**
 * The honest worklist buckets the UI groups residents into. Driven entirely by
 * `clearProfile.actionability` (a measure-level property), never hand-assigned.
 *   clearable    — team can act today (GDR/d-c/remove/query) + fresh MDS
 *   trajectory   — clears only if the resident clinically improves
 *   cant_clear   — time-based; falls/UTI age out, no action accelerates
 *   locked       — locked to this stay/season
 *   coming_soon  — Phase-2 crossers (short-stay coding that will trip long-stay)
 * MeasureBucket = 'clearable' | 'trajectory' | 'cant_clear' | 'locked' | 'coming_soon'
 */
export function bucketForActionability(a) {
  switch (a) {
    case 'team_decision':
      return 'clearable';
    case 'clinical_trajectory':
      return 'trajectory';
    case 'time_only':
      return 'cant_clear';
    case 'stay_locked':
      return 'locked';
    default:
      return 'clearable';
  }
}

/**
 * Whether the what-if "Cleared" control is offerable. Only buckets where an
 * action (or the resident improving / being prevented) can move the measure.
 * For `cant_clear` and `locked`, the UI shows a disabled "Locked" pill instead.
 */
export function isWhatIfClearable(b) {
  return b === 'clearable' || b === 'trajectory' || b === 'coming_soon';
}

/**
 * The honest worklist split the VP actually cares about: *can anyone still do
 * anything about this?* It crosses two axes already present on a triggering
 * entry — whether a lever exists (`clearGuidance.actionType`) and how close the
 * cliff is (`cliffInfo.urgency`):
 *   at_risk    — a lever exists AND the cliff is near. The real worklist.
 *   clearable  — a lever exists, runway is still long.
 *   will_hit   — no lever this stay (time-only / locked). Destined to count no
 *                matter what; awareness/forecasting only, never a to-do.
 * StatusBucket = 'at_risk' | 'clearable' | 'will_hit'
 */

/**
 * Whether the team has a lever that can still move this measure before the
 * cliff. `clinical` (d/c med, remove device, heal), `modification` (re-code),
 * and `dx_query` (physician query) are levers; `time` (age-out), `stay_locked`,
 * and `none` are not — those are destined.
 */
export function entryIsActionable(entry) {
  const t = entry.clearGuidance?.actionType;
  return t === 'clinical' || t === 'modification' || t === 'dx_query';
}

/** Status bucket for a single triggering measure entry. */
export function statusBucketForEntry(entry) {
  if (!entryIsActionable(entry)) return 'will_hit';
  const u = entry.cliffInfo?.urgency ?? 'routine';
  if (u === 'at-risk' || u === 'urgent') return 'at_risk';
  if (u === 'routine') return 'clearable';
  return 'will_hit'; // actionable on paper but stay-locked timing — no path this stay
}

const STATUS_RANK = { at_risk: 0, clearable: 1, will_hit: 2 };

/** Sort key: at_risk (0) < clearable (1) < will_hit (2). */
export function statusRank(b) {
  return STATUS_RANK[b];
}

/**
 * Resident-level bucket = the most actionable+urgent across their triggering
 * measures. A resident lands in `at_risk` if *any* trigger is actionable and
 * near the cliff; `will_hit` only when *every* trigger is destined.
 */
export function statusBucketForRow(row) {
  let best = 'will_hit';
  for (const m of row.measures) {
    if (!m.triggers) continue;
    const b = statusBucketForEntry(m);
    if (STATUS_RANK[b] < STATUS_RANK[best]) best = b;
  }
  return best;
}

// ── Five-Star tag ───────────────────────────────────────────────────────────
/**
 * The 10 MDS-based measures that feed the CMS Care Compare Five-Star QM rating.
 * The other measures we compute are iQIES/state-survey only. Light honest tag;
 * no scoring.
 */
const FIVE_STAR_MDS = new Set([
  'adl_decline',
  'walk_indep_worsened',
  'pressure_ulcer_long',
  'catheter',
  'uti',
  'falls_major_injury',
  'antipsychotic_long',
  'discharge_function',
  'pressure_ulcer_short',
  'antipsychotic_new',
]);

export function isFiveStarMds(id) {
  return FIVE_STAR_MDS.has(id);
}

// ── Rate math ───────────────────────────────────────────────────────────────
/**
 * Facility observed rate for one measure. denominator = residents with a
 * qualifying target and not excluded (CMS "facility-level observed score"
 * population). Floors the denominator at 0 and never divides by zero.
 */
export function measureRate(c) {
  const den = Math.max(0, c.applicable - c.excluded);
  return { num: c.triggering, den, rate: den > 0 ? c.triggering / den : 0 };
}

/** Numerator after the what-if clears `clearedCount` residents. Floors at 0. */
export function projectedNum(num, clearedCount) {
  return Math.max(0, num - clearedCount);
}

/** Percentage form of a rate; 0 when the denominator is 0. */
export function ratePct(num, den) {
  return den > 0 ? (100 * num) / den : 0;
}

// ── Urgency tally (for the measure-tile dot strip) ──────────────────────────
export function urgencyTally(urgencies) {
  const t = {
    'at-risk': 0,
    urgent: 0,
    routine: 0,
    'stay-locked': 0,
  };
  for (const u of urgencies) t[u] = (t[u] ?? 0) + 1;
  return t;
}

// ── Measure presentation metadata (short labels + CMS codes) ────────────────
/**
 * Short, scannable labels + CMS measure codes (only the ones we're confident
 * of). Shared by the overview tiles, measure-detail header, and worklist pills
 * so the naming is DRY across surfaces.
 */
const MEASURE_META = {
  uti: { short: 'UTI', code: 'N024' },
  catheter: { short: 'Catheter', code: 'N026' },
  falls_major_injury: { short: 'Falls w/ Injury', code: 'N013' },
  antipsychotic_long: { short: 'Antipsychotic', code: 'N047' },
  weight_loss: { short: 'Weight Loss', code: 'N029' },
  pressure_ulcer_long: { short: 'Pressure Ulcer' },
  phq9_depression: { short: 'Depression', code: 'N030' },
  adl_decline: { short: 'ADL Decline' },
  physical_restraints: { short: 'Restraints', code: 'N027' },
  low_risk_incontinence: { short: 'Low-Risk Incont.' },
  discharge_function: { short: 'Discharge Function' },
  antipsychotic_new: { short: 'Antipsychotic (New)' },
  pressure_ulcer_short: { short: 'Pressure Ulcer (Short)' },
  influenza_vaccine: { short: 'Influenza' },
  antianxiety_hypnotic_rate: { short: 'Antianx Rate', code: 'N036' },
  antianxiety_hypnotic_use: { short: 'Antianx Use', code: 'N033' },
  falls_all: { short: 'Falls (Any)', code: 'N032' },
  behavior_symptoms: { short: 'Behavior', code: 'N034' },
  bb_new_worsened: { short: 'Bowel/Bladder', code: 'N046' },
  walk_indep_worsened: { short: 'Walk Indep.', code: 'N035' },
};

export function shortLabel(id, label) {
  return MEASURE_META[id]?.short ?? label.replace(/\s*\(.*$/, '').trim();
}
export function measureCode(id) {
  return MEASURE_META[id]?.code;
}

/**
 * MDS items that are Yes/No checkboxes — a coded `1` means "yes", `0` means
 * "no". Conservative allow-list: only items we're confident are boolean. A
 * value of 0/1 on anything NOT matched here (PHQ-9 total, weight-loss code,
 * restraint frequency, fall/ulcer counts) is left as the raw number, so we
 * never turn a real number into a misleading "Yes".
 */
const BOOLEAN_MDS = [
  /^N041[05]/, // medications received (antipsychotic, antianxiety, hypnotic, …)
  /^H0100/, // bladder/bowel appliances (indwelling catheter, ostomy, …)
  /^I[1-7]\d{3}/, // Section I active-diagnosis checkboxes (NOT I8000 write-ins)
  /^J1550/, // health conditions (fever, vomiting, dehydration, weight loss flag)
  /^J1700/, // history of falls
  /^J1800/, // any fall since admission/prior assessment
  /^E0100/, // hallucinations / delusions
  /^O0100/, // special treatments / programs
  /^O0250/, // influenza vaccine
  /^M104[05]/, // foot / other skin problems
  /^M1200/, // skin & ulcer treatments
  /^K0100/, // swallowing disorder signs
];

/**
 * Human-facing value for an MDS evidence cell. Yes/No for boolean checkboxes,
 * raw value for everything else (numeric scales, totals, codes, write-ins).
 */
export function displayMdsValue(mdsItem, value) {
  const v = value.trim();
  if (v !== '0' && v !== '1') return value;
  if (BOOLEAN_MDS.some((re) => re.test(mdsItem))) return v === '1' ? 'Yes' : 'No';
  return value;
}
