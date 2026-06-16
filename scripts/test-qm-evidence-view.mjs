#!/usr/bin/env node
/**
 * TDD for the QM drill-in GG evidence translation — the pure pairing/labeling
 * that turns the raw paired GG rows (target `GG…1` + prior `GG…3`, each item
 * twice) into one before→after line per declining item. No Preact, no DB.
 *
 * Usage: node scripts/test-qm-evidence-view.mjs
 */
import {
  ggComparisonLines,
  isGgComparisonMeasure,
} from '../content/modules/qm-board/lib/qm-evidence-view.js';

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got !== undefined ? `\n        got ${JSON.stringify(got)}` : ''}`); fail++; }
}

/** One raw evidence row. */
function ev(mdsItem, value, note, assessmentType, ard) {
  return { mdsItem, value, note: note ?? null, assessmentType: assessmentType ?? null, assessmentArdDate: ard ?? null, assessmentId: 'a' };
}

// ── isGgComparisonMeasure ─────────────────────────────────────────────────────
check('adl_decline is a GG comparison measure', isGgComparisonMeasure('adl_decline') === true);
check('walk_indep_worsened is a GG comparison measure', isGgComparisonMeasure('walk_indep_worsened') === true);
check('uti is NOT a GG comparison measure', isGgComparisonMeasure('uti') === false);
check('bb_new_worsened is NOT a GG comparison measure', isGgComparisonMeasure('bb_new_worsened') === false);

// ── ggComparisonLines: pairing target + prior by base key ─────────────────────
{
  const evidence = [
    ev('GG0170I1', '01', 'Target 1 vs prior 4 (decline of 3)', '5-Day PPS', '2026-05-28'),
    ev('GG0170I3', '04', 'Prior value for comparison', null, '2026-04-09'),
    ev('GG0170B1', '01', 'Target 1 vs prior 2 (decline of 1)', '5-Day PPS', '2026-05-28'),
    ev('GG0170B3', '02', 'Prior value for comparison', null, '2026-04-09'),
  ];
  const view = ggComparisonLines(evidence);
  check('two declining items paired', view.lines.length === 2, view.lines.length);
  check('biggest drop first (Walk drop 3)', view.lines[0].baseKey === 'GG0170I' && view.lines[0].drop === 3, view.lines[0]);
  check('Walk name + before→after labels', view.lines[0].name === 'Walk 10 Feet' && view.lines[0].priorLabel === 'Supervision' && view.lines[0].nowLabel === 'Dependent', view.lines[0]);
  check('second item Sit to Lying drop 1', view.lines[1].baseKey === 'GG0170B' && view.lines[1].drop === 1, view.lines[1]);
  check('header carries target type + ARDs', view.targetType === '5-Day PPS' && view.targetArd === '2026-05-28' && view.priorArd === '2026-04-09', view);
}

// ── recode: 88 ("not attempted") is dependent-equivalent (1), not a high number ─
{
  const evidence = [
    ev('GG0130A1', '88', 'Target', '5-Day PPS', '2026-05-28'), // recodes to 1
    ev('GG0130A3', '06', 'Prior value', null, '2026-04-09'),    // Independent = 6
  ];
  const view = ggComparisonLines(evidence);
  check('88 recodes to dependent: drop = 6 - 1 = 5', view.lines[0].drop === 5, view.lines[0]);
  check('88 labels as "Not attempted" (not a 88-point score)', view.lines[0].nowLabel === 'Not attempted', view.lines[0]);
}

// ── unpaired rows + non-GG evidence are ignored ───────────────────────────────
{
  const evidence = [
    ev('GG0170I1', '01', 'Target', '5-Day PPS', '2026-05-28'), // no matching prior
    ev('H0300', '1', 'bowel continence'),                       // non-GG, ignored
  ];
  const view = ggComparisonLines(evidence);
  check('unpaired target dropped; non-GG ignored → no lines', view.lines.length === 0, view.lines);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
