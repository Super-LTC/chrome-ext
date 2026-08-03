/**
 * Render checks for the ported RegionalBoard.
 *
 * The point is NOT to re-test the web's layout — it's to catch the things a
 * TSX→JSX port actually breaks: a field read off the wrong nesting level, a
 * React-ism (`React.Fragment`, `key` on a fragment) that Preact drops silently,
 * and the optional-field fallbacks that only fire on older cached payloads.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, h } from 'preact';
import { RegionalBoard } from '../RegionalBoard.jsx';

const ladder = (maxScore) => ({
  title: 'QM',
  currentStar: 3,
  nextStar: 4,
  pointsAboveFloor: 20,
  pointsToNextStar: 40,
  proximity: 'in_reach',
  lowerIsBetter: false,
  maxScore,
  bands: [
    { stars: 3, label: '600–999', current: true },
    { stars: 4, label: '1000–1299', current: false },
  ],
});

const facility = (over = {}) => ({
  locationId: 'loc1',
  name: 'Regents Park Winter Park',
  pccFacilityName: 'Regents Park Winter Park',
  state: 'FL',
  ccn: '455480',
  certifiedBeds: 98,
  dataStatus: 'ok',
  published: { overall: 3 },
  overall: { published: 3 },
  inspection: { publishedStar: 2, surveyScore: 44, ladder: ladder(380) },
  staffing: { publishedStar: 4, points: 300, ladder: ladder(380) },
  qm: {
    publishedStar: 3,
    livePoints: { long: 700, short: 500, overall: 1200 },
    liveStars: { long: 3, short: 2, overall: 3 },
    projectedPoints: { long: 750, short: 520, overall: 1270 },
    projectedStars: { long: 3, short: 3, overall: 4 },
    projectionState: 'projected',
    starDelta: 1,
    ladders: { long: ladder(1150), short: ladder(1150), overall: ladder(2300) },
    measuresPresent: { long: 9, short: 5 },
    claimsCarriedForward: { long: null, short: null },
  },
  unactionedUpside: {},
  crossers: { on: 2, clearable: 1 },
  attention: [{ kind: 'risk', code: 'near_floor', reason: '20 pts above 3★ floor', axis: 'overall', points: 20 }],
  notes: [],
  ...over,
});

const rollup = (over = {}) => ({
  scope: 'region',
  key: 'ALL',
  label: 'Region',
  facilities: 1,
  avgPublishedOverallStar: 3,
  avgProjectedOverallStar: 4,
  avgSurveyScore: 44,
  avgStaffingPoints: 300,
  avgLongStayPoints: 700,
  avgShortStayPoints: 500,
  avgQmOverallPoints: 1200,
  avgProjectedQmStar: 4,
  publishedStarDistribution: {},
  totalCrossersOn: 2,
  totalClearableResidents: 1,
  totalUnactionedPoints: 0,
  facilitiesWhereUpsideChangesStar: 0,
  ...over,
});

const payload = (over = {}) => ({
  organizationId: 'org1',
  generatedAt: '2026-08-02T10:40:00.000Z',
  cmsAsOf: '2026-06-25',
  facilities: [facility()],
  groups: [rollup({ scope: 'state', key: 'FL', label: 'FL', facilities: 1 })],
  region: rollup(),
  needsALook: [],
  ...over,
});

let host;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { render(null, host); host.remove(); });

// h() rather than JSX: the vitest glob only picks up `*.test.js`, and esbuild
// does not parse JSX in a .js file.
const draw = (props) => { render(h(RegionalBoard, props), host); return host; };

describe('RegionalBoard', () => {
  it('renders the hero off the region rollup', () => {
    const el = draw({ data: payload() });
    expect(el.textContent).toContain('All Buildings');
    expect(el.textContent).toContain('1 facility');
    expect(el.textContent).toContain('Jun 25, 2026'); // cmsAsOf, hand-parsed
  });

  it('renders a card per building with its name and CCN sub-line', () => {
    const el = draw({ data: payload() });
    expect(el.querySelectorAll('.gcard')).toHaveLength(1);
    expect(el.textContent).toContain('Regents Park Winter Park');
    expect(el.textContent).toContain('CCN 455480 · 98 beds');
  });

  it('chips and rings only the current building', () => {
    const el = draw({ data: payload(), currentLocationId: 'loc1' });
    expect(el.querySelector('.gcard.here')).not.toBeNull();
    expect(el.textContent).toContain("You're here");
  });

  it('shows no chip when the current building could not be identified', () => {
    // The expected outcome of a failed name match — never a wrong chip.
    const el = draw({ data: payload(), currentLocationId: null });
    expect(el.querySelector('.gcard.here')).toBeNull();
    expect(el.textContent).not.toContain("You're here");
  });

  it('renders the table view with all eight columns and the rollup row', () => {
    const el = draw({ data: payload(), initialView: 'table' });
    expect(el.querySelectorAll('thead th')).toHaveLength(8);
    expect(el.querySelector('tr.rollup')).not.toBeNull();
    // The per-state band plus the facility row — proves the Fragment-per-group
    // survived the React.Fragment → preact Fragment swap.
    expect(el.querySelectorAll('tr.grow')).toHaveLength(1);
    expect(el.querySelectorAll('tr.f')).toHaveLength(1);
  });

  it('falls back to `ladders` when a cached payload predates `liveLadders`', () => {
    // A type-level field added after rows were cached must not throw on those rows.
    const el = draw({ data: payload(), initialView: 'table' });
    expect(el.querySelectorAll('.cutpop').length).toBeGreaterThan(0);
  });

  it('prefers `liveLadders` when the payload has them', () => {
    const withLive = facility();
    withLive.qm.liveLadders = {
      long: { ...ladder(1150), title: 'LIVE LONG' },
      short: ladder(1150),
      overall: ladder(2300),
    };
    const el = draw({ data: payload({ facilities: [withLive] }), initialView: 'table' });
    expect(el.textContent).toContain('LIVE LONG');
  });

  it('drops unactioned pills from the Needs-a-look rail but keeps risk', () => {
    const el = draw({
      data: payload({
        needsALook: [
          { kind: 'risk', code: 'losing_star', reason: 'projected to lose 4★ QM', axis: 'overall', points: null, locationId: 'loc1', shortName: 'Regents', facilityName: 'Regents Park Winter Park' },
          { kind: 'unactioned', code: 'unactioned_points', reason: '80 pts clearable', axis: 'overall', points: 80, locationId: 'loc1', shortName: 'Regents', facilityName: 'Regents Park Winter Park' },
        ],
      }),
    });
    expect(el.textContent).toContain('projected to lose 4★ QM');
    expect(el.textContent).not.toContain('80 pts clearable');
  });

  it('names the reason a building cannot be scored instead of showing a blank', () => {
    const el = draw({ data: payload({ facilities: [facility({ dataStatus: 'no_ccn', ccn: null })] }) });
    expect(el.textContent).toContain('no CCN matched');
    expect(el.textContent).toContain('CCN —');
  });

  it('renders the empty state when the org has no scoreable buildings', () => {
    const el = draw({ data: payload({ facilities: [], groups: [], region: rollup({ facilities: 0 }) }) });
    expect(el.textContent).toContain('No buildings to score yet.');
  });

  it('hands the whole facility row to onSelectFacility, not just an id', () => {
    // The row must carry `pccFacilityName`: no /api/extension route accepts a
    // locationId, they all resolve on PCC's name, so an id alone leaves the
    // caller unable to build a request. This is the field that makes a card
    // clickable at all.
    let got = null;
    render(h(RegionalBoard, { data: payload(), onSelectFacility: (f) => { got = f; } }), host);
    host.querySelector('.gcard').click();
    expect(got).toMatchObject({
      locationId: 'loc1',
      name: 'Regents Park Winter Park',
      pccFacilityName: 'Regents Park Winter Park',
    });
  });

  it('marks a row unopenable when it carries no PCC name, instead of guessing', () => {
    // No fallback to `name`: that would 404 for the ~5% whose names differ, and
    // could silently resolve to a DIFFERENT building if one location's display
    // name equals another's PCC name.
    let got;
    const noAddr = facility({ pccFacilityName: null });
    render(h(RegionalBoard, { data: payload({ facilities: [noAddr] }), onSelectFacility: (f) => { got = f; } }), host);
    host.querySelector('.gcard').click();
    expect(got.pccFacilityName).toBeNull();
  });

  it('carries a pccFacilityName that differs from the display name', () => {
    // 20 of 432 prod locations disagree; the card shows the short label but the
    // click must hand over the long one.
    let got = null;
    const riverside = facility({
      name: 'Riverside Premier',
      pccFacilityName: 'The Riverside Premier Rehabilitation & Healing Center',
    });
    render(h(RegionalBoard, {
      data: payload({ facilities: [riverside] }),
      onSelectFacility: (f) => { got = f; },
    }), host);
    expect(host.textContent).toContain('Riverside Premier');
    expect(host.textContent).not.toContain('Rehabilitation & Healing Center');
    host.querySelector('.gcard').click();
    expect(got.pccFacilityName).toBe('The Riverside Premier Rehabilitation & Healing Center');
  });
});


/**
 * Degraded rows are a THIRD of a real grid: at a 62-building org only 42 are
 * `dataStatus: 'ok'` and 7 have no CCN at all. `emptyRegionalRow` is what a
 * building whose computation failed serializes to — nulls almost everywhere,
 * but still carrying `pccFacilityName` on purpose, because a failed building is
 * the one a user most wants to click into.
 */
describe('RegionalBoard — degraded rows', () => {
  const nullLadder = () => ({
    title: 'QM', currentStar: null, nextStar: null, score: null,
    pointsAboveFloor: null, pointsToNextStar: null, proximity: null,
    lowerIsBetter: false, maxScore: null, bands: [],
  });

  /** Mirrors emptyRegionalRow(). */
  const emptyRow = (over = {}) => ({
    locationId: 'dead1',
    name: 'Broken Building',
    pccFacilityName: 'Broken Building PCC',
    state: 'FL',
    ccn: null,
    certifiedBeds: null,
    dataStatus: 'no_ccn',
    published: { overall: null },
    overall: { published: null },
    inspection: { publishedStar: null, surveyScore: null, ladder: null },
    staffing: { publishedStar: null, points: null, ladder: nullLadder() },
    qm: {
      publishedStar: null,
      livePoints: { long: null, short: null, overall: null },
      liveStars: { long: null, short: null, overall: null },
      projectedPoints: { long: null, short: null, overall: null },
      projectedStars: { long: null, short: null, overall: null },
      projectionState: 'projected',
      starDelta: null,
      ladders: { long: nullLadder(), short: nullLadder(), overall: nullLadder() },
      measuresPresent: { long: 0, short: 0 },
      claimsCarriedForward: { long: null, short: null },
    },
    unactionedUpside: {},
    crossers: { on: 0, clearable: 0 },
    attention: [],
    notes: ['Row failed: boom'],
    ...over,
  });

  it('renders a fully-null row as a card without throwing', () => {
    const el = draw({ data: payload({ facilities: [emptyRow()] }) });
    expect(el.querySelectorAll('.gcard')).toHaveLength(1);
    expect(el.textContent).toContain('Broken Building');
    expect(el.textContent).toContain('no CCN matched');
  });

  it('renders a fully-null row in the table view too', () => {
    const el = draw({ data: payload({ facilities: [emptyRow()] }), initialView: 'table' });
    expect(el.querySelectorAll('tr.f')).toHaveLength(1);
  });

  it('keeps a degraded building clickable — it is the one people want to open', () => {
    let got = null;
    render(h(RegionalBoard, {
      data: payload({ facilities: [emptyRow()] }),
      onSelectFacility: (f) => { got = f; },
    }), host);
    host.querySelector('.gcard').click();
    expect(got.pccFacilityName).toBe('Broken Building PCC');
  });

  it('derives point scales from defaults when the first row has no ladders', () => {
    // scalesFor() reads facilities[0].qm.ladders.*.maxScore — a degraded row
    // sorting first must not blank every points column in the grid.
    const el = draw({ data: payload({ facilities: [emptyRow(), facility()] }), initialView: 'table' });
    expect(el.textContent).toContain('/2,300');
  });

  it('mixes degraded and healthy rows in one group', () => {
    const el = draw({ data: payload({ facilities: [emptyRow(), facility()] }) });
    expect(el.querySelectorAll('.gcard')).toHaveLength(2);
  });
});
