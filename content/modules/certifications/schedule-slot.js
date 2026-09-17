/**
 * Date/time helpers for scheduling a certification send.
 *
 * Every value here is a facility-local WALL CLOCK string ('YYYY-MM-DD' /
 * 'HH:MM'), never an instant. The backend converts to UTC once, at schedule
 * time, and hands display labels back already formatted. Nothing in the
 * extension should build a Date from a stored schedule and read a time off it —
 * that drifts by a day near midnight and by an hour across a DST boundary.
 */

/** Matches the backend's DEFAULT_SCHEDULED_SEND_TIME. */
export const DEFAULT_SEND_TIME = '06:00';

/** Local 'YYYY-MM-DD' for a Date, using its own local fields (never toISOString). */
function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today, in the browser's local timezone — the nurse is sitting in the building. */
export function todayLocal() {
  return toLocalDateString(new Date());
}

/** Tomorrow, in the browser's local timezone. */
export function tomorrowLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateString(d);
}

/**
 * The slot the picker should open on: the cert's due date at 6:00 AM when that
 * is still ahead, otherwise tomorrow at 6:00 AM.
 *
 * Mirrors `defaultScheduledSendSlot` on the backend. Defaulting to the due date
 * is what makes prescheduling worth using — a nurse looking at a recert due next
 * Tuesday wants Tuesday, and defaulting to tomorrow would mean correcting the
 * picker nearly every time. A cert due TODAY has already missed a 6 AM slot, so
 * it falls through to tomorrow.
 */
export function defaultSlot(dueDate) {
  const today = todayLocal();
  const date = dueDate && dueDate > today ? dueDate : tomorrowLocal();
  return { date, time: DEFAULT_SEND_TIME };
}

/** Half-hour options for the time select, as { value, label }. */
export function timeOptions() {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      out.push({ value, label: formatTime(value) });
    }
  }
  return out;
}

/** '06:00' -> '6:00 AM'. */
export function formatTime(time) {
  const [hh, mm] = time.split(':').map(Number);
  const period = hh < 12 ? 'AM' : 'PM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${period}`;
}

/**
 * 'YYYY-MM-DD' + 'HH:MM' -> 'Wed 9/23 at 6:00 AM'.
 *
 * Built from the wall-clock strings only. The Date is constructed in UTC and
 * read back in UTC purely to get a weekday name, so no timezone can shift it.
 */
export function formatSlot(date, time) {
  if (!date || !time) return '';
  const [y, m, d] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][probe.getUTCDay()];
  return `${weekday} ${m}/${d} at ${formatTime(time)}`;
}

/** Whether a picked slot is still in the future, to the minute, locally. */
export function isSlotInFuture(date, time) {
  if (!date || !time) return false;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0).getTime() > Date.now();
}
