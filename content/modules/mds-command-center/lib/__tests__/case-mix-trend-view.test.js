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

describe('drift band on the open quarter', () => {
  const WITH_DRIFT = [
    { quarter: '2026Q2', medicaidCmi: 1.40, inProgress: false, medicaidScored: 50 },
    { quarter: '2026Q3', medicaidCmi: 1.30, inProgress: true, medicaidScored: 30,
      drift: { low: 0.019, high: 0.081, daysRemaining: 56, bracket: [45, 75], extrapolated: false } },
  ];

  /**
   * THE POINT OF THE BAND. The open quarter reads as a 0.10 drop; the measured
   * drift says most of that is the quarter being young. If the cap did not sit
   * above the bar there would be nothing on screen saying so.
   */
  it('puts the drift cap above the bar it belongs to', () => {
    const open = buildCaseMixTrend(WITH_DRIFT).points[1];
    expect(open.driftFrac).toBeGreaterThan(open.heightFrac);
    expect(open.driftFloorFrac).toBeGreaterThan(open.heightFrac);
    expect(open.driftFrac).toBeGreaterThan(open.driftFloorFrac);
  });

  /**
   * ⚠️ The axis must CONTAIN the cap. When the open quarter is also the tallest,
   * a range computed from bar values alone clips the band flat against the top
   * of the track — invisible on precisely the quarter it exists for.
   */
  it('widens the axis so the cap is never clipped, even when the open quarter is highest', () => {
    // The two quarters sit CLOSE together on purpose. padRange adds 25% of the
    // visible span, so a wide fixture pads far enough to hide the bug by luck —
    // here the span is 0.05, the pad is 0.0125, and the 0.08 cap can only fit if
    // the range actually accounts for it. (Verified: this fails when it doesn't.)
    const t = buildCaseMixTrend([
      { quarter: '2026Q2', medicaidCmi: 1.85, inProgress: false },
      { quarter: '2026Q3', medicaidCmi: 1.90, inProgress: true,
        drift: { low: 0.02, high: 0.08 } },
    ]);
    expect(t.top).toBeGreaterThan(1.98);
    expect(t.points[1].driftFrac).toBeLessThan(1);
    // And the bar itself must stay well clear of the cap, not pinned beneath it.
    expect(t.points[1].driftFrac - t.points[1].heightFrac).toBeGreaterThan(0.1);
  });

  it('leaves quarters without a band alone', () => {
    const closed = buildCaseMixTrend(WITH_DRIFT).points[0];
    expect(closed.drift).toBeNull();
    expect(closed.driftFrac).toBeNull();
    expect(closed.driftFloorFrac).toBeNull();
  });

  /** Never invented client-side. If the server withheld it — capture population,
   *  closed quarter, unverified state — there is no band, full stop. */
  it('does not synthesise a band the server did not send', () => {
    const t = buildCaseMixTrend([{ quarter: '2026Q3', medicaidCmi: 1.3, inProgress: true }]);
    expect(t.points[0].drift).toBeNull();
    expect(t.points[0].driftFrac).toBeNull();
  });
});

describe('composition follows the metric', () => {
  const Q = [{
    quarter: '2026Q3', medicaidCmi: 1.5, allCmi: 1.4, medicaidWithPendingCmi: 1.55,
    inProgress: false, scored: 60, medicaidScored: 40,
    composition: {
      medicaidCmi: { total: 40, slices: [{ key: 'SCH', label: 'Special Care High', n: 40, share: 1, cmi: 2.2 }] },
      allCmi: { total: 60, slices: [{ key: 'RPF', label: 'Reduced Physical Function', n: 60, share: 1, cmi: 1.1 }] },
      medicaidWithPendingCmi: { total: 45, slices: [{ key: 'CC', label: 'Clinically Complex', n: 45, share: 1, cmi: 1.7 }] },
    },
  }];

  /**
   * ⚠️ THE CROSS-PAIRING GUARD. Each fold sums to a DIFFERENT denominator — the
   * engine builds one per published mean for exactly that reason. Serving the
   * all-payer fold under a Medicaid headline puts 60 residents of bars under a
   * number that says 40 are counted.
   */
  it('hands back the fold belonging to the selected measure, and its total matches that denominator', () => {
    const med = buildCaseMixTrend(Q, { metric: 'medicaidCmi' }).points[0];
    expect(med.composition.total).toBe(med.scored);
    expect(med.composition.slices[0].key).toBe('SCH');

    const all = buildCaseMixTrend(Q, { metric: 'allCmi' }).points[0];
    expect(all.composition.total).toBe(all.scored);
    expect(all.composition.slices[0].key).toBe('RPF');

    const pend = buildCaseMixTrend(Q, { metric: 'medicaidWithPendingCmi' }).points[0];
    expect(pend.composition.slices[0].key).toBe('CC');
  });

  it('is null when the server sent no composition', () => {
    expect(buildCaseMixTrend([{ quarter: '2026Q1', medicaidCmi: 1.2 }]).points[0].composition).toBeNull();
  });
});

describe('buildCaseMixTableRows', () => {
  it('is newest first — the quarter you are in is the one you came to read', () => {
    const t = buildCaseMixTrend(REAL);
    expect(t.rows[0].quarter).toBe('2026Q3');
    expect(t.rows[t.rows.length - 1].quarter).toBe('2025Q3');
  });

  it('measures each quarter against the one before it', () => {
    const t = buildCaseMixTrend(REAL);
    const q4 = t.rows.find((r) => r.quarter === '2025Q4');
    expect(q4.change).toBeCloseTo(1.3517 - 1.4015, 4);
  });

  it('gives the earliest quarter no change rather than a fake zero', () => {
    const t = buildCaseMixTrend(REAL);
    expect(t.rows[t.rows.length - 1].change).toBeNull();
  });

  /** A gap is not a floor to fall from and not a peak to rise from — the next
   *  present quarter must compare against the last present one. */
  it('skips gaps instead of treating them as zero', () => {
    const t = buildCaseMixTrend([
      { quarter: '2026Q1', medicaidCmi: 1.5, inProgress: false },
      { quarter: '2026Q2', medicaidCmi: null, inProgress: false },
      { quarter: '2026Q3', medicaidCmi: 1.6, inProgress: false },
    ]);
    const q3 = t.rows.find((r) => r.quarter === '2026Q3');
    expect(q3.change).toBeCloseTo(0.1, 4);
    expect(t.rows.find((r) => r.quarter === '2026Q2').change).toBeNull();
  });

  it('survives an empty window', () => {
    expect(buildCaseMixTrend([]).rows).toEqual([]);
  });
});
