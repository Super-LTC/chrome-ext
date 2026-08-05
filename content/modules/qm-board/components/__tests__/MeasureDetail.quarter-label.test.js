/**
 * The drill's heading must name the quarter whose ROSTER is on screen.
 *
 * `currentlyTriggering` is the live board — always the CURRENT quarter — while
 * `quarterRates` is whichever quarter the reader picked on the grid. Labelling off
 * the former puts 2025-Q4's residents under "Q3 2026 locks Sep 30": the numbers are
 * about one quarter, the heading about another, and neither looks wrong alone.
 * That is the same failure as scoping to the wrong building, so it is pinned here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, h } from 'preact';
import { MeasureDetail } from '../MeasureDetail.jsx';

const MEASURE = 'antipsychotic_long';
const CURRENT_QUARTER_END = '2026-09-30'; // Q3 2026, still open

const board = () => ({
  measuresEvaluated: [{ id: MEASURE, label: 'Antipsychotic medication' }],
  patients: [],
  summary: {
    currentQuarterEnd: CURRENT_QUARTER_END,
    byMeasure: { [MEASURE]: { triggering: 5, excluded: 16, applicable: 85 } },
  },
  facilityState: 'OH',
});

/** A windowed roster for one quarter — only what the headline reads. */
const quarterRates = (label, start, end, num, den) => ({
  quarter: { label, start, end },
  rates: [{ measureId: MEASURE, label: 'Antipsychotic medication', numerator: num, denominator: den, rate: den ? num / den : 0, nonCms: false }],
  rows: [],
});

function headingOf(qr) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(
    h(MeasureDetail, {
      currentlyTriggering: board(),
      measureId: MEASURE,
      quarterRates: qr,
      rolling: null,
      upcoming: { upcomingPatients: [] },
      onBack: () => {},
      onOpenResident: () => {},
    }),
    host,
  );
  return host.textContent;
}

describe('MeasureDetail — the heading names the quarter that was loaded', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('names the open quarter and its lock date when that is what is showing', () => {
    const text = headingOf(quarterRates('2026Q3', '2026-07-01', '2026-08-05', 5, 69));
    expect(text).toContain('5 of 69');
    expect(text).toContain('Q3 2026 locks');
  });

  /** THE REGRESSION: a historical quarter must not borrow the live board's label. */
  it('names the CLOSED quarter, and does not promise it a lock date', () => {
    const text = headingOf(quarterRates('2025Q4', '2025-10-01', '2025-12-31', 6, 58));
    expect(text).toContain('6 of 58');
    expect(text).toContain('Q4 2025 (closed)');
    expect(text).not.toContain('Q3 2026 locks');
  });

  it('falls back to the live board’s quarter before the roster lands', () => {
    const text = headingOf(null);
    expect(text).toContain('Q3 2026 locks');
  });
});
