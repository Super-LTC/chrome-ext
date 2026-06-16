#!/usr/bin/env node
/**
 * TDD for the QM Command Center view-model — the pure presentation helpers that
 * drive bucketing, the Five-Star tag, rate math, and the what-if recompute. No
 * Preact, no DB; this is the testable core of the UI.
 *
 * Ported from ../superltc scripts/test-qm-view-model.ts (PR #626).
 * Usage: node scripts/test-qm-view-model.mjs
 */
import {
  clearGroupForEntry,
  clearGroupForRow,
  clearGroupForMechanism,
  clearGroupRank,
  clearsThisQuarter,
  rowClearsThisQuarter,
  isFiveStarMds,
  measureRate,
  projectedNum,
  ratePct,
  urgencyTally,
  shortLabel,
  measureCode,
  displayMdsValue,
  measureInLens,
} from '../content/modules/qm-board/lib/qm-view-model.js';
import { hasActiveQip, qipMeasureSet } from '../content/modules/qm-board/lib/qip-programs.js';

/** Minimal triggering entry for bucketing tests. actionType `null` = no guidance. */
function mkEntry(actionType, urgency) {
  return {
    id: 'uti',
    label: '',
    applicable: true,
    triggers: true,
    excluded: false,
    evidence: [],
    clearGuidance: actionType
      ? { actionType, clearsOnNextObra: false, actions: [] }
      : undefined,
    cliffInfo: {
      cliffDate: '2026-06-30',
      cliffLabel: '',
      cliffType: 'point_in_time',
      daysUntilCliff: 5,
      clearableBeforeCliff: true,
      urgency,
      clearPathLabel: '',
    },
  };
}

function mkRow(measures) {
  return {
    patientId: 'p',
    externalPatientId: null,
    firstName: null,
    lastName: null,
    admissionDate: null,
    payerClassification: null,
    stayType: 'long',
    currentMedicareDay: null,
    cdif: 120,
    target: null,
    measures,
    triggeringCount: measures.filter((m) => m.triggers).length,
    nextObraPreview: { wouldClear: [], wouldNotClear: [] },
  };
}

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got !== undefined ? `\n        got ${JSON.stringify(got)}` : ''}`); fail++; }
}

// ── clearGroupForMechanism (By-measure tile axis) ───────────────────────────
check('time_only → clear_mds', clearGroupForMechanism('time_only') === 'clear_mds');
check('next_target_compare → clear_mds', clearGroupForMechanism('next_target_compare') === 'clear_mds');
check('discontinue_medication → clinical', clearGroupForMechanism('discontinue_medication') === 'clinical');
check('remove_device → clinical', clearGroupForMechanism('remove_device') === 'clinical');
check('heal_wound → clinical', clearGroupForMechanism('heal_wound') === 'clinical');
check('change_clinical_state → clinical', clearGroupForMechanism('change_clinical_state') === 'clinical');
check('time_lookback_scan → locked', clearGroupForMechanism('time_lookback_scan') === 'locked');
check('stay_locked → locked', clearGroupForMechanism('stay_locked') === 'locked');
check('undefined → clinical (safe default)', clearGroupForMechanism(undefined) === 'clinical');

// ── clearGroupRank ──────────────────────────────────────────────────────────
check('rank clear_mds < clinical < locked', clearGroupRank('clear_mds') < clearGroupRank('clinical') && clearGroupRank('clinical') < clearGroupRank('locked'));

// ── isFiveStarMds ───────────────────────────────────────────────────────────
check('antipsychotic_long is Five-Star MDS', isFiveStarMds('antipsychotic_long') === true);
check('catheter is Five-Star MDS', isFiveStarMds('catheter') === true);
check('discharge_function is Five-Star MDS', isFiveStarMds('discharge_function') === true);
check('antianxiety_hypnotic_use is NOT Five-Star MDS', isFiveStarMds('antianxiety_hypnotic_use') === false);
check('falls_all is NOT Five-Star MDS', isFiveStarMds('falls_all') === false);

// ── measureRate ─────────────────────────────────────────────────────────────
{
  const r = measureRate({ triggering: 6, excluded: 2, applicable: 60 });
  check('rate num/den exclude-adjusted', r.num === 6 && r.den === 58 && Math.abs(r.rate - 6 / 58) < 1e-9, r);
}
{
  const r = measureRate({ triggering: 0, excluded: 0, applicable: 0 });
  check('rate no divide-by-zero', r.num === 0 && r.den === 0 && r.rate === 0, r);
}
{
  const r = measureRate({ triggering: 3, excluded: 10, applicable: 5 });
  check('rate den floors at 0 (excluded > applicable)', r.den === 0 && r.rate === 0, r);
}

// ── projectedNum ────────────────────────────────────────────────────────────
check('projectedNum 6-2=4', projectedNum(6, 2) === 4);
check('projectedNum floors at 0', projectedNum(1, 5) === 0);

// ── ratePct ─────────────────────────────────────────────────────────────────
check('ratePct 6/58', Math.abs(ratePct(6, 58) - (100 * 6) / 58) < 1e-9);
check('ratePct 0 den → 0', ratePct(3, 0) === 0);

// ── urgencyTally ────────────────────────────────────────────────────────────
{
  const t = urgencyTally(['at-risk', 'at-risk', 'routine', 'stay-locked']);
  check('urgencyTally counts', t['at-risk'] === 2 && t.routine === 1 && t['stay-locked'] === 1 && t.urgent === 0, t);
}
{
  const t = urgencyTally([]);
  check('urgencyTally empty all-zero', t['at-risk'] === 0 && t.urgent === 0 && t.routine === 0 && t['stay-locked'] === 0, t);
}

// ── clearGroupForEntry (falls back to deriveClearability(actionType)) ───────
// mkEntry sets cliffType 'point_in_time', so a `time` trigger is NOT a lookback
// scan → clear_mds (MDS-clearable). A Falls lookback scan would be locked.
check('modification → clear_mds (pure re-code)', clearGroupForEntry(mkEntry('modification', 'routine')) === 'clear_mds');
check('time (point_in_time, e.g. UTI) → clear_mds', clearGroupForEntry(mkEntry('time', 'at-risk')) === 'clear_mds');
check('clinical → clinical (clinical team must act)', clearGroupForEntry(mkEntry('clinical', 'urgent')) === 'clinical');
check('dx_query → clinical (needs a query)', clearGroupForEntry(mkEntry('dx_query', 'routine')) === 'clinical');
check('stay_locked → locked', clearGroupForEntry(mkEntry('stay_locked', 'routine')) === 'locked');
check('none / missing guidance → locked', clearGroupForEntry(mkEntry(null, 'at-risk')) === 'locked');
{
  const falls = mkEntry('time', 'routine');
  falls.cliffInfo.cliffType = 'lookback_scan';
  check('time + lookback_scan (Falls) → locked', clearGroupForEntry(falls) === 'locked');
}
{
  const e = mkEntry('clinical', 'routine');
  e.clearability = 'clear_now'; // backend field wins over actionType fallback
  check('backend clearability overrides actionType', clearGroupForEntry(e) === 'clear_mds');
}

// ── clearGroupForRow (best across a resident's triggers) ────────────────────
check('row with a clear_mds trigger → clear_mds', clearGroupForRow(mkRow([mkEntry('stay_locked', 'routine'), mkEntry('modification', 'routine')])) === 'clear_mds');
check('row best is clinical (no green)', clearGroupForRow(mkRow([mkEntry('stay_locked', 'routine'), mkEntry('clinical', 'routine')])) === 'clinical');
check('row of only locked triggers → locked', clearGroupForRow(mkRow([mkEntry('stay_locked', 'routine'), mkEntry('none', 'routine')])) === 'locked');
check('row ignores non-triggering measures', clearGroupForRow(mkRow([{ ...mkEntry('modification', 'routine'), triggers: false }, mkEntry('stay_locked', 'routine')])) === 'locked');

// ── clearsThisQuarter (green this-q vs next-q split) ─────────────────────────
{
  const e = mkEntry('time', 'routine');
  e.cliffInfo.earliestClearDate = '2026-06-20';
  check('earliest before quarter-end → this quarter', clearsThisQuarter(e, '2026-06-30') === true);
  e.cliffInfo.earliestClearDate = '2026-07-15';
  check('earliest after quarter-end → next quarter', clearsThisQuarter(e, '2026-06-30') === false);
}
check('no earliest/clearDate → assume this quarter', clearsThisQuarter(mkEntry('modification', 'routine'), '2026-06-30') === true);

// ── rowClearsThisQuarter (row-level green split) ─────────────────────────────
{
  // A clear_mds trigger (time + point_in_time) that clears before the lock → true.
  const soon = mkEntry('time', 'routine');
  soon.cliffInfo.earliestClearDate = '2026-06-20';
  check('row with a green trigger clearing this quarter → true', rowClearsThisQuarter(mkRow([soon]), '2026-06-30') === true);

  // Same green trigger but clearing after the lock → false.
  const late = mkEntry('time', 'routine');
  late.cliffInfo.earliestClearDate = '2026-07-15';
  check('row whose only green trigger clears next quarter → false', rowClearsThisQuarter(mkRow([late]), '2026-06-30') === false);

  // A clinical trigger that "clears" this quarter does NOT count (not the coordinator's lever).
  const clinical = mkEntry('clinical', 'routine');
  clinical.cliffInfo.earliestClearDate = '2026-06-20';
  check('clinical trigger never counts toward this-quarter green', rowClearsThisQuarter(mkRow([clinical]), '2026-06-30') === false);

  // Mixed: a late-green + a this-quarter-green → true (some()).
  check('row with any this-quarter green trigger → true', rowClearsThisQuarter(mkRow([late, soon]), '2026-06-30') === true);
}

// ── shortLabel / measureCode ────────────────────────────────────────────────
check('shortLabel known id wins over server label', shortLabel('antipsychotic_long', 'Antipsychotic Medication (long-stay)') === 'Antipsychotic');
check('shortLabel unmapped strips paren', shortLabel('__unmapped__', 'Some Measure (extra)') === 'Some Measure');
check('measureCode known', measureCode('catheter') === 'N026');
check('measureCode missing → undefined', measureCode('adl_decline') === undefined);

// ── displayMdsValue ─────────────────────────────────────────────────────────
check('N0415A1=1 → Yes', displayMdsValue('N0415A1', '1') === 'Yes');
check('N0415A1=0 → No', displayMdsValue('N0415A1', '0') === 'No');
check('H0100A=1 → Yes', displayMdsValue('H0100A', '1') === 'Yes');
check('I6000=0 → No (Section I dx checkbox)', displayMdsValue('I6000', '0') === 'No');
check('J1800=1 → Yes (any fall)', displayMdsValue('J1800', '1') === 'Yes');
check('E0100A=1 → Yes (hallucinations)', displayMdsValue('E0100A', '1') === 'Yes');
check('O0250A=1 → Yes (flu vaccine)', displayMdsValue('O0250A', '1') === 'Yes');
check('D0160=13 → 13 (PHQ-9 total)', displayMdsValue('D0160', '13') === '13');
check('K0300=2 → 2 (weight-loss code)', displayMdsValue('K0300', '2') === '2');
check('D0150A2=2 → 2 (frequency scale)', displayMdsValue('D0150A2', '2') === '2');
check('P0100E=2 → 2 (restraint frequency)', displayMdsValue('P0100E', '2') === '2');
check('J1900C=1 → 1 (fall count, not allow-listed)', displayMdsValue('J1900C', '1') === '1');
check('M0300B1=1 → 1 (ulcer count, not allow-listed)', displayMdsValue('M0300B1', '1') === '1');
check('I8000=— → — (write-in untouched)', displayMdsValue('I8000', '—') === '—');

// ── measureInLens / QIP registry ────────────────────────────────────────────
check('five_star lens = Five-Star MDS only', measureInLens('uti', 'five_star', 'OH') === true && measureInLens('weight_loss', 'five_star', 'TX') === false);
check('qip lens = state QIP set (OH uti)', measureInLens('uti', 'qip', 'OH') === true);
check('qip lens excludes non-QIP (OH weight_loss)', measureInLens('weight_loss', 'qip', 'OH') === false);
check('qip lens surfaces state-only (TX weight_loss)', measureInLens('weight_loss', 'qip', 'TX') === true);
check('both lens = union (TX weight_loss in)', measureInLens('weight_loss', 'both', 'TX') === true);
check('both lens keeps Five-Star (TX uti)', measureInLens('uti', 'both', 'TX') === true);
check('no-QIP state → qip lens empty (WI)', measureInLens('uti', 'qip', 'WI') === false);
check('no state → five_star fallback only', measureInLens('uti', 'qip', null) === false && measureInLens('uti', 'five_star', null) === true);
check('state-survey-only never in any lens (falls_all)', measureInLens('falls_all', 'both', 'TX') === false);
check('hasActiveQip OH true, WI false, null false', hasActiveQip('OH') === true && hasActiveQip('WI') === false && hasActiveQip(null) === false);
check('hasActiveQip case-insensitive', hasActiveQip('oh') === true);
check('qipMeasureSet TX size 10', qipMeasureSet('TX').size === 10);
check('qipMeasureSet WI empty', qipMeasureSet('WI').size === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
