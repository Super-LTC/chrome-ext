/**
 * ONE QUARTER, EVERY RESIDENT, EVERY MEASURE — the view-model behind the roster
 * grid a quarter card opens.
 *
 * The scorecard answers "where do we stand"; the roster answers "who is that,
 * exactly". Rows are the quarter's windowed cohort (discharged and deceased
 * included, because CMS counts them), columns are the Five-Star MDS measures,
 * and each cell says what that resident did to that measure IN THAT QUARTER.
 *
 * ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────
 * The engine denominator is `applicable && !excluded && !skipped`
 * (quarter-rates-view.ts, facility-rates.ts). `skipped` is the third leg — no
 * qualifying prior assessment, a pre-GG-era ARD, no 5-day baseline — and it is
 * NOT an exclusion, so it carries no exclusion reason and CMS never counts it.
 *
 * A grid that renders skipped residents as "in the denominator" produces columns
 * whose totals EXCEED the headline rate the same screen prints two inches above.
 * That is precisely the "two clashing resident lists" complaint (SUP-263) in a
 * new costume, so the reconciliation is asserted as an invariant in the tests:
 * per column, `✕ == numerator` and `✕ + · == denominator`. Break the skip check
 * and those fail.
 *
 * ── WHY SKIPPED AND NOT-APPLICABLE SHARE A GLYPH ────────────────────────────
 * A drill-in panel can simply OMIT an uncounted resident. A grid cannot — every
 * row crosses every column, so the cell has to say something. Both "never in
 * this measure's population" and "applicable, but no qualifying prior this
 * quarter" reduce to the same fact for the reader: CMS did not count them.
 *
 * So they share `–` and the tooltip carries the specific reason when there is
 * one. The alternative — a fifth symbol — was rejected because the alphabet is
 * deliberately SHP's (X / d / e), so a customer holding both reports reads one
 * set of letters. The distinction survives in `reason`, not in the glyph.
 *
 * PURE — no Preact, no fetch, no Date.now. That is what makes the invariant
 * testable without driving a render.
 */
import { isFiveStarMds, shortLabel } from './qm-view-model.js';

/**
 * What a resident did to one measure this quarter.
 *
 * @typedef {'numerator'|'denominator'|'excluded'|'uncounted'} RosterCellKind
 */

/** Glyphs, deliberately SHP's alphabet — see the file header. */
export const ROSTER_GLYPH = {
  numerator: '✕',
  denominator: '·',
  excluded: 'e',
  uncounted: '–',
};

/** CSV codes. `uncounted` is blank: a spreadsheet filter reads empty as "no". */
export const ROSTER_CSV_CODE = {
  numerator: 'X',
  denominator: 'd',
  excluded: 'e',
  uncounted: '',
};

export const ROSTER_CELL_TITLE = {
  numerator: 'Triggering — in the numerator',
  denominator: 'In the denominator, not triggering',
  excluded: 'Excluded from the denominator',
  uncounted: 'Not counted by CMS for this measure',
};

/**
 * The kind for one `QuarterRowMeasureView` cell.
 *
 * Order matters. `skipped` is tested BEFORE `triggers` because the engine drops
 * a skipped resident from the denominator outright — a skipped row that also
 * happens to carry `triggers: true` is still not in the numerator, and reading
 * it as one would inflate the column past the published numerator.
 */
export function rosterCellKind(cell) {
  if (!cell || !cell.applicable || cell.skipped) return 'uncounted';
  if (cell.excluded) return 'excluded';
  return cell.triggers ? 'numerator' : 'denominator';
}

/**
 * Columns: the Five-Star MDS measures the engine actually evaluated this
 * quarter, in the order it returned them (stable across quarters, so a reader
 * flipping between two quarters keeps their place).
 */
export function rosterMeasures(quarterRates) {
  return (quarterRates?.rates ?? [])
    .map((r) => r.measureId)
    .filter((id) => isFiveStarMds(id));
}

/** measureId → short column label. */
export function rosterLabels(quarterRates) {
  const m = new Map();
  // `label` is required on QmFacilityRate, but shortLabel calls .replace on it —
  // so a malformed payload would throw here rather than degrade. Fall back.
  for (const r of quarterRates?.rates ?? []) {
    m.set(r.measureId, shortLabel(r.measureId, r.label ?? r.measureId));
  }
  return m;
}

/**
 * Resident rows, A–Z. Cells are a plain object keyed by measureId rather than a
 * Map so a row survives a structuredClone across the message boundary.
 */
export function toRosterRows(quarterRates) {
  return (quarterRates?.rows ?? [])
    .map((r) => {
      const cells = {};
      for (const e of r.measures ?? []) {
        if (!isFiveStarMds(e.measureId)) continue;
        cells[e.measureId] = { kind: rosterCellKind(e), reason: e.reason ?? null };
      }
      return {
        patientId: r.patientId,
        name: r.name,
        stayType: r.stayType,
        cdif: r.cdif,
        discharged: r.dischargeStatus !== 'active',
        targetArd: r.targetArd ?? null,
        targetAccepted: r.targetAccepted !== false,
        cells,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Does this resident trigger anything at all this quarter? */
export function rowTriggersAnything(row) {
  return Object.values(row.cells).some((c) => c.kind === 'numerator');
}

export function filterRoster(rows, { query = '', triggeringOnly = false } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (triggeringOnly && !rowTriggersAnything(r)) return false;
    return true;
  });
}

/** RFC-4180 field escaping. */
function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The visible rows, as CSV. Exports what is ON SCREEN, not the whole cohort —
 * someone who filtered to "triggering only" and then exported means the filter.
 */
export function rosterCsv({ rows, measures, labels }) {
  const head = ['Resident', 'Stay', 'Day', 'Status', 'Target ARD', 'Submitted']
    .concat(measures.map((m) => labels.get(m) ?? m));
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      r.name,
      r.stayType,
      r.cdif,
      r.discharged ? 'discharged' : 'active',
      r.targetArd ?? '',
      r.targetAccepted ? 'yes' : 'no',
    ].concat(measures.map((m) => ROSTER_CSV_CODE[r.cells[m]?.kind ?? 'uncounted']))
      .map(csvCell)
      .join(','));
  }
  // CRLF: Excel's own dialect, and the one CertAuditView already writes.
  return lines.join('\r\n');
}

/**
 * Per-column tallies, for the reconciliation the tests assert and the footer
 * prints. Returns `{ measureId, numerator, denominator, excluded }`.
 */
export function rosterTallies(rows, measures) {
  return measures.map((m) => {
    let numerator = 0;
    let denominator = 0;
    let excluded = 0;
    for (const r of rows) {
      const kind = r.cells[m]?.kind ?? 'uncounted';
      if (kind === 'numerator') { numerator += 1; denominator += 1; }
      else if (kind === 'denominator') denominator += 1;
      else if (kind === 'excluded') excluded += 1;
    }
    return { measureId: m, numerator, denominator, excluded };
  });
}
