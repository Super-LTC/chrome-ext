// content/modules/managed-care/lib/recert-utils.test.js
import { describe, it, expect } from 'vitest';
import {
  resolveRelativeDate, isInProgress, isStuck, groupByDay, runBadgeCounts
} from './recert-utils.js';

const NOW = new Date('2026-06-11T18:00:00Z');

describe('resolveRelativeDate', () => {
  it('resolves today', () => expect(resolveRelativeDate('today', NOW)).toBe('2026-06-11'));
  it('resolves -30d', () => expect(resolveRelativeDate('-30d', NOW)).toBe('2026-05-12'));
  it('resolves -7d', () => expect(resolveRelativeDate('-7d', NOW)).toBe('2026-06-04'));
  it('passes through absolute dates', () => expect(resolveRelativeDate('2026-01-15', NOW)).toBe('2026-01-15'));
  it('returns null on garbage', () => expect(resolveRelativeDate('banana', NOW)).toBe(null));
});

describe('isInProgress', () => {
  for (const s of ['pending', 'fetching_documents', 'extracting', 'all_documents_extracted', 'generating_defense']) {
    it(`${s} is in progress`, () => expect(isInProgress(s)).toBe(true));
  }
  it('completed is not', () => expect(isInProgress('completed')).toBe(false));
  it('failed is not', () => expect(isInProgress('failed')).toBe(false));
});

describe('isStuck', () => {
  it('in-progress + updatedAt 31min ago → stuck', () => {
    expect(isStuck({ status: 'extracting', updatedAt: '2026-06-11T17:29:00Z' }, NOW)).toBe(true);
  });
  it('in-progress + updatedAt 5min ago → not stuck', () => {
    expect(isStuck({ status: 'extracting', updatedAt: '2026-06-11T17:55:00Z' }, NOW)).toBe(false);
  });
  it('completed is never stuck', () => {
    expect(isStuck({ status: 'completed', updatedAt: '2026-06-11T10:00:00Z' }, NOW)).toBe(false);
  });
});

describe('groupByDay', () => {
  it('buckets Today / Yesterday / Earlier off createdAt (local time)', () => {
    const runs = [
      { id: 'a', createdAt: '2026-06-11T14:00:00Z' },
      { id: 'b', createdAt: '2026-06-10T23:00:00Z' },
      { id: 'c', createdAt: '2026-06-01T08:00:00Z' },
    ];
    const groups = groupByDay(runs, NOW);
    expect(groups.map(g => [g.label, g.runs.map(r => r.id)])).toEqual([
      ['Today', ['a']], ['Yesterday', ['b']], ['Earlier', ['c']],
    ]);
  });
  it('omits empty groups', () => {
    expect(groupByDay([{ id: 'a', createdAt: '2026-06-11T14:00:00Z' }], NOW).map(g => g.label)).toEqual(['Today']);
  });
});

describe('runBadgeCounts', () => {
  it('counts in-flight + unseen-completed', () => {
    const runs = [
      { id: 'a', status: 'extracting' },
      { id: 'b', status: 'completed' },
      { id: 'c', status: 'completed' },
      { id: 'd', status: 'failed' },
    ];
    const unseen = new Set(['b', 'd']);
    expect(runBadgeCounts(runs, unseen)).toEqual({ inFlight: 1, unseenDone: 2 });
  });
});
