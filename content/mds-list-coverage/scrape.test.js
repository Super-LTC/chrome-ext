import { describe, it, expect } from 'vitest';
import { assessmentIdFromHtml, mrnFromHtml, patientNameFromHtml } from './scrape.js';

const ROW_HTML = `<tr bgcolor="#efefef"><td valign="top">&nbsp;
  <a class="listbutton" href="/clinical/mds3/sectionlisting.xhtml?ESOLassessid=1560725&retURL=/care/chart/mds/mdslist.jsp">edit</a>&nbsp;&nbsp;
  <a class="listbutton" href="javascript:launchStrikeOut('?ESOLassessid=1560725','1560725','841062');">strike-out</a>&nbsp;&nbsp;
  <a class="listbutton" href="javascript:launchPrintOp('?ESOLassessid=','');">print</a>&nbsp;&nbsp;
  <a href="javascript:launchCopyMDSAssessment(1560725, 841062, 'Y')">copy</a></td>
  <td valign="top" align="left">7/4/2026</td>
  <td valign="top"><a href="/admin/client/cp_mds.jsp?ESOLclientid=841062&ESOLtabtype=C">Sanders, Gordon (000953026)</a></td>
  <td valign="top">NQ</td><td valign="top"><span>A, B, C</span></td></tr>`;

describe('assessmentIdFromHtml', () => {
  it('reads ESOLassessid from the edit link', () => {
    expect(assessmentIdFromHtml(ROW_HTML)).toBe('1560725');
  });
  it('falls back to strike-out/copy args, never the empty print id', () => {
    const noEdit = ROW_HTML.replace(/<a class="listbutton" href="\/clinical[^>]*>edit<\/a>/, '');
    expect(assessmentIdFromHtml(noEdit)).toBe('1560725');
  });
  it('returns null when no assessment id is present', () => {
    expect(assessmentIdFromHtml('<tr><td>header</td></tr>')).toBeNull();
  });
  // NOTE: pdpmAnalyzer/EID recovery cases live in __tests__/scrape-cells.test.js
  // — vitest's include is content/**/__tests__/**, so THIS file is not run by the
  // suite (kept for reference alongside the pure parsers).
});

describe('mrnFromHtml / patientNameFromHtml', () => {
  it('extracts the parenthetical MRN', () => {
    expect(mrnFromHtml(ROW_HTML)).toBe('000953026');
  });
  it('extracts the patient name without the MRN', () => {
    expect(patientNameFromHtml(ROW_HTML)).toBe('Sanders, Gordon');
  });
});
