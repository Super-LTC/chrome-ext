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

/** POST an invitation: { orgSlug, email, role, snfRole?, modules?, locationIds, tempPassword? }. */
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

/** GET a person's current access: { orgRole, snfRole, modules }. Prefills the Features editor. */
export function getTeamMemberPermissions(userId, orgSlug) {
  return request(
    `/api/extension/team/members/${userId}/permissions?orgSlug=${encodeURIComponent(orgSlug)}`,
    'GET',
  );
}

/** PUT a person's job title + features: { orgSlug, snfRole?, modules? }. */
export function updateTeamMemberPermissions(userId, body) {
  return request(`/api/extension/team/members/${userId}/permissions`, 'PUT', body);
}

/** PUT a person's admin scope: { orgSlug, orgRole }. */
export function updateTeamMemberRole(userId, body) {
  return request(`/api/extension/team/members/${userId}/role`, 'PUT', body);
}

/** PUT a person's manual building assignments: { orgSlug, locationIds }. */
export function updateTeamMemberLocations(userId, body) {
  return request(`/api/extension/team/members/${userId}/locations`, 'PUT', body);
}

/** POST a new temporary password onto a pending invite: { orgSlug, password }. */
export function resetInvitationPassword(invitationId, body) {
  return request(`/api/extension/team/invitations/${invitationId}/reset-password`, 'POST', body);
}

/** DELETE (cancel) a pending invitation. */
export function deleteInvitation(orgSlug, invitationId) {
  return request(
    `/api/extension/team/invitations/${invitationId}?orgSlug=${encodeURIComponent(orgSlug)}`,
    'DELETE',
  );
}

/** Add (or link) a doctor to a building: { orgSlug, firstName, lastName, phoneNumber, title?, email?, locationId }. */
export function addTeamDoctor(body) {
  return request('/api/extension/team/practitioners', 'POST', body);
}

/** Send a doctor's setup link (forward flow): { orgSlug, practitionerId, locationId }. */
export function sendTeamDoctorLink(body) {
  return request('/api/extension/team/practitioners/send', 'POST', body);
}

/* ------------------------------------------------------------------ */
/* Regions — /api/extension/team/regions/* (org admin only)            */
/* ------------------------------------------------------------------ */

/** GET the org's regions with building + member counts. Returns { success, regions }. */
export function getTeamRegions(orgSlug) {
  return request(`/api/extension/team/regions?orgSlug=${encodeURIComponent(orgSlug)}`, 'GET');
}

/** GET one region's detail (buildings + members). Returns { success, detail }. */
export function getTeamRegion(orgSlug, regionId) {
  return request(
    `/api/extension/team/regions/${regionId}?orgSlug=${encodeURIComponent(orgSlug)}`,
    'GET',
  );
}

/** POST a new region: { orgSlug, name }. Returns { success, region }. */
export function createTeamRegion(body) {
  return request('/api/extension/team/regions', 'POST', body);
}

/** PATCH a region name: { orgSlug, name }. */
export function renameTeamRegion(regionId, body) {
  return request(`/api/extension/team/regions/${regionId}`, 'PATCH', body);
}

/** DELETE a region (strips region-derived access first). */
export function deleteTeamRegion(orgSlug, regionId) {
  return request(
    `/api/extension/team/regions/${regionId}?orgSlug=${encodeURIComponent(orgSlug)}`,
    'DELETE',
  );
}

/** POST buildings onto a region: { orgSlug, locationIds }. */
export function addRegionBuildings(regionId, body) {
  return request(`/api/extension/team/regions/${regionId}/buildings`, 'POST', body);
}

/** DELETE buildings from a region: { orgSlug, locationIds }. */
export function removeRegionBuildings(regionId, body) {
  return request(`/api/extension/team/regions/${regionId}/buildings`, 'DELETE', body);
}

/** POST a member onto a region: { orgSlug, userId } | { orgSlug, invitationId }. */
export function addRegionMember(regionId, body) {
  return request(`/api/extension/team/regions/${regionId}/members`, 'POST', body);
}

/** DELETE a member from a region: { orgSlug, userId } | { orgSlug, invitationId }. */
export function removeRegionMember(regionId, body) {
  return request(`/api/extension/team/regions/${regionId}/members`, 'DELETE', body);
}
