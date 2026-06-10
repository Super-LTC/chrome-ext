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
  bucketForActionability,
  isWhatIfClearable,
  isFiveStarMds,
  measureRate,
  projectedNum,
  ratePct,
  urgencyTally,
  shortLabel,
  measureCode,
  entryIsActionable,
  statusBucketForEntry,
  statusBucketForRow,
  displayMdsValue,
} from '../content/modules/qm-board/lib/qm-view-model.js';

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

// ── bucketForActionability ──────────────────────────────────────────────────
check('team_decision → clearable', bucketForActionability('team_decision') === 'clearable');
check('time_only → cant_clear', bucketForActionability('time_only') === 'cant_clear');
check('clinical_trajectory → trajectory', bucketForActionability('clinical_trajectory') === 'trajectory');
check('stay_locked → locked', bucketForActionability('stay_locked') === 'locked');
check('undefined → clearable (safe default)', bucketForActionability(undefined) === 'clearable');

// ── isWhatIfClearable ───────────────────────────────────────────────────────
check('clearable is what-if clearable', isWhatIfClearable('clearable') === true);
check('trajectory is what-if clearable', isWhatIfClearable('trajectory') === true);
check('coming_soon is what-if clearable', isWhatIfClearable('coming_soon') === true);
check('cant_clear is NOT what-if clearable', isWhatIfClearable('cant_clear') === false);
check('locked is NOT what-if clearable', isWhatIfClearable('locked') === false);

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

// ── entryIsActionable ───────────────────────────────────────────────────────
check('clinical actionType is actionable', entryIsActionable(mkEntry('clinical', 'urgent')) === true);
check('modification actionType is actionable', entryIsActionable(mkEntry('modification', 'routine')) === true);
check('dx_query actionType is actionable', entryIsActionable(mkEntry('dx_query', 'routine')) === true);
check('time actionType is NOT actionable', entryIsActionable(mkEntry('time', 'at-risk')) === false);
check('stay_locked actionType is NOT actionable', entryIsActionable(mkEntry('stay_locked', 'routine')) === false);
check('none actionType is NOT actionable', entryIsActionable(mkEntry('none', 'at-risk')) === false);
check('missing guidance is NOT actionable', entryIsActionable(mkEntry(null, 'at-risk')) === false);

// ── statusBucketForEntry ────────────────────────────────────────────────────
check('clinical + at-risk → at_risk', statusBucketForEntry(mkEntry('clinical', 'at-risk')) === 'at_risk');
check('clinical + urgent → at_risk', statusBucketForEntry(mkEntry('clinical', 'urgent')) === 'at_risk');
check('dx_query + routine → clearable', statusBucketForEntry(mkEntry('dx_query', 'routine')) === 'clearable');
check('time + at-risk → will_hit (destined, not at_risk)', statusBucketForEntry(mkEntry('time', 'at-risk')) === 'will_hit');
check('stay_locked actionType → will_hit', statusBucketForEntry(mkEntry('stay_locked', 'routine')) === 'will_hit');
check('none actionType → will_hit', statusBucketForEntry(mkEntry('none', 'at-risk')) === 'will_hit');
check('actionable but stay-locked urgency → will_hit', statusBucketForEntry(mkEntry('clinical', 'stay-locked')) === 'will_hit');

// ── statusBucketForRow (best across a resident's triggers) ───────────────────
check('row with an actionable-near trigger → at_risk', statusBucketForRow(mkRow([mkEntry('time', 'at-risk'), mkEntry('clinical', 'at-risk')])) === 'at_risk');
check('row actionable-but-runway → clearable', statusBucketForRow(mkRow([mkEntry('time', 'at-risk'), mkEntry('clinical', 'routine')])) === 'clearable');
check('row of only destined triggers → will_hit', statusBucketForRow(mkRow([mkEntry('time', 'at-risk'), mkEntry('stay_locked', 'routine')])) === 'will_hit');
check('row ignores non-triggering measures', statusBucketForRow(mkRow([{ ...mkEntry('clinical', 'at-risk'), triggers: false }, mkEntry('time', 'at-risk')])) === 'will_hit');

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
