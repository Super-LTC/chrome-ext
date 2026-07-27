/**
 * PCC identity capture — pure helpers.
 *
 * `mds_assessments.created_by` names the MDS coordinator who opened an
 * assessment, but as a PCC login username (`kmcdonald5`). It joins to Super
 * `users` at 0% — not fuzzily, at all: 838 of 838 misses had no candidate at
 * any threshold, because those people have no Super account. Guessing is dead;
 * observing is not. The extension is the only place both identities are
 * visible at once, so it reads the PCC login name and reports it.
 *
 * Side-effecting boot/fetch/POST logic lives in index.js; everything here is
 * pure so the parse rules can be pinned in tests.
 */

// Backend caps the column at 64. Measured prod range is 3–20, but the field's
// maxlength is per-org config (this org shows 10 while `jkennedyBRNC` is 12),
// so don't infer a tighter bound from any one page.
const MAX_USERNAME_LENGTH = 64;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pull ESOLuserid out of the `editUserProfile(...)` href PCC puts in the user
 * menu on every page. This is the account-switch key: reading it is free,
 * whereas noticing a changed *username* would cost the profile fetch that the
 * cache exists to avoid.
 */
export function parseEsolUserIdFromHref(href) {
  const m = String(href ?? '').match(/ESOLuserid=(\d+)/);
  return m ? m[1] : null;
}

/**
 * Find the logged-in PCC user's id on the current page.
 *
 * Primary source is the "Edit Profile" link in the user dropdown, which every
 * chrome-bearing PCC page renders. The inline `userId:` global is the fallback
 * — note PCC also emits a blank `userId: ''.trim()` form on some pages, so the
 * pattern requires digits rather than trusting the key's presence.
 *
 * Returns null inside chrome-less iframes, where capture should no-op.
 */
export function getEsolUserId(doc = document) {
  const link = doc.querySelector('a[href*="editmyprofile.jsp"]');
  const fromLink = parseEsolUserIdFromHref(link?.getAttribute('href'));
  if (fromLink) return fromLink;

  for (const script of doc.querySelectorAll('script')) {
    const m = script.textContent?.match(/\buserId:\s*'?(\d+)'?/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Read the login name out of a /home/editmyprofile.jsp response.
 *
 * The markup is:
 *   Login Name: eac.<input name="login_name" readonly value="jcameron">
 *
 * That `eac.` is the PCC org code rendered as a bare text node beside the
 * input — UI chrome, not part of the username. Reading the input's value
 * attribute sidesteps it structurally rather than by stripping a prefix.
 *
 * Whatever is inside the value is returned verbatim. Dots there are real
 * (`jennifer.russell1`, `Shawnia.Bennett.rn` — name separators and credential
 * suffixes, present in 22 of 895 prod usernames with no org sharing a leading
 * token). Normalizing them away would collide distinct people.
 */
export function parseLoginName(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const input = doc.querySelector('input[name="login_name"]');
  const value = input?.getAttribute('value')?.trim();
  return value || null;
}

/**
 * Guard the POST. Capture is fire-and-forget, so a mis-parse would bind
 * garbage silently and we'd never hear about it. The likeliest mis-parse is
 * the adjacent display-name field ("Jonathan Cameron"), which the
 * no-whitespace rule catches.
 */
export function isValidPccUsername(value) {
  if (typeof value !== 'string') return false;
  return new RegExp(`^[A-Za-z0-9._-]{2,${MAX_USERNAME_LENGTH}}$`).test(value);
}

/**
 * Decide whether to spend a profile fetch, given the cached binding and what
 * the current page says. Every identity that can change out from under a
 * cached binding is part of the key:
 *
 *   esolUserId  — a different PCC account logged in on this browser
 *   superUserId — chrome.storage.local is per browser *profile*, not per Super
 *                 user, so without this A binds, logs out, B logs in on the
 *                 same machine and is never bound at all
 *   orgSlug     — the binding row is per user+org
 *
 * The TTL then re-posts weekly so `lastSeenAt` stays a real liveness signal
 * and staff renames get picked up.
 */
export function shouldCapture(cached, current, nowMs) {
  // Chrome-less PCC iframes have no user menu. Better to no-op than to bind
  // against a key we couldn't compare on the next boot.
  if (!current?.esolUserId) return false;
  if (!cached?.postedAt) return true;
  if (cached.superUserId !== current.superUserId) return true;
  if (cached.esolUserId !== current.esolUserId) return true;
  if (cached.orgSlug !== current.orgSlug) return true;
  return nowMs - cached.postedAt > CACHE_TTL_MS;
}
