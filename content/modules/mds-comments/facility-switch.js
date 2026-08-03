/**
 * Move PCC to another building, using PCC's own facility chooser.
 *
 * ── Why we drive their UI instead of calling their API ─────────────────────
 * Three things rule out the obvious approaches:
 *
 * 1. We are in the ISOLATED world, so `switchToFacilityView(3)` — a page global
 *    — is not reachable from here. It has to be the page that calls it.
 * 2. The facility list is NOT in the page. `#pccFacMenu` ships empty and PCC
 *    lazily `$.load()`s `/tools/faclist.jsp` into it the first time the header
 *    link is clicked. Any code that scans the DOM for facility anchors on page
 *    load finds nothing, every time.
 * 3. We cannot fetch that HTML and inject it ourselves either: `innerHTML` does
 *    not execute scripts, and `switchToFacilityView` is defined *by the
 *    response*. jQuery's `.load()` runs them; we would end up with anchors that
 *    call a function nobody defined.
 *
 * So we do exactly what a person does: click the header link, wait for PCC to
 * populate its own menu, and click the facility. Their code runs their switch
 * in their world with their session. We never construct the request.
 *
 * ── Why we read the id off their anchor, not out of our database ───────────
 * `pcc_system_id` is unique per PCC *tenant*, not per organization — two
 * customers can both legitimately have facility 3. Matching on the name inside
 * the menu PCC just rendered for *this* session sidesteps that entirely: the
 * id we click is by construction the one this login means. Our stored id is
 * used only as a tiebreaker and as a sanity check, which is the right job for a
 * column that is ~97% populated.
 *
 * Switching is never silent. It always follows an explicit click on "Open in
 * PCC", and it always ends with a verification that we landed where we meant to
 * — see `tag-restore.js`.
 */

const FAC_LINK = '#pccFacLink';
const FAC_MENU = '#pccFacMenu';
const MENU_TIMEOUT_MS = 8000;
const MENU_POLL_MS = 120;

/** The building PCC currently has us in, as its own header reports it. */
export function currentFacilityName() {
  const el = document.querySelector(FAC_LINK);
  if (!el) return null;
  return el.title || el.textContent?.trim() || null;
}

/**
 * PCC renders menu entries as "Autumnwood Care Center - 3". The trailing id is
 * theirs, not part of the name, so it comes off before comparing.
 */
function normalizeFacilityLabel(text) {
  return String(text || '')
    .replace(/\s*-\s*\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The `n` in `href="javascript:switchToFacilityView(n)"`. */
function facilityIdFromHref(href) {
  const m = String(href || '').match(/switchToFacilityView\(\s*'?(\d+)'?\s*\)/);
  return m ? m[1] : null;
}

export function isAlreadyAtFacility(targetName) {
  const current = currentFacilityName();
  if (!current || !targetName) return false;
  return normalizeFacilityLabel(current) === normalizeFacilityLabel(targetName);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get PCC to render its facility list, then hand back the anchors.
 *
 * Opening the menu is a side effect we own, so the caller must close it again
 * if it decides not to switch — leaving a dropdown hanging open over PCC's
 * chrome is the kind of thing that makes an extension feel broken.
 */
async function loadFacilityAnchors() {
  const link = document.querySelector(FAC_LINK);
  const menu = document.querySelector(FAC_MENU);
  if (!link || !menu) return { ok: false, reason: 'no_facility_chooser' };

  const anchorsNow = () =>
    [...menu.querySelectorAll('a')].filter((a) => facilityIdFromHref(a.getAttribute('href')));

  if (anchorsNow().length === 0) {
    // A real click: PCC's handler is bound in the page's world, and a
    // dispatched DOM event reaches it even though our listener could not.
    link.click();
  }

  const deadline = Date.now() + MENU_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const anchors = anchorsNow();
    if (anchors.length > 0) return { ok: true, anchors, menu, link };
    await sleep(MENU_POLL_MS);
  }
  return { ok: false, reason: 'facility_list_timeout', menu, link };
}

/** Put PCC's own chrome back the way we found it. */
function closeMenu(menu, link) {
  try {
    if (menu && getComputedStyle(menu).display !== 'none') link?.click();
  } catch (_) {
    /* cosmetic only */
  }
}

/**
 * Switch to `pccFacilityName`, preferring a name match and falling back to our
 * stored `pccSystemId`.
 *
 * Resolves `{ ok: true, switching: true }` once the click has been dispatched —
 * PCC then navigates, so nothing after that point in this page's life is
 * guaranteed to run. Whoever calls this must have already persisted whatever it
 * needs on the other side.
 */
export async function switchToFacility({ pccFacilityName, pccSystemId }) {
  if (!pccFacilityName && !pccSystemId) {
    return { ok: false, reason: 'no_target' };
  }
  if (pccFacilityName && isAlreadyAtFacility(pccFacilityName)) {
    return { ok: true, switching: false };
  }

  const loaded = await loadFacilityAnchors();
  if (!loaded.ok) {
    closeMenu(loaded.menu, loaded.link);
    return { ok: false, reason: loaded.reason };
  }

  const wanted = normalizeFacilityLabel(pccFacilityName);
  let anchor =
    loaded.anchors.find((a) => normalizeFacilityLabel(a.textContent) === wanted) || null;

  // Only fall back to the stored id when the name matched nothing. Preferring
  // the name is what keeps us safe from the cross-tenant id collision.
  if (!anchor && pccSystemId) {
    anchor =
      loaded.anchors.find(
        (a) => facilityIdFromHref(a.getAttribute('href')) === String(pccSystemId)
      ) || null;
  }

  if (!anchor) {
    closeMenu(loaded.menu, loaded.link);
    return { ok: false, reason: 'facility_not_in_chooser' };
  }

  anchor.click();
  return { ok: true, switching: true, facilityId: facilityIdFromHref(anchor.getAttribute('href')) };
}

export const _test = {
  normalizeFacilityLabel,
  facilityIdFromHref,
};
