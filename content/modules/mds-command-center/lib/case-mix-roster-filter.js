/**
 * Filter a quarter's roster, and score whatever is left.
 *
 * ── THIS REPLACED A SECOND HEADLINE NUMBER ────────────────────────────────
 *
 * The tab used to carry a Capture / Payable toggle: two parallel CMI scores over
 * two populations, sitting next to a measure toggle, with nothing on screen
 * saying which axis you were moving. Nobody could tell them apart, including the
 * person who asked for them.
 *
 * They collapsed into this. "Capture" was only ever "the residents assessed
 * inside this quarter", which is a QUESTION ABOUT THE LIST — so it is a filter on
 * the list, and `cohortCmi` scores the survivors. Pick `record: 'assessed'` and
 * the number you get IS the old capture score, next to the names it came from
 * rather than floating above them.
 *
 * That is why `cohortCmi` is not optional decoration. It is the entire reason
 * removing the toggle did not cost Chelsea her number.
 *
 * ── WHY THE PREDICATES ARE EXACT AND NOT APPROXIMATE ──────────────────────
 *
 * Every field filtered on here is the same one the engine gated on, not a
 * lookalike:
 *
 *   status === 'locked'    the `assessed_in_period` gate — roster and score call
 *                          one `recordTiming`, deliberately, "so the roster and
 *                          the score it drills into must never disagree about
 *                          which residents were assessed in the period".
 *   counts                 the Ohio payer tree's own verdict — the exact
 *                          predicate `medicaidCmi` averaged over.
 *   pendingMedicaid        the exact set `medicaidWithPendingCmi` adds.
 *   excludedLowGroup       PA1/PA2, removed by statute, not by us.
 *
 * So `basis: 'counts'` with no other filter must reproduce the headline's
 * denominator exactly. If it ever doesn't, this file is wrong — not the header.
 *
 * Pure — no Preact, no fetch, no DOM. Unit-tested in ./__tests__.
 */

/**
 * How a resident came to be scored this quarter.
 *
 * `backward` rides with `assessed` on purpose: Ohio attributes a late admission
 * assessment back into the quarter, so from "did we do the work" it IS an
 * assessment done for this period. The row's Record column still says
 * "counted back" so the distinction survives where it matters.
 */
export const RECORD_FILTERS = [
  { key: 'any', label: 'Any' },
  { key: 'assessed', label: 'Assessed this quarter' },
  { key: 'older', label: 'Scored off an older assessment' },
  { key: 'none', label: 'No assessment on file' },
];

/** Why a resident does or doesn't enter the payable average. */
export const BASIS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'counts', label: 'Counts' },
  { key: 'excluded', label: "Doesn't count" },
  { key: 'lowgroup', label: 'PA1 / PA2' },
  { key: 'review', label: 'Needs review' },
];

const RECORD_KEYS = new Set(RECORD_FILTERS.map((f) => f.key));
const BASIS_KEYS = new Set(BASIS_FILTERS.map((f) => f.key));

/** Has a record in effect that can be scored at all. */
export function isScoreable(row) {
  return row != null && row.currentGroup != null;
}

function matchesRecord(row, key) {
  if (key === 'any') return true;
  if (key === 'none') return row.status === 'none';
  if (key === 'assessed') return row.status === 'locked' || row.status === 'backward';
  // 'older' — on the census, scored, but the record predates the quarter.
  return row.status === 'carry';
}

function matchesBasis(row, key) {
  if (key === 'all') return true;
  if (key === 'counts') return row.counts === true;
  if (key === 'lowgroup') return row.excludedLowGroup === true;
  if (key === 'review') return row.needsReview === true;
  // "Doesn't count" means exactly that — everyone the payable average excludes,
  // whatever the reason. PA1/PA2 and needs-review are subsets of it, not
  // alternatives to it, so they are deliberately NOT subtracted here.
  return row.counts !== true;
}

/** Case-insensitive substring over the name, and the PCC id people paste in. */
function matchesSearch(row, needle) {
  if (!needle) return true;
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    String(row.patientName ?? '').toLowerCase().includes(q) ||
    String(row.patientId ?? '').toLowerCase().includes(q)
  );
}

function mean(values) {
  if (!values.length) return null;
  return +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(4);
}

/**
 * @param {Array<object>} rows  roster residents, as the API returns them
 * @param {{record?: string, basis?: string, search?: string, category?: string}} opts
 * @returns {{rows: Array<object>, total: number, unscoreable: number, cohortCmi: number|null, cohortScored: number}}
 */
export function filterCaseMixRoster(rows, opts = {}) {
  const record = RECORD_KEYS.has(opts.record) ? opts.record : 'any';
  const basis = BASIS_KEYS.has(opts.basis) ? opts.basis : 'all';
  const all = Array.isArray(rows) ? rows : [];

  const out = all.filter(
    (r) =>
      matchesRecord(r, record) &&
      matchesBasis(r, basis) &&
      matchesSearch(r, opts.search) &&
      (!opts.category || r.nursingCategory === opts.category)
  );

  // Scored over the residents who HAVE a record — a resident with none is on the
  // census and in no average, and averaging them as absent-zero would drag the
  // cohort down. They stay in `rows` so the list still shows them.
  const scoreable = out.filter(isScoreable);

  return {
    rows: out,
    total: all.length,
    /** On the census with no record in effect — in the list, in no average. */
    unscoreable: out.length - scoreable.length,
    /**
     * The mean CMI of what survived the filters. THIS IS WHAT REPLACED THE
     * CAPTURE HEADLINE — filter to `record: 'assessed'` and you have that score.
     */
    cohortCmi: mean(scoreable.map((r) => r.currentCmi).filter((v) => typeof v === 'number')),
    cohortScored: scoreable.length,
  };
}

/**
 * One line naming what is on screen, or null when nothing is filtered.
 *
 * Deliberately short. The previous version was a two-sentence paragraph
 * explaining a toggle, and the feedback was that it was "way too much" — which
 * it was, because it was explaining a control that should not have existed.
 */
export function describeCaseMixCohort(record, basis) {
  const parts = [];
  if (record === 'assessed') parts.push('assessed this quarter');
  if (record === 'older') parts.push('scored off an older assessment');
  if (record === 'none') parts.push('no assessment on file');
  if (basis === 'counts') parts.push('counts toward the rate');
  if (basis === 'excluded') parts.push("doesn't count toward the rate");
  if (basis === 'lowgroup') parts.push('PA1 / PA2 — excluded by Ohio statute');
  if (basis === 'review') parts.push('payer we could not classify');
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Column sorting for the roster.
 *
 * Kept here rather than in the component because "which value does this column
 * actually sort on" is a correctness question, not a rendering one: the Current
 * column shows "HBC2 · 2.12" and must sort by the CMI, not alphabetically by the
 * group name — HBC2 before ES2 before PA1 is meaningless ordering for a number
 * people are scanning for outliers.
 */
export const SORT_COLUMNS = {
  name: (r) => String(r.patientName ?? '').toLowerCase(),
  counts: (r) => (r.needsReview ? 2 : r.counts ? 0 : 1),
  category: (r) => String(r.nursingCategory ?? '~'),
  prior: (r) => (typeof r.priorCmi === 'number' ? r.priorCmi : null),
  current: (r) => (typeof r.currentCmi === 'number' ? r.currentCmi : null),
  change: (r) => (typeof r.delta === 'number' ? r.delta : null),
  qualifier: (r) => String(r.qualifier ?? '~').toLowerCase(),
  record: (r) => String(r.status ?? ''),
};

/**
 * Sort rows by a column, stably, with missing values always LAST regardless of
 * direction.
 *
 * That last part matters: flipping to ascending on Current would otherwise fill
 * the top of the table with residents who have no record at all, burying the
 * lowest real CMIs — the thing the sort was clicked to find.
 */
export function sortCaseMixRoster(rows, column, direction = 'desc') {
  const key = SORT_COLUMNS[column];
  const list = Array.isArray(rows) ? [...rows] : [];
  if (!key) return list;
  const dir = direction === 'asc' ? 1 : -1;

  return list.sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    const aMissing = av == null || av === '~';
    const bMissing = bv == null || bv === '~';
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (av === bv) return String(a.patientName ?? '').localeCompare(String(b.patientName ?? ''));
    return av < bv ? -dir : dir;
  });
}
