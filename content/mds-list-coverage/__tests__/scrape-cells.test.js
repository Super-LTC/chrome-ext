import { describe, it, expect } from 'vitest';
import {
  parseSectionList,
  nativeColumnIndexes,
  cellTextAt,
  scrapeRows,
  assessmentIdFromHtml,
  normalizeArdDate,
} from '../scrape.js';

describe('normalizeArdDate', () => {
  it('converts PCC M/D/YYYY to ISO', () => {
    expect(normalizeArdDate('8/14/2026')).toBe('2026-08-14');
    expect(normalizeArdDate('8/4/2026')).toBe('2026-08-04');
    expect(normalizeArdDate(' 12/31/2025 ')).toBe('2025-12-31');
  });
  it('returns null for empty/unparseable input', () => {
    expect(normalizeArdDate('')).toBeNull();
    expect(normalizeArdDate(null)).toBeNull();
    expect(normalizeArdDate('2026-08-14')).toBeNull(); // already-ISO isn't the PCC cell shape
  });
});

describe('assessmentIdFromHtml (EID migration)', () => {
  it('reads a numeric id from the edit link', () => {
    const html = '<a href="/clinical/mds3/sectionlisting.xhtml?ESOLassessid=1560725&x=1">edit</a>';
    expect(assessmentIdFromHtml(html)).toBe('1560725');
  });

  it('recovers the numeric id from a pdpmAnalyzer (HIPPS) call when edit/strike/copy links are EID', () => {
    const eidRow = `<tr>
      <a href="/clinical/mds3/sectionlisting.xhtml?ESOLassessid=EID_0qp9Dt46t1IKFj6k">edit</a>
      <a href="javascript:launchStrikeOut('?ESOLassessid=EID_x','EID_x','EID_c');">strike-out</a>
      <a href="javascript:pdpmAnalyzer('/mds3/analyzer.jsp?ESOLassessid=3120458&x=1')">HIPPS</a>
    </tr>`;
    expect(assessmentIdFromHtml(eidRow)).toBe('3120458');
  });

  it('returns null on a fully EID-flipped row (never an EID_ token)', () => {
    const eidRow = `<tr>
      <a href="/clinical/mds3/sectionlisting.xhtml?ESOLassessid=EID_0qp9Dt46t1IKFj6k">edit</a>
      <a href="javascript:launchStrikeOut('?ESOLassessid=EID_x','EID_x','EID_c');">strike-out</a>
    </tr>`;
    expect(assessmentIdFromHtml(eidRow)).toBeNull();
  });
});

describe('parseSectionList', () => {
  it('splits a comma + nbsp separated list into upper-case tokens', () => {
    // Real cell text has non-breaking spaces between letters.
    const cell = 'A,  B,  GG,  Q';
    expect(parseSectionList(cell)).toEqual(['A', 'B', 'GG', 'Q']);
  });
  it('lower-case and stray whitespace are normalized', () => {
    expect(parseSectionList('  a , b ,  gg ')).toEqual(['A', 'B', 'GG']);
  });
  it('drops non-section junk and handles empty', () => {
    expect(parseSectionList('')).toEqual([]);
    expect(parseSectionList(null)).toEqual([]);
    expect(parseSectionList('A, 123, ---, C')).toEqual(['A', 'C']);
  });
});

// A header row shaped like the live page: native columns first, our injected
// Complete By / Interviews Due columns (super-ilc-th) appended at the end.
const HEADER = `<tr>
  <th class="detailColHeader"></th>
  <th class="detailColHeader">Date</th>
  <th class="detailColHeader">Name</th>
  <th class="detailColHeader">Type</th>
  <th class="detailColHeader">Verify</th>
  <th class="detailColHeader">Unsigned Sections</th>
  <th class="detailColHeader super-ilc-th super-ilc-cb-th">Complete By</th>
  <th class="detailColHeader super-ilc-th super-ilc-due-th">Interviews Due</th>
</tr>`;

const DATA_ROW = `<tr bgcolor="#efefef">
  <td><a class="listbutton" href="/clinical/mds3/sectionlisting.xhtml?ESOLassessid=3104940&retURL=x">edit</a></td>
  <td>8/14/2026</td>
  <td><a href="/admin/client/cp_mds.jsp?ESOLclientid=2897057&ESOLtabtype=C">Gibson, Larry (178122)</a></td>
  <td>NQ</td>
  <td></td>
  <td><span style="font-size:8pt;">A,  B,  C,  Q</span></td>
</tr>`;

function buildTable(inner) {
  const t = document.createElement('table');
  t.innerHTML = inner;
  return t;
}

describe('nativeColumnIndexes', () => {
  it('locates Date (ARD), Type and Unsigned Sections by header text, skipping our columns', () => {
    const table = buildTable(HEADER + DATA_ROW);
    expect(nativeColumnIndexes(table)).toEqual({ unsigned: 5, type: 3, ard: 1 });
  });
  it('returns -1 for missing type/unsigned headers (Date still located)', () => {
    const table = buildTable('<tr><th>Date</th><th>Name</th></tr>');
    expect(nativeColumnIndexes(table)).toEqual({ unsigned: -1, type: -1, ard: 0 });
  });
});

describe('cellTextAt', () => {
  it('reads trimmed cell text by index; no-op for -1', () => {
    const table = buildTable(HEADER + DATA_ROW);
    const dataRow = table.querySelectorAll('tr')[1];
    expect(cellTextAt(dataRow, 3)).toBe('NQ');
    expect(cellTextAt(dataRow, -1)).toBe('');
  });
});

describe('scrapeRows (with native cells)', () => {
  it('captures unsignedSections + type + normalized ardDate alongside id/name/mrn', () => {
    const table = buildTable(HEADER + DATA_ROW);
    const rows = scrapeRows(table);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalAssessmentId: '3104940',
      mrn: '178122',
      patientName: 'Gibson, Larry',
      type: 'NQ',
      ardDate: '2026-08-14',
      unsignedSections: ['A', 'B', 'C', 'Q'],
      unsignedColIndex: 5,
    });
  });

  it('KEEPS a flipped (EID) row that has an MRN but no numeric id — the coverage fallback needs it', () => {
    const flippedRow = `<tr bgcolor="#efefef">
      <td><a class="listbutton" href="/clinical/mds3/sectionlisting.xhtml?ESOLassessid=EID_0qp9Dt46t1IKFj6k">edit</a></td>
      <td>9/1/2026</td>
      <td><a href="/admin/client/cp_mds.jsp?ESOLclientid=EID_x">Doe, Jane (AC72452125)</a></td>
      <td>5-Day</td>
      <td></td>
      <td><span>A,  GG</span></td>
    </tr>`;
    const rows = scrapeRows(buildTable(HEADER + flippedRow));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalAssessmentId: null,
      mrn: 'AC72452125',
      patientName: 'Doe, Jane',
      type: '5-Day',
      ardDate: '2026-09-01',
      unsignedSections: ['A', 'GG'],
    });
  });

  it('drops header/spacer rows with neither a numeric id nor an MRN', () => {
    const rows = scrapeRows(buildTable(HEADER + '<tr><td colspan="6">No assessments</td></tr>'));
    expect(rows).toHaveLength(0);
  });
});
