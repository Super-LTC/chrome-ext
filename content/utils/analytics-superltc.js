// content/utils/analytics-superltc.js
//
// Store-build analytics shim. Replaces posthog-js under vite mode='store'.
// Mirrors only the posthog-js methods analytics.js actually calls. Buffers
// events for 2s (or 50 per batch), then hands off to background via
// chrome.runtime.sendMessage. Background uses apiRequest() — so auth, 401
// retry, and persistent-401 logout all reuse the existing path.
//
// Best-effort: no retries, no offline queue. If a flush fails, events are
// lost. analytics() callers never see errors.

const FLUSH_MS = 2000;
const FLUSH_THRESHOLD = 50;

let distinctId = null;
let superProps = {};
let groups = {};
let queue = [];
let timer = null;

function schedule() {
  if (queue.length >= FLUSH_THRESHOLD) {
    flush();
  } else if (!timer) {
    timer = setTimeout(flush, FLUSH_MS);
  }
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  try {
    // Fire-and-forget. Don't await the response — caller never blocks on
    // analytics. Background swallows errors.
    chrome.runtime.sendMessage({ type: 'analyticsBatch', batch }, () => {
      // Read lastError to silence "Unchecked runtime.lastError" warnings
      // when the background worker is briefly unavailable.
      void chrome.runtime.lastError;
    });
  } catch {
    // Tab being unloaded, extension context invalidated, etc. — drop.
  }
}

function enqueue(event) {
  queue.push(event);
  schedule();
}

function nowIso() {
  return new Date().toISOString();
}

const shim = {
  // posthog-js init() — no-op. analytics.js calls this but no setup needed
  // here; the shim is always "initialized" when imported.
  init() {},

  capture(name, props) {
    enqueue({
      event: name,
      distinct_id: distinctId,
      timestamp: nowIso(),
      properties: { ...superProps, ...(props || {}) },
      groups,
    });
  },

  identify(id, setProps) {
    distinctId = id;
    enqueue({
      event: '$identify',
      distinct_id: id,
      timestamp: nowIso(),
      $set: setProps || {},
    });
  },

  setPersonProperties(props) {
    enqueue({
      event: '$set',
      distinct_id: distinctId,
      timestamp: nowIso(),
      $set: props || {},
    });
  },

  group(type, key, props) {
    groups = { ...groups, [type]: key };
    enqueue({
      event: '$groupidentify',
      distinct_id: distinctId,
      timestamp: nowIso(),
      properties: {
        $group_type: type,
        $group_key: key,
        $group_set: props || {},
      },
    });
  },

  register(props) {
    superProps = { ...superProps, ...(props || {}) };
  },

  reset() {
    distinctId = null;
    superProps = {};
    groups = {};
    queue = [];
    if (timer) { clearTimeout(timer); timer = null; }
  },

  // Stubs — present so analytics.js dev-only code paths don't throw.
  onFeatureFlags() {},
  get_session_id() { return null; },
  sessionRecording: null,
};

// Flush trailing in-flight batch on page navigation. PCC is a SPA that tears
// down content scripts on every nav, so the debounced 2s flush would otherwise
// drop the last batch. `pagehide` fires reliably across nav (incl. bfcache),
// unlike `beforeunload`. `capture: true` runs before other teardown listeners.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush, { capture: true });
}

export default shim;
