/**
 * QM Command Center view-model — framework-free presentation logic.
 *
 * Ported verbatim from the web app
 * (web/components/quality-measures/qm-view-model.ts, PR #626). Everything here
 * is pure (no Preact, no fetch) so it can be unit-tested via
 * scripts/test-qm-view-model.mjs. The components import these helpers; the test
 * imports them too. Keep it pure. TS types stripped for the JS bundle.
 */
import { qipMeasureSet } from './qip-programs.js';
import { deriveClearability } from './clearability.js';

// ── Clear group — the one honest axis ────────────────────────────────────────
/**
 * Lori's three worklist groups: the SINGLE classification the whole board, the
 * By-measure grid, and the drill-in all share. This replaces the two axes that
 * used to disagree on the same measure — the urgency-based
 * at_risk/clearable/will_hit and the actionability-based clearable/trajectory/…
 * (which, e.g., put ADL Decline in "will_hit / no lever" while the chip said
 * "clears next assessment").
 *
 *   clear_mds — the MDS coordinator can knock it off by scheduling an
 *               assessment (UTI, ADL Decline, Walk-Indep, Bowel/Bladder) or a
 *               pure re-code (Modification). The actionable, green group.
 *   clinical  — the clinical team / physician must act first (antipsychotic
 *               GDR, catheter Dx/DC, pressure-ulcer healing, weight/PHQ/…).
 *               Not the coordinator's to schedule away. Amber.
 *   locked    — counts no matter what this stay (Falls 275-day scan,
 *               stay-locked measures); FYI only, never a to-do. Slate.
 *
 * ClearGroup = 'clear_mds' | 'clinical' | 'locked'
 */
const CLEAR_GROUP_RANK = { clear_mds: 0, clinical: 1, locked: 2 };

/** Sort key: clear_mds (0) < clinical (1) < locked (2). */
export function clearGroupRank(g) {
  return CLEAR_GROUP_RANK[g];
}

/**
 * Measure-level group from the evaluator's `clearMechanism` — drives the
 * By-measure tile so the tile descriptor and the worklist rows always agree.
 */
export function clearGroupForMechanism(mech) {
  switch (mech) {
    case 'time_only': // UTI — 30-day window can be re-ARD'd past
    case 'next_target_compare': // ADL, Walk-Indep, Bowel/Bladder — next target re-baselines
      return 'clear_mds';
    case 'discontinue_medication': // antipsychotic, antianxiety, hypnotic
    case 'remove_device': // catheter
    case 'heal_wound': // pressure ulcer
    case 'change_clinical_state': // weight, PHQ-9, restraints, behavior
      return 'clinical';
    case 'time_lookback_scan': // Falls — can't accelerate the 275-day scan
    case 'stay_locked': // antipsychotic-new, PU-short, DFS, influenza
      return 'locked';
    default:
      return 'clinical';
  }
}

/**
 * Resident-level group for one triggering entry. Reads the backend-derived
 * `clearability` (single source of truth; falls back to deriving it from the
 * action type for older responses). `time_based` splits on cliffType: a
 * lookback scan (Falls) is locked, but a point-in-time window (UTI) or a
 * comparison (ADL/Walk/B&B) is MDS-clearable.
 */
export function clearGroupForEntry(entry) {
  const c = entry.clearability ?? deriveClearability(entry.clearGuidance?.actionType);
  switch (c) {
    case 'needs_clinical':
    case 'needs_query':
      return 'clinical';
    case 'clear_now':
      return 'clear_mds';
    case 'time_based':
      return entry.cliffInfo?.cliffType === 'lookback_scan' ? 'locked' : 'clear_mds';
    case 'stay_locked':
    case 'none':
    default:
      return 'locked';
  }
}

/** Most-actionable group across a resident's triggering measures. */
export function clearGroupForRow(row) {
  let best = 'locked';
  for (const m of row.measures) {
    if (!m.triggers) continue;
    const g = clearGroupForEntry(m);
    if (CLEAR_GROUP_RANK[g] < CLEAR_GROUP_RANK[best]) best = g;
  }
  return best;
}

/**
 * Whether a clear_mds entry can clear within the CURRENT quarter — the green
 * "this quarter" vs "next quarter (misses the cutoff)" split. Uses the earliest
 * clearing ARD / time-window clear date when known; a comparison measure with
 * no computed window yet is assumed schedulable this quarter.
 *
 * Both args are ISO YYYY-MM-DD, so the lexical compare is a correct date compare.
 */
export function clearsThisQuarter(entry, quarterEndIso) {
  const ref = entry.cliffInfo?.earliestClearDate ?? entry.clearGuidance?.clearDate ?? null;
  return ref ? ref <= quarterEndIso : true;
}

/**
 * Row-level green split: whether a resident has at least one MDS-clearable
 * (clear_mds) trigger that clears on/before the quarter lock. Drives the green
 * group's "This quarter · do now" vs "Next quarter only" partition (and Focus
 * mode's "Clear this week"). Clinical / locked triggers don't count — the MDS
 * coordinator can't move them this quarter.
 */
export function rowClearsThisQuarter(row, quarterEndIso) {
  return row.measures.some(
    (m) => m.triggers && clearGroupForEntry(m) === 'clear_mds' && clearsThisQuarter(m, quarterEndIso)
  );
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

/**
 * Which measure-set the "By measure" grid is showing:
 *   five_star — the 10 MDS Five-Star QMs (default; the iQIES star measures)
 *   qip       — the active state's QIP measures (Medicaid $ — varies by state)
 *   both      — the union
 * Measures that are neither Five-Star nor in this state's QIP (state-survey-only
 * noise like Falls-Any / Behavior) never show under any lens. QmLens =
 * 'five_star' | 'qip' | 'both'.
 */
export function measureInLens(id, lens, state) {
  const five = isFiveStarMds(id);
  if (lens === 'five_star') return five;
  const inQip = qipMeasureSet(state).has(id);
  if (lens === 'qip') return inQip;
  return five || inQip; // both
}

/**
 * Reduce a resident row to one lens: drop measures not in the lens and recompute
 * `triggeringCount`. This is what makes the lens drive the WHOLE dashboard — the
 * hero count, the At-risk / Clearable / Will-hit buckets, and the per-resident
 * pills — not just the measure-tile grid. A resident whose only triggers are
 * state-survey noise (Depression, Antianx, Falls-Any) drops to 0 under Five-Star.
 */
export function rowForLens(row, lens, state) {
  const measures = row.measures.filter((m) => measureInLens(m.id, lens, state));
  return { ...row, measures, triggeringCount: measures.filter((m) => m.triggers).length };
}

/** Same idea for a day-101 crosser: keep only projected hits in the lens. */
export function crosserForLens(crosser, lens, state) {
  return {
    ...crosser,
    projectedHits: crosser.projectedHits.filter((h) => measureInLens(h.id, lens, state)),
  };
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

// ── What-if scoping (superapp PR #654) ──────────────────────────────────────
/**
 * A short-stay resident only counts toward a measure once they reach long-stay
 * (day-101); if that crossing falls after the quarter locks, they become
 * long-stay in the NEXT quarter and cannot move the current quarter's rate at
 * all. Both args are ISO `YYYY-MM-DD`, so a lexical compare is a correct date
 * compare.
 */
export function crosserCountsThisQuarter(crossingDate, quarterEndIso) {
  return crossingDate <= quarterEndIso;
}

/**
 * PatientIds of residents the what-if can pre-clear **for free** — the trigger
 * is purely a coding error correctable by an MDS Modification (`actionType ===
 * 'modification'`), needing NO clinical change, NO physician query, and NO wait.
 *
 * This is the ONLY honest default-seed set. `nextObraPreview.wouldClear` is the
 * wrong signal: it's `true` on antipsychotic and pressure-ulcer (both
 * `actionType: 'clinical'`) because it assumes the new MDS is coded clean — i.e.
 * it presumes the drug was stopped / the wound healed, projecting a fake 0%. So
 * the seed is restricted to `modification`; clinical / dx_query / time-based /
 * stay-locked triggers are never auto-resolved (the nurse can still toggle them
 * by hand). No standard evaluator emits `modification`, so in practice this is
 * empty and the what-if opens clean.
 */
export function reCodeClearableIds(patients, measureId) {
  const out = [];
  for (const p of patients) {
    const e = p.measures.find((m) => m.id === measureId);
    if (e?.triggers && e.clearGuidance?.actionType === 'modification') out.push(p.patientId);
  }
  return out;
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
