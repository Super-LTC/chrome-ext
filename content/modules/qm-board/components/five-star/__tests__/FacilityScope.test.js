/**
 * The measure drill must open the quarter the reader selected.
 *
 * ── The bug this pins ───────────────────────────────────────────────────────
 * `FacilityFiveStar` lets you click a quarter card to scope the grid, and the
 * selection is carried on the route as `quarter`. But `ScopedMeasureDetail`
 * called `useQuarterRates({ facilityName, orgSlug })` with no `back`, so the
 * drill always fetched the OPEN quarter regardless. Select 2025-Q3, click a
 * measure, read the current quarter's residents.
 *
 * It shipped because nothing on the screen said which quarter was being shown —
 * the numbers were real, internally consistent, and simply answered a different
 * question than the one asked. Reported by a user, not by a test.
 *
 * These assert the REQUEST, because that is where the quarter is chosen. A
 * render assertion would pass against the wrong roster as long as it rendered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { FacilityScope } from '../FacilityScope.jsx';

const board = {
  facilityState: 'FL',
  facilityDate: '2026-08-02',
  patients: [],
  summary: {},
};

const quarterRatesFor = (label) => ({
  quarter: { label, start: '2025-07-01', end: '2025-09-30' },
  rates: [{ measureId: 'uti', label: 'UTI', numerator: 1, denominator: 2, rate: 0.5 }],
  rows: [],
});

/** Records every endpoint the surface asks for. */
function stubApi() {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg) => {
        calls.push(msg.endpoint);
        if (msg.endpoint.includes('quarter-rates')) {
          const back = new URL(`http://x${msg.endpoint}`).searchParams.get('back') ?? '0';
          return { success: true, data: quarterRatesFor(`back=${back}`) };
        }
        if (msg.endpoint.includes('qm-planner/board') || msg.endpoint.includes('currently-triggering')) {
          return { success: true, data: { currentlyTriggering: board, upcoming: {}, alerts: {} } };
        }
        return { success: true, data: null };
      }),
    },
  };
  return calls;
}

let host;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { render(null, host); host.remove(); vi.restoreAllMocks(); });

const mount = async (props) => {
  await act(async () => {
    render(h(FacilityScope, {
      facilityName: 'Alpha Care Center',
      displayName: 'Alpha Care',
      orgSlug: 'org',
      view: 'measure',
      measureId: 'uti',
      quarterBack: 0,
      onQuarterBackChange: () => {},
      onOpenMeasure: () => {},
      onBackToMeasureHost: () => {},
      onScopeOut: () => {},
      onOpenResident: () => {},
      ...props,
    }), host);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return host;
};

const quarterRatesCalls = (calls) => calls.filter((e) => e.includes('quarter-rates'));

describe('FacilityScope — the drill opens the selected quarter', () => {
  it('requests the OPEN quarter when that is what is selected', async () => {
    const calls = stubApi();
    await mount({ quarterBack: 0 });
    const qr = quarterRatesCalls(calls);
    expect(qr.length).toBeGreaterThan(0);
    // back=0 is the backend default and is deliberately omitted from the query.
    expect(qr.every((e) => !e.includes('back='))).toBe(true);
  });

  it('requests the quarter the reader picked, not the open one', async () => {
    const calls = stubApi();
    await mount({ quarterBack: 2 });
    const qr = quarterRatesCalls(calls);
    expect(qr.length).toBeGreaterThan(0);
    expect(qr.some((e) => e.includes('back=2')), `asked for: ${qr.join(' | ')}`).toBe(true);
    // And never silently also pulls the open quarter to render instead.
    expect(qr.every((e) => e.includes('back=2'))).toBe(true);
  });

  it('re-requests when the reader changes quarter', async () => {
    const calls = stubApi();
    await mount({ quarterBack: 1 });
    expect(quarterRatesCalls(calls).some((e) => e.includes('back=1'))).toBe(true);
    await mount({ quarterBack: 3 });
    expect(quarterRatesCalls(calls).some((e) => e.includes('back=3'))).toBe(true);
  });

  it('asks the SCOPED building for that quarter, not the PCC one', async () => {
    // The two bugs compose: wrong building AND wrong quarter would each look
    // like plausible data.
    const calls = stubApi();
    await mount({ facilityName: 'Bravo Health PCC', quarterBack: 2 });
    const qr = quarterRatesCalls(calls);
    expect(qr.some((e) => e.includes('facilityName=Bravo+Health+PCC') && e.includes('back=2'))).toBe(true);
  });
});
