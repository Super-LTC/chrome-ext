import { describe, it, expect } from 'vitest';
import {
  isSummaryKey,
  itemLabel,
  assessmentLabel,
  groupEvidence,
  evidenceItemCodes,
} from '../evidence-model.js';

// Shapes copied from what the evaluators actually emit:
// core/services/qm-planner/evaluators/adl-decline.evaluator.ts (target + prior)
// core/services/qm-planner/evaluators/discharge-function.evaluator.ts (DFS-summary)
const TARGET = 'tgt-1';
const PRIOR = 'pri-1';

const ADL_DECLINE_EVIDENCE = [
  { mdsItem: 'GG0130A3', value: '05', assessmentId: TARGET, assessmentArdDate: '2026-06-09', assessmentType: 'OBRA Quarterly' },
  { mdsItem: 'GG0130A1', value: '06', assessmentId: PRIOR, assessmentArdDate: '2026-04-30', assessmentType: 'OBRA Quarterly', note: 'Prior value for comparison' },
  { mdsItem: 'GG0170D3', value: '05', assessmentId: TARGET, assessmentArdDate: '2026-06-09', assessmentType: 'OBRA Quarterly' },
  { mdsItem: 'GG0170D1', value: '06', assessmentId: PRIOR, assessmentArdDate: '2026-04-30', assessmentType: 'OBRA Quarterly', note: 'Prior value for comparison' },
];

const DFS_EVIDENCE = [
  { mdsItem: 'GG0130A3', value: '4', assessmentId: TARGET, assessmentArdDate: '2026-06-09', assessmentType: 'PPS Discharge' },
  { mdsItem: 'DFS-summary', value: 44, assessmentId: TARGET, assessmentArdDate: '2026-06-09', assessmentType: 'PPS Discharge', note: 'observed=44, expected=47, delta=-3' },
];

describe('isSummaryKey', () => {
  it('flags computed summary rows, not MDS items', () => {
    expect(isSummaryKey('DFS-summary')).toBe(true);
    expect(isSummaryKey('GG0130A3')).toBe(false);
    expect(isSummaryKey(undefined)).toBe(false);
  });
});

describe('itemLabel', () => {
  it('names GG items regardless of column suffix', () => {
    // The whole point: the evaluator emits the target as ...A3 and the prior as
    // ...A1, and both must read "Eating".
    expect(itemLabel('GG0130A3')).toBe('Eating');
    expect(itemLabel('GG0130A1')).toBe('Eating');
    expect(itemLabel('GG0170D3')).toBe('Sit to stand');
  });

  it('falls back to the raw code for non-GG items', () => {
    expect(itemLabel('I2300')).toBe('I2300');
    expect(itemLabel('')).toBe('');
  });
});

describe('assessmentLabel', () => {
  it('renders type and ARD', () => {
    expect(assessmentLabel({ assessmentType: 'OBRA Quarterly', assessmentArdDate: '2026-04-30' }))
      .toBe('OBRA Quarterly · Apr 30, 2026');
  });

  it('does NOT shift the day in a negative-offset timezone', () => {
    // new Date('2026-01-01') parses as UTC and prints Dec 31 in US timezones.
    // An ARD off by one looks plausible, which is what makes it dangerous.
    expect(assessmentLabel({ assessmentType: 'PPS Discharge', assessmentArdDate: '2026-01-01' }))
      .toBe('PPS Discharge · Jan 1, 2026');
  });

  it('degrades without throwing on a missing or malformed date', () => {
    expect(assessmentLabel({ assessmentType: 'OBRA Quarterly' })).toBe('OBRA Quarterly');
    expect(assessmentLabel({})).toBe('');
    expect(assessmentLabel(null)).toBe('');
  });
});

describe('groupEvidence', () => {
  it('separates the MDS under review from what it is compared against', () => {
    const { groups } = groupEvidence(ADL_DECLINE_EVIDENCE, TARGET);
    expect(groups).toHaveLength(2);
    expect(groups[0].isTarget).toBe(true);      // target sorts first
    expect(groups[1].isTarget).toBe(false);
    expect(groups[1].label).toBe('OBRA Quarterly · Apr 30, 2026');
  });

  it('keeps both sides of a decline so 6 → 5 is visible', () => {
    const { groups } = groupEvidence(ADL_DECLINE_EVIDENCE, TARGET);
    const eating = (g) => g.rows.find((r) => itemLabel(r.mdsItem) === 'Eating');
    expect(eating(groups[0]).value).toBe('05');
    expect(eating(groups[1]).value).toBe('06');
  });

  it('lifts DFS-summary out of the item chips', () => {
    const { summaries, groups } = groupEvidence(DFS_EVIDENCE, TARGET);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].note).toContain('expected=47');
    // the synthetic key must not appear as an item chip
    expect(groups.flatMap((g) => g.rows).map((r) => r.mdsItem)).toEqual(['GG0130A3']);
  });

  it('handles empty evidence', () => {
    expect(groupEvidence([], TARGET)).toEqual({ summaries: [], groups: [] });
    expect(groupEvidence(undefined, TARGET)).toEqual({ summaries: [], groups: [] });
  });
});

describe('evidenceItemCodes', () => {
  it('excludes synthetic keys so the View button never deep-links a non-item', () => {
    expect(evidenceItemCodes({ evidence: DFS_EVIDENCE })).toEqual(['GG0130A3']);
  });

  it('dedupes and tolerates a missing measure', () => {
    expect(evidenceItemCodes({ evidence: ADL_DECLINE_EVIDENCE })).toEqual([
      'GG0130A3', 'GG0130A1', 'GG0170D3', 'GG0170D1',
    ]);
    expect(evidenceItemCodes(undefined)).toEqual([]);
  });
});
