import { describe, it, expect } from 'vitest';
import {
  formatIsoShort,
  resolveEffectiveDate,
  isDateInWindow,
  windowGuidanceText,
  outsideWindowWarning,
  formatArdBadge,
} from '../query-timing.js';

const WINDOW = { start: '2026-07-14', end: '2026-07-20' };

describe('formatIsoShort', () => {
  it('formats a YYYY-MM-DD string as "Mon D"', () => {
    expect(formatIsoShort('2026-07-14')).toBe('Jul 14');
    expect(formatIsoShort('2026-01-01')).toBe('Jan 1');
    expect(formatIsoShort('2026-12-09')).toBe('Dec 9');
  });

  it('returns the raw input for non-ISO strings and empties for junk', () => {
    expect(formatIsoShort('not a date')).toBe('not a date');
    expect(formatIsoShort('')).toBe('');
    expect(formatIsoShort(null)).toBe('');
    expect(formatIsoShort(undefined)).toBe('');
  });

  it('is timezone-proof (no Date parsing / no day shift)', () => {
    // 2026-07-14 must stay the 14th regardless of the host timezone.
    expect(formatIsoShort('2026-07-14')).toBe('Jul 14');
  });
});

describe('resolveEffectiveDate', () => {
  it('prefers timing.effectiveDate', () => {
    expect(resolveEffectiveDate({ timing: { effectiveDate: '2026-07-16' }, effectiveDate: '2026-01-01' }))
      .toBe('2026-07-16');
  });

  it('falls back to a top-level effectiveDate', () => {
    expect(resolveEffectiveDate({ effectiveDate: '2026-05-05' })).toBe('2026-05-05');
  });

  it('returns empty string for old queries with neither (backwards compatible)', () => {
    expect(resolveEffectiveDate({})).toBe('');
    expect(resolveEffectiveDate(null)).toBe('');
    expect(resolveEffectiveDate(undefined)).toBe('');
  });
});

describe('isDateInWindow', () => {
  it('is inclusive of both endpoints', () => {
    expect(isDateInWindow('2026-07-14', WINDOW)).toBe(true);
    expect(isDateInWindow('2026-07-20', WINDOW)).toBe(true);
    expect(isDateInWindow('2026-07-17', WINDOW)).toBe(true);
  });

  it('is false just outside either edge', () => {
    expect(isDateInWindow('2026-07-13', WINDOW)).toBe(false);
    expect(isDateInWindow('2026-07-21', WINDOW)).toBe(false);
  });

  it('returns null (unknown → do not warn) when window or date missing', () => {
    expect(isDateInWindow('2026-07-14', null)).toBeNull();
    expect(isDateInWindow('2026-07-14', {})).toBeNull();
    expect(isDateInWindow('', WINDOW)).toBeNull();
    expect(isDateInWindow(null, WINDOW)).toBeNull();
  });
});

describe('windowGuidanceText', () => {
  it('renders the inclusive range', () => {
    expect(windowGuidanceText(WINDOW)).toBe('Counts as active if dated Jul 14 – Jul 20');
  });

  it('returns null with no window', () => {
    expect(windowGuidanceText(null)).toBeNull();
    expect(windowGuidanceText({})).toBeNull();
  });
});

describe('outsideWindowWarning', () => {
  it('names the lookback length and the range', () => {
    expect(outsideWindowWarning(7, WINDOW))
      .toBe("Outside the ARD-7 lookback (Jul 14 – Jul 20) — won't count as active for this MDS.");
    expect(outsideWindowWarning(30, WINDOW))
      .toContain('ARD-30');
  });

  it('degrades when lookbackDays / window are missing', () => {
    expect(outsideWindowWarning(null, null))
      .toBe("Outside the ARD lookback — won't count as active for this MDS.");
  });
});

describe('formatArdBadge', () => {
  it('returns null for missing/empty timing (old queries — backwards compatible)', () => {
    expect(formatArdBadge(null)).toBeNull();
    expect(formatArdBadge(undefined)).toBeNull();
    expect(formatArdBadge({})).toBeNull();
  });

  it('no_ard renders no badge', () => {
    expect(formatArdBadge({ status: 'no_ard', daysUntilArd: null })).toBeNull();
  });

  it('captured → Signed (no countdown)', () => {
    expect(formatArdBadge({ status: 'captured' })).toEqual({ text: 'Signed', tone: 'signed' });
  });

  it('overdue → red Overdue', () => {
    expect(formatArdBadge({ status: 'overdue', daysUntilArd: -3 }))
      .toEqual({ text: 'Overdue', tone: 'red' });
  });

  it('upcoming with 0 days → "ARD due today" amber', () => {
    expect(formatArdBadge({ status: 'upcoming', daysUntilArd: 0 }))
      .toEqual({ text: 'ARD due today', tone: 'amber' });
  });

  it('upcoming close (<=2 days) → amber, singular/plural correct', () => {
    expect(formatArdBadge({ status: 'upcoming', daysUntilArd: 1 }))
      .toEqual({ text: '1 day until ARD', tone: 'amber' });
    expect(formatArdBadge({ status: 'upcoming', daysUntilArd: 2 }))
      .toEqual({ text: '2 days until ARD', tone: 'amber' });
  });

  it('upcoming far out (>2 days) → neutral', () => {
    expect(formatArdBadge({ status: 'upcoming', daysUntilArd: 3 }))
      .toEqual({ text: '3 days until ARD', tone: 'neutral' });
    expect(formatArdBadge({ status: 'upcoming', daysUntilArd: 10 }))
      .toEqual({ text: '10 days until ARD', tone: 'neutral' });
  });

  it('upcoming with null daysUntilArd → no badge', () => {
    expect(formatArdBadge({ status: 'upcoming', daysUntilArd: null })).toBeNull();
  });
});
