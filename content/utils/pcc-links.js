/**
 * Shared PCC deep-link builders.
 *
 * PCC is the parent page, so `origin()` is the current tab's host — never
 * hardcode a domain, customers are on different PCC pods.
 *
 * These URL patterns were duplicated across four modules before this file
 * existed (mds-planner, ftag-prevention, twenty-four-hour-report, and inline in
 * queries/query-modal.js). Add new patterns here rather than a fifth copy.
 *
 * ── The id these take ──────────────────────────────────────────────────────
 * Every `ESOLclientid` link needs the PCC **external client id**, not our
 * internal patient id. Modules disagree on the field name that holds it:
 * ftag-prevention keeps them apart as `pccPatientId` vs `patientId`, while the
 * 24-hour report's `patientId` IS the external id because the backend rewrites
 * it before the payload ships. Check what your payload actually carries — do
 * not copy a field name across modules by analogy.
 */

function origin() {
  return window.location.origin;
}

/** Resident dashboard — a reliable landing spot to reach Progress Notes / Vitals / MAR. */
export function patientDashboardUrl(pccClientId) {
  if (!pccClientId) return null;
  return `${origin()}/admin/client/cp_residentdashboard.jsp?ESOLrow=1&ESOLclientid=${encodeURIComponent(pccClientId)}`;
}

/**
 * New-progress-note entry form.
 *   /care/chart/ipn/newipn.jsp?ESOLclientid=<id>&res_pn=Y&ESOLpnid=-1
 * (`ESOLpnid=-1` = new note, `res_pn=Y` = resident progress note.)
 */
export function progressNoteUrl(pccClientId) {
  if (!pccClientId) return null;
  return `${origin()}/care/chart/ipn/newipn.jsp?ESOLclientid=${encodeURIComponent(pccClientId)}&res_pn=Y&ESOLpnid=-1`;
}

/**
 * An EXISTING progress note, by PCC's note id.
 *
 * Same ipn screen as the new-note form, with the real id in place of the -1
 * sentinel. That is the inference, not a verified fact — the scraper reads
 * notes through its own API, so the URL shape is not written down anywhere in
 * our code. If PCC does not honour it, `openExistingNote` below falls back to
 * the resident dashboard, which is where this button already lands today, so a
 * wrong guess costs nothing.
 *
 * `pccNoteId` comes from `followup.detectedPccNoteId`. It is NOT
 * `detectedSourceId` — that one is our own clinical_notes row id, which PCC
 * has never seen and cannot resolve.
 */
export function existingProgressNoteUrl(pccClientId, pccNoteId) {
  if (!pccClientId || !pccNoteId) return null;
  return `${origin()}/care/chart/ipn/newipn.jsp?ESOLclientid=${encodeURIComponent(pccClientId)}&res_pn=Y&ESOLpnid=${encodeURIComponent(pccNoteId)}`;
}

/**
 * Best available destination for "show me that note": the note itself when we
 * have its PCC id, otherwise the resident's chart. Never returns null when a
 * client id exists, so the affordance always does something.
 */
export function noteOrChartUrl(pccClientId, pccNoteId) {
  return existingProgressNoteUrl(pccClientId, pccNoteId) || patientDashboardUrl(pccClientId);
}

/** Navigate the current (PCC) tab to a deep-link. Returns false if no URL. */
export function navigatePcc(url) {
  if (!url) return false;
  window.location.href = url;
  return true;
}

/**
 * Open a PCC deep-link in a genuine NEW WINDOW (not a tab), keeping the overlay
 * in place. Must be called synchronously from a click handler (before any await)
 * or the browser may block the popup. The window features force a separate
 * popup window; we intentionally DON'T pass `noopener` so the caller gets the
 * handle back and can poll `.closed` to know when the nurse finished.
 *
 * Returns the WindowProxy handle, or null if blocked / no URL.
 */
export function openPccWindow(url, target = 'super_pcc_window') {
  if (!url) return null;
  const w = Math.min(1180, Math.max(900, Math.round(window.screen.availWidth * 0.7)));
  const h = Math.min(900, Math.max(700, Math.round(window.screen.availHeight * 0.85)));
  const left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  return window.open(url, target, features) || null;
}
