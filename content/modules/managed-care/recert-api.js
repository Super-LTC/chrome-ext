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

function qs(params) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  return new URLSearchParams(clean).toString();
}

const RecertAPI = {
  // { orgSlug, mine, facilityName, patientId, status, limit, offset }
  // facilityName omitted → all locations the user can access ("All locations" mode).
  async list(params) {
    const res = await apiRequest(`/api/extension/recertifications?${qs(params)}`, { method: 'GET' });
    if (!res?.success) return null;
    return res.data?.recertifications || [];
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

  async create(body) {
    const res = await apiRequest('/api/extension/recertifications', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res?.success) throw apiError(res, 'Failed to create clinical update');
    return res.data?.recertification;
  },

  async generate(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/generate`, { method: 'POST' });
    if (!res?.success) throw apiError(res, 'Failed to start generation');
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
export { RecertAPI };
