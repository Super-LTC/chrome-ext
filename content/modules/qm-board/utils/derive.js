/**
 * Data shaping for the QM Board.
 *
 * Historically this held the "Clearing Soon" rail helpers (per-measure tiles,
 * flattened triggering rows, and a date-driven `clearCta`/`clearLabel`). That
 * whole surface was superseded by the QmOverview / MeasureDetail / ResidentDrillIn
 * flow, which reads raw `QmMeasureEntry` objects and derives clear-timing through
 * the single `clearTiming()` decision in `lib/qm-tones.js` (keyed off the backend
 * `clearability` field — see §6A). The old rail helpers were removed (commit
 * dropping the parallel date-driven path) because they carried the
 * `clearsOnNextObra → "Code clean"` over-promise — "Code clean" fired for a
 * Stage-4 ulcer that actually has to heal first. If a "Clearing Soon" rail ever
 * returns, build it on `clearTiming()` so the two paths can't drift again.
 *
 * The one helper still in use lives on below.
 */

/**
 * Format ARD-like dates into "Mar 14"-style short strings.
 */
export function formatShortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
