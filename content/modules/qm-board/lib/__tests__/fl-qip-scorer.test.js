import { describe, it, expect } from 'vitest';
import { scoreFlQipMeasure, scoreFlQipBand, flQipImprovementPct } from '../fl-qip-scorer.js';

/**
 * Parity lock: the FL QIP payload is the oracle — for every measure the server
 * sends both the rate and the points, so the ported scorer must reproduce those
 * points from those rates. These are Regents Park Winter Park's live projected
 * values (the diff anchor the whole build was validated against).
 */
describe('fl-qip-scorer — reproduces the server points from the payload rates (Regents)', () => {
  const cases = [
    { id: 'adl_decline', rate: 3.17, pts: 3 },            // ≤ t3 4.66 → 90th
    { id: 'uti', rate: 0.40, pts: 1 },                    // > t2 0.12, ≤ t1 0.72 → 50th
    { id: 'physical_restraints', rate: 0.0, pts: 3 },     // ≤ t3 0.0 → 90th
    { id: 'antianxiety_hypnotic_rate', rate: 2.94, pts: 3 }, // ≤ t3 12.03 → 90th
    { id: 'influenza_vaccine', rate: 100.0, pts: 3 },     // ≥ t3 100 (higher-better) → 90th
  ];
  for (const c of cases) {
    it(`${c.id} @ ${c.rate}% → ${c.pts} pts`, () => {
      expect(scoreFlQipMeasure(c.id, c.rate)?.points).toBe(c.pts);
    });
  }

  it('falls @ 2.68% is below entry, but ≥20% YoY improvement earns 0.5', () => {
    // 2.68 > t1 2.41 → below band; Regents showed 0.5 (improvement point).
    expect(scoreFlQipMeasure('falls_major_injury', 2.68)?.points).toBe(0);
    expect(scoreFlQipMeasure('falls_major_injury', 2.68, 25)?.points).toBe(0.5);
  });

  it('band boundaries are inclusive (≤ for lower-better, ≥ for higher-better)', () => {
    expect(scoreFlQipBand(4.66, { t3: 4.66, t2: 7.09, t1: 10.85, direction: 'lower_better' }).points).toBe(3);
    expect(scoreFlQipBand(100, { t3: 100, t2: 100, t1: 100, direction: 'higher_better' }).points).toBe(3);
  });

  it('unknown measure → null (not FL-scored)', () => {
    expect(scoreFlQipMeasure('walk_indep_worsened', 5)).toBeNull();
  });

  it('improvement % is direction-aware and positive when better', () => {
    expect(flQipImprovementPct(4, 8, 'lower_better')).toBe(50);   // rate halved → +50%
    expect(flQipImprovementPct(9, 6, 'higher_better')).toBe(50);  // rate up 50%
    expect(flQipImprovementPct(5, null, 'lower_better')).toBeNull();
  });
});
