/**
 * Render checks for the ported FacilityFiveStar.
 *
 * Targets the port's real failure modes rather than the layout: the published /
 * predicted / projected grammar the screen exists to protect, the claims
 * carry-forward branch, the rate-unit inference, and the proximity chip's
 * suppression rule (a flag on every row is not a flag).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, h } from 'preact';
import { FacilityFiveStar } from '../FacilityFiveStar.jsx';

const ladder = (over = {}) => ({
  title: 'QM overall',
  currentStar: 3,
  nextStar: 4,
  score: 800,
  pointsAboveFloor: 20,
  pointsToNextStar: 40,
  proximity: 'in_reach',
  lowerIsBetter: false,
  maxScore: 2300,
  bands: [
    { stars: 3, label: '600–999', min: 600, max: 999, current: true },
    { stars: 4, label: '1000–1299', min: 1000, max: 1299, current: false },
  ],
  ...over,
});

const quarter = (over = {}) => ({
  label: '2026Q2',
  displayLabel: '2026-Q2',
  windowStart: '2025-07-01',
  windowEnd: '2026-06-30',
  state: 'published',
  stateLabel: 'Published',
  open: false,
  daysUntilClose: null,
  computedPoints: 1200,
  computedStar: 3,
  longStayPoints: 700,
  longStayStar: 3,
  shortStayPoints: 500,
  shortStayStar: 2,
  publishedStar: 3,
  disagreesWithPublished: false,
  pointsDeltaVsPrior: 40,
  starDeltaVsPrior: 0,
  pointsAboveFloor: 20,
  publishedOnProcessingDate: '2026-04-01',
  notes: [],
  ...over,
});

// A lower-is-better percentage measure sitting mid-band (no proximity chip).
const mdsRow = (over = {}) => ({
  key: 'ls_uti',
  measureId: 'uti',
  label: 'UTI',
  stay: 'long',
  maxPoints: 100,
  higherIsBetter: false,
  riskAdjusted: false,
  computation: 'mds',
  cmsMeasureCode: 'N024.02',
  published: { numerator: 4, denominator: 80, rate: 0.05, adjustedRate: null, points: 60 },
  live: { numerator: 3, denominator: 78, rate: 0.0385, adjustedRate: null, points: 80 },
  projected: { numerator: 3, denominator: 80, rate: 0.0375, adjustedRate: null, points: 80 },
  brackets: [
    { points: 100, min: 0, max: 0.02, current: false },
    { points: 80, min: 0.02, max: 0.06, current: true },
    { points: 60, min: 0.06, max: 1, current: false },
  ],
  liveVsPublishedPoints: 20,
  projectedVsPublishedPoints: 20,
  upside: null,
  ...over,
});

const claimsRow = (over = {}) => ({
  ...mdsRow(),
  key: 'ss_rehosp',
  measureId: null,
  label: 'Rehospitalization per 1,000 days',
  stay: 'short',
  computation: 'claims',
  cmsMeasureCode: 'S001.01',
  brackets: [
    { points: 100, min: 0, max: 500, current: false },
    { points: 50, min: 500, max: 1000, current: true },
  ],
  ...over,
});

const totals = (axis, over = {}) => ({
  axis,
  label: `${axis} total`,
  maxPoints: 2300,
  published: { points: 1150, star: 3, ladder: ladder() },
  live: { points: 1200, star: 3, ladder: ladder() },
  projected: { points: 1270, star: 4, ladder: ladder() },
  unactionedPoints: 0,
  unactionedChangesStar: false,
  starIfActioned: null,
  ...over,
});

const payload = (over = {}) => ({
  locationId: 'loc1',
  organizationId: 'org1',
  name: 'Regents Park Winter Park',
  state: 'FL',
  city: 'Winter Park',
  ccn: '455480',
  certifiedBeds: 98,
  dataStatus: 'ok',
  generatedAt: '2026-08-02T10:40:00.000Z',
  cmsAsOf: '2026-06-25',
  cmsMdsWindowEnd: '2026-03-31',
  census: { longStay: 74, shortStay: 12, total: 86 },
  published: { overall: 3, processingDate: '2026-04-01' },
  overall: { published: 3, projected: 4, delta: 1, explanation: 'x', unavailableReason: null },
  domains: {
    healthInspection: {
      publishedStar: 2,
      surveyScore: 44.5,
      state: 'FL',
      percentileInState: 38,
      facilitiesInState: 690,
      distributionProcessingDate: '2026-04-01',
      priorYear: { status: 'available', processingDate: '2025-04-01' },
      usedNationalFallback: false,
      abuseIconApplied: false,
      carriesForward: true,
      ladder: ladder({ lowerIsBetter: true, score: 44.5 }),
    },
    staffing: {
      publishedStar: 4,
      points: 300,
      maxPoints: 380,
      edition: '2026',
      ratingSource: 'published',
      nextStar: 5,
      pointsForNextStar: 40,
      precisionUnstable: false,
      reported: {
        totalNurseHprd: 3.62, rnHprd: 0.71, weekendTotalNurseHprd: 3.1,
        rnTurnoverPct: 41.2, totalNurseTurnoverPct: 52.8,
      },
      cheapestLever: { deltaLabel: '+0.08 RN HPRD', basis: 'reported', sufficientAlone: true },
      ladder: ladder({ score: 300, maxScore: 380 }),
    },
  },
  quarters: [quarter({ label: '2025Q3', displayLabel: '2025-Q3' }), quarter()],
  measures: [mdsRow(), claimsRow()],
  totals: [totals('long'), totals('short'), totals('overall')],
  action: { quarterLabel: '2026Q3', quarterEnd: '2026-09-30', daysUntilQuarterEnd: 59 },
  attention: [],
  notes: [],
  ...over,
});

let host;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { render(null, host); host.remove(); });

const draw = (props) => { render(h(FacilityFiveStar, props), host); return host; };

describe('FacilityFiveStar', () => {
  it('renders the hero from the payload', () => {
    const el = draw({ data: payload() });
    expect(el.textContent).toContain('Regents Park Winter Park');
    expect(el.textContent).toContain('Winter Park, FL · CCN 455480 · 98 beds · 74 long-stay / 12 short-stay today');
  });

  it('formats a date-only ISO string in UTC so it cannot slip a day', () => {
    // `2026-06-25` parses as UTC midnight; formatting it in LOCAL time renders
    // Jun 24 anywhere west of Greenwich. What this pins is the `timeZone: 'UTC'`
    // on the formatter — verified by mutation, and only meaningful because
    // vitest.config.js pins the runner to a negative-offset zone.
    const el = draw({ data: payload() });
    expect(el.textContent).toContain('Jun 25, 2026');
    expect(el.textContent).not.toContain('Jun 24, 2026');
  });

  // The published / predicted / projected grammar is the whole point of the
  // screen; each state has its own card class and its own note.
  it('gives each quarter state its own card class', () => {
    const el = draw({
      data: payload({
        quarters: [
          quarter({ label: 'a', displayLabel: 'a', state: 'published' }),
          quarter({ label: 'b', displayLabel: 'b', state: 'predicted' }),
          quarter({ label: 'c', displayLabel: 'c', state: 'projected', open: true, daysUntilClose: 59 }),
        ],
      }),
    });
    expect(el.querySelector('.qcard.now')).not.toBeNull();
    expect(el.querySelector('.qcard.pred')).not.toBeNull();
    expect(el.querySelector('.qcard.proj')).not.toBeNull();
  });

  it('says a closed quarter is already earned when it gained a star', () => {
    const el = draw({
      data: payload({
        quarters: [quarter({ state: 'predicted', starDeltaVsPrior: 1, computedStar: 4 })],
      }),
    });
    expect(el.textContent).toContain('4★ is already earned');
  });

  it('calls out a closed quarter with nothing computed as a gap, not a zero', () => {
    const el = draw({
      data: payload({
        quarters: [quarter({ state: 'predicted', computedPoints: null, notes: ['No MDS window.'] })],
      }),
    });
    expect(el.textContent).toContain('we hold no computable window');
  });

  it('surfaces a disagreement with CMS rather than hiding it', () => {
    const el = draw({
      data: payload({
        quarters: [quarter({ disagreesWithPublished: true, computedStar: 4, publishedStar: 3 })],
      }),
    });
    expect(el.textContent).toContain('ours 4★ · CMS 3★');
  });

  it('renders claims rows as carrying forward, not as missing data', () => {
    const el = draw({ data: payload() });
    expect(el.textContent).toContain('carries forward');
  });

  it('formats a percentage measure as a percentage and a per-1,000 measure as a raw rate', () => {
    const el = draw({ data: payload() });
    // UTC percentage row: 0.0385 → 3.85
    expect(el.textContent).toContain('3.85');
    // The per-1,000 claims row must not print 385% — it goes through the raw branch.
    expect(el.textContent).not.toContain('385.00');
  });

  it('suppresses the proximity chip for a measure sitting mid-band', () => {
    // 3.85% against a band edge at 6% is 2.15pp away — well past NEAR_PP, so no
    // chip. A flag on every row is not a flag.
    const el = draw({ data: payload() });
    expect(el.querySelector('.prox')).toBeNull();
  });

  it('flags a measure a rounding error from losing points, in the losing direction', () => {
    const near = mdsRow({
      live: { numerator: 3, denominator: 78, rate: 0.0598, adjustedRate: null, points: 80 },
    });
    const el = draw({ data: payload({ measures: [near] }) });
    const chip = el.querySelector('.prox');
    expect(chip).not.toBeNull();
    expect(chip.className).toContain('lose');
    expect(chip.textContent).toContain('▼');
  });

  it('renders a sub-0.005 gap as <0.01 rather than 0.000', () => {
    // Sitting exactly ON a band edge is the most urgent state a measure can be
    // in, so it must not be the one that looks like a failed computation.
    const onEdge = mdsRow({
      live: { numerator: 3, denominator: 78, rate: 0.06, adjustedRate: null, points: 80 },
    });
    const el = draw({ data: payload({ measures: [onEdge] }) });
    expect(el.querySelector('.prox').textContent).toContain('<0.01');
  });

  it('drills a computed measure but never a claims row', () => {
    const opened = [];
    draw({ data: payload(), onOpenMeasure: (id, back) => opened.push([id, back]) });
    const names = [...host.querySelectorAll('.mname')];
    // The MDS row is a button; the claims row (measureId null) is inert text.
    expect(names.filter((el) => el.tagName === 'BUTTON')).toHaveLength(1);
    names.find((el) => el.tagName === 'BUTTON').click();
    expect(opened).toEqual([['uti', 0]]);
  });

  it('drills on the quarter the reader selected, not always the open one', () => {
    const opened = [];
    draw({ data: payload(), quarterBack: 1, onOpenMeasure: (id, back) => opened.push([id, back]) });
    host.querySelector('button.mname').click();
    expect(opened).toEqual([['uti', 1]]);
  });

  it('explains a limited-data facility instead of rendering blanks', () => {
    const el = draw({ data: payload({ dataStatus: 'no_ccn' }) });
    expect(el.textContent).toContain('No CCN on this facility');
  });

  it('scopes out through the breadcrumb', () => {
    let out = 0;
    draw({ data: payload(), onScopeOut: () => { out += 1; } });
    host.querySelector('.crumblink').click();
    expect(out).toBe(1);
  });

  it('renders the totals star rows for all three axes', () => {
    const el = draw({ data: payload() });
    expect(el.querySelectorAll('tr.starrow')).toHaveLength(3);
  });
});

/**
 * A DEGRADED building is not an edge case: at a real 62-building org only 42 are
 * `dataStatus: 'ok'` and 7 have no CCN. About a third of the grid opens into one
 * of these, so they get the same scrutiny as the happy path.
 *
 * The service never returns a null domain summary — it substitutes
 * `emptyInspection()` / `emptyStaffing()` — but `emptyInspection().ladder` IS
 * null while `emptyStaffing().ladder` is a real (empty-band) ladder. That
 * asymmetry is the trap: the two cards cannot be written the same way.
 */
describe('FacilityFiveStar — degraded buildings', () => {
  const emptyInspection = () => ({
    publishedStar: null, surveyScore: null, state: null, percentileInState: null,
    facilitiesInState: null, distributionProcessingDate: null,
    priorYear: { status: 'collecting', boundaries: null, processingDate: null },
    usedNationalFallback: false, abuseIconApplied: false, carriesForward: false,
    ladder: null,  // ← the asymmetry
  });

  const emptyStaffing = () => ({
    publishedStar: null, ratingSource: null, points: null, maxPoints: 380,
    nextStar: null, pointsForNextStar: null,
    ladder: { ...ladder({ score: null }), bands: [] },
    cheapestLever: null, levers: [],
    reported: {
      totalNurseHprd: null, rnHprd: null, weekendTotalNurseHprd: null,
      rnTurnoverPct: null, totalNurseTurnoverPct: null,
    },
    edition: null, precisionUnstable: false, notes: [],
  });

  /** What a no-CCN building actually looks like on the wire. */
  const degraded = (over = {}) => payload({
    dataStatus: 'no_ccn',
    ccn: null,
    certifiedBeds: null,
    cmsAsOf: null,
    published: { overall: null, processingDate: null },
    overall: { published: null, projected: null, delta: null, explanation: null, unavailableReason: 'no_ccn' },
    domains: { healthInspection: emptyInspection(), staffing: emptyStaffing() },
    quarters: [],
    measures: [],
    totals: [],
    census: { longStay: 0, shortStay: 0, total: 0 },
    ...over,
  });

  it('renders a no-CCN building without throwing', () => {
    const el = draw({ data: degraded() });
    expect(el.textContent).toContain('Regents Park Winter Park');
    expect(el.textContent).toContain('No CCN on this facility');
  });

  it('survives a null inspection ladder', () => {
    // InspectionCard must guard `d.ladder`; StaffingCard must not, because its
    // ladder is always an object. Writing either one the other way throws.
    const el = draw({ data: degraded() });
    expect(el.querySelectorAll('.dcard')).toHaveLength(2);
  });

  it('renders an empty quarter track rather than a broken header', () => {
    // The grid header interpolates quarters[0] and quarters[last].
    const el = draw({ data: degraded() });
    expect(el.querySelector('.qtrack').children).toHaveLength(0);
    expect(el.textContent).toContain('Live — 4-quarter window');
  });

  it('renders an empty measure grid with no totals rows', () => {
    const el = draw({ data: degraded() });
    expect(el.querySelectorAll('tr.starrow')).toHaveLength(0);
    expect(el.querySelectorAll('.fqm tbody tr.sectionrow')).toHaveLength(2);
  });

  it('says why there is no overall rating instead of printing a bare dash', () => {
    const el = draw({ data: degraded() });
    expect(el.textContent).toContain('NO OVERALL (no ccn)');
  });

  it('handles every non-ok dataStatus with its own sentence', () => {
    for (const [status, needle] of [
      ['no_ccn', 'No CCN on this facility'],
      ['ccn_excluded', 'deliberately excluded'],
      ['no_published_snapshot', 'no published CMS snapshot'],
      ['no_computed_window', 'no computable MDS window'],
    ]) {
      const el = draw({ data: degraded({ dataStatus: status }) });
      expect(el.textContent).toContain(needle);
    }
  });

  it('still lets a degraded building be opened and scoped back out', () => {
    // The backend carries pccFacilityName on the degraded row on purpose: a
    // building whose computation failed is the one people most want to click.
    let out = 0;
    draw({ data: degraded(), onScopeOut: () => { out += 1; } });
    host.querySelector('.crumblink').click();
    expect(out).toBe(1);
  });
});
