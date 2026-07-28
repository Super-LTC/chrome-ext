import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  REVIEW_STATUS,
  reviewStatusOf,
  STATUS_LABEL,
  ACTION_VERB,
  formatTrailTime,
  shortName,
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
    expect(STATUS_LABEL[REVIEW_STATUS.OPEN]).toBe('Open');
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
