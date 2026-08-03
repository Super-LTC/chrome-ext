/**
 * The QIP measure drill, and specifically its deferral banner.
 *
 * The banner is the reason this component exists rather than a plain roster.
 * For the four measures FL QIP scores from CMS's published rate, everything
 * below it is our live MDS view and NOT the scored input. If the banner ever
 * stops rendering, the screen still looks completely correct — a roster, real
 * names, real numbers — while asserting something false about where the score
 * came from. That is invisible to every other kind of check, so it gets tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { QipMeasureDrill } from '../QipMeasureDrill.jsx';

/**
 * A resident ROW, in the shape `buildDenominatorView` actually consumes — the
 * roster lives on `qr.rows` with a per-measure cell, not nested under each rate.
 * Derived from qm-denominator-view.js rather than invented; the first version of
 * this fixture guessed and the tests caught it.
 */
const row = (patientId, name, cell = {}) => ({
  patientId,
  name,
  stayType: 'long',
  cdif: 120,
  dischargeStatus: 'active',
  measures: [{
    measureId: cell.measureId ?? 'uti',
    applicable: cell.applicable ?? true,
    excluded: cell.excluded ?? false,
    skipped: cell.skipped ?? false,
    triggers: cell.triggers ?? false,
    reason: cell.reason ?? null,
  }],
});

/**
 * The four-entry map the server attaches to every quarter-rates payload
 * (superltc #1084). Since the extension keeps NO local copy, a fixture without
 * this renders no banner — which is the behaviour, not a bug.
 */
const SERVER_DEFERRALS = {
  antipsychotic_long: "CMS scores the Jan-2026 hybrid measure with Medicare/Medicaid pharmacy-claims data no MDS view contains",
  pressure_ulcer_long: 'CMS publishes a risk-adjusted rate an observed roster cannot reproduce',
  bb_new_worsened: 'CMS publishes a risk-adjusted rate an observed roster cannot reproduce',
  influenza_vaccine: 'CMS scores the influenza-season cohort (Oct-Mar), a different population than any calendar quarter',
};

const quarterRates = (measureId, over = {}) => ({
  quarter: { label: '2026Q2', start: '2026-04-01', end: '2026-06-30' },
  scoringDeferrals: SERVER_DEFERRALS,
  rates: [{ measureId, label: measureId, numerator: 1, denominator: 2, rate: 0.5 }],
  rows: [
    row('p1', 'Test Resident', { measureId, triggers: true }),
    row('p2', 'Other Resident', { measureId }),
  ],
  ...over,
});

/**
 * The drill reads its data through useQuarterRates, which talks to the
 * background worker. Stub chrome.runtime so the component's real hook runs
 * against a controlled response rather than mocking the hook itself — that way
 * the envelope handling stays under test too.
 */
function stubApi(response) {
  globalThis.chrome = {
    runtime: { sendMessage: vi.fn().mockResolvedValue(response) },
  };
}

let host;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { render(null, host); host.remove(); vi.restoreAllMocks(); });

/**
 * Mount and let the data land.
 *
 * `act` is required, not a nicety: Preact flushes effects on
 * requestAnimationFrame, so draining `setTimeout(0)` never runs them and the
 * fetch is never even fired. An earlier version of this file did exactly that
 * and "passed" 6 of 9 — every one of which was asserting against a component
 * still showing its skeleton. Anything that renders the LOADED state has to go
 * through here.
 */
const mount = async (props) => {
  await act(async () => {
    render(h(QipMeasureDrill, {
      facilityName: 'Test Facility PCC',
      buildingName: 'Test Facility',
      orgSlug: 'org',
      quarterBack: 0,
      onQuarterChange: () => {},
      onBack: () => {},
      ...props,
    }), host);
  });
  // SECOND flush, and it is not redundant. The first act mounts and fires the
  // request; the response lands after it, so the component is still showing its
  // skeleton at that point. Verified directly: one act → "QIP scorecardUTI",
  // two → the full roster. Without this every assertion about loaded content
  // would be checking an empty skeleton and passing for the wrong reason.
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return host;
};

/** Guard: the roster really did render, so a skeleton can't masquerade as a pass. */
const expectLoaded = (el) => expect(el.querySelector('.animate-pulse')).toBeNull();

describe('QipMeasureDrill — deferral banner', () => {
  it('shows the banner, in the deferral\'s own words, for a deferred measure', async () => {
    stubApi({ success: true, data: quarterRates('pressure_ulcer_long') });
    const el = await mount({ measureId: 'pressure_ulcer_long' });

    expect(el.textContent).toContain("FL QIP scores this measure from CMS's published rate");
    // The specific reason, not a generic "deferred" — risk-adjusted and
    // wrong-cohort are different problems.
    expectLoaded(el);
    expect(el.textContent).toContain('risk-adjusted rate an observed roster cannot reproduce');
    // And the disclaimer that the roster is not the scored input.
    expect(el.textContent.replace(/\s+/g, ' ')).toContain('it is not the input behind the scored number');
  });

  it('names the influenza cohort mismatch specifically', async () => {
    stubApi({ success: true, data: quarterRates('influenza_vaccine') });
    const el = await mount({ measureId: 'influenza_vaccine' });
    expect(el.textContent).toContain('Oct-Mar');
  });

  it('shows NO banner for a measure FL scores from our own MDS', async () => {
    // The banner must mean something when it appears — on every row it is noise.
    stubApi({ success: true, data: quarterRates('uti') });
    const el = await mount({ measureId: 'uti' });
    expectLoaded(el);
    expect(el.textContent).not.toContain("FL QIP scores this measure");
  });

  it('renders the SERVER\'s wording, not a copy of its own', async () => {
    // The point of #1084: one source for the words. A sentinel proves the banner
    // passes through whatever the payload says rather than hardcoding it — which
    // a fixture using the real strings could not distinguish.
    stubApi({ success: true, data: quarterRates('uti', {
      scoringDeferrals: { uti: 'SERVER-AUTHORED SENTINEL' },
    }) });
    const el = await mount({ measureId: 'uti' });
    expect(el.textContent).toContain('SERVER-AUTHORED SENTINEL');
  });

  it('shows no banner when the roster fails to load', async () => {
    // The reason travels ON the payload, so a failed fetch has none — and that
    // is right: there is no roster on screen to be misread, and the failure
    // message says so. (Before #1084 a local copy kept the banner up here.)
    stubApi({ success: false, error: 'boom' });
    const el = await mount({ measureId: 'bb_new_worsened' });
    expect(el.textContent).not.toContain("FL QIP scores this measure");
    expect(el.textContent).toContain('Could not load this quarter');
  });
});

describe('QipMeasureDrill — data path', () => {
  it('requests the SCOPED building, not whichever board is loaded', async () => {
    // The bug this component was created to fix: drilling into building B
    // showed building A's residents.
    stubApi({ success: true, data: quarterRates('uti') });
    await mount({ measureId: 'uti', facilityName: 'Building B PCC' });

    const endpoint = globalThis.chrome.runtime.sendMessage.mock.calls[0][0].endpoint;
    expect(endpoint).toContain('facilityName=Building+B+PCC');
  });

  it('asks for the selected quarter', async () => {
    stubApi({ success: true, data: quarterRates('uti') });
    await mount({ measureId: 'uti', quarterBack: 2 });
    expect(globalThis.chrome.runtime.sendMessage.mock.calls[0][0].endpoint).toContain('back=2');
  });

  it('renders a failure message rather than spinning a skeleton forever', async () => {
    // useQuarterRates resolves to null on error by design (the tiles degrade to
    // the active rate). A screen that IS this payload cannot tell that from
    // "still loading" without the `failed` flag.
    stubApi({ success: false, error: 'nope' });
    const el = await mount({ measureId: 'uti' });
    expect(el.textContent).toContain('Could not load this quarter for this building');
    expect(el.querySelector('.animate-pulse')).toBeNull();
  });

  it('says so when the measure has no evaluated residents that quarter', async () => {
    stubApi({ success: true, data: { quarter: { label: '2026Q2' }, rates: [], rows: [] } });
    const el = await mount({ measureId: 'uti' });
    expectLoaded(el);
    expect(el.textContent).toContain('no evaluated residents in 2026Q2');
  });

  it('renders inside the Tailwind scope container', async () => {
    // Ported web markup is Tailwind-styled; without .sltc-tw none of it applies.
    stubApi({ success: true, data: quarterRates('uti') });
    const el = await mount({ measureId: 'uti' });
    expect(el.firstElementChild.className).toContain('sltc-tw');
  });
});
