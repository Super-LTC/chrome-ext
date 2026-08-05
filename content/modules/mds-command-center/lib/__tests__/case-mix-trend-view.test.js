import { describe, it, expect } from 'vitest';
import { buildCaseMixTrend, shortQuarter } from '../case-mix-trend-view.js';

/** Five real Autumnwood quarters — the range that motivated the design. */
const REAL = [
  { quarter: '2025Q3', medicaidCmi: 1.4015, allCmi: 1.39, medicaidWithPendingCmi: 1.42, inProgress: false, medicaidScored: 50, scored: 60, carryForward: 2 },
  { quarter: '2025Q4', medicaidCmi: 1.3517, allCmi: 1.34, medicaidWithPendingCmi: 1.36, inProgress: false, medicaidScored: 51, scored: 61, carryForward: 1 },
  { quarter: '2026Q1', medicaidCmi: 1.3954, allCmi: 1.38, medicaidWithPendingCmi: 1.40, inProgress: false, medicaidScored: 52, scored: 62, carryForward: 0 },
  { quarter: '2026Q2', medicaidCmi: 1.3784, allCmi: 1.37, medicaidWithPendingCmi: 1.39, inProgress: false, medicaidScored: 53, scored: 63, carryForward: 3 },
  { quarter: '2026Q3', medicaidCmi: 1.4827, allCmi: 1.47, medicaidWithPendingCmi: 1.49, inProgress: true, medicaidScored: 49, scored: 59, carryForward: 12 },
];

describe('shortQuarter', () => {
  it('shortens a quarter label', () => {
    expect(shortQuarter('2026Q3')).toBe("Q3 '26");
  });
  it('passes anything unparseable straight through', () => {
    expect(shortQuarter('whatever')).toBe('whatever');
    expect(shortQuarter(null)).toBe('');
  });
});

describe('buildCaseMixTrend', () => {
  /**
   * THE ONE THAT JUSTIFIES THE MODULE. Scaled from zero, five real quarters
   * (1.3517–1.4827) occupy 91%–100% of the track and the chart is unreadable.
   * Scaled to the visible range the movement is legible. If someone "simplifies"
   * this back to zero-based, this fails.
   */
  it('spreads a narrow real-world CMI range across the track', () => {
    const t = buildCaseMixTrend(REAL);
    const fracs = t.points.map((p) => p.heightFrac);
    expect(Math.max(...fracs) - Math.min(...fracs)).toBeGreaterThan(0.6);

    const zeroBased = REAL.map((q) => q.medicaidCmi / Math.max(...REAL.map((r) => r.medicaidCmi)));
    expect(Math.max(...zeroBased) - Math.min(...zeroBased)).toBeLessThan(0.1);
  });

  /**
   * The axis is truncated, so the caller MUST be able to say so. A baseline the
   * component cannot read is a chart that silently lies about its floor.
   */
  it('hands back a usable baseline and top, and never starts at zero for real data', () => {
    const t = buildCaseMixTrend(REAL);
    expect(t.baseline).toBeGreaterThan(0);
    expect(t.top).toBeGreaterThan(t.baseline);
    expect(t.baseline).toBeLessThan(Math.min(...REAL.map((q) => q.medicaidCmi)));
    expect(t.top).toBeGreaterThan(Math.max(...REAL.map((q) => q.medicaidCmi)));
  });

  it('reads the metric it was asked for, across all three measures', () => {
    expect(buildCaseMixTrend(REAL).points[0].value).toBe(1.4015);
    expect(buildCaseMixTrend(REAL, { metric: 'allCmi' }).points[0].value).toBe(1.39);
    expect(buildCaseMixTrend(REAL, { metric: 'medicaidWithPendingCmi' }).points[0].value).toBe(1.42);
    expect(buildCaseMixTrend(REAL, { metric: 'nonsense' }).metric).toBe('medicaidCmi');
  });

  /**
   * The denominator has to follow the measure. All-payer counts everyone
   * scoreable; the Medicaid measures count only the payable set. Printing
   * "85 counted" under a number computed over 56 residents is a lie about the
   * denominator, and it looks like the building lost thirty people on a toggle.
   */
  it('quotes the denominator that belongs to the measure', () => {
    expect(buildCaseMixTrend(REAL, { metric: 'allCmi' }).points[0].scored).toBe(60);
    expect(buildCaseMixTrend(REAL, { metric: 'medicaidCmi' }).points[0].scored).toBe(50);
    expect(buildCaseMixTrend(REAL, { metric: 'medicaidWithPendingCmi' }).points[0].scored).toBe(50);
  });

  /** A quarter with nothing scoreable is a GAP. Rendering it as a zero bar would
   *  claim the building's acuity collapsed that quarter. */
  it('treats a null CMI as absent, not as zero', () => {
    const t = buildCaseMixTrend([
      { quarter: '2026Q1', medicaidCmi: null, inProgress: false },
      { quarter: '2026Q2', medicaidCmi: 1.5, inProgress: false },
    ]);
    expect(t.points[0].present).toBe(false);
    expect(t.points[0].heightFrac).toBe(0);
    expect(t.first).toBe(1.5);
  });

  it('survives a flat building without dividing by zero', () => {
    const t = buildCaseMixTrend([
      { quarter: '2026Q1', medicaidCmi: 2.0, inProgress: false },
      { quarter: '2026Q2', medicaidCmi: 2.0, inProgress: false },
    ]);
    expect(t.direction).toBe('flat');
    expect(t.delta).toBe(0);
    expect(t.points.every((p) => Number.isFinite(p.heightFrac))).toBe(true);
    expect(t.points.every((p) => p.heightFrac > 0 && p.heightFrac < 1)).toBe(true);
  });

  it('survives an empty window', () => {
    const t = buildCaseMixTrend([]);
    expect(t.points).toEqual([]);
    expect(t.direction).toBe('flat');
    expect(t.openQuarter).toBeNull();
    expect(Number.isFinite(t.baseline)).toBe(true);
  });

  it('is not fooled by a non-array', () => {
    expect(buildCaseMixTrend(null).points).toEqual([]);
    expect(buildCaseMixTrend(undefined).points).toEqual([]);
  });

  it('finds the open quarter, which is the only one a projection suits', () => {
    expect(buildCaseMixTrend(REAL).openQuarter.quarter).toBe('2026Q3');
    expect(buildCaseMixTrend(REAL.slice(0, 4)).openQuarter).toBeNull();
  });

  it('measures direction first-to-last, not against the tallest bar', () => {
    // 2025Q3 1.4015 → 2026Q3 1.4827 is UP, even though 2025Q4 dips below both.
    const t = buildCaseMixTrend(REAL);
    expect(t.direction).toBe('up');
    expect(t.delta).toBeCloseTo(0.0812, 4);
  });

  it('clamps height to [0,1] so a stray value cannot invert a bar', () => {
    const t = buildCaseMixTrend(REAL);
    expect(t.points.every((p) => p.heightFrac >= 0 && p.heightFrac <= 1)).toBe(true);
  });
});
