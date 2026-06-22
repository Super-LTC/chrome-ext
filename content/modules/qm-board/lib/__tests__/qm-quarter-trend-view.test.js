import { describe, it, expect } from 'vitest';
import { quarterTrendForMeasure } from '../qm-quarter-trend-view.js';

function q(label, rates) {
  return { label, start: '', end: '', rates };
}
function rate(measureId, numerator, denominator) {
  return { measureId, numerator, denominator, rate: denominator > 0 ? numerator / denominator : 0 };
}

describe('quarterTrendForMeasure', () => {
  const rolling = {
    quarters: [
      q('2025Q3', [rate('uti', 4, 100)]),               // 4%
      q('2025Q4', [rate('uti', 3, 100)]),               // 3%
      q('2026Q1', [rate('uti', 0, 0)]),                 // no applicable denom → gap
      q('2026Q2', [rate('uti', 1, 100)]),               // 1%
    ],
    rolling: [{ measureId: 'uti', totalNum: 8, totalDen: 300, weightedRate: 0.0267, quarters: [] }],
    projection: {},
  };

  it('maps each quarter and flags zero-denominator quarters as gaps', () => {
    const t = quarterTrendForMeasure(rolling, 'uti');
    expect(t.points.map((p) => p.present)).toEqual([true, true, false, true]);
    expect(t.points[2]).toMatchObject({ rate: 0, num: 0, den: 0, present: false });
    expect(t.weightedRate).toBeCloseTo(0.0267);
  });

  it('reports RAW direction from first-present vs last-present (component colors it)', () => {
    const t = quarterTrendForMeasure(rolling, 'uti');
    expect(t.firstRate).toBeCloseTo(0.04);
    expect(t.lastRate).toBeCloseTo(0.01);
    expect(t.direction).toBe('down'); // 4% → 1%, raw down (good for lower-is-better, but that's the component's call)
  });

  it('handles a measure absent from rolling (all gaps, flat, weightedRate 0)', () => {
    const t = quarterTrendForMeasure(rolling, 'catheter');
    expect(t.points.every((p) => !p.present)).toBe(true);
    expect(t.firstRate).toBeNull();
    expect(t.lastRate).toBeNull();
    expect(t.direction).toBe('flat');
    expect(t.weightedRate).toBe(0);
  });
});
