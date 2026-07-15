import { describe, it, expect } from 'vitest';
import {
  authoringPct,
  shouldPoll,
  polishByStdId,
  applyPolish,
  chartQualityMessage,
  POLL_CAP_MS,
} from '../generateModel.js';

describe('authoringPct', () => {
  it('computes a clamped whole percent', () => {
    expect(authoringPct({ done: 5, total: 8 })).toBe(63);
    expect(authoringPct({ done: 0, total: 8 })).toBe(0);
    expect(authoringPct({ done: 9, total: 8 })).toBe(100);
  });
  it('null when no signal (indeterminate UI, never NaN)', () => {
    expect(authoringPct(null)).toBe(null);
    expect(authoringPct({ done: 3, total: 0 })).toBe(null);
    expect(authoringPct({})).toBe(null);
  });
});

describe('shouldPoll', () => {
  const base = { payload: { authored: false }, error: null, startedAt: 1000 };
  it('polls while unauthored and inside the cap', () => {
    expect(shouldPoll({ ...base, now: 1000 + 5000 })).toBe(true);
  });
  it('stops when authored', () => {
    expect(shouldPoll({ ...base, payload: { authored: true }, now: 2000 })).toBe(false);
  });
  it('stops on error or missing payload (409 unmapped org = feature off)', () => {
    expect(shouldPoll({ ...base, error: new Error('409'), now: 2000 })).toBe(false);
    expect(shouldPoll({ ...base, payload: null, now: 2000 })).toBe(false);
  });
  it('stops past the 90s cap', () => {
    expect(shouldPoll({ ...base, now: 1000 + POLL_CAP_MS })).toBe(false);
  });
  it('stops when the caller flags stopped (fingerprint moved mid-session)', () => {
    expect(shouldPoll({ ...base, now: 2000, stopped: true })).toBe(false);
  });
});

describe('polishByStdId / applyPolish', () => {
  const gen = {
    focuses: [
      { libraryStdId: '100', description: 'Polished falls focus', goals: [{ description: 'G' }], interventions: [{ description: 'I1' }] },
      { libraryStdId: '200', description: 'Polished skin focus', goals: [], interventions: [] },
      { description: 'no stdId — unmatchable' },
    ],
  };
  const row = (rowId, stdId, desc = 'Deterministic') => ({
    _rowId: rowId,
    ruleId: `rule-${rowId}`,
    focus: { libraryStdId: stdId, description: desc, goals: [], interventions: [{ description: 'A' }, { description: 'B' }] },
  });

  it('indexes only focuses that carry a libraryStdId', () => {
    const map = polishByStdId(gen);
    expect([...map.keys()].sort()).toEqual(['100', '200']);
  });

  it('swaps polished content into untouched matching rows', () => {
    const items = [row('a', '100'), row('b', '999')];
    const { items: out, swappedCount } = applyPolish(items, polishByStdId(gen), new Set());
    expect(swappedCount).toBe(1);
    expect(out[0].focus.description).toBe('Polished falls focus');
    expect(out[0]._polished).toBe(true);
    expect(out[1]).toBe(items[1]); // unmatched row shared by reference
  });

  it('NEVER swaps a row the nurse touched', () => {
    const items = [row('a', '100'), row('b', '200')];
    const { items: out, swappedCount } = applyPolish(items, polishByStdId(gen), new Set(['a']));
    expect(swappedCount).toBe(1);
    expect(out[0].focus.description).toBe('Deterministic'); // touched → untouched by us
    expect(out[1].focus.description).toBe('Polished skin focus');
  });

  it('touched match by ruleId also blocks the swap', () => {
    const items = [row('a', '100')];
    const { swappedCount } = applyPolish(items, polishByStdId(gen), new Set(['rule-a']));
    expect(swappedCount).toBe(0);
  });

  it('does not mutate its inputs', () => {
    const items = [row('a', '100')];
    const before = JSON.stringify(items);
    applyPolish(items, polishByStdId(gen), new Set());
    expect(JSON.stringify(items)).toBe(before);
  });
});

describe('chartQualityMessage', () => {
  it('renders one human sentence per flag, never the raw flag name', () => {
    const msg = chartQualityMessage(['no_orders_synced', 'no_coded_mds']);
    expect(msg).toContain('No active orders are synced');
    expect(msg).toContain('No coded MDS assessment');
    expect(msg).toContain('still safe to use');
    expect(msg).not.toContain('no_orders_synced');
  });
  it('empty for no flags or unknown flags', () => {
    expect(chartQualityMessage([])).toBe('');
    expect(chartQualityMessage(['mystery_flag'])).toBe('');
    expect(chartQualityMessage(undefined)).toBe('');
  });
});
