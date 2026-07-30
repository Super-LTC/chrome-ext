/**
 * Parse PointClickCare's "view all progress notes" page.
 *
 * The extension runs inside PCC with the nurse's own session, so it can just
 * fetch this page — no scraper, no backend, no sync lag:
 *
 *   /clinical/client/progressnotesviewall.xhtml
 *     ?ESOLclientid=<id>&ESOLshowEMARPN=Y&viewAllOption=3      (3 = last 24 hrs)
 *
 * Column order matches the Go scraper's getPatientProgressNotes (requests.go),
 * and is the same for both table skins:
 *
 *   0 Actions (holds ESOLpnid)  1 Effective Date  2 Type  3 Note
 *   4 Care Plan Item/Task       5 Department      6 Shift Report  7 24 Hour Report
 *
 * PCC renders the list as `.pnlist` (legacy) or `.evergreen-table` (current);
 * only the container differs, so we take rows from whichever is present rather
 * than hard-coding one and silently returning nothing after a PCC redesign.
 *
 * Pure and DOM-agnostic on purpose — it takes an HTML string and a DOMParser
 * so it can be tested without a browser.
 */

/** `openSizedLookup2('/care/chart/ipn/newipn.jsp?ESOLpnid=7604501&...')` -> "7604501" */
const PN_ID = /ESOLpnid=(\d+)/;

/**
 * PCC prints dates as M/D/YYYY HH:mm in the FACILITY's local time with no zone.
 * Parsed as local time, which is what the nurse's browser is in — the only
 * case that breaks is a nurse working remotely in another timezone, and the
 * consequence there is a mis-ordered "newest" pick, not a wrong note body.
 */
function parseNoteDate(text) {
  const m = String(text || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, mo, d, y, h, min] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(min));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Text of a cell with <br> turned into newlines, entities decoded. */
function cellText(td) {
  const html = td.innerHTML || '';
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n');
  const tmp = td.ownerDocument.createElement('div');
  tmp.innerHTML = withBreaks;
  return (tmp.textContent || '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * @returns {Array<{pnid: string, effectiveDate: Date|null, effectiveText: string,
 *                  type: string, text: string, department: string}>}
 *          Newest first. Empty array on anything unparseable — a bad parse must
 *          look like "found nothing", never like a wrong note.
 */
export function parseProgressNotes(html, parser = new DOMParser()) {
  let doc;
  try {
    doc = parser.parseFromString(String(html || ''), 'text/html');
  } catch {
    return [];
  }
  if (!doc) return [];

  const table =
    doc.querySelector('.pnlist') ||
    doc.querySelector('.evergreen-table') ||
    doc;

  const notes = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    // Header rows in either skin.
    if (tr.querySelector('th') || tr.querySelector('td.detailColHeader')) continue;

    const tds = Array.from(tr.querySelectorAll('td'));
    if (tds.length < 4) continue;

    const link = tds[0].querySelector('a');
    const href = link ? link.getAttribute('href') || '' : '';
    const match = href.match(PN_ID);
    if (!match) continue; // no id -> not a note row (spacers, "No records found")

    const effectiveText = (tds[1].textContent || '').trim();
    notes.push({
      pnid: match[1],
      effectiveDate: parseNoteDate(effectiveText),
      effectiveText,
      type: (tds[2].textContent || '').trim(),
      text: cellText(tds[3]),
      department: tds[5] ? (tds[5].textContent || '').trim() : '',
    });
  }

  notes.sort((a, b) => {
    const ta = a.effectiveDate ? a.effectiveDate.getTime() : 0;
    const tb = b.effectiveDate ? b.effectiveDate.getTime() : 0;
    return tb - ta;
  });
  return notes;
}

/**
 * Machine-written eMAR rows, which are NOT what a nurse just typed.
 *
 * Measured on a real page: 9 of 10 rows in a 24-hour window were
 * "Orders - Administration Note". They land continuously while she is in the
 * form, so without this the most likely wrong pick is an eMAR row stamped a
 * minute after her actual note. Same exclusion the backend linkage uses.
 */
export const NON_AUTHORED_TYPES = ['Orders - Administration Note'];

/**
 * The note she most likely just wrote: newest one effective at or after she
 * opened the form, minus anything that was already on screen before, minus
 * machine-written eMAR rows.
 *
 * `knownIds` matters more than the timestamp — a nurse can back-date a note,
 * and eMAR rows land continuously while she types. Comparing against what we
 * saw BEFORE she started is the only reliable signal that a row is new.
 *
 * Returns null when nothing qualifies. Guessing here would attach the wrong
 * note to a clinical finding, which is worse than no link at all.
 */
export function pickNewestNewNote(notes, knownIds, since) {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
  const cutoff = since instanceof Date ? since.getTime() : null;

  const fresh = (notes || []).filter((n) => {
    if (known.has(n.pnid)) return false;
    if (NON_AUTHORED_TYPES.includes(n.type)) return false;
    // A note with no parseable date still counts if it wasn't there before —
    // being new to the page is the stronger signal.
    if (cutoff && n.effectiveDate) {
      // 5 min of slack: PCC stamps the effective time the form was opened, which
      // can precede our click by a little.
      return n.effectiveDate.getTime() >= cutoff - 5 * 60 * 1000;
    }
    return true;
  });

  return fresh.length > 0 ? fresh[0] : null;
}
