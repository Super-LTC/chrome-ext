#!/usr/bin/env node
/**
 * TDD for the pure Five-Star predictor (predictStars / starProgress /
 * cmsWindowEndFor) — the client-side math the card + what-if simulator re-run.
 * No Preact, no fetch.
 *
 * Usage: node scripts/test-five-star-predictor.mjs
 */
import {
  predictStars,
  starProgress,
  cmsWindowEndFor,
} from '../content/modules/qm-board/lib/five-star-predictor.js';

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got !== undefined ? `\n        got ${JSON.stringify(got)}` : ''}`); fail++; }
}

const anchor = { qm: 3, ls: 3, ss: 3, overall: 3 };

// ── predictStars: a clean ADL rate now vs a bad anchor rate lifts the LS star ──
{
  // adl_decline (LS, 150pt, lower-is-better): 0.01 → 150 pts; 0.35 → 15 pts ⇒ +135.
  const p = predictStars(anchor, [{ id: 'adl_decline', rateNow: 0.01, rateAtAnchor: 0.35 }]);
  check('ls anchor preserved', p.ls.anchorStar === 3);
  check('ls delta = +135', p.ls.pointsDelta === 135, p.ls.pointsDelta);
  // long band 3 midpoint = (566+640)/2 = 603; 603+135 = 738 ⇒ 5★ (≥736).
  check('ls score = 738', p.ls.score === 738, p.ls.score);
  check('ls predicted 5★', p.ls.predictedStar === 5, p.ls.predictedStar);
  check('ls trend up', p.ls.trend === 'up');
  // short-stay has no pairs → frozen at anchor.
  check('ss frozen at anchor', p.ss.predictedStar === 3 && p.ss.pointsDelta === 0, p.ss);
}

// ── a worsening rate drops the star ──
{
  // 0.35 now (15 pts) vs 0.01 anchor (150 pts) ⇒ −135 ⇒ 603−135 = 468 ⇒ 2★.
  const p = predictStars(anchor, [{ id: 'adl_decline', rateNow: 0.35, rateAtAnchor: 0.01 }]);
  check('ls delta = −135', p.ls.pointsDelta === -135, p.ls.pointsDelta);
  check('ls predicted 2★', p.ls.predictedStar === 2, p.ls.predictedStar);
  check('ls trend down', p.ls.trend === 'down');
}

// ── null anchor → unknown, never fabricate a star ──
{
  const p = predictStars({ qm: null, ls: null, ss: null, overall: null }, [{ id: 'uti', rateNow: 0.001, rateAtAnchor: 0.2 }]);
  check('null anchor → predicted null', p.ls.predictedStar === null && p.overall.predictedStar === null, p);
  check('null anchor → trend unknown', p.ls.trend === 'unknown');
  check('null anchor → score null', p.ls.score === null);
}

// ── claims / non-five-star ids contribute zero delta ──
{
  const p = predictStars(anchor, [{ id: 'phq9_depression', rateNow: 0.9, rateAtAnchor: 0.0 }]);
  check('non-five-star id ignored (Δ=0)', p.ls.pointsDelta === 0 && p.ls.predictedStar === 3, p.ls);
}

// ── starProgress: points to the next band ──
{
  // long score 603 (3★, band 566–640); next band 4★ starts at 641 ⇒ 38 pts to go.
  const prog = starProgress('long', 603);
  check('progress star 3', prog.star === 3, prog);
  check('progress nextStar 4', prog.nextStar === 4, prog);
  check('progress 38 pts to next', prog.pointsToNext === 38, prog.pointsToNext);
}
{
  // a 5★ score → no next band.
  const prog = starProgress('long', 800);
  check('top band → nextStar null', prog.nextStar === null && prog.pointsToNext === null, prog);
}

// ── cmsWindowEndFor: step back 2 quarters + snap to quarter end ──
check('Apr 2026 processing → Q4 2025 end', cmsWindowEndFor('2026-04-15') === '2025-12-31', cmsWindowEndFor('2026-04-15'));
check('Jan 2026 processing → Q3 2025 end', cmsWindowEndFor('2026-01-20') === '2025-09-30', cmsWindowEndFor('2026-01-20'));
check('Oct 2026 processing → Q2 2026 end', cmsWindowEndFor('2026-10-05') === '2026-06-30', cmsWindowEndFor('2026-10-05'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
