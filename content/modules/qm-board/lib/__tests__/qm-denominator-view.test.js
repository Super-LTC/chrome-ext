import { describe, it, expect } from 'vitest';
import { buildDenominatorView, windowedRate } from '../qm-denominator-view.js';

/** Minimal quarter-rates response factory. */
function qr({ rates, rows }) {
  return { quarter: { label: '2026Q2', start: '2026-04-01', end: '2026-06-21' }, rates, rows };
}
function measure(measureId, { applicable = true, excluded = false, skipped = false, triggers = false, reason = null } = {}) {
  return { measureId, applicable, excluded, skipped, triggers, reason };
}
function row(patientId, name, opts = {}, measures = []) {
  return {
    patientId, name,
    dischargeStatus: opts.discharged ? 'discharged' : 'active',
    stayType: opts.stayType ?? 'long',
    cdif: opts.cdif ?? 200,
    measures,
  };
}

describe('buildDenominatorView', () => {
  it('classifies in-denominator / excluded / skipped per the engine rule', () => {
    const view = buildDenominatorView(qr({
      rates: [{ measureId: 'uti', numerator: 1, denominator: 2, rate: 0.5 }],
      rows: [
        row('p1', 'Alice', {}, [measure('uti', { triggers: true })]),                 // in-denom, numerator
        row('p2', 'Bob', {}, [measure('uti', { triggers: false })]),                   // in-denom, not numerator
        row('p3', 'Carol', {}, [measure('uti', { excluded: true, reason: 'on dialysis' })]), // excluded
        row('p4', 'Dan', {}, [measure('uti', { skipped: true, reason: 'no baseline' })]),    // skipped → dropped
        row('p5', 'Eve', {}, [measure('uti', { applicable: false })]),                 // not applicable → dropped
      ],
    }));
    const m = view.byMeasure.get('uti');
    // CRITICAL: skipped + not-applicable residents are NOT in the denominator roster.
    expect(m.roster.inDenominator.map((r) => r.name)).toEqual(['Alice', 'Bob']);
    expect(m.roster.excluded.map((r) => r.name)).toEqual(['Carol']);
    expect(m.roster.inDenominator.find((r) => r.name === 'Alice').isNumerator).toBe(true);
    expect(m.roster.inDenominator.find((r) => r.name === 'Bob').isNumerator).toBe(false);
    expect(m.roster.excluded[0].reason).toBe('on dialysis');
  });

  it('takes headline num/den/rate verbatim from rates (never recomputed)', () => {
    const view = buildDenominatorView(qr({
      rates: [{ measureId: 'uti', numerator: 7, denominator: 290, rate: 0.0241 }],
      rows: [row('p1', 'Alice', {}, [measure('uti', { triggers: true })])],
    }));
    const m = view.byMeasure.get('uti');
    expect(m).toMatchObject({ numerator: 7, denominator: 290, rate: 0.0241 });
  });

  it('marks discharged residents who still count', () => {
    const view = buildDenominatorView(qr({
      rates: [{ measureId: 'uti', numerator: 1, denominator: 1, rate: 1 }],
      rows: [row('p1', 'Gone', { discharged: true }, [measure('uti', { triggers: true })])],
    }));
    const r = view.byMeasure.get('uti').roster.inDenominator[0];
    expect(r.discharged).toBe(true);
    expect(r.isNumerator).toBe(true);
  });

  it('windowedRate returns null for an unknown measure (tile falls back to active)', () => {
    const view = buildDenominatorView(qr({ rates: [{ measureId: 'uti', numerator: 0, denominator: 5, rate: 0 }], rows: [] }));
    expect(windowedRate(view, 'uti')).toEqual({ num: 0, den: 5, rate: 0 });
    expect(windowedRate(view, 'catheter')).toBeNull();
  });
});
