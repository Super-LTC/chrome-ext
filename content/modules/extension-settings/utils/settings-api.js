/**
 * Thin client for the extension Settings panel — weekly-report config + profile.
 * Routes through the background API_REQUEST bridge (bearer auth + 401 retry live
 * there). Mirrors content/modules/ftag-prevention/utils/api.js.
 *
 * The background worker wraps each response as { success, data: <server-resp> }.
 * Our endpoints return their own { success, ...fields } envelope, which has no
 * nested `data` key, so unwrap() returns it as-is and callers read fields directly.
 */

function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return payload.data;
  }
  return payload;
}

async function request(endpoint, method, body) {
  const res = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: {
      method,
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
    },
  });
  if (!res?.success) throw new Error(res?.error || 'Request failed');
  return unwrap(res.data);
}

/** GET the current user's weekly-report config for the given building context. */
export function getWeeklyReport(facilityName, orgSlug) {
  const qs = new URLSearchParams({ facilityName, orgSlug }).toString();
  return request(`/api/extension/weekly-report?${qs}`, 'GET');
}

/** POST a partial weekly-report patch. body must carry { facilityName, orgSlug, ... }. */
export function saveWeeklyReport(body) {
  return request('/api/extension/weekly-report', 'POST', body);
}

/** GET the signed-in user's profile (name, position, email). */
export function getProfile() {
  return request('/api/extension/me', 'GET');
}

/** PUT profile changes: { name?, position? }. */
export function saveProfile(body) {
  return request('/api/extension/me', 'PUT', body);
}
