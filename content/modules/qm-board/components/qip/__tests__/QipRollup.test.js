/**
 * The QIP rollup.
 *
 * These focus on the two things the board refuses to do, because both are
 * failures that LOOK like working software: a building with no MDS rendered as
 * the portfolio leader, and "below the floor" collapsed into one number that
 * sends someone to change clinical practice when the real fix is a missing
 * cost-report field.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { QipRollup } from '../QipRollup.jsx';

const FLOOR = 16.5;

const fac = (over = {}) => ({
  locationId: 'a',
  name: 'Alpha Care',
  state: 'FL',
  ccn: '105001',
  floor: FLOOR,
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
  ...over,
});

const payload = (over = {}) => ({
  floor: FLOOR,
  maxPoints: 49,
  facilities: [fac()],
  notes: [],
  summary: {
    scored: 1,
    projectedQualifying: 1,
    officialQualifying: 1,
    onTheBubble: 0,
    insufficientData: 0,
    belowFloorPendingInputs: 0,
    shortAtCeiling: 0,
  },
  ...over,
});

let host;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { render(null, host); host.remove(); });

const draw = (props) => { render(h(QipRollup, props), host); return host; };

describe('QipRollup', () => {
  it('leads with points against the floor, not a percentage', () => {
    // 22/49 is 45%, a true number that answers nothing — the program pays on
    // clearing the floor.
    const el = draw({ data: payload() });
    expect(el.textContent).toContain('22.0');
    expect(el.textContent).toContain('Qualifying floor 16.5 pts');
    expect(el.textContent).not.toContain('45%');
  });

  it('shows both tracks — ours and CMS published', () => {
    const el = draw({ data: payload() });
    expect(el.textContent).toContain('pts projected · CMS 20.0');
  });

  it('renders inside the Tailwind scope container', () => {
    expect(draw({ data: payload() }).firstElementChild.className).toContain('sltc-tw');
  });

  // ── the two refusals ──────────────────────────────────────────────────────

  it('prints em-dashes for a building with no MDS, never its phantom score', () => {
    // The real bug this prevents: on a 62-building portfolio the top scorer was
    // an archived building with zero MDS posting ~24 points.
    const el = draw({
      data: payload({
        facilities: [fac({ projected: { points: 24 }, insufficientData: true })],
        summary: { ...payload().summary, scored: 0, insufficientData: 1 },
      }),
    });
    expect(el.textContent).toContain('— pts');
    expect(el.textContent).not.toContain('24.0');
    expect(el.textContent).toContain('no measure has a denominator');
  });

  it('explains WHY an unscored building is excluded rather than just hiding it', () => {
    const el = draw({
      data: payload({
        facilities: [fac({ insufficientData: true })],
        summary: { ...payload().summary, scored: 0, insufficientData: 1 },
      }),
    });
    expect(el.textContent).toContain('would rank them at the top of the board on no data');
  });

  it('splits a data-entry gap from a care gap in the headline banner', () => {
    const el = draw({
      data: payload({
        summary: { ...payload().summary, belowFloorPendingInputs: 3, shortAtCeiling: 2 },
      }),
    });
    expect(el.textContent).toContain('even crediting every missing input');
    expect(el.textContent).toContain('that is the clinical worklist');
    expect(el.textContent).toContain('a data-entry gap before a care gap');
  });

  it('says plainly when nothing is short on care', () => {
    const el = draw({
      data: payload({
        summary: { ...payload().summary, belowFloorPendingInputs: 2, shortAtCeiling: 0 },
      }),
    });
    expect(el.textContent).toContain('No building');
    expect(el.textContent).toContain('short of the floor on clinical performance');
  });

  // ── ordering + interaction ────────────────────────────────────────────────

  it('opens on the worst standing and sinks the unrankable', () => {
    const el = draw({
      data: payload({
        facilities: [
          fac({ locationId: 'ghost', name: 'Ghost Home', projected: { points: 24 }, insufficientData: true }),
          fac({ locationId: 'safe', name: 'Safe Home', projected: { points: 30 } }),
          fac({ locationId: 'short', name: 'Short Home', projected: { points: 10 }, ceiling: 11 }),
        ],
        summary: { ...payload().summary, scored: 2, insufficientData: 1 },
      }),
    });
    const names = [...el.querySelectorAll('.truncate.text-sm.font-bold')].map((n) => n.textContent);
    expect(names).toEqual(['Short Home', 'Safe Home', 'Ghost Home']);
  });

  it('hands the whole facility row to the caller, not just an id', () => {
    // Downstream needs pccFacilityName to address the building — an id alone is
    // not enough, same as the Five-Star grid.
    let got = null;
    render(h(QipRollup, { data: payload(), onSelectFacility: (f) => { got = f; } }), host);
    host.querySelector('button.group').click();
    expect(got).toMatchObject({ locationId: 'a', name: 'Alpha Care' });
  });

  it('renders the table view with all nine columns', () => {
    const el = draw({ data: payload() });
    // act(): a setState from a click isn't flushed synchronously in Preact, so
    // without it this asserts against the grid that's still on screen.
    act(() => {
      [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Table')).click();
    });
    expect(el.querySelectorAll('thead th')).toHaveLength(9);
  });

  it('shows an errored building as failed rather than scoring it', () => {
    const el = draw({ data: payload({ facilities: [fac({ error: 'Row failed: boom' })] }) });
    expect(el.textContent).toContain('Row failed: boom');
  });
});
