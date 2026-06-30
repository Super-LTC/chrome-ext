// content/modules/managed-care/recert-api.js
// Recertification ("clinical update") API client. The extension is a LAUNCHER:
// it lists runs and mints one-time login links into the real dashboard pages —
// it does not create/edit recerts itself. All calls ride the background
// API_REQUEST channel — bearer token + base URL live in background.js.
// Contracts: .context/chrome-ext-recert-handoff.md

async function apiRequest(endpoint, options = {}) {
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options,
  });
  return response;
}

// Background failure envelope is { success: false, error, status, body } —
// keep status + the backend's `required` field list on the thrown error so
// the wizard can render field-level hints and a clear 403 state.
function apiError(res, fallback) {
  const err = new Error(res?.error || fallback);
  err.status = res?.status;
  err.required = res?.body?.required;
  return err;
}

// Keys are sorted so two callers building the same logical query in a
// different field order (e.g. RunList's full param object vs run-tracker's
// {orgSlug, mine, limit}) collapse to the SAME cache/in-flight key.
function qs(params) {
  const clean = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(clean).toString();
}

// ---- list() request coalescing + micro-cache ----
// The list endpoint is polled by RunList (every 3–15s) AND run-tracker, and
// re-fired on mount / tab-focus / toggle / tracker transitions. With no
// coalescing the same URL piles up concurrently — each copy waits behind the
// others on Lambda/DB, turning a ~60ms query into 10–20s. Two guards:
//   1. In-flight dedup — concurrent identical queries share ONE round-trip.
//   2. Short TTL cache — incidental refetches (mount, focus, toggle-back)
//      within the window reuse the last result. Polling and explicit refresh
//      pass { force:true } to bypass the cache (but still ride dedup), so
//      freshness is never sacrificed for liveness-driven fetches.
const LIST_CACHE_TTL_MS = 5000;
const _listCache = new Map();     // key → { at, data }
const _listInflight = new Map();  // key → Promise<data|null>

// Mutations (create/generate/archive) make any cached list stale — drop it so
// the next read re-fetches. Also exported for logout/teardown.
function clearRecertListCache() {
  _listCache.clear();
}

const RecertAPI = {
  // { orgSlug, mine, facilityName, patientId, status, limit, offset }
  // facilityName omitted → all locations the user can access ("All locations" mode).
  // opts.force bypasses the TTL cache (still coalesces with any in-flight twin).
  async list(params, { force = false } = {}) {
    const key = qs(params);
    // Coalesce: while one request for this exact query is outstanding, every
    // other caller (forced or not) reuses its promise instead of piling on.
    const inflight = _listInflight.get(key);
    if (inflight) return inflight;
    if (!force) {
      const cached = _listCache.get(key);
      if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) return cached.data;
    }
    const promise = (async () => {
      const res = await apiRequest(`/api/extension/recertifications?${key}`, { method: 'GET' });
      if (!res?.success) return null;
      return res.data?.recertifications || [];
    })();
    _listInflight.set(key, promise);
    try {
      const data = await promise;
      // Never cache a failure (null) — let the next read retry immediately.
      if (data !== null) _listCache.set(key, { at: Date.now(), data });
      return data;
    } finally {
      _listInflight.delete(key);
    }
  },

  // One-time 5-min login link into the REAL editor for this run
  // (/dashboard/recertifications/{id}). Mint on click, never ahead of time.
  async openLink(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/open-link`, { method: 'POST' });
    if (!res?.success) throw apiError(res, 'Could not open this clinical update');
    return res.data?.url;
  },

  // One-time 5-min login link into the REAL create wizard, prefilled for the
  // patient. Server enforces module gate + location access before minting.
  async openCreateLink({ orgSlug, externalPatientId, facilityName }) {
    const res = await apiRequest('/api/extension/recertifications/open-create-link', {
      method: 'POST',
      body: JSON.stringify({ orgSlug, externalPatientId, facilityName }),
    });
    if (!res?.success) throw apiError(res, 'Could not start a clinical update');
    return res.data?.url;
  },

  // ---- In-extension create wizard (the dashboard handoff is for OPENING
  // runs after the fact; creation lives here in the extension) ----

  // patientId = PCC external client id; drives the prefill block.
  async formData({ orgSlug, patientId }) {
    const res = await apiRequest(`/api/extension/recertifications/form-data?${qs({ orgSlug, patientId })}`, { method: 'GET' });
    if (!res?.success) throw apiError(res, 'Failed to load form data');
    return res.data?.formData;
  },

  // Distinct synced assessment (UDA) forms for the facility + the org default
  // include keywords. Drives the per-recert "Assessment filter" picker.
  // Returns { total, orgDefaultKeywords: string[], forms: [{description, count}] }.
  // Empty/unresolvable facility resolves to { total:0, forms:[] } (not an error).
  async udaPreview({ orgSlug, facilityName, locationId }) {
    const res = await apiRequest(
      `/api/extension/recertifications/uda-preview?${qs({ orgSlug, facilityName, locationId })}`,
      { method: 'GET' }
    );
    if (!res?.success) throw apiError(res, 'Failed to load assessments');
    return res.data;
  },

  async create(body) {
    const res = await apiRequest('/api/extension/recertifications', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res?.success) throw apiError(res, 'Failed to create clinical update');
    clearRecertListCache();
    return res.data?.recertification;
  },

  async generate(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/generate`, { method: 'POST' });
    if (!res?.success) throw apiError(res, 'Failed to start generation');
    clearRecertListCache();
    return true;
  },

  async savePreset({ orgSlug, name, ...config }) {
    const res = await apiRequest('/api/extension/recertifications/presets', {
      method: 'POST',
      body: JSON.stringify({ orgSlug, name, ...config }),
    });
    if (!res?.success) throw new Error(res?.error || 'Failed to save preset');
    return res.data?.preset;
  },

  async archive(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/archive`, { method: 'POST' });
    if (!res?.success) throw new Error(res?.error || 'Failed to archive');
    clearRecertListCache();
    return true;
  },

  // Per-facility gate, same model as ftag-prevention/module-status.
  async moduleStatus({ facilityName, orgSlug }) {
    const res = await apiRequest(`/api/extension/recertifications/module-status?${qs({ facilityName, orgSlug })}`, { method: 'GET' });
    return res?.success === true && res?.data?.enabled === true;
  },
};

// Guarded: run-tracker tests pull this module in under node where window doesn't exist.
if (typeof window !== 'undefined') window.RecertAPI = RecertAPI;
export { RecertAPI, clearRecertListCache };
