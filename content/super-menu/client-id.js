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

  // 5. Resident-header "Client ID: NNN" span — PCC shows the numeric id here
  //    (in a title attr / text, NOT in ESOLclientid= form) on chart pages whose
  //    URL only carries an EID_ token and whose body has no ESOLclientid= link.
  for (const el of doc.querySelectorAll('span[title^="Client ID:"], span[title*="Client ID:"]')) {
    const m = /Client ID:\s*(\d+)/.exec(el.getAttribute('title') || '');
    if (m && _isNumericId(m[1])) return m[1];
  }
  const txtMatch = /Client ID:\s*(\d+)/.exec(doc.body?.innerText || '');
  if (txtMatch && _isNumericId(txtMatch[1])) return txtMatch[1];

  // 6. Last resort: any numeric ESOLclientid anywhere in the page HTML.
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

// Expose on window for the global-style content scripts that don't use imports.
if (typeof window !== 'undefined') {
  window.resolveStableClientId = resolveStableClientId;
  window.scrapeNumericClientIdFromDOM = scrapeNumericClientIdFromDOM;
}
