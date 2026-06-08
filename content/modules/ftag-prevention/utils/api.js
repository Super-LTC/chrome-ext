/**
 * Background worker wraps each API response as { success, data: <server-resp> }.
 * The ftag-prevention endpoints return their own { success, ... } envelope on
 * top, so `result.data` is the server envelope. This helper peels a single
 * { success, data } wrapper when present and otherwise returns the value as-is,
 * so callers get the real payload regardless of nesting depth.
 */
export function unwrap(payload) {
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return payload.data;
  }
  return payload;
}

/** Thin wrapper over the background API_REQUEST bridge. Returns unwrapped data or throws. */
export async function apiGet(endpoint) {
  const res = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options: { method: 'GET' },
  });
  if (!res?.success) throw new Error(res?.error || 'Request failed');
  return unwrap(res.data);
}

/** POST a JSON body through the background bridge. Returns unwrapped data or throws. */
export async function apiPost(endpoint, body) {
  return apiSend(endpoint, 'POST', body);
}

/** Send an arbitrary-method request (POST/DELETE/...) with optional JSON body. */
export async function apiSend(endpoint, method, body) {
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
