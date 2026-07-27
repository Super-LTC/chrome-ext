/**
 * PCC identity capture — boot wiring.
 *
 * Once per user per org per week: read the logged-in PCC login name off the
 * profile page and report it, so `mds_assessments.created_by` can be resolved
 * to a Super user instead of attributed to a building.
 *
 * Entirely invisible. Nothing user-facing depends on the result, so every
 * failure path is silent — but a failure must also leave the cache untouched,
 * or it would suppress its own retry for a week.
 */
import { getEsolUserId, parseLoginName, isValidPccUsername, shouldCapture } from './capture.js';

const STORAGE_KEY = 'superPccIdentity';
const PROFILE_PATH = '/home/editmyprofile.jsp';
const ENDPOINT = '/api/extension/identity/pcc-username';

/**
 * Decide, fetch, validate, report, cache. Dependencies are injected so the
 * control flow is testable without a browser or a PCC session.
 */
export async function captureIdentity({
  esolUserId,
  superUserId,
  orgSlug,
  now,
  loadCache,
  saveCache,
  fetchProfile,
  postUsername,
}) {
  const cached = await loadCache();
  if (!shouldCapture(cached, { superUserId, esolUserId, orgSlug }, now)) {
    return { posted: false, reason: 'cached' };
  }

  let html;
  try {
    html = await fetchProfile(esolUserId);
  } catch {
    // Expired PCC session, or a profile page we can't reach. Try again next boot.
    return { posted: false, reason: 'fetch-failed' };
  }

  const pccUsername = parseLoginName(html);
  if (!isValidPccUsername(pccUsername)) {
    // Either PCC redesigned the page or we drifted onto the wrong field.
    // Binding a wrong nurse is strictly worse than binding none.
    return { posted: false, reason: 'no-valid-username' };
  }

  try {
    // orgSlug is optional per the contract — the backend falls back to the
    // user's selected org, so a missing CORE.org_code shouldn't cost a binding.
    await postUsername({ pccUsername, ...(orgSlug ? { orgSlug } : {}) });
  } catch {
    return { posted: false, reason: 'post-failed' };
  }

  await saveCache({ superUserId, esolUserId, orgSlug, pccUsername, postedAt: now });
  return { posted: true, pccUsername };
}

// Same-origin GET; PCC session cookies ride along because the content script
// runs on the PCC origin. Mirrors the _fetchText pattern used elsewhere.
async function fetchProfileHtml(esolUserId) {
  const url = `${PROFILE_PATH}?ESOLuserid=${encodeURIComponent(esolUserId)}&retURL=/home/home.jsp`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`PCC GET ${url} failed: ${res.status}`);
  const html = await res.text();
  if (html.includes('<title>Login</title>') || html.includes('loginForm')) {
    throw new Error('PCC session expired');
  }
  return html;
}

async function postUsernameToBackend(body) {
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: ENDPOINT,
    options: { method: 'POST', body: JSON.stringify(body) },
  });
  if (!response?.success) throw new Error(response?.error || 'pcc-username POST failed');
  return response.data;
}

// One run per page, shared across concurrent callers, so a burst of PCC
// navigations can't stampede the profile fetch.
let _inFlight = null;

export function initPccIdentityCapture() {
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const esolUserId = getEsolUserId(document);
      if (!esolUserId) return { posted: false, reason: 'no-user-chrome' };

      const { user } = await chrome.storage.local.get('user');
      // Not signed in to Super yet — there's no one to bind the username to.
      if (!user?.id) return { posted: false, reason: 'not-authenticated' };

      return await captureIdentity({
        esolUserId,
        superUserId: user.id,
        orgSlug: window.getCurrentParams?.()?.orgSlug || '',
        now: Date.now(),
        loadCache: async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || null,
        saveCache: (record) => chrome.storage.local.set({ [STORAGE_KEY]: record }),
        fetchProfile: fetchProfileHtml,
        postUsername: postUsernameToBackend,
      });
    } catch {
      // Never let invisible plumbing surface an error to the user.
      return { posted: false, reason: 'error' };
    }
  })();

  return _inFlight;
}
