/**
 * Work out which progress note the nurse just wrote in PCC, so a finding can
 * link to it.
 *
 * Two signals, cheapest first:
 *
 *   1. The popup's URL. It is SAME-ORIGIN — we are injected into PCC — so as
 *      she saves we can read where it went. A blank form is ESOLpnid=-1; any
 *      other value is a note that now exists. Free and exact when it works.
 *
 *   2. Diff the notes list. Snapshot the ids BEFORE she starts, fetch again
 *      after, and take the newest row that was not there before. Costs one
 *      request and is the fallback if PCC keeps the id out of the URL.
 *
 * Both refuse to guess. Returning null means the nurse still gets credit for
 * writing a note — the trail records that — it just carries no link. Attaching
 * the WRONG note to a clinical finding is the outcome worth avoiding.
 *
 * We deliberately do not POST the note to PCC ourselves. PCC's form is JSF and
 * carries view state; a release could change it silently, and the failure mode
 * is a malformed or misattributed note in a legal record.
 */

import { parseProgressNotes, pickNewestNewNote } from './parseProgressNotes.js';

/** Last 24 hours, eMAR included — pickNewestNewNote filters those out itself. */
export function notesListUrl(pccClientId) {
  if (!pccClientId) return null;
  return `${window.location.origin}/clinical/client/progressnotesviewall.xhtml?ESOLclientid=${encodeURIComponent(
    pccClientId
  )}&ESOLshowEMARPN=Y&viewAllOption=3`;
}

/** Ids currently on the resident's notes list, so we can tell what is new. */
export async function snapshotNoteIds(pccClientId) {
  const url = notesListUrl(pccClientId);
  if (!url) return new Set();
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return new Set();
    return new Set(parseProgressNotes(await res.text()).map((n) => n.pnid));
  } catch {
    // A failed snapshot only costs us the fallback; the URL signal still works.
    return new Set();
  }
}

/**
 * Read a note id out of a popup URL, but only if that URL is the note FORM for
 * THIS resident.
 *
 * The naive version — match `ESOLpnid=(\d+)` anywhere — captures a note she
 * merely opened to read. PCC's note window is where a nurse navigates: she
 * clicks "Add progress note", meets the e-signature attestation, and goes to
 * look at an existing note first. That note's id would then be recorded as the
 * one she wrote, on a finding about a different resident, in a sign-off trail.
 *
 * So both halves must hold: the page is `newipn.jsp`, and its `ESOLclientid`
 * is the resident whose finding we started from.
 *
 * @returns {string|null}
 */
export function noteIdFromFormUrl(href, pccClientId) {
  if (!href || !pccClientId) return null;
  let url;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }
  if (!/\/newipn\.jsp$/i.test(url.pathname)) return null;
  if (url.searchParams.get('ESOLclientid') !== String(pccClientId)) return null;

  const pnid = url.searchParams.get('ESOLpnid');
  // -1 is the blank form; a real id means a note now exists.
  if (!pnid || pnid === '-1' || !/^\d{1,12}$/.test(pnid)) return null;
  return pnid;
}

/**
 * @returns {Promise<{pnid: string, via: 'url'|'list'}|null>}
 */
export async function captureWrittenNote({ pccClientId, urlPnid, knownIds, since }) {
  // The URL said a note exists — but only trust it if it was NOT already on her
  // list before she started. An id we had already seen is by definition not the
  // note she just wrote, which is the same test the list path applies.
  if (urlPnid && /^\d{1,12}$/.test(urlPnid) && urlPnid !== '-1') {
    const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
    if (!known.has(urlPnid)) return { pnid: urlPnid, via: 'url' };
  }

  const url = notesListUrl(pccClientId);
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const picked = pickNewestNewNote(parseProgressNotes(await res.text()), knownIds, since);
    return picked ? { pnid: picked.pnid, via: 'list' } : null;
  } catch {
    return null;
  }
}
