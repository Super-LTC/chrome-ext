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

/** GET the current user's weekly-report config (user-global — covers all their buildings). */
export function getWeeklyReport() {
  return request('/api/extension/weekly-report', 'GET');
}

/** POST a partial weekly-report patch: { enabled?, cards?, deliveryMode?, dayOfWeek?, hour? }. */
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

/* ------------------------------------------------------------------ */
/* Team tab — /api/extension/team/*                                    */
/* ------------------------------------------------------------------ */

/** GET the org roster, scoped to the caller's admin scope. Returns { success, team, scope }. */
export function getTeamMembers(orgSlug) {
  return request(`/api/extension/team/members?orgSlug=${encodeURIComponent(orgSlug)}`, 'GET');
}

/** GET what the caller may hand out: scopes / buildings / features + bundle & role catalog. */
export function getTeamGrantable(orgSlug) {
  return request(`/api/extension/team/grantable?orgSlug=${encodeURIComponent(orgSlug)}`, 'GET');
}

/** POST an invitation: { orgSlug, email, role, snfRole?, modules?, locationIds }. */
export function inviteTeamMember(body) {
  return request('/api/extension/team/invite', 'POST', body);
}

/** DELETE a person from the org. */
export function removeTeamMember(orgSlug, userId) {
  return request(
    `/api/extension/team/members/${userId}?orgSlug=${encodeURIComponent(orgSlug)}`,
    'DELETE',
  );
}

/** PUT a person's job title + features: { orgSlug, snfRole?, modules? }. */
export function updateTeamMemberPermissions(userId, body) {
  return request(`/api/extension/team/members/${userId}/permissions`, 'PUT', body);
}
