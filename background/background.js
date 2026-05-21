// Background service worker for Super LTC Chrome Extension
// Handles cross-origin requests and authentication

// CONFIG is inlined here since service workers use ES modules and can't use importScripts
// __DEV_MODE__ is replaced at build time by Vite:
//   npm run dev        → true  (uses localhost:3000)
//   npm run build:prod → false (uses superltc.com)
const CONFIG = {
  DEV_MODE: __DEV_MODE__,
  get API_BASE() {
    return this.DEV_MODE ? 'http://localhost:3000' : 'https://superltc.com';
  },
};

// Helper: Make authenticated API requests
//
// 401 handling: a single 401 used to immediately wipe the auth token and force
// reauth. That made the extension fragile to any transient backend blip
// (deploy in flight, momentary auth-service hiccup, network glitch) — one bad
// response and every active user got logged out. Now we retry the same request
// once with the same token before clearing storage. Safe because 401 means
// the request was rejected at auth time → no side effects → retry is idempotent
// for any HTTP method.
async function apiRequest(endpoint, options = {}) {
  const { authToken } = await chrome.storage.local.get('authToken');
  if (!authToken) {
    throw new Error('Not authenticated');
  }

  const doFetch = () => fetch(`${CONFIG.API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers,
    },
  });

  let response = await doFetch();

  if (response.status === 401) {
    // Retry once — small backoff to ride out a transient auth blip.
    await new Promise((r) => setTimeout(r, 300));
    response = await doFetch();

    if (response.status === 401) {
      // Persistent 401 — token genuinely revoked/expired. Clear storage.
      console.warn('[Auth] Token cleared:', { reason: 'persistent-401-apiRequest', endpoint, at: Date.now() });
      await chrome.storage.local.remove(['authToken', 'user']);
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Open chrome://extensions so user can click the Reload icon after
  // a background file-swap update (content scripts can't open chrome:// URLs).
  if (message.type === 'OPEN_EXTENSIONS_PAGE') {
    chrome.tabs.create({ url: 'chrome://extensions' }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Open an arbitrary URL in a new tab (used for release-notes link, etc.)
  if (message.type === 'OPEN_TAB' && typeof message.url === 'string') {
    chrome.tabs.create({ url: message.url }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Reload the tab the content script is running in. More reliable than
  // window.location.reload() from a content script — that can be blocked
  // by the page's CSP, isolated-world quirks, or host framing.
  if (message.type === 'RELOAD_CURRENT_TAB') {
    const tabId = sender?.tab?.id;
    if (tabId) {
      chrome.tabs.reload(tabId, { bypassCache: true }, () => {
        sendResponse({ ok: true });
      });
    } else {
      sendResponse({ ok: false, error: 'No tab id' });
    }
    return true;
  }

  // Initiate login - generate state and return auth URL
  if (message.type === 'LOGIN') {
    (async () => {
      try {
        const state = crypto.randomUUID();
        const redirectUri = `${CONFIG.API_BASE}/auth/extension/callback`;
        await chrome.storage.local.set({ authState: state });

        const authUrl = `${CONFIG.API_BASE}/auth/extension?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
        sendResponse({ success: true, authUrl });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Handle OAuth callback - validate state and store token
  if (message.type === 'AUTH_CALLBACK') {
    (async () => {
      try {
        const { token, state } = message;

        // Verify state matches (CSRF protection)
        const { authState } = await chrome.storage.local.get('authState');
        if (state !== authState) {
          sendResponse({ success: false, error: 'State mismatch - possible CSRF attack' });
          return;
        }

        // Clear the auth state
        await chrome.storage.local.remove('authState');

        // Validate token with API
        const validateUrl = `${CONFIG.API_BASE}/api/auth/extension/validate`;
        console.log('Super LTC: Validating token at:', validateUrl);

        const response = await fetch(validateUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        console.log('Super LTC: Validation response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Super LTC: Validation failed:', response.status, errorText);
          sendResponse({ success: false, error: `Token validation failed: ${response.status} - ${errorText}` });
          return;
        }

        const data = await response.json();
        console.log('Super LTC: Validation response:', data);
        const { user } = data;

        // Store token and user info
        await chrome.storage.local.set({
          authToken: token,
          user: user,
        });

        sendResponse({ success: true, user });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Get current auth state
  if (message.type === 'GET_AUTH_STATE') {
    (async () => {
      try {
        const { authToken, user } = await chrome.storage.local.get(['authToken', 'user']);

        if (!authToken) {
          sendResponse({ authenticated: false, user: null });
          return;
        }

        // Optionally validate token is still valid.
        //
        // Only clear storage on a CONFIRMED 401 (token revoked/invalid). Any
        // other non-2xx — 502/503 from a deploy in flight, 500 from a backend
        // hiccup, 504 timeout — is a server problem, not an auth problem, and
        // must NOT log the user out. Same retry-once policy as apiRequest:
        // a single 401 could be a transient auth-service blip; require two in
        // a row before treating it as authoritative.
        if (message.validate) {
          const validateUrl = `${CONFIG.API_BASE}/api/auth/extension/validate`;
          const doFetch = () => fetch(validateUrl, {
            headers: { 'Authorization': `Bearer ${authToken}` },
          });

          try {
            let response = await doFetch();

            if (response.status === 401) {
              await new Promise((r) => setTimeout(r, 300));
              response = await doFetch();
            }

            if (response.status === 401) {
              // Persistent 401 — token genuinely revoked. Clear storage.
              console.warn('[Auth] Token cleared:', { reason: 'persistent-401-validate', at: Date.now() });
              await chrome.storage.local.remove(['authToken', 'user']);
              sendResponse({ authenticated: false, user: null });
              return;
            }

            if (!response.ok) {
              // Server error (5xx, etc.) — keep the user logged in with
              // cached state. They'll re-validate next time.
              sendResponse({ authenticated: true, user });
              return;
            }

            const { user: validatedUser } = await response.json();
            await chrome.storage.local.set({ user: validatedUser });
            sendResponse({ authenticated: true, user: validatedUser });
          } catch {
            // Network error - return cached state
            sendResponse({ authenticated: true, user });
          }
        } else {
          sendResponse({ authenticated: true, user });
        }
      } catch (error) {
        sendResponse({ authenticated: false, user: null, error: error.message });
      }
    })();
    return true;
  }

  // Logout - clear stored auth data
  if (message.type === 'LOGOUT') {
    (async () => {
      try {
        console.warn('[Auth] Token cleared:', { reason: 'explicit-logout', at: Date.now() });
        await chrome.storage.local.remove(['authToken', 'user', 'authState']);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Capture the current visible tab as a PNG data URL
  if (message.type === 'CAPTURE_VIEWPORT') {
    const windowId = sender?.tab?.windowId;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true;
  }

  // Submit feedback to the backend
  if (message.type === 'SUBMIT_FEEDBACK') {
    (async () => {
      try {
        const result = await apiRequest('/api/extension/feedback', {
          method: 'POST',
          body: JSON.stringify(message.payload),
        });
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Make authenticated API request (for use by popup/content scripts)
  // Save a file via chrome.downloads. Used to bypass the filename-strip that
  // happens when content scripts trigger blob downloads from third-party
  // origins like pointclickcare.com. Caller sends a data URL + filename.
  if (message.type === 'DOWNLOAD_FILE' && typeof message.dataUrl === 'string') {
    chrome.downloads.download(
      { url: message.dataUrl, filename: message.filename, saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError || !downloadId) {
          sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Download failed' });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    return true;
  }

  // Fetch the unsigned print-preview PDF for a diagnosis query and hand it to
  // chrome.downloads. PDF bytes can't be passed across the runtime boundary, so
  // we do the auth+fetch+save here in one shot.
  if (message.type === 'PRINT_QUERY_PDF' && typeof message.queryId === 'string') {
    (async () => {
      try {
        const { authToken } = await chrome.storage.local.get('authToken');
        if (!authToken) throw new Error('Not authenticated');

        const endpoint = `/api/extension/diagnosis-queries/${message.queryId}/print`;
        const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            selectedIcd10Code: message.selectedIcd10Code,
            selectedIcd10Description: message.selectedIcd10Description,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(errText || `Print failed (${res.status})`);
        }

        // Convert binary → base64 data URL in chunks so large PDFs don't blow
        // the call stack via String.fromCharCode(...spread).
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        const dataUrl = `data:application/pdf;base64,${btoa(binary)}`;

        const filename = message.filename || `query-${message.queryId.slice(0, 8)}.pdf`;
        chrome.downloads.download(
          { url: dataUrl, filename, saveAs: true },
          (downloadId) => {
            if (chrome.runtime.lastError || !downloadId) {
              sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Download failed' });
            } else {
              sendResponse({ success: true, downloadId });
            }
          }
        );
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Store-build analytics batches from analytics-superltc.js. Routed through
  // apiRequest for 401 retry + persistent-401 logout. Best-effort: errors swallowed.
  if (message.type === 'analyticsBatch') {
    (async () => {
      try {
        await apiRequest('/api/v1/analytics/events', {
          method: 'POST',
          body: JSON.stringify({ batch: message.batch }),
        });
      } catch {
        // No auth, network error, 5xx — drop. apiRequest already handles
        // persistent-401 token clear.
      }
      sendResponse({ ok: true });
    })();
    return true;  // async response
  }

  if (message.type === 'API_REQUEST') {
    (async () => {
      try {
        const result = await apiRequest(message.endpoint, message.options);
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Unhandled message type - don't hold the channel open
  return false;
});

// ============================================
// Streaming Chat Handler (Port-based)
// ============================================
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chat-stream') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'START_STREAM') {
      await handleChatStream(port, msg.messages, msg.context);
    }
  });
});

async function handleChatStream(port, messages, context) {
  try {
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
      port.postMessage({ type: 'ERROR', error: 'Not authenticated' });
      return;
    }

    const url = `${CONFIG.API_BASE}/api/chat`;
    console.log('Super LTC Chat: Starting stream to', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ messages, context })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Super LTC Chat: API error', response.status, errorText);
      port.postMessage({ type: 'ERROR', error: `API error: ${response.status}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      try {
        port.postMessage({ type: 'CHUNK', data: chunk });
      } catch (e) {
        // Port disconnected
        console.log('Super LTC Chat: Port disconnected during stream');
        break;
      }
    }

    try {
      port.postMessage({ type: 'DONE' });
    } catch (e) {
      // Port already disconnected
    }

    console.log('Super LTC Chat: Stream complete');

  } catch (error) {
    console.error('Super LTC Chat: Stream error', error);
    try {
      port.postMessage({ type: 'ERROR', error: error.message });
    } catch (e) {
      // Port disconnected
    }
  }
}

// Log when service worker starts
console.log('Super LTC background service worker started');
console.log('API Base:', CONFIG.API_BASE);
