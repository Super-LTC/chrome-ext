/**
 * Ported from superltc `qm-dfs-view.test.ts`. Same reason as the simulator
 * suite: `dfsTileStats` shipped here untested.
 */
import { describe, it, expect } from 'vitest';
import { dfsTileStats } from '../qm-dfs-view.js';

/** Minimal builder — dfsTileStats only reads live.rate/denominator + nationalRate. */
const dfs = ({ rate, denominator, national }) => ({
  available: true,
  live: { rate, numerator: 0, denominator, coveragePct: null },
  nationalRate: national,
});

describe('dfsTileStats', () => {
  it('rate above national → good tone, positive vsNational, rate rounded to 0.1', () => {
    const s = dfsTileStats(dfs({ rate: 0.512, denominator: 40, national: 0.5 }));
    expect(s.ratePct).toBe(51.2);
    expect(s.vsNationalPts).toBe(1);
    expect(s.discharges).toBe(40);
    expect(s.tone).toBe('good');
  });

  it('rate below national → bad tone, negative vsNational', () => {
    const s = dfsTileStats(dfs({ rate: 0.22, denominator: 54, national: 0.58 }));
    expect(s.vsNationalPts).toBe(-36);
    expect(s.tone).toBe('bad');
  });

  it('national missing → neutral tone, null vsNational, rate still shown', () => {
    const s = dfsTileStats(dfs({ rate: 0.4, denominator: 10, national: null }));
    expect(s.ratePct).toBe(40);
    expect(s.vsNationalPts).toBeNull();
    expect(s.tone).toBe('neutral');
  });

  it('no live rate → null ratePct, neutral tone, zero discharges', () => {
    const s = dfsTileStats(dfs({ rate: null, denominator: 0, national: 0.5 }));
    expect(s.ratePct).toBeNull();
    expect(s.discharges).toBe(0);
    expect(s.tone).toBe('neutral');
  });

  it('rate equal to national → good (at benchmark), zero delta', () => {
    const s = dfsTileStats(dfs({ rate: 0.5, denominator: 20, national: 0.5 }));
    expect(s.vsNationalPts).toBe(0);
    expect(s.tone).toBe('good');
  });
});
