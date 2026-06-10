#!/usr/bin/env node
/**
 * Verifies the Five-Star QM scoring transcription (Appendix Table A3 + Table 5)
 * against known cut-points + boundaries. Catches transcription errors in the
 * per-measure rate→points lookup.
 *
 * Ported from ../superltc scripts/test-qm-five-star.ts (PR #626).
 * Usage: node scripts/test-qm-five-star.mjs
 */
import {
  FIVE_STAR_MEASURES,
  fiveStarMeasure,
  measurePoints,
  pointsForRate,
  nextTier,
  starsForScore,
  SHORT_STAY_SCALE,
} from '../content/modules/qm-board/lib/qm-five-star.js';

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${got !== undefined ? `  got ${JSON.stringify(got)}` : ''}`); fail++; }
}

// ── lower-is-better: antipsychotic-long (150-pt decile) ─────────────────────
check('antipsych 0.00 → 150', measurePoints('antipsychotic_long', 0.0) === 150);
check('antipsych 0.0426 (top boundary) → 150', measurePoints('antipsychotic_long', 0.0426) === 150);
check('antipsych 0.0427 (next tier) → 135', measurePoints('antipsychotic_long', 0.0427) === 135);
check('antipsych 0.10 → 105', measurePoints('antipsychotic_long', 0.10) === 105);
check('antipsych 0.2836 → 30', measurePoints('antipsychotic_long', 0.2836) === 30);
check('antipsych 0.2837 → 15', measurePoints('antipsychotic_long', 0.2837) === 15);
check('antipsych 1.0 → 15 (floor)', measurePoints('antipsychotic_long', 1.0) === 15);

// ── 100-pt quintile: UTI / catheter / falls / PU-long ───────────────────────
check('uti 0.005 → 100', measurePoints('uti', 0.005) === 100);
check('uti 0.0071 → 80', measurePoints('uti', 0.0071) === 80);
check('uti 0.05 → 20', measurePoints('uti', 0.05) === 20);
check('catheter 0.004 → 100', measurePoints('catheter', 0.004) === 100);
check('catheter 0.04 → 20', measurePoints('catheter', 0.04) === 20);
check('falls 0.0134 → 100', measurePoints('falls_major_injury', 0.0134) === 100);
check('falls 0.02 → 80', measurePoints('falls_major_injury', 0.02) === 80);
check('PU-long 0.0288 → 100', measurePoints('pressure_ulcer_long', 0.0288) === 100);
check('PU-long 0.05 → 60', measurePoints('pressure_ulcer_long', 0.05) === 60);

// ── special 0-rule quintiles (SS PU / SS antipsych): 0 → 100 ─────────────────
check('SS PU 0.0 → 100', measurePoints('pressure_ulcer_short', 0.0) === 100);
check('SS PU 0.0001 → 80', measurePoints('pressure_ulcer_short', 0.0001) === 80);
check('SS antipsych 0.0 → 100', measurePoints('antipsychotic_new', 0.0) === 100);
check('SS antipsych 0.02 → 40', measurePoints('antipsychotic_new', 0.02) === 40);

// ── higher-is-better: discharge function score (150-pt decile) ──────────────
check('DFS 0.80 → 150', measurePoints('discharge_function', 0.80) === 150);
check('DFS 0.7074 (top boundary) → 150', measurePoints('discharge_function', 0.7074) === 150);
check('DFS 0.7073 → 135', measurePoints('discharge_function', 0.7073) === 135);
check('DFS 0.65 → 135', measurePoints('discharge_function', 0.65) === 135);
check('DFS 0.10 → 15 (floor)', measurePoints('discharge_function', 0.10) === 15);

// ── walk / adl deciles ──────────────────────────────────────────────────────
check('walk 0.05 → 150', measurePoints('walk_indep_worsened', 0.05) === 150);
check('walk 0.25 → 60', measurePoints('walk_indep_worsened', 0.25) === 60);
check('adl 0.0662 → 150', measurePoints('adl_decline', 0.0662) === 150);
check('adl 0.20 → 60', measurePoints('adl_decline', 0.20) === 60);

// ── nextTier ────────────────────────────────────────────────────────────────
{
  const spec = fiveStarMeasure('antipsychotic_long');
  const nt = nextTier(spec, 0.05); // current 135; better is 150 at ≤0.0426
  check('nextTier antipsych @0.05 → +150 need 0.0426', nt?.points === 150 && Math.abs(nt.needRate - 0.0426) < 1e-9, nt);
  check('nextTier delta ≈ 0.0074', nt != null && Math.abs(nt.delta - (0.05 - 0.0426)) < 1e-9, nt?.delta);
  check('nextTier at top tier → null', nextTier(spec, 0.0) === null);
}
{
  const spec = fiveStarMeasure('discharge_function');
  const nt = nextTier(spec, 0.65); // current 135; better 150 at ≥0.7074
  check('nextTier DFS @0.65 → +150 need 0.7074', nt?.points === 150 && Math.abs(nt.needRate - 0.7074) < 1e-9, nt);
}

// ── star thresholds (Table 5) ───────────────────────────────────────────────
check('long 155 → 1★', starsForScore('long', 155) === 1);
check('long 736 → 5★', starsForScore('long', 736) === 5);
check('long 600 → 3★', starsForScore('long', 600) === 3);
check('short 144 → 1★', starsForScore('short', 144) === 1);
check('short 720 → 5★', starsForScore('short', 720) === 5);
check('overall 299 → 1★', starsForScore('overall', 299) === 1);
check('overall 1456 → 5★', starsForScore('overall', 1456) === 5);
check('overall 1200 → 3★', starsForScore('overall', 1200) === 3);

// ── structural sanity: max-point sums match the guide ───────────────────────
const lsMax = FIVE_STAR_MEASURES.filter((m) => m.stay === 'long').reduce((a, m) => a + m.maxPoints, 0);
const ssMax = FIVE_STAR_MEASURES.filter((m) => m.stay === 'short').reduce((a, m) => a + m.maxPoints, 0);
const lsMdsMax = FIVE_STAR_MEASURES.filter((m) => m.stay === 'long' && !m.claimsBased).reduce((a, m) => a + m.maxPoints, 0);
const ssMdsMax = FIVE_STAR_MEASURES.filter((m) => m.stay === 'short' && !m.claimsBased).reduce((a, m) => a + m.maxPoints, 0);
check('long max = 1150', lsMax === 1150, lsMax);
check('short max = 800 (pre-scale)', ssMax === 800, ssMax);
check('long MDS-only max = 850', lsMdsMax === 850, lsMdsMax);
check('short MDS-only max = 350', ssMdsMax === 350, ssMdsMax);
check('SS scale ≈ 1.4375', Math.abs(SHORT_STAY_SCALE - 1.4375) < 1e-9);
check('10 MDS measures computable', FIVE_STAR_MEASURES.filter((m) => !m.claimsBased && m.id).length === 10);
check('5 claims measures present', FIVE_STAR_MEASURES.filter((m) => m.claimsBased).length === 5);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
