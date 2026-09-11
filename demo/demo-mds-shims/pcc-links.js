/**
 * Demo shim for content/utils/pcc-links.js.
 *
 * "Add progress note" on a 24-hour finding opens PCC's new-note form in a
 * popup and watches its URL for the saved note's id (`ESOLpnid=<id>`). The
 * demo host has no PCC, so the form URL is pointed at a stand-in page
 * (demo/pcc-progress-note.html) that plays the same URL game on Save. Every
 * other builder is passed through unchanged.
 *
 * Wired by a vite.demo.config.js alias on the RELATIVE specifiers content code
 * uses (`../../../utils/pcc-links.js`); this file reaches the real module by
 * a path that alias does not match.
 */
export * from '../../content/utils/pcc-links.js';
import { patientDashboardUrl } from '../../content/utils/pcc-links.js';

const DEMO_NOTE_FORM = '/demo/pcc-progress-note.html';

/** New-note form → the demo stand-in, same query shape as PCC's. */
export function progressNoteUrl(pccClientId) {
  if (!pccClientId) return null;
  return `${window.location.origin}${DEMO_NOTE_FORM}?ESOLclientid=${encodeURIComponent(pccClientId)}&res_pn=Y&ESOLpnid=-1`;
}

/** An existing note — the stand-in reopens it read-only from localStorage. */
export function existingProgressNoteUrl(pccClientId, pccNoteId) {
  if (!pccClientId || !pccNoteId) return null;
  return `${window.location.origin}${DEMO_NOTE_FORM}?ESOLclientid=${encodeURIComponent(pccClientId)}&res_pn=Y&ESOLpnid=${encodeURIComponent(pccNoteId)}`;
}

/** Same fallback rule as the real helper, built on the demo URLs above. */
export function noteOrChartUrl(pccClientId, pccNoteId) {
  return existingProgressNoteUrl(pccClientId, pccNoteId) || patientDashboardUrl(pccClientId);
}
