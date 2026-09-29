/**
 * Pins the extension's QIP registry to superltc's
 * web/components/quality-measures/qip-programs.ts.
 *
 * The JS file is a hand port, and it drifted: Texas and Florida kept N033
 * `antianxiety_hypnotic_use` and Florida the retired N025 `low_risk_incontinence`
 * after the web moved to N036 `antianxiety_hypnotic_rate` / N046
 * `bb_new_worsened`. Nothing failed, because nothing compared them. The
 * expected lists below are copied from the web registry — when that file
 * changes, this test is supposed to go red until the port is updated too.
 */
import { describe, it, expect } from 'vitest';
import { QIP_PROGRAMS, qipMeasureSet, hasQipScorer, hasActiveQip } from '../qip-programs.js';
import { shortLabel, measureInLens } from '../qm-view-model.js';

// Order matters only for readability; compared as sets below.
const WEB_MEASURES = {
  OH: ['pressure_ulcer_long', 'uti', 'walk_indep_worsened', 'catheter', 'adl_decline', 'falls_major_injury', 'antipsychotic_long'],
  TX: ['falls_major_injury', 'uti', 'weight_loss', 'antipsychotic_long', 'walk_indep_worsened', 'phq9_depression', 'antianxiety_hypnotic_rate', 'bb_new_worsened', 'pressure_ulcer_long', 'catheter'],
  GA: ['weight_loss', 'uti', 'antipsychotic_long', 'falls_major_injury'],
  FL: ['uti', 'pressure_ulcer_long', 'falls_major_injury', 'antipsychotic_long', 'antianxiety_hypnotic_rate', 'physical_restraints', 'adl_decline', 'influenza_vaccine', 'bb_new_worsened'],
  AL: ['influenza_vaccine', 'antipsychotic_long', 'physical_restraints', 'pressure_ulcer_short'],
  TN: ['antipsychotic_long', 'antipsychotic_new', 'uti'],
  WI: [],
};

describe('QIP registry — measures per state', () => {
  it('has exactly the web registry’s states', () => {
    expect(Object.keys(QIP_PROGRAMS).sort()).toEqual(Object.keys(WEB_MEASURES).sort());
  });

  for (const [state, expected] of Object.entries(WEB_MEASURES)) {
    it(`${state} measures match the web registry`, () => {
      expect([...QIP_PROGRAMS[state].measures].sort()).toEqual([...expected].sort());
      expect(QIP_PROGRAMS[state].measures).toHaveLength(expected.length); // no duplicates
    });
  }

  it('no state scores the retired / survey-only variants', () => {
    for (const p of Object.values(QIP_PROGRAMS)) {
      expect(p.measures).not.toContain('antianxiety_hypnotic_use'); // N033, not N036
      expect(p.measures).not.toContain('low_risk_incontinence'); // retired N025
    }
  });

  it('every registry measure is one the board knows how to label', () => {
    const MISSING = 'NOT IN CATALOGUE';
    for (const p of Object.values(QIP_PROGRAMS)) {
      for (const id of p.measures) expect(shortLabel(id, MISSING), id).not.toBe(MISSING);
    }
  });
});

describe('QIP registry — Florida rate-year text', () => {
  it('describes the 2026-10-01 rate year, not the one that just closed', () => {
    expect(QIP_PROGRAMS.FL.programYear).toMatch(/^Rate year 2026-10-01 – 2027-09-30 \(SFY2027\)/);
  });

  it('carries the 18.1373% pool, not the "sunsets to 10%" claim the 2026 session reversed', () => {
    expect(QIP_PROGRAMS.FL.pool).toMatch(/^18\.1373% of Sept-2016 non-property payments/);
    expect(QIP_PROGRAMS.FL.pool).not.toMatch(/SUNSET/i);
    expect(QIP_PROGRAMS.FL.pool).not.toContain('17.862');
  });
});

describe('QIP scorer gate', () => {
  it('only Florida has a scorer; every other program state gets no QIP view', () => {
    expect(hasQipScorer('FL')).toBe(true);
    expect(hasQipScorer('fl')).toBe(true);
    for (const s of ['GA', 'AL', 'TN', 'TX', 'OH', 'WI', null, undefined, '']) {
      expect(hasQipScorer(s), String(s)).toBe(false);
    }
  });

  it('a program on paper is not the same as a scorer', () => {
    // The trap the scorer gate exists for: GA/AL/TN are "active" programs.
    for (const s of ['GA', 'AL', 'TN']) {
      expect(hasActiveQip(s)).toBe(true);
      expect(hasQipScorer(s)).toBe(false);
    }
  });
});

describe('QIP lens uses the current measure ids', () => {
  it('Texas: N036 rate and N046 bowel/bladder are in the QIP lens; N033 is not', () => {
    expect(qipMeasureSet('TX').has('antianxiety_hypnotic_rate')).toBe(true);
    expect(measureInLens('antianxiety_hypnotic_rate', 'qip', 'TX')).toBe(true);
    expect(measureInLens('bb_new_worsened', 'both', 'TX')).toBe(true);
    expect(measureInLens('antianxiety_hypnotic_use', 'both', 'TX')).toBe(false);
  });

  it('Florida: N046 replaces the retired N025', () => {
    expect(measureInLens('bb_new_worsened', 'qip', 'FL')).toBe(true);
    expect(measureInLens('low_risk_incontinence', 'qip', 'FL')).toBe(false);
    expect(measureInLens('antianxiety_hypnotic_use', 'qip', 'FL')).toBe(false);
  });
});
