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

/** Parse a native "Unsigned Sections" cell string → upper-case section tokens.
 *  Handles comma + &nbsp; separators, e.g. "A,  B,  GG" → ['A','B','GG']. */
export function parseSectionList(text) {
  if (!text) return [];
  return String(text)
    .replace(/\u00a0/g, ' ')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{1,2}$/.test(s));
}

/** Column indexes (by header text) for the native cells we filter on. Located by
 *  header rather than a fixed position so we survive PCC column reordering / the
 *  optional Verify column. Our own injected columns carry `super-ilc-th` and are
 *  skipped, and they're appended at the end so native indexes stay stable. */
export function nativeColumnIndexes(container) {
  const headRow = container?.querySelector?.('tr');
  const out = { unsigned: -1, type: -1 };
  if (!headRow) return out;
  [...headRow.children].forEach((th, i) => {
    if (th.classList?.contains('super-ilc-th')) return;
    const t = (th.textContent || '').replace(/\u00a0/g, ' ').trim().toLowerCase();
    if (t.includes('unsigned')) out.unsigned = i;
    else if (t === 'type') out.type = i;
  });
  return out;
}

/** Trimmed text of a data row's cell at a column index (''/no-op for idx < 0). */
export function cellTextAt(rowEl, idx) {
  if (idx == null || idx < 0) return '';
  const cell = rowEl?.children?.[idx];
  return cell ? (cell.textContent || '').replace(/\u00a0/g, ' ').trim() : '';
}

/** DOM adapter (not unit-tested — pure logic above is). Returns one entry per
 *  data row, carrying the live rowEl for chip injection. Also captures the native
 *  Unsigned Sections / Type cells (for the filter bar) plus the unsigned cell's
 *  column index so the highlighter can find it later. */
export function scrapeRows(container) {
  if (!container) return [];
  const cols = nativeColumnIndexes(container);
  return [...container.querySelectorAll('tr')]
    .map((rowEl) => {
      const html = rowEl.outerHTML;
      const externalAssessmentId = assessmentIdFromHtml(html);
      if (!externalAssessmentId) return null;
      return {
        externalAssessmentId,
        rowEl,
        mrn: mrnFromHtml(html),
        patientName: patientNameFromHtml(html),
        unsignedSections: parseSectionList(cellTextAt(rowEl, cols.unsigned)),
        type: cellTextAt(rowEl, cols.type),
        unsignedColIndex: cols.unsigned,
      };
    })
    .filter(Boolean);
}
