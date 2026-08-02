/**
 * Getting from an inbox row to the MDS item it is about, across up to two
 * navigations and possibly a facility switch.
 *
 * ── Why this is not `hydrateTwentyFourHourRestore` ─────────────────────────
 * That one drops its payload the moment the current facility does not match
 * the one it was written at. For the 24-hour report that is right: the handoff
 * only ever happens inside one building, so a mismatch means the user wandered
 * off and the payload is stale.
 *
 * Here a mismatch is the *expected* middle of the journey. The whole point is
 * to start at building A and end at building B, so a payload that deletes
 * itself on mismatch would delete itself every single time it was used. It also
 * drops the payload when the facility has simply not resolved yet — PCC's
 * header chrome is not guaranteed to exist when we run — which turns a race
 * into a silent no-op.
 *
 * So this one is a small state machine instead, and it never throws work away
 * quietly: every terminal failure says something out loud.
 *
 *   switch  → we asked PCC to change buildings; wait until it has
 *   section → we are in the right building; go to the item's section page
 *   (clear) → we are on the page; scroll to the item and open its thread
 */

const KEY = 'super:mds-tag:restore';
const VERSION = 1;
const TTL_MS = 10 * 60 * 1000;
/** PCC's header can lag the page; a switch is not failed until it stays wrong. */
const FACILITY_SETTLE_MS = 6000;
const FACILITY_POLL_MS = 200;

function normalize(text) {
  return String(text || '')
    .replace(/\s*-\s*\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function writeRestore(payload) {
  if (!payload?.assessmentId || !payload?.mdsItem) return false;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ version: VERSION, expiresAt: Date.now() + TTL_MS, ...payload })
    );
    return true;
  } catch (err) {
    console.warn('[MdsTags] could not persist restore payload', err);
    return false;
  }
}

export function readRestore() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || payload.version !== VERSION) return null;
    if (!Number.isFinite(payload.expiresAt) || Date.now() > payload.expiresAt) return null;
    if (!payload.assessmentId || !payload.mdsItem) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

export function clearRestore() {
  try {
    sessionStorage.removeItem(KEY);
  } catch (_) {
    /* nothing we can do, and nothing depends on it */
  }
}

/** `I0200` → `I`, `GG0130B1` → `GG`. PCC's `sectioncode`. */
export function sectionCodeForItem(mdsItem) {
  const m = String(mdsItem || '')
    .toUpperCase()
    .match(/^([A-Z]+)/);
  return m ? m[1] : '';
}

export function sectionUrlFor(payload) {
  const section = payload.sectionCode || sectionCodeForItem(payload.mdsItem);
  let url = `${window.location.origin}/clinical/mds3/section.xhtml?ESOLassessid=${encodeURIComponent(
    payload.externalAssessmentId
  )}`;
  if (section) url += `&sectioncode=${encodeURIComponent(section)}`;
  return url;
}

function currentFacilityName() {
  const el = document.getElementById('pccFacLink');
  if (!el) return null;
  return el.title || el.textContent?.trim() || null;
}

/**
 * Wait for PCC's header to report the building we asked for.
 *
 * Returns the resolved name, or null if it never settled. An unresolved header
 * is NOT treated as a mismatch — it is treated as "not yet", which is the
 * distinction the 24-hour version misses.
 */
async function waitForFacility(targetName) {
  const wanted = normalize(targetName);
  const deadline = Date.now() + FACILITY_SETTLE_MS;
  while (Date.now() < deadline) {
    const current = currentFacilityName();
    if (current && normalize(current) === wanted) return current;
    await new Promise((r) => setTimeout(r, FACILITY_POLL_MS));
  }
  return null;
}

function onTargetSectionPage(payload) {
  const url = new URL(window.location.href);
  if (!url.pathname.includes('/clinical/mds3/section.xhtml')) return false;
  const assess = url.searchParams.get('ESOLassessid');
  // A raw `EID_…` handle will not equal the numeric id we stored. Landing on
  // *a* section page for the right section is good enough to hand over to the
  // overlay, which resolves the assessment properly itself.
  if (assess && assess === String(payload.externalAssessmentId)) return true;
  const section = url.searchParams.get('sectioncode');
  return !!section && section === (payload.sectionCode || sectionCodeForItem(payload.mdsItem));
}

/**
 * Advance the handoff one step. Called once per page load.
 *
 * Returns `{ arrived: payload }` when the caller should now scroll to the item
 * and open its thread; `null` otherwise (including when it navigated away, in
 * which case nothing after this matters).
 */
export async function hydrateTagRestore({ onFailure } = {}) {
  const payload = readRestore();
  if (!payload) return null;

  const fail = (message) => {
    clearRestore();
    onFailure?.(message);
    return null;
  };

  if (payload.stage === 'switch') {
    const landed = await waitForFacility(payload.pccFacilityName);
    if (!landed) {
      // We are somewhere else and it is not going to correct itself. Say so —
      // dropping this quietly is how a user ends up staring at the wrong
      // building wondering why nothing happened.
      return fail(
        `Could not switch to ${payload.facilityName || payload.pccFacilityName}. Open it from the facility menu and try again.`
      );
    }
    writeRestore({ ...payload, stage: 'section' });
    window.location.href = sectionUrlFor(payload);
    return null;
  }

  if (payload.stage === 'section') {
    if (!onTargetSectionPage(payload)) {
      // A single retry: PCC sometimes bounces a deep link through a landing
      // page. Anything past that is a redirect we do not understand.
      if (payload.retried) {
        return fail('Could not open that MDS section in PCC.');
      }
      writeRestore({ ...payload, retried: true });
      window.location.href = sectionUrlFor(payload);
      return null;
    }
    clearRestore();
    return { arrived: payload };
  }

  // Only reachable if a payload was written by a different build mid-session.
  // Nothing the user did wrong, but staying silent would leave them staring at
  // a page that did not move.
  return fail('Could not finish opening that item. Try it again from the Inbox.');
}

export const _test = {
  normalize,
  onTargetSectionPage,
  sectionCodeForItem,
  KEY,
};
