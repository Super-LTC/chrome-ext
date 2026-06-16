#!/usr/bin/env node
/**
 * TDD for the pure DFS per-item row builder (buildDfsStayItemRows) — the zip the
 * explorer + outcome modals render. No Preact, no fetch.
 *
 * Usage: node scripts/test-dfs-stay-item-rows.mjs
 */
import { buildDfsStayItemRows } from '../content/modules/qm-board/lib/build-stay-item-rows.js';
import { DFS_GG_ORDER, dfsGgLabel } from '../content/modules/qm-board/lib/gg-item-labels.js';

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got !== undefined ? `\n        got ${JSON.stringify(got)}` : ''}`); fail++; }
}

const raw = (value) => ({ value, source: 'raw' });
const imp = (value) => ({ value, source: 'imputed' });

// ── walk locomotion: only items present in either breakdown appear, in order ──
{
  const admission = { perItem: {
    GG0130A: raw(3), GG0130B: raw(4), GG0170J: imp(2.4),
  } };
  const discharge = { perItem: {
    GG0130A: raw(5), GG0130B: raw(4), GG0170J: raw(4),
  } };
  const rows = buildDfsStayItemRows({ admission, discharge });
  check('3 items present', rows.length === 3, rows.length);
  check('ordered self-care first', rows.map((r) => r.code).join(',') === 'GG0130A,GG0130B,GG0170J', rows.map((r) => r.code));
  check('label resolved', rows[0].label === 'Eating', rows[0].label);
  check('delta computed', rows[0].delta === 2, rows[0].delta);
  check('no-change delta = 0', rows[1].delta === 0, rows[1].delta);
  check('admissionImputed flag', rows[2].admissionImputed === true && rows[2].dischargeImputed === false, rows[2]);
  check('continuous admission kept raw (round at display)', rows[2].admission === 2.4, rows[2].admission);
}

// ── wheel locomotion: GG0170R present, walk slots absent ──
{
  const admission = { perItem: { GG0170R: raw(2), GG0130A: raw(3) } };
  const rows = buildDfsStayItemRows({ admission, discharge: null });
  check('wheel slot present', rows.some((r) => r.code === 'GG0170R'), rows.map((r) => r.code));
  check('walk slots absent', !rows.some((r) => r.code === 'GG0170J' || r.code === 'GG0170I'));
  check('discharge null → delta null', rows.every((r) => r.delta === null), rows.map((r) => r.delta));
  check('wheel label', dfsGgLabel('GG0170R') === 'Wheel 50 feet with two turns');
}

// ── admission-only (explorer): discharge null everywhere ──
{
  const admission = { perItem: { GG0130A: raw(1), GG0130C: imp(2.7) } };
  const rows = buildDfsStayItemRows({ admission, discharge: null });
  check('admission-only keeps admission', rows[0].admission === 1 && rows[0].discharge === null, rows[0]);
  check('item not scored is skipped', rows.length === 2, rows.length);
}

// ── empty input → empty rows ──
check('empty → []', buildDfsStayItemRows({ admission: null, discharge: null }).length === 0);

// ── order list sanity ──
check('DFS_GG_ORDER has 11 slots', DFS_GG_ORDER.length === 11, DFS_GG_ORDER.length);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
