import { describe, it, expect } from 'vitest';
import {
  summaryTiles,
  captureTile,
  countOpenQueries,
  countMissingInterviews,
  categorizeDetections,
  groupQmByBucket,
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

describe('captureTile (from reimbursementHeadline)', () => {
  it('shows $/day for dollars kind with a lift', () => {
    expect(captureTile({ kind: 'dollars', hasLift: true, deltaValue: 42.1 })).toEqual({ display: '+$42', label: '/day to capture', muted: false });
  });
  it('shows CMI points (not $) for cmi kind', () => {
    expect(captureTile({ kind: 'cmi', hasLift: true, deltaValue: 0.29 })).toEqual({ display: '+0.29', label: 'CMI to capture', muted: false });
  });
  it('mutes cmi with no lift', () => {
    expect(captureTile({ kind: 'cmi', hasLift: false, deltaValue: 0 })).toEqual({ display: '0.00', label: 'CMI captured', muted: true });
  });
  it('mutes kind none / missing headline', () => {
    expect(captureTile({ kind: 'none', hasLift: false })).toEqual({ display: '$0', label: 'captured', muted: true });
    expect(captureTile(undefined)).toEqual({ display: '$0', label: 'captured', muted: true });
  });
  it('falls back to payment.delta when the headline is absent but payment has a lift', () => {
    expect(captureTile(null, { mode: 'cmi', delta: 0.29 })).toEqual({ display: '+0.29', label: 'CMI to capture', muted: false });
    expect(captureTile({ hasLift: false }, { mode: 'medicare', delta: 48 })).toEqual({ display: '+$48', label: '/day to capture', muted: false });
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

describe('groupQmByBucket', () => {
  const qm = { measures: [
    { id: 'adl_decline', verifyBucket: 'new_trigger' },
    { id: 'phq9_depression', verifyBucket: 'will_clear' },
    { id: 'weight_loss', verifyBucket: 'clearable' },
    { id: 'falls_all', verifyBucket: 'locked' },
    { id: 'uti', verifyBucket: 'incomplete' },
    { id: 'catheter', verifyBucket: 'clinical' },
    { id: 'pressure_ulcer_long', verifyBucket: 'clean' },
  ] };

  it('groups by verifyBucket (will_clear + clearable share the clearing worklist)', () => {
    const g = groupQmByBucket(qm);
    expect(g.newTrigger.map((m) => m.id)).toEqual(['adl_decline']);
    expect(g.clearing.map((m) => m.id)).toEqual(['phq9_depression', 'weight_loss']);
    expect(g.locked.map((m) => m.id)).toEqual(['falls_all']);
    expect(g.incomplete.map((m) => m.id)).toEqual(['uti']);
    expect(g.clinical.map((m) => m.id)).toEqual(['catheter']);
  });
  it('counts triggering buckets (new_trigger/will_clear/clearable/locked) as firing', () => {
    expect(groupQmByBucket(qm).firingCount).toBe(4);
  });
  it('falls back to deriving a bucket when verifyBucket is absent (older response)', () => {
    const legacy = { measures: [
      { id: 'a', triggers: true, facilityCount: { isNewTrigger: true } },
      { id: 'b', triggers: false, facilityCount: { wouldClearOnLock: true } },
      { id: 'c', excluded: true, exclusionKind: 'incomplete' },
    ] };
    const g = groupQmByBucket(legacy);
    expect(g.newTrigger.map((m) => m.id)).toEqual(['a']);
    expect(g.clearing.map((m) => m.id)).toEqual(['b']);
    expect(g.incomplete.map((m) => m.id)).toEqual(['c']);
  });
  it('handles null qm', () => {
    expect(groupQmByBucket(null)).toEqual({
      newTrigger: [], clearing: [], locked: [], incomplete: [], clinical: [], firingCount: 0,
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
