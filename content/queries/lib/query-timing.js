// Pure helpers for rendering diagnosis-query ARD timing + effective-date
// guidance. Shared by every query surface (vanilla QuerySendModal /
// QueryDetailModal, Preact BatchReviewPage) so the badge/warning wording and
// the in-window math live in ONE place.
//
// The backend owns the `timing` object (see core/utils/diagnosis-query-timing.ts
// and the /preview-timing endpoint) — we NEVER derive the lookback window or the
// 7-vs-30-day rule on the client. We only:
//   - format a badge from a backend-provided `timing`
//   - compare a nurse-picked date against a backend-provided window (drift-proof
//     lexicographic YYYY-MM-DD compare, per the backend handoff)
//   - word the guidance/warning strings
//
// Everything degrades gracefully when `timing` is absent (old queries created
// before this feature, or a stale backend that doesn't emit it yet): the badge
// is null, the guidance/warning are null, and callers render nothing.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a strict `YYYY-MM-DD` string as `Mon D` (e.g. "Jul 14") without going
 * through `new Date()` — parsing an ISO date string as UTC midnight and then
 * displaying it in a negative-offset timezone would shift it a day. We split
 * the parts by hand so the label is timezone-proof.
 * @param {string} iso
 * @returns {string} the pretty label, or the raw input if it isn't YYYY-MM-DD
 */
export function formatIsoShort(iso) {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}`;
}

/**
 * Resolve the effective (onset) date to prefill a picker with. Prefers the
 * backend-resolved `timing.effectiveDate` (custom ?? createdAt), then a bare
 * top-level `effectiveDate`, else empty (blank = "use the createdAt default").
 * @param {Object|null|undefined} query
 * @returns {string} YYYY-MM-DD or ''
 */
export function resolveEffectiveDate(query) {
  return query?.timing?.effectiveDate || query?.effectiveDate || '';
}

/**
 * Is `dateStr` inside `window` (inclusive)? Uses a plain string compare, which
 * is exact for `YYYY-MM-DD` and immune to timezone/parse drift. Returns null
 * (unknown) when we lack a window or a date — callers treat null as "don't warn".
 * @param {string|null|undefined} dateStr - YYYY-MM-DD
 * @param {{start: string, end: string}|null|undefined} window
 * @returns {boolean|null}
 */
export function isDateInWindow(dateStr, window) {
  if (!dateStr || !window || !window.start || !window.end) return null;
  return dateStr >= window.start && dateStr <= window.end;
}

/**
 * One-line "aim for this range" guidance shown under the picker, e.g.
 * "Counts as active if dated Jul 14 – Jul 20". Null when there's no window
 * (unlinked query / no ARD) — nothing to aim at.
 * @param {{start: string, end: string}|null|undefined} window
 * @returns {string|null}
 */
export function windowGuidanceText(window) {
  if (!window || !window.start || !window.end) return null;
  return `Counts as active if dated ${formatIsoShort(window.start)} – ${formatIsoShort(window.end)}`;
}

/**
 * The non-blocking soft warning shown when the picked date is outside the
 * lookback window, e.g. "Outside the ARD-7 lookback (Jul 14 – Jul 20) — won't
 * count as active for this MDS". Always advisory; never disable save.
 * @param {number|null|undefined} lookbackDays
 * @param {{start: string, end: string}|null|undefined} window
 * @returns {string}
 */
export function outsideWindowWarning(lookbackDays, window) {
  const days = lookbackDays != null ? `ARD-${lookbackDays}` : 'ARD';
  const range = window && window.start && window.end
    ? ` (${formatIsoShort(window.start)} – ${formatIsoShort(window.end)})`
    : '';
  return `Outside the ${days} lookback${range} — won't count as active for this MDS.`;
}

/**
 * Format the ARD status badge from a backend `timing` object. Returns
 * `{ text, tone }` or null when there's nothing to show.
 *
 * tone ∈ 'neutral' | 'amber' | 'red' | 'signed' — maps to CSS modifiers.
 *
 * Per the handoff render table:
 *   upcoming → "{n} days until ARD" (0 = "Due today"); amber when close, else neutral
 *   overdue  → "Overdue" (red)
 *   captured → "Signed" (green/signed, no countdown)
 *   no_ard   → null (no countdown at all)
 *
 * @param {Object|null|undefined} timing
 * @returns {{text: string, tone: string}|null}
 */
export function formatArdBadge(timing) {
  if (!timing || !timing.status) return null;

  switch (timing.status) {
    case 'captured':
      return { text: 'Signed', tone: 'signed' };

    case 'overdue':
      return { text: 'Overdue', tone: 'red' };

    case 'upcoming': {
      const n = timing.daysUntilArd;
      if (n == null) return null;
      if (n < 0) return { text: 'Overdue', tone: 'red' }; // defensive; backend usually says 'overdue'
      if (n === 0) return { text: 'ARD due today', tone: 'amber' };
      const label = `${n} day${n === 1 ? '' : 's'} until ARD`;
      return { text: label, tone: n <= 2 ? 'amber' : 'neutral' };
    }

    case 'no_ard':
    default:
      return null;
  }
}
