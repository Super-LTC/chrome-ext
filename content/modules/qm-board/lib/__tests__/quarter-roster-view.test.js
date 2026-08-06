/**
 * The roster grid has to RECONCILE with the number printed above it.
 *
 * A resident-level list that disagrees with its own headline is the exact defect
 * SUP-263 was filed for, and the grid can reproduce it in a way the drill-in
 * panel cannot: the panel OMITS uncounted residents, the grid must render a cell
 * for every (resident, measure) pair and therefore has to decide what an
 * uncounted one looks like. Get that wrong and the column silently over-counts.
 *
 * So the load-bearing test here is not "does it map fields" — it is the
 * invariant, checked against a fixture whose `rates` were computed by the
 * engine's own rule:
 *
 *     per column:  ✕ == numerator        ✕ + · == denominator
 *
 * ── THE FIXTURE CLASSIFIES, IT DOES NOT ROLL ────────────────────────────────
 * Every resident below exists to occupy one branch, including the two that only
 * a deliberate fixture produces: a skipped resident (in the cohort, applicable,
 * not excluded, not counted) and a skipped resident that ALSO carries
 * `triggers: true`. A randomly generated or captured-from-prod fixture would
 * very likely contain neither, and the suite would pass while asserting nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  rosterCellKind,
  rosterMeasures,
  rosterLabels,
  toRosterRows,
  filterRoster,
  rosterCsv,
  rosterTallies,
  ROSTER_CSV_CODE,
} from '../quarter-roster-view.js';

/** One measure cell. Defaults are "counted, not triggering". */
function cell(measureId, over = {}) {
  return {
    measureId,
    applicable: true,
    excluded: false,
    skipped: false,
    triggers: false,
    reason: null,
    ...over,
  };
}

/**
 * Six residents against `uti`, one per branch:
 *
 *   Alder     triggering                          → numerator + denominator
 *   Birch     counted, not triggering             → denominator
 *   Cedar     excluded (carries a reason)         → neither
 *   Dogwood   SKIPPED — no qualifying prior       → neither
 *   Elm       SKIPPED *and* triggers              → neither (the ordering trap)
 *   Fir       not applicable to the measure       → neither
 *
 * Engine rule `applicable && !excluded && !skipped` therefore gives uti 1/2.
 * `catheter` is a second column so the tallies cannot pass by accident on a
 * single-column fixture.
 */
const QUARTER_RATES = {
  quarter: { label: 'Q2 2026', start: '2026-04-01', end: '2026-06-30' },
  rates: [
    { measureId: 'uti', label: 'Urinary Tract Infection (Long Stay)', numerator: 1, denominator: 2, rate: 0.5, nonCms: false },
    // 2/4: Alder + Birch trigger, Dogwood + Fir are counted and do not, Cedar is
    // excluded, Elm is skipped. (This line said 2/3 on the first draft and the
    // invariant below caught it — which is the point of asserting it.)
    { measureId: 'catheter', label: 'Catheter Inserted/Left in Bladder', numerator: 2, denominator: 4, rate: 0.5, nonCms: false },
    // Not Five-Star MDS — must never become a column.
    { measureId: 'falls_all', label: 'Falls (Any)', numerator: 4, denominator: 6, rate: 0.667, nonCms: true },
  ],
  rows: [
    {
      patientId: 'p-alder', name: 'Alder, Ann', stayType: 'long', cdif: 402,
      dischargeStatus: 'active', targetAccepted: true, targetArd: '2026-05-02',
      measures: [cell('uti', { triggers: true }), cell('catheter', { triggers: true }), cell('falls_all', { triggers: true })],
    },
    {
      patientId: 'p-birch', name: 'Birch, Bob', stayType: 'long', cdif: 210,
      dischargeStatus: 'active', targetAccepted: true, targetArd: '2026-05-09',
      measures: [cell('uti'), cell('catheter', { triggers: true })],
    },
    {
      // `WindowedDischargeStatus` is 'active' | 'discharged' only — deceased
      // residents are folded into 'discharged' upstream, which is why the row
      // maps on `!== 'active'` rather than listing statuses.
      patientId: 'p-cedar', name: 'Cedar, Cy', stayType: 'long', cdif: 150,
      dischargeStatus: 'discharged', targetAccepted: true, targetArd: '2026-04-18',
      measures: [
        cell('uti', { excluded: true, reason: 'Comatose' }),
        cell('catheter', { excluded: true, reason: 'Neurogenic bladder' }),
      ],
    },
    {
      patientId: 'p-dogwood', name: 'Dogwood, Dee', stayType: 'long', cdif: 95,
      dischargeStatus: 'active', targetAccepted: true, targetArd: '2026-06-01',
      measures: [
        cell('uti', { skipped: true, reason: 'No qualifying prior assessment' }),
        cell('catheter'),
      ],
    },
    {
      // The ordering trap: skipped WINS over triggers. The engine already
      // dropped this resident, so counting the trigger would push the column's
      // numerator past the published one.
      patientId: 'p-elm', name: 'Elm, Eve', stayType: 'short', cdif: 40,
      dischargeStatus: 'active', targetAccepted: false, targetArd: '2026-06-14',
      measures: [
        cell('uti', { skipped: true, triggers: true, reason: 'Pre-GG-era ARD' }),
        cell('catheter', { skipped: true, triggers: true, reason: 'No 5-day baseline' }),
      ],
    },
    {
      patientId: 'p-fir', name: 'Fir, Fay', stayType: 'short', cdif: 12,
      dischargeStatus: 'discharged', targetAccepted: true, targetArd: '2026-05-30',
      measures: [cell('uti', { applicable: false }), cell('catheter')],
    },
  ],
};

describe('rosterCellKind', () => {
  it('reads a plain counted resident as the denominator', () => {
    expect(rosterCellKind(cell('uti'))).toBe('denominator');
  });

  it('reads a triggering resident as the numerator', () => {
    expect(rosterCellKind(cell('uti', { triggers: true }))).toBe('numerator');
  });

  it('reads an excluded resident as excluded', () => {
    expect(rosterCellKind(cell('uti', { excluded: true, reason: 'Comatose' }))).toBe('excluded');
  });

  it('reads a not-applicable resident as uncounted', () => {
    expect(rosterCellKind(cell('uti', { applicable: false }))).toBe('uncounted');
  });

  it('reads a SKIPPED resident as uncounted, not as denominator', () => {
    // The regression this file exists for: `skipped` is the third leg of the
    // engine's denominator rule and is not an exclusion.
    expect(rosterCellKind(cell('uti', { skipped: true, reason: 'No qualifying prior' }))).toBe('uncounted');
  });

  it('lets skipped beat triggers', () => {
    expect(rosterCellKind(cell('uti', { skipped: true, triggers: true }))).toBe('uncounted');
  });

  it('treats a missing cell as uncounted rather than throwing', () => {
    expect(rosterCellKind(undefined)).toBe('uncounted');
  });
});

describe('columns', () => {
  it('keeps only the Five-Star MDS measures, in engine order', () => {
    expect(rosterMeasures(QUARTER_RATES)).toEqual(['uti', 'catheter']);
  });

  it('labels columns with the short name', () => {
    expect(rosterLabels(QUARTER_RATES).get('uti')).toBe('UTI');
  });

  it('survives a payload with no rates', () => {
    expect(rosterMeasures(undefined)).toEqual([]);
    expect(toRosterRows(undefined)).toEqual([]);
  });
});

describe('THE INVARIANT — the grid reconciles with the headline rate', () => {
  const rows = toRosterRows(QUARTER_RATES);
  const measures = rosterMeasures(QUARTER_RATES);
  const tallies = rosterTallies(rows, measures);

  it.each(QUARTER_RATES.rates.filter((r) => measures.includes(r.measureId)))(
    '$measureId: the grid counts exactly what the engine published',
    (rate) => {
      const t = tallies.find((x) => x.measureId === rate.measureId);
      expect(t.numerator, `${rate.measureId} numerator`).toBe(rate.numerator);
      expect(t.denominator, `${rate.measureId} denominator`).toBe(rate.denominator);
    },
  );

  it('counts every resident exactly once per column', () => {
    for (const m of measures) {
      const kinds = rows.map((r) => r.cells[m]?.kind ?? 'uncounted');
      expect(kinds).toHaveLength(QUARTER_RATES.rows.length);
    }
  });
});

describe('rows', () => {
  const rows = toRosterRows(QUARTER_RATES);

  it('sorts A–Z by name', () => {
    expect(rows.map((r) => r.name)).toEqual([
      'Alder, Ann', 'Birch, Bob', 'Cedar, Cy', 'Dogwood, Dee', 'Elm, Eve', 'Fir, Fay',
    ]);
  });

  it('flags discharged residents — CMS still counts them in the quarter', () => {
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName['Cedar, Cy'].discharged).toBe(true);
    expect(byName['Fir, Fay'].discharged).toBe(true);
    expect(byName['Alder, Ann'].discharged).toBe(false);
  });

  it('carries the exclusion reason through to the cell', () => {
    const cedar = rows.find((r) => r.patientId === 'p-cedar');
    expect(cedar.cells.uti.reason).toBe('Comatose');
  });

  it('carries the SKIP reason too — it is the only thing distinguishing it from n/a', () => {
    const dogwood = rows.find((r) => r.patientId === 'p-dogwood');
    expect(dogwood.cells.uti.kind).toBe('uncounted');
    expect(dogwood.cells.uti.reason).toBe('No qualifying prior assessment');
  });

  it('drops non-Five-Star measures from the cells', () => {
    expect(rows[0].cells.falls_all).toBeUndefined();
  });
});

describe('filtering', () => {
  const rows = toRosterRows(QUARTER_RATES);

  it('matches a name case-insensitively', () => {
    expect(filterRoster(rows, { query: 'birch' }).map((r) => r.patientId)).toEqual(['p-birch']);
  });

  it('keeps only residents triggering something', () => {
    // Elm triggers on paper but is skipped on BOTH measures, so the grid must
    // not offer her as "triggering" — she is not in either numerator.
    expect(filterRoster(rows, { triggeringOnly: true }).map((r) => r.patientId))
      .toEqual(['p-alder', 'p-birch']);
  });

  it('composes the two filters', () => {
    expect(filterRoster(rows, { query: 'a', triggeringOnly: true }).map((r) => r.patientId))
      .toEqual(['p-alder']);
  });

  it('returns everything when unfiltered', () => {
    expect(filterRoster(rows)).toHaveLength(6);
  });
});

describe('CSV', () => {
  const rows = toRosterRows(QUARTER_RATES);
  const measures = rosterMeasures(QUARTER_RATES);
  const labels = rosterLabels(QUARTER_RATES);
  const csv = rosterCsv({ rows, measures, labels });
  const lines = csv.split('\r\n');

  it('heads with the meta columns then one column per measure', () => {
    expect(lines[0]).toBe('Resident,Stay,Day,Status,Target ARD,Submitted,UTI,Catheter');
  });

  it('writes one line per resident', () => {
    expect(lines).toHaveLength(1 + rows.length);
  });

  it('quotes names, which contain commas', () => {
    // Unquoted, "Alder, Ann" would shift every subsequent column one to the
    // right — the whole sheet silently misaligns.
    expect(lines[1].startsWith('"Alder, Ann",')).toBe(true);
  });

  it('writes the SHP alphabet', () => {
    const alder = lines[1].split(',').slice(-2);
    expect(alder).toEqual([ROSTER_CSV_CODE.numerator, ROSTER_CSV_CODE.numerator]);
  });

  it('writes an uncounted cell as blank, not as "d"', () => {
    const elm = lines.find((l) => l.includes('Elm, Eve'));
    expect(elm.endsWith(',,')).toBe(true);
  });

  it('exports what is on screen, filters included', () => {
    const visible = filterRoster(rows, { triggeringOnly: true });
    const filtered = rosterCsv({ rows: visible, measures, labels }).split('\r\n');
    expect(filtered).toHaveLength(3); // header + Alder + Birch
  });

  it('escapes an embedded quote', () => {
    const odd = toRosterRows({
      ...QUARTER_RATES,
      rows: [{ ...QUARTER_RATES.rows[0], name: 'O"Hara, Ann' }],
    });
    expect(rosterCsv({ rows: odd, measures, labels })).toContain('"O""Hara, Ann"');
  });
});
