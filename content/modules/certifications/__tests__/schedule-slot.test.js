import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  defaultSlot,
  formatSlot,
  formatTime,
  isSlotInFuture,
  timeOptions,
  todayLocal,
  tomorrowLocal,
  DEFAULT_SEND_TIME,
} from '../schedule-slot.js';

/**
 * Every value in here is a facility-local WALL CLOCK string, never an instant.
 * The tests that matter are the ones proving a stored slot never drifts: a
 * 6:00 AM send must read 6:00 AM in January and in July, and a date must not
 * slide a day near midnight.
 */

afterEach(() => vi.useRealTimers());

function freezeLocal(y, m, d, hh = 9, mm = 0) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(y, m - 1, d, hh, mm, 0));
}

describe('todayLocal / tomorrowLocal', () => {
  it('uses local calendar fields, not the UTC date', () => {
    // 9:30 PM local on Sep 16 is already Sep 17 in UTC for US timezones. Using
    // toISOString here would offer the nurse tomorrow's date as "today".
    freezeLocal(2026, 9, 16, 21, 30);
    expect(todayLocal()).toBe('2026-09-16');
    expect(tomorrowLocal()).toBe('2026-09-17');
  });

  it('rolls the month over correctly', () => {
    freezeLocal(2026, 9, 30, 10, 0);
    expect(tomorrowLocal()).toBe('2026-10-01');
  });

  it('rolls the year over correctly', () => {
    freezeLocal(2026, 12, 31, 10, 0);
    expect(tomorrowLocal()).toBe('2027-01-01');
  });

  it('pads single-digit months and days', () => {
    freezeLocal(2026, 3, 5, 10, 0);
    expect(todayLocal()).toBe('2026-03-05');
  });
});

describe('defaultSlot', () => {
  it('opens on the due date when it is still ahead', () => {
    // The point of prescheduling: a recert due next Tuesday should default to
    // Tuesday, not tomorrow.
    freezeLocal(2026, 9, 16);
    expect(defaultSlot('2026-09-23')).toEqual({ date: '2026-09-23', time: '06:00' });
  });

  it('opens on tomorrow when the due date has passed', () => {
    freezeLocal(2026, 9, 16);
    expect(defaultSlot('2026-09-12')).toEqual({ date: '2026-09-17', time: '06:00' });
  });

  it('opens on tomorrow when the cert is due today', () => {
    // A 6 AM slot today has already gone by the time anyone is looking at it.
    freezeLocal(2026, 9, 16);
    expect(defaultSlot('2026-09-16').date).toBe('2026-09-17');
  });

  it('opens on tomorrow with no due date at all', () => {
    freezeLocal(2026, 9, 16);
    expect(defaultSlot(null).date).toBe('2026-09-17');
    expect(defaultSlot(undefined).date).toBe('2026-09-17');
  });

  it('always uses the default time', () => {
    freezeLocal(2026, 9, 16);
    expect(defaultSlot('2026-09-23').time).toBe(DEFAULT_SEND_TIME);
    expect(DEFAULT_SEND_TIME).toBe('06:00');
  });
});

describe('formatTime', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['00:30', '12:30 AM'],
    ['06:00', '6:00 AM'],
    ['11:30', '11:30 AM'],
    ['12:00', '12:00 PM'],
    ['12:30', '12:30 PM'],
    ['13:00', '1:00 PM'],
    ['23:30', '11:30 PM'],
  ])('%s -> %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });
});

describe('formatSlot', () => {
  it('formats a full slot', () => {
    expect(formatSlot('2026-09-23', '06:00')).toBe('Wed 9/23 at 6:00 AM');
  });

  it('reads the same wall clock in winter and summer', () => {
    // The whole reason local strings are stored rather than derived from the UTC
    // instant: a DST boundary must not move a 6 AM slot to 5 or 7.
    expect(formatSlot('2026-01-15', '06:00')).toContain('6:00 AM');
    expect(formatSlot('2026-07-15', '06:00')).toContain('6:00 AM');
  });

  it('gets the weekday right across a whole week', () => {
    // Sep 21 2026 is a Monday.
    expect(formatSlot('2026-09-21', '06:00')).toMatch(/^Mon /);
    expect(formatSlot('2026-09-22', '06:00')).toMatch(/^Tue /);
    expect(formatSlot('2026-09-26', '06:00')).toMatch(/^Sat /);
    expect(formatSlot('2026-09-27', '06:00')).toMatch(/^Sun /);
  });

  it('returns empty for a missing date or time', () => {
    expect(formatSlot(null, '06:00')).toBe('');
    expect(formatSlot('2026-09-23', null)).toBe('');
  });
});

describe('isSlotInFuture', () => {
  it('accepts a slot later today', () => {
    freezeLocal(2026, 9, 16, 9, 0);
    expect(isSlotInFuture('2026-09-16', '18:00')).toBe(true);
  });

  it('rejects a slot earlier today', () => {
    // Catches the common mistake: picking today, leaving the 6:00 AM default.
    freezeLocal(2026, 9, 16, 9, 0);
    expect(isSlotInFuture('2026-09-16', '06:00')).toBe(false);
  });

  it('accepts tomorrow at the default time', () => {
    freezeLocal(2026, 9, 16, 9, 0);
    expect(isSlotInFuture('2026-09-17', '06:00')).toBe(true);
  });

  it('rejects a past date', () => {
    freezeLocal(2026, 9, 16, 9, 0);
    expect(isSlotInFuture('2026-09-15', '23:30')).toBe(false);
  });

  it('rejects missing values rather than throwing', () => {
    expect(isSlotInFuture(null, '06:00')).toBe(false);
    expect(isSlotInFuture('2026-09-23', '')).toBe(false);
  });
});

describe('timeOptions', () => {
  it('offers every half hour across the day', () => {
    expect(timeOptions()).toHaveLength(48);
  });

  it('starts at midnight and ends at 11:30 PM', () => {
    const opts = timeOptions();
    expect(opts[0]).toEqual({ value: '00:00', label: '12:00 AM' });
    expect(opts[47]).toEqual({ value: '23:30', label: '11:30 PM' });
  });

  it('includes the default send time', () => {
    expect(timeOptions().some((o) => o.value === DEFAULT_SEND_TIME)).toBe(true);
  });
});
