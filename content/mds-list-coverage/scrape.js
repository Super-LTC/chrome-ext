// content/mds-list-coverage/scrape.js
// Pure string parsers (unit-tested in node) + a thin DOM adapter.

/** ESOLassessid from a row's HTML: edit link → strike-out args → copy args.
 *  Never the print link — PCC renders it as `?ESOLassessid=` (empty). */
export function assessmentIdFromHtml(html) {
  if (!html) return null;
  const edit = html.match(/sectionlisting\.xhtml\?ESOLassessid=(\d+)/);
  if (edit) return edit[1];
  const strike = html.match(/launchStrikeOut\('[^']*',\s*'?(\d+)'?/);
  if (strike) return strike[1];
  const copy = html.match(/launchCopyMDSAssessment\(\s*(\d+)/);
  if (copy) return copy[1];
  return null;
}

/** MRN is the parenthetical in the Name cell, e.g. "Sanders, Gordon (000953026)". */
export function mrnFromHtml(html) {
  const name = nameAnchorText(html);
  const m = name?.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

/** Patient name without the trailing "(MRN)". */
export function patientNameFromHtml(html) {
  const name = nameAnchorText(html);
  return name ? name.replace(/\s*\([^)]*\)\s*$/, '').trim() : null;
}

/** Text of the cp_mds.jsp name link, tags stripped. */
function nameAnchorText(html) {
  if (!html) return null;
  const m = html.match(/<a[^>]*cp_mds\.jsp[^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** DOM adapter (not unit-tested — pure logic above is). Returns one entry per
 *  data row, carrying the live rowEl for chip injection. */
export function scrapeRows(container) {
  if (!container) return [];
  return [...container.querySelectorAll('tr')]
    .map((rowEl) => {
      const html = rowEl.outerHTML;
      const externalAssessmentId = assessmentIdFromHtml(html);
      if (!externalAssessmentId) return null;
      return { externalAssessmentId, rowEl, mrn: mrnFromHtml(html), patientName: patientNameFromHtml(html) };
    })
    .filter(Boolean);
}
