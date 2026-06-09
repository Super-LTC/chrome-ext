/**
 * Background worker wraps each API_REQUEST response as { success, data: <server-resp> }.
 * Most extension endpoints return their own { success, ... } envelope, so the payload
 * we care about lives on `result.data`. This helper normalizes both shapes.
 *
 * Mirrors content/modules/qm-board/utils/api.js.
 */
export function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return payload.data;
  }
  return payload;
}

/**
 * Format a YYYY-MM-DD date in the facility's timezone for display in the header.
 * Uses Intl.DateTimeFormat with the provided timezone. Falls back to a plain
 * local-TZ format if the timezone is missing or invalid.
 */
export function formatFacilityDate(ymd, timezone, opts = {}) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: opts.weekday ?? 'short',
    month: opts.month ?? 'short',
    day: 'numeric',
    year: opts.year ?? 'numeric',
    timeZone: timezone || undefined
  });
  try {
    return formatter.format(date);
  } catch {
    return ymd;
  }
}

/**
 * Get "today" in the facility's timezone as a YYYY-MM-DD string.
 */
export function todayInFacilityTz(timezone) {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: timezone || undefined
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Add/subtract calendar days from a YYYY-MM-DD string. Purely date arithmetic
 * in UTC to avoid DST edge cases — the result is still a naive YYYY-MM-DD.
 */
export function addDays(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Extract a YYYY-MM-DD (facility-local) date string from a report list item.
 * The backend returns reportDate as a timestamp; the extension route response
 * shape on list mode should include a facility-local date already, but guard
 * against both shapes.
 */
/**
 * Format an hour (0–23) as a friendly local time label, e.g. "7:00 AM".
 */
export function formatHourLabel(hour) {
  if (hour == null || Number.isNaN(Number(hour))) return '—';
  const h = ((Number(hour) % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

/**
 * Short friendly timezone label from an IANA timezone, e.g. "ET" for
 * America/New_York. Falls back to the raw IANA string.
 */
export function formatTimezoneLabel(timezone) {
  if (!timezone) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || timezone;
  } catch {
    return timezone;
  }
}

export function facilityDateFromReport(item, timezone) {
  if (!item) return null;
  if (typeof item.facilityDate === 'string') return item.facilityDate;
  if (typeof item.reportDate === 'string' && item.reportDate.length === 10) {
    return item.reportDate;
  }
  if (item.reportDate) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        timeZone: timezone || undefined
      }).formatToParts(new Date(item.reportDate));
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      /* fall through */
    }
  }
  return null;
}
