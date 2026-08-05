/**
 * FacilityScope threads BOTH scoping arguments into the drill.
 *
 * The scope owns the measure drill precisely so it can re-fetch for the building
 * the grid is showing rather than the one open in PCC (see the file header). The
 * quarter is the same kind of argument and was NOT being threaded: the hook fell
 * back to `back = 0`, so picking a historical quarter card and clicking a num/den
 * returned the CURRENT quarter's residents — under a heading naming the quarter
 * you picked, and directly contradicting the grid's own "drill-ins open <quarter>"
 * promise.
 *
 * These assert the arguments the hooks are CALLED with, because that is the whole
 * defect — the roster that comes back is internally consistent either way, which
 * is exactly why the bug was invisible.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from 'preact';

const quarterRatesSpy = vi.fn(() => ({ quarterRates: null, loading: false, failed: false }));
const qmBoardSpy = vi.fn(() => ({
  currentlyTriggering: { measures: [], patients: [], facilityState: 'OH' },
  preventableAlerts: null,
  upcoming: null,
  loading: false,
  error: null,
  retry: () => {},
}));
const rollingSpy = vi.fn(() => ({ rolling: null }));
const facilitySpy = vi.fn(() => ({
  facility: null,
  notYetReason: null,
  stale: false,
  loading: false,
  error: null,
  retry: () => {},
}));

vi.mock('../../../hooks/useQuarterRates.js', () => ({
  useQuarterRates: (...args) => quarterRatesSpy(...args),
}));
vi.mock('../../../hooks/useQmBoard.js', () => ({
  useQmBoard: (...args) => qmBoardSpy(...args),
}));
vi.mock('../../../hooks/useRolling.js', () => ({
  useRolling: (...args) => rollingSpy(...args),
}));
vi.mock('../../../hooks/useFiveStarFacility.js', () => ({
  useFiveStarFacility: (...args) => facilitySpy(...args),
}));
// The drill's own rendering is not the subject; stub it so the test fails only
// when the wiring changes.
vi.mock('../../MeasureDetail.jsx', () => ({
  MeasureDetail: () => h('div', { 'data-testid': 'measure-detail' }),
}));

const { FacilityScope } = await import('../FacilityScope.jsx');

const PCC_NAME = 'WALNUT CREEK CARE COMMUNITY';

function mountMeasure(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(
    h(FacilityScope, {
      facilityName: PCC_NAME,
      displayName: 'Walnut Creek Care Community',
      orgSlug: 'lionstone',
      view: 'measure',
      measureId: 'antipsychotic_long',
      quarterBack: 0,
      onQuarterBackChange: () => {},
      onOpenMeasure: () => {},
      onBackToMeasureHost: () => {},
      onScopeOut: () => {},
      onOpenResident: () => {},
      ...props,
    }),
    host,
  );
  return host;
}

describe('FacilityScope — the drill reads the quarter the reader picked', () => {
  beforeEach(() => {
    quarterRatesSpy.mockClear();
    qmBoardSpy.mockClear();
    rollingSpy.mockClear();
    document.body.innerHTML = '';
  });

  it('asks for the SELECTED quarter, not the open one', () => {
    mountMeasure({ quarterBack: 3 });
    expect(quarterRatesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ facilityName: PCC_NAME, orgSlug: 'lionstone', back: 3 }),
    );
  });

  it('still asks for the open quarter when that is what is selected', () => {
    mountMeasure({ quarterBack: 0 });
    expect(quarterRatesSpy).toHaveBeenCalledWith(expect.objectContaining({ back: 0 }));
  });

  /**
   * The building half of the same contract — already correct, pinned so a future
   * refactor cannot quietly re-point the drill at the PCC building.
   */
  it('reads the SCOPED building, never the one open in PCC', () => {
    mountMeasure({ quarterBack: 1 });
    for (const spy of [quarterRatesSpy, qmBoardSpy, rollingSpy]) {
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ facilityName: PCC_NAME }));
    }
  });

  it('does not fire the drill hooks at all while only the scorecard is showing', () => {
    mountMeasure({ view: 'overview', measureId: undefined });
    expect(quarterRatesSpy).not.toHaveBeenCalled();
    expect(qmBoardSpy).not.toHaveBeenCalled();
  });
});
