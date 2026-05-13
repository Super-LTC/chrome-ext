// Rounding Reports API client.
//
// All requests route through the background service worker's API_REQUEST
// handler, which attaches the bearer token and base URL. We send
// facilityName + orgSlug on every call (query for GETs, body for POSTs) —
// the server resolves to a locationId and enforces compliance-module access.
//
// Errors:
//   - Background throws `API error: <status>`; we normalize to a typed error.
//   - 403 ⇒ ModuleDisabledError so the UI can render a banner instead of a toast.

export class ModuleDisabledError extends Error {
  constructor(message = 'Compliance module not enabled for this facility') {
    super(message);
    this.name = 'ModuleDisabledError';
    this.status = 403;
  }
}

function parseStatus(message) {
  const m = String(message || '').match(/API error:\s*(\d{3})/);
  return m ? Number(m[1]) : null;
}

function toError(err) {
  const status = parseStatus(err?.message);
  if (status === 403) return new ModuleDisabledError();
  return err instanceof Error ? err : new Error(String(err));
}

async function send(endpoint, options) {
  const result = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options,
  });
  if (!result?.success) {
    throw toError(new Error(result?.error || 'Request failed'));
  }
  // Server envelope: { success: true, ... } — pass the whole payload through.
  return result.data;
}

const BASE = '/api/extension/compliance/rounding-reports';

export const RoundingAPI = {
  /** List recent sessions for the facility, newest first. */
  async list({ facilityName, orgSlug }) {
    const qs = new URLSearchParams({ facilityName, orgSlug });
    return send(`${BASE}?${qs}`, { method: 'GET' });
  },

  /** Start a new rounding session. Returns { sessionId, locationId }. */
  async start({ facilityName, orgSlug }) {
    return send(BASE, {
      method: 'POST',
      body: JSON.stringify({ facilityName, orgSlug }),
    });
  },

  /** Full session detail — checks grouped by patient. */
  async detail({ sessionId, facilityName, orgSlug }) {
    const qs = new URLSearchParams({ facilityName, orgSlug });
    return send(`${BASE}/${encodeURIComponent(sessionId)}?${qs}`, {
      method: 'GET',
    });
  },

  /** Delete a session and its checks/photos. */
  async del({ sessionId, facilityName, orgSlug }) {
    const qs = new URLSearchParams({ facilityName, orgSlug });
    return send(`${BASE}/${encodeURIComponent(sessionId)}?${qs}`, {
      method: 'DELETE',
    });
  },

  /** Mint a 30-minute mobile QR token. Returns { url, token, expiresInSeconds }. */
  async qrLink({ sessionId, facilityName, orgSlug }) {
    return send(`${BASE}/${encodeURIComponent(sessionId)}/qr-link`, {
      method: 'POST',
      body: JSON.stringify({ facilityName, orgSlug }),
    });
  },
};
