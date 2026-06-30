import { describe, it, expect } from 'vitest';
import { buildFiveStarScorecard, buildUpcomingCrossers, buildDfsStrip, buildMeasureResidents, summarizeMeasureResidents } from '../qm-fivestar-view.js';

const rate = (measureId, num, den, nonCms = false) => ({
  measureId,
  label: measureId,
  numerator: num,
  denominator: den,
  rate: den > 0 ? num / den : 0,
  nonCms,
});

function rolling(lastRates, currentRates) {
  return {
    quarters: [
      { label: '2025Q4', start: '2025-10-01', end: '2025-12-31', rates: lastRates },
      { label: '2026Q1', start: '2026-01-01', end: '2026-03-31', rates: currentRates },
    ],
    rolling: [],
    projection: {},
  };
}

const prediction = {
  available: true,
  anchor: { qm: 4 },
  predicted: { overall: { predictedStar: 3, trend: 'down' } },
};

describe('buildFiveStarScorecard', () => {
  it('pairs last-complete vs current quarter, orients trend, filters lens, and pulls the star', () => {
    const sc = buildFiveStarScorecard(
      rolling(
        [rate('uti', 2, 70), rate('catheter', 1, 64), rate('falls_all', 9, 70, true)], // falls_all nonCms → dropped
        [rate('uti', 1, 74), rate('catheter', 3, 66)],
      ),
      prediction,
      'five_star',
      null,
    );

    expect(sc.lastLabel).toBe('2025Q4');
    expect(sc.currentLabel).toBe('2026Q1');
    expect(sc.anchorStar).toBe(4);
    expect(sc.projectedStar).toBe(3); // star stays predictor-sourced (anchor+delta), not points-derived
    expect(sc.starTrend).toBe('down');

    // the points tally is summed on the CURRENT rate, not the basis of the projected star
    expect(sc.headline.pointsBasis).toBe('current-rate');

    // nonCms measure excluded
    expect(sc.measures.map((m) => m.id).sort()).toEqual(['catheter', 'uti']);

    // every measure carries a numeric leverage score; the table sorts on it
    // (highest first) and the headline's top fix is that lead measure.
    for (const m of sc.measures) expect(typeof m.leverage).toBe('number');
    expect(sc.measures[0].leverage).toBeGreaterThanOrEqual(sc.measures[1].leverage);
    if (sc.headline.topFix) expect(sc.headline.topFix.id).toBe(sc.measures[0].id);

    const uti = sc.measures.find((m) => m.id === 'uti');
    expect(uti.last).toEqual({ label: '2025Q4', numerator: 2, denominator: 70, rate: 2 / 70 });
    expect(uti.current.numerator).toBe(1);
    // UTI rate dropped (2/70 → 1/74) → improved (lower is better)
    expect(uti.trend).toBe('improved');

    const cath = sc.measures.find((m) => m.id === 'catheter');
    // catheter rate rose (1/64 → 3/66) → worsened
    expect(cath.trend).toBe('worsened');
  });

  it('excludes discharge_function from the table — it lives in its own strip, not a quarter row', () => {
    const sc = buildFiveStarScorecard(
      rolling(
        [rate('uti', 1, 70), rate('discharge_function', 5, 7)],
        [rate('uti', 1, 74), rate('discharge_function', 6, 9)],
      ),
      prediction,
      'five_star',
      null,
    );
    expect(sc.measures.some((m) => m.id === 'discharge_function')).toBe(false);
    expect(sc.measures.some((m) => m.id === 'uti')).toBe(true);
  });

  it('handles a measure with no prior quarter (current only) → flat trend, null delta, and null star w/o prediction', () => {
    const sc = buildFiveStarScorecard(
      rolling([], [rate('pressure_ulcer_long', 3, 64)]),
      null,
      'five_star',
      null,
    );
    expect(sc.measures).toHaveLength(1);
    expect(sc.measures[0].last).toBeNull();
    expect(sc.measures[0].trend).toBe('flat');
    expect(sc.measures[0].deltaPts).toBeNull();
    expect(sc.anchorStar).toBeNull(); // no prediction
  });
});

describe('summarizeMeasureResidents', () => {
  const mk = (status, clearKind, i) => ({
    patientId: `p${i}`,
    name: `R${i}`,
    stayType: 'long',
    status,
    clearKind,
    clearShort: clearKind === 'now' ? 'Clearable now' : clearKind,
    date: '2026-05-18',
    note: 'x',
    pendingSubmission: false,
  });

  it('numerator = active triggering + discharged (reconciles with the rate); splits the active by clear path', () => {
    const residents = [
      ...Array.from({ length: 6 }, (_, i) => mk('triggering', 'now', i)), // MDS-clearable (coding fix)
      ...Array.from({ length: 24 }, (_, i) => mk('triggering', 'conditional', 100 + i)), // clinical-gated
      ...Array.from({ length: 3 }, (_, i) => mk('discharged', 'locked', 300 + i)),
      ...Array.from({ length: 4 }, (_, i) => mk('crossing', 'wait', 200 + i)),
    ];
    const s = summarizeMeasureResidents(residents);

    expect(s.activeCount).toBe(30);
    expect(s.dischargedCount).toBe(3);
    // the numerator includes discharged — this is what must equal rate.numerator
    expect(s.numerator).toBe(33);
    expect(s.clearMds).toBe(6); // now/date kinds → clear with an MDS
    expect(s.clinical).toBe(24); // conditional kind → needs a clinical fix
    expect(s.crossing).toBe(4); // crossers are NOT in the numerator
    expect(s.total).toBe(37);
  });

  it('counts discharged-only numerators (the UTI 1/92-is-discharged case)', () => {
    const s = summarizeMeasureResidents([mk('discharged', 'locked', 1)]);
    expect(s.numerator).toBe(1);
    expect(s.dischargedCount).toBe(1);
    expect(s.activeCount).toBe(0);
    expect(s.clearMds).toBe(0);
    expect(s.clinical).toBe(0);
  });
});

describe('buildMeasureResidents (roster-driven)', () => {
  const row = (patientId, name, discharged, triggers, targetAccepted = true) => ({
    patientId,
    name,
    dischargeStatus: discharged ? 'discharged' : 'active',
    stayType: 'long',
    cdif: 200,
    targetAccepted,
    targetArd: '2026-05-18',
    measures: [{ measureId: 'uti', applicable: true, excluded: false, skipped: false, triggers, reason: null }],
  });

  const board = {
    currentlyTriggering: {
      patients: [
        { patientId: 'a', measures: [{ id: 'uti', triggers: true, clearability: 'clear_now', clearGuidance: { actionType: 'modification', clearsOnNextObra: true, actions: [{ label: 'open a fresh MDS' }] } }], target: { ardDate: '2026-05-18' } },
      ],
    },
    upcoming: { upcomingPatients: [] },
  };

  it('includes discharged numerator residents and reconciles the numerator with the roster', () => {
    const roster = [row('a', 'Active Andy', false, true), row('b', 'Discharged Dan', true, true), row('c', 'NotInNum Ned', false, false)];
    const residents = buildMeasureResidents(roster, 'uti', { board, isCurrent: true });

    // c doesn't trigger → excluded; a (active) + b (discharged) are the numerator
    expect(residents.map((r) => r.patientId).sort()).toEqual(['a', 'b']);
    const andy = residents.find((r) => r.patientId === 'a');
    expect(andy.status).toBe('triggering');
    expect(andy.clearKind).toBe('now'); // pulled from the board's clearability ('clear_now')
    const dan = residents.find((r) => r.patientId === 'b');
    expect(dan.status).toBe('discharged');
    expect(dan.clearKind).toBe('locked');
  });

  it('past quarter: no board layered (no clear-now), discharged still shown', () => {
    const roster = [row('a', 'Active Andy', false, true), row('b', 'Discharged Dan', true, true)];
    const residents = buildMeasureResidents(roster, 'uti', { board: null, isCurrent: false });
    // No board → active resident has no derived clear lever (falls back to 'wait', not 'now').
    expect(residents.find((r) => r.patientId === 'a').clearKind).toBe('wait');
    expect(residents.find((r) => r.patientId === 'b').status).toBe('discharged');
  });
});

describe('buildUpcomingCrossers', () => {
  const board = (upcomingPatients) => ({
    currentlyTriggering: { facilityDate: '2026-06-27' },
    upcoming: { upcomingPatients },
  });

  it('collapses to one row per resident (multi-measure), filters lens, orders by date, computes days-until', () => {
    const crossers = buildUpcomingCrossers(
      board([
        {
          patientId: 'a',
          firstName: 'JANE',
          lastName: 'BEINING',
          projectedHits: [
            { id: 'antipsychotic_long', crossingDate: '2026-07-19', bucket: 'carryover' },
            { id: 'falls_all', crossingDate: '2026-07-22', bucket: 'preventable' }, // nonCms → dropped by lens
          ],
        },
        {
          patientId: 'b',
          firstName: 'SAM',
          lastName: 'KNOTT',
          projectedHits: [{ id: 'uti', crossingDate: '2026-07-05', bucket: 'preventable' }],
        },
      ]),
      'five_star',
      null,
    );

    // KNOTT (Jul 5) sorts ahead of BEINING (Jul 19)
    expect(crossers.map((c) => c.patientId)).toEqual(['b', 'a']);

    const knott = crossers[0];
    expect(knott.name).toBe('KNOTT, SAM');
    expect(knott.crossingDate).toBe('2026-07-05');
    expect(knott.daysUntil).toBe(8); // from facility 'today' 2026-06-27
    expect(knott.anyPreventable).toBe(true);

    const beining = crossers[1];
    // falls_all is not in the five-star lens → only antipsychotic survives
    expect(beining.measures.map((m) => m.id)).toEqual(['antipsychotic_long']);
    expect(beining.crossingDate).toBe('2026-07-19');
  });

  it('drops residents whose only hits fall outside the lens', () => {
    const crossers = buildUpcomingCrossers(
      board([{ patientId: 'a', firstName: 'X', lastName: 'Y', projectedHits: [{ id: 'falls_all', crossingDate: '2026-07-01', bucket: 'preventable' }] }]),
      'five_star',
      null,
    );
    expect(crossers).toHaveLength(0);
  });
});

describe('buildDfsStrip', () => {
  const dfsPayload = (over = {}) => ({
    available: true,
    nationalRate: 0.55,
    cms: { rateShown: 0.6, numerator: 30, denominator: 50, windowStart: '07/01/2024', windowEnd: '06/30/2025' },
    live: { rate: 0.8, numerator: 8, denominator: 10, windowStart: '2025-06-28', windowEnd: '2026-06-27', coveragePct: 20 },
    inProgress: {
      total: 2,
      atRisk: 1,
      residents: [
        { projectedObserved: 42, expected: 40 }, // on track → meets
        { projectedObserved: 38, expected: 41 }, // behind → misses
      ],
    },
    ...over,
  });

  it('returns null when DFS is unavailable or absent', () => {
    expect(buildDfsStrip(null)).toBeNull();
    expect(buildDfsStrip({ available: false })).toBeNull();
  });

  it('exposes Current (live) + Official (cms) + in-house count, and DFS Five-Star points — no predicted rate', () => {
    const s = buildDfsStrip(dfsPayload());
    // Current = live as-is
    expect(s.current.rate).toBe(0.8);
    expect(s.current.numerator).toBe(8);
    expect(s.current.denominator).toBe(10);
    expect(s.current.coveragePct).toBe(20);
    // in-house residents are surfaced as a COUNT — no forward/projected rate
    expect(s.inHouseCount).toBe(2);
    expect('projected' in s).toBe(false);
    // Official = cms
    expect(s.official.rate).toBe(0.6);
    expect(s.official.numerator).toBe(30);
    expect(s.nationalRate).toBe(0.55);
    // DFS contributes real Five-Star points (scored on the current rate)
    expect(s.points).not.toBeNull();
    expect(s.maxPoints).not.toBeNull();
    expect(s.points).toBeGreaterThanOrEqual(0);
    expect(s.points).toBeLessThanOrEqual(s.maxPoints);
  });

  it('official is null when CMS has not published a rate', () => {
    const s = buildDfsStrip(dfsPayload({ cms: null }));
    expect(s.official).toBeNull();
    // still has current
    expect(s.current.rate).toBe(0.8);
  });
});
