// Stable PCC client-id resolution.
//
// PCC migrated its listing pages and in-page links from a numeric ESOLclientid
// (e.g. 2745953) to an ephemeral, per-render token (e.g.
// ESOLclientid=EID_0qp9Dt46t1IKFj6k). The token works for same-session PCC
// requests, but it is NOT stable: it is regenerated on every render and is
// rejected ("link_expired") in a later session. It therefore can never be
// stored or matched against our backend's numeric patient records — passing one
// to the backend yields "patient not found".
//
// The good news: the numeric id is still present in the rendered page even when
// the URL only carries an EID_ token — most commonly the hidden form input
// `<input name="ESOLclientid" value="2745953">`, and otherwise in anchor hrefs
// and inline scripts. These helpers recover that numeric id.
//
// Rule of thumb: anywhere the extension reads a client id off the page to send
// to the backend (or to build a link we persist), use resolveStableClientId()
// instead of reading ESOLclientid straight from the URL.

const _NUMERIC_ID = /^\d+$/;

function _isNumericId(v) {
  return typeof v === 'string' && _NUMERIC_ID.test(v) && v !== '0';
}

// PCC serves the resident-header photo from a file named after the patient's
// NUMERIC client id (e.g. `.../21068632.jpg`), which makes it a durable id source
// on EID-flipped pages that expose no ESOLclientid at all. Scoped to the resident
// header so a wound thumbnail or an avatar elsewhere on the page can't be read as
// a patient id, and required to be 6+ digits so it can never be an MRN (those are
// 4-5 digits). A wrong guess is recoverable — the backend verifies the id and
// falls back to the MRN — but a wrong guess that LOOKS right is not, hence the
// scoping.
const _PHOTO_ID = /\/(\d{6,})\.(?:jpg|jpeg|png)(?:[?#]|$)/i;

export function scrapeClientIdFromResidentPhoto(doc = document) {
  const fromImg = (img) => {
    for (const attr of ['src', 'data-src']) {
      const m = _PHOTO_ID.exec(img?.getAttribute?.(attr) || '');
      if (m) return m[1];
    }
    return null;
  };

  // 1. PCC's own photo elements, when the markup names them.
  for (const img of doc.querySelectorAll(
    '#residentPhoto, .residentPhoto, img.resident-photo, .rh-photo img, .residentPhoto img'
  )) {
    const id = fromImg(img);
    if (id) return id;
  }

  // 2. Otherwise: an <img> inside the resident-header block. Walk up from the
  //    name element a few levels — PCC's header nesting varies by page.
  //    Stop at <body>: everything on the page is inside it, so searching there
  //    would pull in wound thumbnails and other patients' avatars.
  let node = doc.querySelector('.residentName#name, .residentName');
  for (let depth = 0; node && node !== doc.body && node !== doc.documentElement && depth < 4; depth += 1) {
    for (const img of node.querySelectorAll?.('img') || []) {
      const id = fromImg(img);
      if (id) return id;
    }
    node = node.parentElement;
  }

  return null;
}

// Scrape a NUMERIC ESOLclientid from the live DOM. Returns null if none is
// found. Never returns an EID_ token (every source is matched against digits).
export function scrapeNumericClientIdFromDOM(doc = document) {
  // 1. Hidden form input — clinical form pages (e.g. newmds.xhtml) carry the
  //    numeric id here even when the page URL shows an EID_ token.
  const hidden = doc.querySelector('input[name="ESOLclientid"]');
  if (hidden && _isNumericId(hidden.value)) return hidden.value;

  // 2. PCC's own `document.needs` form, when present.
  try {
    const v = doc?.needs?.ESOLclientid?.value;
    if (_isNumericId(v)) return v;
  } catch (_) { /* document.needs may not exist */ }

  // 3. Anchor hrefs — survive most PCC markup tweaks.
  for (const a of doc.querySelectorAll('a[href*="ESOLclientid="]')) {
    const m = /[?&]ESOLclientid=(\d+)/.exec(a.getAttribute('href') || '');
    if (m && _isNumericId(m[1])) return m[1];
  }

  // 4. Inline scripts — link-builder strings, etc.
  for (const s of doc.querySelectorAll('script:not([src])')) {
    const m = /ESOLclientid=(\d+)/.exec(s.textContent || '');
    if (m && _isNumericId(m[1])) return m[1];
  }

  // 5. Resident-header PHOTO filename — PCC serves the resident's photo as
  //    `<numeric client id>.jpg`, so the id survives on pages that carry no
  //    ESOLclientid anywhere. Verified against prod 2026-09-02: the header photo
  //    on MRN 11006's chart is `21068632.jpg`, and 21068632 is exactly that
  //    patient's stored external_patient_id. Ordered ABOVE the "Client ID:" span
  //    because that span is the MRN (see step 6) and this is the real id.
  const fromPhoto = scrapeClientIdFromResidentPhoto(doc);
  if (fromPhoto) return fromPhoto;

  // 6. Resident-header "Client ID: NNN" span.
  //    ⚠️ PCC labels the FACILITY MRN "Client ID" in this header, so on many
  //    facilities this yields an MRN, not a client id (prod, 2026-09-02: across
  //    42,169 active residents, NO patient's MRN equals their own client id).
  //    Kept as a last resort — the backend verifies any id we send and falls back
  //    to the MRN ladder — but every earlier source is preferred for a reason.
  for (const el of doc.querySelectorAll('span[title^="Client ID:"], span[title*="Client ID:"]')) {
    const m = /Client ID:\s*(\d+)/.exec(el.getAttribute('title') || '');
    if (m && _isNumericId(m[1])) return m[1];
  }
  const txtMatch = /Client ID:\s*(\d+)/.exec(doc.body?.innerText || '');
  if (txtMatch && _isNumericId(txtMatch[1])) return txtMatch[1];

  // 7. Last resort: any numeric ESOLclientid anywhere in the page HTML.
  const m = /ESOLclientid=(\d+)/.exec(doc.body?.innerHTML || '');
  if (m && _isNumericId(m[1])) return m[1];

  return null;
}

// Resolve the stable client id for the current page.
//   - URL id is numeric  → use it (fast path, un-migrated facilities).
//   - URL id is an EID_   → recover the numeric id from the DOM; fall back to the
//                           raw token only if no numeric id is on the page.
//   - URL has no id       → return null (we are not on a patient page; do NOT
//                           guess from the DOM, or a resident-list page would
//                           wrongly latch onto some random resident).
export function resolveStableClientId(href) {
  let fromUrl = null;
  try {
    fromUrl = new URL(href || window.location.href).searchParams.get('ESOLclientid');
  } catch (_) { /* malformed href */ }

  if (!fromUrl) return null;
  if (_isNumericId(fromUrl)) return fromUrl;

  // URL carries an ephemeral EID_ token — recover the stable numeric id.
  return scrapeNumericClientIdFromDOM() || fromUrl;
}

// PCC also migrated ESOLassessid (the MDS assessment id) to ephemeral EID_
// tokens in URLs/links. Unlike the client id, the numeric assessment id survives
// on flipped section pages in the per-item `toggleToolsWindow(this, '<digits>',
// …)` onclick handlers (≈29 copies of the same id on a Section page). Scrape a
// NUMERIC assessment id from those. Returns null if none is found; never returns
// an EID_ token (every source is matched against digits).
const _TOGGLE_TOOLS_ASSESS = /toggleToolsWindow\(\s*this\s*,\s*'(\d+)'/;

export function scrapeNumericAssessmentIdFromDOM(doc = document) {
  // 1. Per-item onclick handlers — the canonical source on a section page.
  for (const el of doc.querySelectorAll('[onclick*="toggleToolsWindow"]')) {
    const m = _TOGGLE_TOOLS_ASSESS.exec(el.getAttribute('onclick') || '');
    if (m && _isNumericId(m[1])) return m[1];
  }

  // 2. Inline scripts — some page variants build the handler in a <script>.
  for (const s of doc.querySelectorAll('script:not([src])')) {
    const m = _TOGGLE_TOOLS_ASSESS.exec(s.textContent || '');
    if (m && _isNumericId(m[1])) return m[1];
  }

  // 3. Last resort: anywhere in the page HTML.
  const m = _TOGGLE_TOOLS_ASSESS.exec(doc.body?.innerHTML || '');
  if (m && _isNumericId(m[1])) return m[1];

  return null;
}

// Resolve the stable NUMERIC assessment id for the current MDS page.
//   - URL ESOLassessid is numeric → use it (fast path, un-migrated facilities).
//   - URL is an EID_ (or absent)   → recover the numeric id from the DOM.
//   - nothing numeric on the page  → null. Callers then rely on the context
//                                    params (pccPublicId + ardDate + type) and
//                                    surface `resolvedVia` from the response.
// NEVER returns an EID_ token: sending one as externalAssessmentId trips the
// backend's non-numeric shell guard (#966) and grows phantom assessment rows.
export function resolveStableAssessmentId(href) {
  let fromUrl = null;
  try {
    fromUrl = new URL(href || window.location.href).searchParams.get('ESOLassessid');
  } catch (_) { /* malformed href */ }

  if (_isNumericId(fromUrl)) return fromUrl;

  return scrapeNumericAssessmentIdFromDOM();
}

// Combined patient-ref for backend calls. Returns whichever stable anchors are
// on the page — BOTH when both scrape (the backend prefers numeric and ignores
// the rest, so sending both is free redundancy + makes the 404 `received:{…}`
// echo readable). The MRN rides in the page title on nearly every PCC page, so
// pccPublicId is the durable floor when the numeric client id is EID-dead.
//   { externalPatientId, pccPublicId } | { pccPublicId } | { externalPatientId } | {}
// GUARD: only a NUMERIC client id lands in externalPatientId — never the raw
// EID_ last-resort resolveStableClientId() can return (the backend would ignore
// it, but clean requests keep the diagnostics echo legible).
export function resolveStablePatientRef(href) {
  const ref = {};
  const numeric = resolveStableClientId(href);
  if (_isNumericId(numeric)) {
    ref.externalPatientId = numeric;
  } else {
    // resolveStableClientId() returns null when the URL carries NO ESOLclientid
    // at all — deliberately, so a resident-LIST page can't latch onto a random
    // resident from the DOM. The resident-header photo is safe to read even
    // then: it only exists inside a resident header, so there is no wrong
    // resident to latch onto. This is the whole ballgame on PCC's newer chart
    // pages, which carry no client id in the URL.
    const fromPhoto = scrapeClientIdFromResidentPhoto();
    if (_isNumericId(fromPhoto)) ref.externalPatientId = fromPhoto;
  }
  const pccPublicId = scrapePccPublicIdFromDOM();
  if (pccPublicId) ref.pccPublicId = pccPublicId;
  return ref;
}

// Scrape the MRN / pccPublicId — the parenthetical id PCC prints in the resident
// header and the page <title>, e.g. "Doe, Jane (AC72452125)". Present on
// virtually every PCC page (nurses need it), so it survives the EID migration.
// Real ids are 4+ alphanumerics AND always contain a digit (AC72452125,
// 000953026, 6306); the digit requirement rejects all-caps decorations an MDS
// title can carry, e.g. "(OBRA)".
const _PCC_PUBLIC_ID = /\(([A-Z0-9]{4,})\)/g;

function _firstPublicIdIn(text) {
  if (!text) return null;
  _PCC_PUBLIC_ID.lastIndex = 0;
  let m;
  while ((m = _PCC_PUBLIC_ID.exec(text)) !== null) {
    if (/\d/.test(m[1])) return m[1];
  }
  return null;
}

export function scrapePccPublicIdFromDOM(doc = document) {
  // <title> is the most stable source and is set on section pages too.
  const fromTitle = _firstPublicIdIn(doc.title || '');
  if (fromTitle) return fromTitle;

  // Resident header — PCC labels the parenthetical id in a name/header element.
  const header = doc.querySelector(
    '.residentName, .resident-name, #residentName, .patientBanner, .patient-header-name'
  );
  const fromHeader = _firstPublicIdIn(header?.textContent || '');
  if (fromHeader) return fromHeader;

  return null;
}

// Expose on window for the global-style content scripts that don't use imports.
if (typeof window !== 'undefined') {
  window.resolveStableClientId = resolveStableClientId;
  window.scrapeNumericClientIdFromDOM = scrapeNumericClientIdFromDOM;
  window.scrapeClientIdFromResidentPhoto = scrapeClientIdFromResidentPhoto;
  window.resolveStableAssessmentId = resolveStableAssessmentId;
  window.scrapeNumericAssessmentIdFromDOM = scrapeNumericAssessmentIdFromDOM;
  window.resolveStablePatientRef = resolveStablePatientRef;
  window.scrapePccPublicIdFromDOM = scrapePccPublicIdFromDOM;
}
