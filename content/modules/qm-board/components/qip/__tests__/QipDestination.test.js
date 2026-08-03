/**
 * The QIP destination's routing.
 *
 * The branch ORDER here fixed a live bug on the web: with the facility scope
 * checked before the measure view, scoping into a building swallows the drill and
 * the measure never opens. And a building with no PCC name must not be addressed
 * by its display name — the same rule the Five-Star grid follows, for the same
 * reason (a 404 at best, the wrong building's numbers at worst).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { QipDestination } from '../QipDestination.jsx';

const rollupPayload = {
  floor: 16.5,
  maxPoints: 49,
  notes: [],
  summary: {
    scored: 1, projectedQualifying: 1, officialQualifying: 1, onTheBubble: 0,
    insufficientData: 0, belowFloorPendingInputs: 0, shortAtCeiling: 0,
  },
  facilities: [{
    locationId: 'loc1',
    name: 'Alpha Care',
    pccFacilityName: 'Alpha Care Center',
    state: 'FL',
    ccn: '105001',
    floor: 16.5,
    projected: { points: 22 },
    official: { points: 20 },
    delta: 2,
    ceiling: 22,
    missingPoints: 0,
    missingInputs: [],
    mdsPoints: { projected: 14 },
    nonMdsPoints: 8,
    insufficientData: false,
    error: null,
    gaps: [],
  }],
};

function stubApi(handler) {
  globalThis.chrome = { runtime: { sendMessage: vi.fn(handler) } };
}

let host;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { render(null, host); host.remove(); vi.restoreAllMocks(); });

const mount = async (props) => {
  await act(async () => {
    render(h(QipDestination, {
      orgSlug: 'org',
      view: 'overview',
      scope: 'rollup',
      quarterBack: 0,
      onSelectFacility: () => {},
      onOpenMeasure: () => {},
      onQuarterChange: () => {},
      onBackToRollup: () => {},
      onBackToFacility: () => {},
      ...props,
    }), host);
  });
  // Second flush — the first mounts and fires the request; the response lands
  // after. Without it every assertion reads an empty skeleton.
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return host;
};

describe('QipDestination', () => {
  it('lands on the rollup', async () => {
    stubApi(async () => ({ success: true, data: rollupPayload }));
    const el = await mount({});
    expect(el.textContent).toContain('Alpha Care');
    expect(el.textContent).toContain('Qualifying floor 16.5 pts');
  });

  it('reads the QIP region route, which is NOT a cache-read envelope', async () => {
    // The Five-Star region route wraps its payload in {status, payload}; this one
    // does not. Reaching for `.payload` here yields undefined and an empty board.
    stubApi(async () => ({ success: true, data: rollupPayload }));
    await mount({});
    expect(globalThis.chrome.runtime.sendMessage.mock.calls[0][0].endpoint)
      .toContain('/api/extension/qip/region');
  });

  it('surfaces a rollup failure with a retry', async () => {
    stubApi(async () => ({ success: false, error: 'nope' }));
    const el = await mount({});
    expect(el.textContent).toContain('The QIP rollup is unavailable');
  });

  it('scopes into a building by its PCC name, not its display name', async () => {
    stubApi(async (msg) => (msg.endpoint.includes('/qip/region')
      ? { success: true, data: rollupPayload }
      : { success: true, data: null }));

    await mount({
      scope: 'facility',
      scopeCtx: { name: 'Alpha Care', pccFacilityName: 'Alpha Care Center' },
    });

    const facilityCall = globalThis.chrome.runtime.sendMessage.mock.calls
      .map((c) => c[0].endpoint)
      .find((e) => e.includes('fl-qip-official'));
    expect(facilityCall).toContain('facilityName=Alpha+Care+Center');
  });

  it('refuses to address a building with no PCC name', async () => {
    stubApi(async () => ({ success: true, data: rollupPayload }));
    const el = await mount({
      scope: 'facility',
      scopeCtx: { name: 'Alpha Care', pccFacilityName: null },
    });
    expect(el.textContent).toContain("isn't");
    expect(el.textContent).toContain('PointClickCare facility name');
    // And critically: no request went out under a guessed name.
    const guessed = globalThis.chrome.runtime.sendMessage.mock.calls
      .map((c) => c[0].endpoint)
      .filter((e) => e.includes('fl-qip-official'));
    expect(guessed).toEqual([]);
  });

  // The branch-order bug.
  it('opens the measure drill instead of the facility view when a measure is set', async () => {
    stubApi(async (msg) => (msg.endpoint.includes('/qip/region')
      ? { success: true, data: rollupPayload }
      // `scoringDeferrals` rides on every real quarter-rates payload (superltc
      // #1084) and is now the ONLY source of the banner's wording — the
      // extension keeps no local copy. A fixture without it renders no banner.
      : { success: true, data: {
          quarter: { label: '2026Q2' }, rates: [], rows: [],
          scoringDeferrals: {
            pressure_ulcer_long: 'CMS publishes a risk-adjusted rate an observed roster cannot reproduce',
          },
        } }));

    const el = await mount({
      view: 'measure',
      measureId: 'pressure_ulcer_long',
      scope: 'facility',
      scopeCtx: { name: 'Alpha Care', pccFacilityName: 'Alpha Care Center' },
    });

    // The drill, with its deferral banner — not the Official-vs-Projected view.
    expect(el.textContent).toContain('QIP scorecard');
    expect(el.textContent).toContain("FL QIP scores this measure from CMS's published rate");
    expect(el.textContent).not.toContain('Official vs Projected');
  });
});
