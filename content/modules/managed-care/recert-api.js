// content/modules/managed-care/recert-api.js
// Recertification ("clinical update") API client. All calls ride the background
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

  // Full record — also used to read a failed run's stored config for retry.
  async get(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}`, { method: 'GET' });
    if (!res?.success) return null;
    return res.data?.recertification || null;
  },

  // patientId = PCC external client id; drives managedCareStay prefill.
  async formData({ orgSlug, patientId }) {
    const res = await apiRequest(`/api/extension/recertifications/form-data?${qs({ orgSlug, patientId })}`, { method: 'GET' });
    if (!res?.success) throw new Error(res?.error || 'Failed to load form data');
    return res.data?.formData;
  },

  async create(body) {
    const res = await apiRequest('/api/extension/recertifications', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res?.success) throw new Error(res?.error || 'Failed to create clinical update');
    return res.data?.recertification;
  },

  async generate(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/generate`, { method: 'POST' });
    if (!res?.success) throw new Error(res?.error || 'Failed to start generation');
    return true;
  },

  // Only valid on completed runs. Mint on click — never pre-mint (30-min single-user token).
  async mintViewLink(id) {
    const res = await apiRequest(`/api/extension/recertifications/${id}/view-link`, { method: 'POST' });
    if (!res?.success) throw new Error(res?.error || 'Failed to create view link');
    return res.data?.url;
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

  async savePreset({ orgSlug, name, ...config }) {
    const res = await apiRequest('/api/extension/recertifications/presets', {
      method: 'POST',
      body: JSON.stringify({ orgSlug, name, ...config }),
    });
    if (!res?.success) throw new Error(res?.error || 'Failed to save preset');
    return res.data?.preset;
  },

  async deletePreset(presetId) {
    const res = await apiRequest(`/api/extension/recertifications/presets/${presetId}`, { method: 'DELETE' });
    if (!res?.success) throw new Error(res?.error || 'Failed to delete preset');
    return true;
  },
};

// Guarded: run-tracker tests pull this module in under node where window doesn't exist.
if (typeof window !== 'undefined') window.RecertAPI = RecertAPI;
export { RecertAPI };
