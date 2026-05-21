# Store Analytics Proxy — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On Chrome Web Store builds, route analytics through a tiny client shim → background service worker → superltc backend → PostHog. Best-effort, batched, with server-side sampling. Dev/internal builds unaffected.

**Architecture:**
- `posthog-js` import is aliased (via vite plugin) to a new `analytics-superltc.js` shim — only under `mode === 'store'`.
- Shim mirrors the posthog-js method surface `analytics.js` actually uses (`capture`, `identify`, `setPersonProperties`, `group`, `register`, `reset`, plus no-op stubs). Internally buffers 2s/50 events and ships via `chrome.runtime.sendMessage`.
- Background worker handles the HTTP via existing `apiRequest()` — auth, 401-retry, persistent-401 token clear all reused.
- Backend route `POST /api/v1/analytics/events` is out of scope for this plan (built separately by the user). Contract documented below for reference.

**Tech Stack:** Vite + Preact + Chrome MV3 service worker. No new dependencies.

**Reference docs:**
- `docs/plans/2026-05-21-store-analytics-proxy-design.md` — design
- `content/utils/analytics.js` — existing analytics funnel (unchanged surface)
- `vite.config.js:82` — `stubPosthogInStore` plugin we're modifying
- `background/background.js:24` — `apiRequest()` we're piggybacking on

**Backend contract (FYI — user implementing separately):**
```
POST /api/v1/analytics/events
auth:  Bearer <authToken>
body:  { batch: Event[] }   // batch ≤ 100, event ≤ 32KB
resp:  204 No Content (ack first, forward async, never block)
```
Server enriches with `surface: 'extension-store'`, applies sampling, forwards to `https://us.i.posthog.com/batch/` with the server-held project key.

---

### Task 1: Add the `analytics-superltc.js` shim

**Files:**
- Create: `content/utils/analytics-superltc.js`

**Step 1: Create the shim file**

The shim must export a `default` object whose methods match every posthog-js method called from `content/utils/analytics.js` (`capture`, `identify`, `setPersonProperties`, `group`, `register`, `reset`, `onFeatureFlags`, `get_session_id`). Plus a `sessionRecording` property that `analytics.js:83` reads. All of these must exist or `analytics.js` will throw at import.

```js
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
const MAX_BATCH = 50;

let distinctId = null;
let superProps = {};
let groups = {};
let queue = [];
let timer = null;

function schedule() {
  if (queue.length >= MAX_BATCH) {
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

export default shim;
```

**Step 2: Verify the shim covers every posthog-js call site in `analytics.js`**

Run: `grep -nE "posthog\.[a-zA-Z_]+" content/utils/analytics.js`

Expected output should list only methods present on the shim above:
- `posthog.init` ✓
- `posthog.register` ✓
- `posthog.onFeatureFlags` ✓
- `posthog.sessionRecording` ✓
- `posthog.get_session_id` ✓
- `posthog.capture` ✓
- `posthog.identify` ✓
- `posthog.group` ✓
- `posthog.setPersonProperties` ✓
- `posthog.reset` ✓

If `grep` shows any method NOT on the shim, add a no-op stub for it before continuing.

**Step 3: Commit**

```bash
git add content/utils/analytics-superltc.js
git commit -m "feat(store-analytics): add posthog-js shim for store builds"
```

---

### Task 2: Wire the shim into vite for `mode === 'store'`

**Files:**
- Modify: `vite.config.js:82-98` (replace `stubPosthogInStore` plugin body)
- Modify: `vite.config.js` `define` block (add `__ANALYTICS_FORCE_ON__`)

**Step 1: Replace the `stubPosthogInStore` plugin**

Replace the existing function (currently `vite.config.js:82-98`) with one that resolves `posthog-js` to the shim instead of emitting an empty object:

```js
// Plugin to redirect the posthog-js import to our own shim for Chrome
// Web Store builds. The shim batches events and hands off to the
// background worker (which forwards through superltc.com to PostHog).
// Reviewers see only superltc.com traffic; no third-party tracking code.
function stubPosthogInStore(mode) {
  const isStore = mode === 'store';
  return {
    name: 'stub-posthog',
    enforce: 'pre',
    resolveId(source) {
      if (isStore && source.startsWith('posthog-js')) {
        return path.resolve(__dirname, 'content/utils/analytics-superltc.js');
      }
    },
  };
}
```

Make sure `path` is already imported at the top of `vite.config.js`. If not, add `import path from 'node:path';` near the other imports.

**Step 2: Add `__ANALYTICS_FORCE_ON__` define**

In the `define` block (around `vite.config.js:164`), add a new entry next to `__DEV_MODE__`:

```js
define: {
  __DEV_MODE__: isDev,
  __ANALYTICS_FORCE_ON__: isStore,  // ← new line
  __POSTHOG_KEY__: JSON.stringify(
    // ... existing
  ),
  // ...
}
```

**Step 3: Verify the build works under both modes**

Run: `npm run build`
Expected: exits 0, normal dev/prod build succeeds.

Run: `npm run build -- --mode store` (or whatever the existing store-build script is — check `package.json` scripts).

Expected: exits 0, `dist-store/` contains a bundle. The output should NOT include `posthog-js`. Verify with:

```bash
grep -c "posthog-js/dist/module.full" dist-store/assets/*.js || echo "✓ posthog-js library not bundled"
```

(grep returns 1/no match → echo runs → confirmation printed.)

**Step 4: Verify shim IS bundled**

Run:
```bash
grep -l "analyticsBatch" dist-store/assets/*.js
```
Expected: at least one matching file (the shim's `sendMessage` payload type made it into the bundle).

**Step 5: Commit**

```bash
git add vite.config.js
git commit -m "feat(store-analytics): alias posthog-js to shim under mode=store"
```

---

### Task 3: Flip `ENABLED` in `analytics.js` to honor the new define

**Files:**
- Modify: `content/utils/analytics.js:18-19`

**Step 1: Update the gate**

Today (`analytics.js:18-19`):
```js
const KEY = __POSTHOG_KEY__;
const ENABLED = KEY && KEY !== 'phc_PLACEHOLDER';
```

Change to:
```js
const KEY = __POSTHOG_KEY__;
// Dev/internal builds: enabled when a real PostHog key is in the bundle.
// Store builds: always enabled, because the shim routes through our own
// backend (no PostHog key shipped to the client).
const ENABLED = __ANALYTICS_FORCE_ON__ || (KEY && KEY !== 'phc_PLACEHOLDER');
```

**Step 2: Verify both builds still type-check / build**

Run: `npm run build`
Expected: clean build, no `__ANALYTICS_FORCE_ON__ is not defined` errors.

Run: `npm run build -- --mode store`
Expected: clean build.

**Step 3: Verify `ENABLED` ends up `true` in the store bundle**

```bash
grep -o "ENABLED[^;]*" dist-store/assets/content.js-*.js | head -3
```
The minified form will look like `ENABLED=true` or similar (true literal substituted in by the constant-folding optimizer because `__ANALYTICS_FORCE_ON__` is a build-time `true`).

**Step 4: Commit**

```bash
git add content/utils/analytics.js
git commit -m "feat(store-analytics): enable analytics on store builds via shim"
```

---

### Task 4: Add the `analyticsBatch` message handler in background

**Files:**
- Modify: `background/background.js` — add a new message handler next to the others

**Step 1: Find a good insertion point**

The existing message handlers live in `background/background.js`. Look for the pattern `if (message.type === '...')`. Pick a spot just before the catch-all `apiRequest` passthrough (around line 347 based on earlier grep). The exact line number may have shifted — search for `message.type === 'apiRequest'` and insert above it.

**Step 2: Add the handler**

```js
// Analytics batch forwarding for store builds. Shim in content scripts
// (analytics-superltc.js) sends batches here; we hand them to superltc
// via apiRequest so we reuse 401 retry / persistent-401 logout. Backend
// acks 204 immediately and forwards to PostHog out-of-band — so this
// resolves fast even when PostHog is slow.
//
// Best-effort: errors are swallowed. Analytics must never break the app.
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
```

**Step 3: Build and confirm**

Run: `npm run build -- --mode store`
Expected: exits 0.

Run: `grep -c analyticsBatch dist-store/background/background.js`
Expected: 1+ (handler made it into the store bundle).

**Step 4: Commit**

```bash
git add background/background.js
git commit -m "feat(store-analytics): background handler forwards batches to superltc"
```

---

### Task 5: Manual smoke test in Chrome

**Files:** none

**Step 1: Build the store bundle**

```bash
npm run build -- --mode store
```

**Step 2: Load `dist-store/` in Chrome**

1. `chrome://extensions`
2. Toggle off the existing Super LTC dev build (if loaded) to avoid double-extension confusion.
3. "Load unpacked" → select `dist-store/`.
4. Confirm it loads without errors. Check the service worker logs (click "service worker" link on the extension card).

**Step 3: Verify network traffic**

Open DevTools on a PointClickCare page. In the Network tab, filter for `posthog`.

Expected: **zero** requests to `us.i.posthog.com` or any `posthog` host. The store bundle must not contact PostHog directly.

**Step 4: Verify analytics call reaches the backend**

Trigger an event the extension definitely fires — e.g. open the FAB / open any module. With the backend route not yet implemented, you should see:

- DevTools Network (filter `analytics/events`): a `POST` to `https://superltc.com/api/v1/analytics/events` returning 404 (route doesn't exist yet) — this is **expected and correct**. It proves the shim → background → apiRequest chain works.
- Service worker console: no thrown errors. The 404 should be swallowed silently.

If you see a 401: log in to the extension first (popup → Sign in), then retry. apiRequest requires an authToken.

**Step 5: Verify batching**

Open several modules in quick succession (within 2 seconds). You should see exactly ONE `POST /api/v1/analytics/events` with multiple events in the body, not one POST per event.

Inspect the request body in DevTools — should look like:
```json
{ "batch": [ { "event": "...", "distinct_id": "...", ... }, ... ] }
```

**Step 6: No commit needed (verification only)**

If anything looks wrong, go back to the relevant task. Otherwise proceed.

---

### Task 6: Document and finalize

**Files:**
- Modify: `CLAUDE.md` (optional — note the new store-build path)

**Step 1: Add a short note to CLAUDE.md**

Under the section that explains the hybrid architecture, add a line about analytics:

```markdown
### Analytics
- Dev/internal builds (`npm run build`) use `posthog-js` directly.
- Store builds (`npm run build -- --mode store`) replace posthog-js with `content/utils/analytics-superltc.js`, which batches and forwards through the background worker → `POST /api/v1/analytics/events` on superltc → PostHog server-side.
- Single funnel through `content/utils/analytics.js` either way — PHI guardrails unchanged.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note store-build analytics shim path"
```

**Step 3: Open PR (or merge directly)**

Use the `superpowers:finishing-a-development-branch` skill to decide how to integrate.

---

## Verification checklist before merging

- [ ] `npm run build` succeeds (dev/internal build still works)
- [ ] `npm run build -- --mode store` succeeds
- [ ] `dist-store/` contains no posthog-js library code (grep shows zero matches for `posthog-js/dist/module`)
- [ ] `dist-store/` contains the shim (`analyticsBatch` grep returns ≥ 1 match)
- [ ] Store extension loads in Chrome with no console errors
- [ ] Triggering any tracked event produces a `POST /api/v1/analytics/events` to `superltc.com` (404 is fine until backend ships)
- [ ] Zero requests to `us.i.posthog.com` from the store build
- [ ] Multiple events within 2s arrive as ONE batched POST
- [ ] Dev build still talks directly to PostHog (no regression)

## Out of scope (user is building separately)

- Backend route `POST /api/v1/analytics/events`
- Server-side per-token rate limit (1,000 events/hr)
- Server-side sampling table for `pcc_page_viewed`, `*_view_switched`, `*_filter_changed`
- Forward to PostHog `/batch/` with `surface: 'extension-store'` super prop
- Optional dual-write to a local `analytics_events` table
