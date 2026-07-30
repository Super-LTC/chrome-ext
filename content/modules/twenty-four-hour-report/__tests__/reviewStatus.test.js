import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  initialsOf,
  REVIEW_STATUS,
  reviewStatusOf,
  STATUS_LABEL,
  ACTION_VERB,
  formatTrailTime,
  shortName,
  mergeTimeline,
} from '../utils/reviewStatus.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('reviewStatusOf', () => {
  it('reads a known status straight through', () => {
    expect(reviewStatusOf({ reviewStatus: 'resolved' })).toBe(REVIEW_STATUS.RESOLVED);
    expect(reviewStatusOf({ reviewStatus: 'needs_input' })).toBe(REVIEW_STATUS.NEEDS_INPUT);
    expect(reviewStatusOf({ reviewStatus: 'open' })).toBe(REVIEW_STATUS.OPEN);
  });

  it('treats a legacy finding with no reviewStatus as open, not broken', () => {
    // v1 findings predate the field entirely — the 24hr report has been running
    // on the legacy pipeline this whole time, so this is the common case.
    expect(reviewStatusOf({ id: 'f1' })).toBe(REVIEW_STATUS.OPEN);
    expect(reviewStatusOf({ reviewStatus: null })).toBe(REVIEW_STATUS.OPEN);
    expect(reviewStatusOf({ reviewStatus: undefined })).toBe(REVIEW_STATUS.OPEN);
  });

  it('falls back to open for an unrecognised value rather than rendering it', () => {
    expect(reviewStatusOf({ reviewStatus: 'wat' })).toBe(REVIEW_STATUS.OPEN);
  });

  it('survives a missing finding', () => {
    expect(reviewStatusOf(null)).toBe(REVIEW_STATUS.OPEN);
    expect(reviewStatusOf(undefined)).toBe(REVIEW_STATUS.OPEN);
  });
});

describe('labels', () => {
  it('calls resolution "Signed off" — it is attribution, not a dismiss', () => {
    expect(STATUS_LABEL[REVIEW_STATUS.RESOLVED]).toBe('Signed off');
    expect(STATUS_LABEL[REVIEW_STATUS.OPEN]).toBe('Not signed off');
    expect(STATUS_LABEL[REVIEW_STATUS.NEEDS_INPUT]).toBe('Needs input');
  });

  it('has a past-tense verb for every action the API accepts', () => {
    expect(ACTION_VERB.resolved).toBe('signed off');
    expect(ACTION_VERB.needs_input).toBe('flagged for input');
    expect(ACTION_VERB.reopened).toBe('reopened');
  });
});

describe('formatTrailTime', () => {
  it('shows time only for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 18, 0, 0));
    const out = formatTrailTime(new Date(2026, 6, 28, 8, 14, 0).toISOString());
    expect(out).toMatch(/^8:14\s?AM$/);
  });

  it('includes the date once it is not today, so a multi-day report stays unambiguous', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 18, 0, 0));
    const out = formatTrailTime(new Date(2026, 6, 26, 8, 14, 0).toISOString());
    expect(out).toMatch(/^Jul 26, 8:14\s?AM$/);
  });

  it('returns empty for missing or unparseable input', () => {
    expect(formatTrailTime(null)).toBe('');
    expect(formatTrailTime('')).toBe('');
    expect(formatTrailTime('not-a-date')).toBe('');
  });
});

describe('mergeTimeline', () => {
  const action = (id, at) => ({ id, action: 'resolved', createdAt: at });
  const comment = (id, at) => ({ id, message: 'note', createdAt: at });

  it('interleaves comments and sign-offs in the order they happened', () => {
    // The sequence IS the story — splitting them would force you to
    // reconstruct it from timestamps by eye.
    const merged = mergeTimeline(
      [action('a1', '2026-07-28T09:00:00Z'), action('a2', '2026-07-28T15:00:00Z')],
      [comment('c1', '2026-07-28T12:00:00Z')]
    );
    expect(merged.map((i) => [i.kind, i.data.id])).toEqual([
      ['action', 'a1'],
      ['comment', 'c1'],
      ['action', 'a2'],
    ]);
  });

  it('puts an action ahead of a comment posted at the same instant', () => {
    // A comment alongside a sign-off reads as the explanation for it.
    const merged = mergeTimeline(
      [action('a1', '2026-07-28T09:00:00Z')],
      [comment('c1', '2026-07-28T09:00:00Z')]
    );
    expect(merged.map((i) => i.kind)).toEqual(['action', 'comment']);
  });

  it('is stable within a kind at identical timestamps', () => {
    const merged = mergeTimeline(
      [],
      [comment('c1', '2026-07-28T09:00:00Z'), comment('c2', '2026-07-28T09:00:00Z')]
    );
    expect(merged.map((i) => i.data.id)).toEqual(['c1', 'c2']);
  });

  it('handles either side being empty, null or undefined', () => {
    expect(mergeTimeline([], [])).toEqual([]);
    expect(mergeTimeline(null, null)).toEqual([]);
    expect(mergeTimeline(undefined, undefined)).toEqual([]);
    expect(mergeTimeline([action('a1', '2026-07-28T09:00:00Z')], null)).toHaveLength(1);
    expect(mergeTimeline(null, [comment('c1', '2026-07-28T09:00:00Z')])).toHaveLength(1);
  });

  it('does not drop entries with an unparseable timestamp', () => {
    const merged = mergeTimeline([action('a1', 'garbage')], [comment('c1', '2026-07-28T09:00:00Z')]);
    expect(merged).toHaveLength(2);
  });
});


describe('shortName', () => {
  it('uses the first name so the pill stays short', () => {
    expect(shortName('Jake Mullins', 'jake@example.com')).toBe('Jake');
  });

  it('falls back to the email local-part when there is no name', () => {
    expect(shortName(null, 'jake.mullins@example.com')).toBe('jake.mullins');
  });

  it('never renders an empty attribution', () => {
    expect(shortName(null, null)).toBe('Someone');
    expect(shortName('', '')).toBe('Someone');
  });
});

describe('initialsOf', () => {
  it('takes first and last initial', () => {
    expect(initialsOf('Jonathan Cameron')).toBe('JC');
  });

  it('handles a single name', () => {
    expect(initialsOf('Cher')).toBe('CH');
  });

  it('falls back to the email local part when there is no name', () => {
    expect(initialsOf('joanna.lucius@example.com')).toBe('JL');
  });

  it('never returns empty', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });
});
