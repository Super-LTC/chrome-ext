/**
 * Date helpers for the manual cert-stay modals.
 *
 * Dates on the wire are date-only 'YYYY-MM-DD'. "Today" is the nurse's local
 * calendar day — `new Date().toISOString()` would be tomorrow every evening
 * west of Greenwich, and a start date "in the future" would then be accepted.
 */

/** Today's local calendar date as 'YYYY-MM-DD'. */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' strings compare correctly as strings. */
export function isAfterToday(isoDate) {
  return !!isoDate && isoDate > todayISO();
}
