#!/usr/bin/env node
/**
 * TDD for the two pure view-helpers added in the UX redesign:
 *   - dfsTileStats (qm-dfs-view.js)  — rate-led DFS tile numbers
 *   - groupLever   (qm-simulator-view.js) — "N movable · up to +Y pts"
 *
 * Usage: node scripts/test-qm-redesign-views.mjs
 */
import { dfsTileStats } from '../content/modules/qm-board/lib/qm-dfs-view.js';
import { groupLever } from '../content/modules/qm-board/lib/qm-simulator-view.js';

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got !== undefined ? `\n        got ${JSON.stringify(got)}` : ''}`); fail++; }
}

// ── dfsTileStats ──
{
  const s = dfsTileStats({ live: { rate: 0.62, denominator: 13 }, nationalRate: 0.575 });
  check('rate → 62.0%', s.ratePct === 62, s.ratePct);
  check('vs national +5 (0.62−0.575=4.5→5)', s.vsNationalPts === 5, s.vsNationalPts);
  check('discharges passthrough', s.discharges === 13);
  check('tone good (≥ national)', s.tone === 'good', s.tone);
}
{
  // 0.40 − 0.575 = −0.175 → −17.5 → Math.round = −17 (JS rounds half toward +∞).
  const s = dfsTileStats({ live: { rate: 0.40, denominator: 8 }, nationalRate: 0.575 });
  check('below national → bad', s.tone === 'bad' && s.vsNationalPts === -17, s);
}
{
  const s = dfsTileStats({ live: { rate: null, denominator: 0 }, nationalRate: 0.575 });
  check('no discharges → null rate, neutral', s.ratePct === null && s.vsNationalPts === null && s.tone === 'neutral', s);
}

// ── groupLever ──
{
  // 5 triggering, 10 eligible; 3 movable now; 2 crossers (1 preventable).
  // pointsAt: linear 100*(1-rate) so lower rate = more points.
  const pointsAt = (r) => 100 * (1 - r);
  const lv = groupLever({ numNow: 5, denNow: 10, movableCurrent: 3, crossersTotal: 2, crossersPreventable: 1, pointsAt });
  // movableCount = movableCurrent(3) + crossersPreventable(1) = 4
  check('movableCount = 4', lv.movableCount === 4, lv.movableCount);
  // den = 10+2 = 12. worstNum = 5+2 = 7 → worstRate .5833 → pts 41.67
  // bestNum = max(0,5-3) + (2-1) = 2+1 = 3 → bestRate .25 → pts 75
  // potential = round(75 - 41.67) = round(33.33) = 33
  check('potentialPts = 33', lv.potentialPts === 33, lv.potentialPts);
}
{
  // nothing movable → 0/0
  const lv = groupLever({ numNow: 4, denNow: 8, movableCurrent: 0, crossersTotal: 0, crossersPreventable: 0, pointsAt: (r) => 100 * (1 - r) });
  check('no movable → 0 count', lv.movableCount === 0, lv.movableCount);
  check('no movable → 0 pts', lv.potentialPts === 0, lv.potentialPts);
}
{
  // empty denom guard
  const lv = groupLever({ numNow: 0, denNow: 0, movableCurrent: 0, crossersTotal: 0, crossersPreventable: 0, pointsAt: (r) => 100 * (1 - r) });
  check('empty denom → 0 pts (no NaN)', lv.potentialPts === 0, lv.potentialPts);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
