import { describe, it, expect } from 'vitest';
import {
  parseSectionList,
  nativeColumnIndexes,
  cellTextAt,
  scrapeRows,
} from '../scrape.js';

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
  it('locates Type and Unsigned Sections by header text, skipping our columns', () => {
    const table = buildTable(HEADER + DATA_ROW);
    expect(nativeColumnIndexes(table)).toEqual({ unsigned: 5, type: 3 });
  });
  it('returns -1 for missing headers', () => {
    const table = buildTable('<tr><th>Date</th><th>Name</th></tr>');
    expect(nativeColumnIndexes(table)).toEqual({ unsigned: -1, type: -1 });
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
  it('captures unsignedSections + type alongside id/name/mrn', () => {
    const table = buildTable(HEADER + DATA_ROW);
    const rows = scrapeRows(table);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalAssessmentId: '3104940',
      mrn: '178122',
      patientName: 'Gibson, Larry',
      type: 'NQ',
      unsignedSections: ['A', 'B', 'C', 'Q'],
      unsignedColIndex: 5,
    });
  });
});
