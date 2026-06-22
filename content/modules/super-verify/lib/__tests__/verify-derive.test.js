import { describe, it, expect } from 'vitest';
import {
  summaryTiles,
  captureTile,
  countOpenQueries,
  countMissingInterviews,
  categorizeDetections,
  partitionMeasures,
  dedupeEvidence,
  componentBreakdown,
  buildImpactChips,
  detectionDisplayCode,
  sectionCodeForItem,
  interviewCells,
} from '../verify-derive.js';

describe('summaryTiles', () => {
  const data = {
    qm: { measures: [
      { triggers: true, excluded: false },
      { triggers: true, excluded: false },
      { triggers: true, excluded: true },   // excluded → not a trigger
      { triggers: false, excluded: false },
    ] },
    payment: { mode: 'medicare', delta: 48.1, current: { total: 612 }, potential: { total: 660 } },
    outstandingQueries: [
      { status: 'sent' }, { status: 'pending' }, { status: 'signed' },
    ],
    compliance: { checks: {
      bims: { status: 'passed' }, phq9: { status: 'failed' },
      gg: { status: 'passed' }, pain: { status: 'not_applicable' },
    } },
  };

  it('counts QM triggers (excluding excluded measures)', () => {
    expect(summaryTiles(data).qmTriggers).toBe(2);
  });
  it('reads the aggregate $/day delta and a formatted label', () => {
    const t = summaryTiles(data);
    expect(t.dollarsDelta).toBeCloseTo(48.1);
    expect(t.dollarsLabel).toBe('+$48/day');
  });
  it('counts open (pending/sent) queries only', () => {
    expect(summaryTiles(data).queriesOpen).toBe(2);
  });
  it('counts failed interviews as missing', () => {
    expect(summaryTiles(data).interviewsMissing).toBe(1);
  });
  it('is robust to a degraded payload (no qm/payment/queries/compliance)', () => {
    expect(summaryTiles({})).toEqual({
      qmTriggers: 0, dollarsDelta: 0, dollarsLabel: null, queriesOpen: 0, interviewsMissing: 0,
    });
  });
});

describe('captureTile', () => {
  it('shows $/day for Medicare with a positive delta', () => {
    expect(captureTile({ mode: 'medicare', delta: 48.1 })).toEqual({ display: '+$48', label: '/day to capture', muted: false });
  });
  it('shows CMI points (not $) for a CMI facility', () => {
    expect(captureTile({ mode: 'cmi', delta: 0.29 })).toEqual({ display: '+0.29', label: 'CMI to capture', muted: false });
  });
  it('mutes CMI with no lift', () => {
    expect(captureTile({ mode: 'cmi', delta: 0 })).toEqual({ display: '0.00', label: 'CMI captured', muted: true });
  });
  it('mutes when payment is not applicable', () => {
    expect(captureTile({ mode: 'not_applicable' })).toEqual({ display: '$0', label: 'captured', muted: true });
  });
});

describe('dedupeEvidence', () => {
  it('collapses repeated item=value chips', () => {
    const ev = dedupeEvidence([
      { mdsItem: 'J1800', value: '1' },
      { mdsItem: 'J1800', value: '1' },
      { mdsItem: 'J1900C', value: '2' },
    ]);
    expect(ev.map((e) => `${e.mdsItem}=${e.value}`)).toEqual(['J1800=1', 'J1900C=2']);
  });
});

describe('countOpenQueries', () => {
  it('counts pending/sent/awaiting_response, ignores signed', () => {
    expect(countOpenQueries([
      { status: 'pending' }, { status: 'sent' }, { status: 'awaiting_response' }, { status: 'signed' },
    ])).toBe(3);
  });
  it('handles missing array', () => {
    expect(countOpenQueries(undefined)).toBe(0);
  });
});

describe('countMissingInterviews', () => {
  it('counts only failed interview checks', () => {
    expect(countMissingInterviews({ checks: {
      bims: { status: 'failed' }, phq9: { status: 'failed' },
      gg: { status: 'passed' }, pain: { status: 'not_applicable' },
    } })).toBe(2);
  });
});

describe('categorizeDetections', () => {
  const data = {
    enhancedDetections: [
      // opportunity (missed, would change HIPPS, undecided)
      { mdsItem: 'I2100', itemName: 'I2100', wouldChangeHipps: true, solverStatus: 'solved' },
      // opportunity already accepted
      { mdsItem: 'O0110M1', itemName: 'O0110M1', wouldChangeHipps: true, solverStatus: 'solved', userDecision: { decision: 'agree' } },
      // risk (over-coded, no order)
      { mdsItem: 'K0510B', itemName: 'K0510B', solverStatus: 'dont_code', activeStatusPassed: false, rationale: 'no order' },
      // query in flight → not a coding card
      { mdsItem: 'E66', itemName: 'E66', wouldChangeHipps: true, solverStatus: 'query_sent' },
      // solved but no HIPPS change → not surfaced
      { mdsItem: 'B0100', itemName: 'B0100', wouldChangeHipps: false, solverStatus: 'solved' },
    ],
  };

  it('splits into opportunities and risks, ignoring in-flight queries and no-impact items', () => {
    const { items } = categorizeDetections(data);
    const codes = items.map((i) => i.mdsItem);
    expect(codes).toEqual(['I2100', 'O0110M1', 'K0510B']);
    expect(items.find((i) => i.mdsItem === 'I2100').kind).toBe('opportunity');
    expect(items.find((i) => i.mdsItem === 'K0510B').kind).toBe('risk');
  });

  it('reflects prior userDecision as a decided disposition', () => {
    const { items } = categorizeDetections(data);
    expect(items.find((i) => i.mdsItem === 'I2100').decided).toBe(null);
    expect(items.find((i) => i.mdsItem === 'O0110M1').decided).toBe('accept');
  });

  it('counts only undecided items as pending', () => {
    // I2100 + K0510B undecided; O0110M1 accepted
    expect(categorizeDetections(data).pendingCount).toBe(2);
  });
});

describe('partitionMeasures', () => {
  const qm = { measures: [
    { id: 'falls_all', triggers: true, excluded: false, facilityCount: { isNewTrigger: true } },
    { id: 'adl_decline', triggers: true, excluded: false, facilityCount: { isNewTrigger: true } },
    { id: 'phq9_depression', triggers: false, excluded: false, facilityCount: { wouldClearOnLock: true } },
    { id: 'uti', triggers: false, excluded: false, facilityCount: null },
    { id: 'catheter', triggers: true, excluded: true, exclusionReason: 'no catheter' },
  ] };

  it('separates triggering, will-clear, and excluded', () => {
    const p = partitionMeasures(qm);
    expect(p.triggering.map((m) => m.id)).toEqual(['falls_all', 'adl_decline']);
    expect(p.willClear.map((m) => m.id)).toEqual(['phq9_depression']);
    expect(p.excluded.map((m) => m.id)).toEqual(['catheter']);
  });
  it('splits triggering into new triggers (isNewTrigger) vs carries', () => {
    const q = { measures: [
      { id: 'falls_all', triggers: true, excluded: false, facilityCount: { isNewTrigger: false } },
      { id: 'adl_decline', triggers: true, excluded: false, facilityCount: { isNewTrigger: true } },
    ] };
    const p = partitionMeasures(q);
    expect(p.newTriggers.map((m) => m.id)).toEqual(['adl_decline']);
    expect(p.carries.map((m) => m.id)).toEqual(['falls_all']);
  });
  it('reports firing + clean counts', () => {
    const p = partitionMeasures(qm);
    expect(p.firingCount).toBe(2);
    expect(p.cleanCount).toBe(2); // phq9 + uti (non-triggering, non-excluded)
  });
  it('buckets excluded measures by exclusionKind', () => {
    const q = { measures: [
      { id: 'uti', excluded: true, exclusionKind: 'incomplete' },
      { id: 'catheter', excluded: true, exclusionKind: 'clinical' },
      { id: 'weight_loss', excluded: true, exclusionKind: null },
      { id: 'falls_all', triggers: true, excluded: false },
    ] };
    const p = partitionMeasures(q);
    expect(p.excludedIncomplete.map((m) => m.id)).toEqual(['uti']);
    expect(p.excludedClinical.map((m) => m.id)).toEqual(['catheter', 'weight_loss']);
  });
  it('handles null qm', () => {
    expect(partitionMeasures(null)).toEqual({
      triggering: [], newTriggers: [], carries: [], willClear: [], excluded: [],
      excludedIncomplete: [], excludedClinical: [], firingCount: 0, cleanCount: 0,
    });
  });
});

describe('componentBreakdown', () => {
  const data = {
    calculation: { hippsCode: 'IAED1' },
    summary: { potentialHippsIfCoded: 'IEAA1' },
    hippsDecoded: { nta: { code: 'ND' }, nursing: { code: 'HDE1' }, slp: { code: 'SA' }, ptot: { code: 'TA' } },
    potentialHippsDecoded: { nta: { code: 'NC' }, nursing: { code: 'ES2' }, slp: { code: 'SD' }, ptot: { code: 'TA' } },
    gapAnalysis: { componentRevenue: {
      nta: { current: 100, potential: 332, delta: 232 },
      nursing: { current: 200, potential: 410, delta: 210 },
      slp: { current: 50, potential: 146, delta: 96 },
      ptot: { current: 120, potential: 120, delta: 0 },
    } },
  };

  it('produces NTA/Nursing/SLP/PT-OT rows with current→potential CMG + delta', () => {
    const { rows } = componentBreakdown(data);
    expect(rows.map((r) => r.label)).toEqual(['NTA', 'Nursing', 'SLP', 'PT/OT']);
    expect(rows[0]).toMatchObject({ currentCmg: 'ND', potentialCmg: 'NC', delta: 232, changed: true });
  });
  it('marks an unchanged component (no delta, same CMG) as not changed', () => {
    const ptot = componentBreakdown(data).rows.find((r) => r.key === 'ptot');
    expect(ptot.changed).toBe(false);
    expect(ptot.delta).toBe(0);
  });
  it('reports maxDelta for bar scaling and the HIPPS lift', () => {
    const b = componentBreakdown(data);
    expect(b.maxDelta).toBe(232);
    expect(b.hippsCurrent).toBe('IAED1');
    expect(b.hippsPotential).toBe('IEAA1');
  });
  it('is robust to a missing breakdown payload', () => {
    const b = componentBreakdown({});
    expect(b.rows.every((r) => r.delta === 0 && !r.changed)).toBe(true);
    expect(b.maxDelta).toBe(0);
  });
});

describe('buildImpactChips', () => {
  it('builds component group-change chips (no per-item $ exists)', () => {
    const impact = {
      nta: { wouldChangeLevel: true, currentLevel: 'NE', newLevel: 'ND' },
      nursing: { wouldChangeGroup: true, currentPaymentGroup: 'HDE2', newPaymentGroup: 'HDE1' },
      slp: { wouldChangeGroup: false },
    };
    expect(buildImpactChips(impact, { mode: 'medicare' })).toEqual([
      { label: 'NTA', text: 'NE → ND' },
      { label: 'Nursing', text: 'HDE2 → HDE1' },
    ]);
  });
  it('returns [] when nothing changes', () => {
    expect(buildImpactChips({ nta: { wouldChangeLevel: false } }, {})).toEqual([]);
  });
});

describe('detectionDisplayCode', () => {
  it('collapses I8000:* composites to I8000', () => {
    expect(detectionDisplayCode('I8000:NTA:18')).toBe('I8000');
    expect(detectionDisplayCode('K0510B')).toBe('K0510B');
  });
});

describe('sectionCodeForItem', () => {
  it('extracts the MDS section letter(s)', () => {
    expect(sectionCodeForItem('I2100')).toBe('I');
    expect(sectionCodeForItem('GG0130B1')).toBe('GG');
    expect(sectionCodeForItem('I8000:NTA:18')).toBe('I');
    expect(sectionCodeForItem('')).toBe('');
  });
});

describe('interviewCells', () => {
  it('produces BIMS/PHQ-9/GG/Pain cells with tone from status', () => {
    const cells = interviewCells({ checks: {
      bims: { status: 'passed', message: 'BIMS completed' },
      phq9: { status: 'failed', message: 'Mood interview missing' },
      gg: { status: 'passed' },
      pain: { status: 'not_applicable' },
    } });
    expect(cells.map((c) => c.key)).toEqual(['bims', 'phq9', 'gg', 'pain']);
    expect(cells.find((c) => c.key === 'bims').tone).toBe('ok');
    expect(cells.find((c) => c.key === 'phq9').tone).toBe('miss');
    expect(cells.find((c) => c.key === 'pain').tone).toBe('na');
  });
});
