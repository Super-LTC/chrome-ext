# Store-Build Analytics Proxy — Design

**Date:** 2026-05-21
**Status:** Approved, ready to implement
**Driver:** Chrome Web Store privacy/policy. Store reviewers should see traffic only to `superltc.com`. PostHog ingestion happens server-side.

## Today

- Dev/internal builds use `posthog-js` directly → `us.i.posthog.com`.
- Store build (`vite.config.js:82`, `stubPosthogInStore`) replaces `posthog-js` with an empty module. `ENABLED` resolves to `false` (`analytics.js:19`), so every `track/identify/etc.` is a no-op.
- Result: store users emit **zero** analytics today.

## Goal

Restore analytics on store builds by routing through superltc backend. Best-effort delivery. No new client-visible third-party traffic. No PHI changes — keep the existing `analytics.js` guardrails as the single funnel.

## Architecture

```
store extension (content script)
  └─ analytics.js (unchanged surface)
       └─ posthog-js import → resolved by vite to → analytics-superltc.js
             └─ chrome.runtime.sendMessage({ type: 'analyticsBatch', batch })
                  │
                  ▼
             background.js
                  └─ apiRequest('/api/v1/analytics/events', { method: 'POST', body }) → superltc.com
                              └─ enrich + sample + forward → us.i.posthog.com/batch/
```

Dev/internal builds are unaffected — still talk to PostHog directly.

## Client shim (`content/utils/analytics-superltc.js`)

Same surface as the posthog-js methods `analytics.js` calls (`capture`, `identify`, `setPersonProperties`, `group`, `register`, `reset`, plus no-op stubs for `onFeatureFlags`, `get_session_id`, `sessionRecording`).

Behavior:
- **Buffered:** 2s window or 50 events, whichever first. One send per flush.
- **Best-effort:** no retries, no persistent queue. On flush, send via `chrome.runtime.sendMessage({ type: 'analyticsBatch', batch })` and don't await the response. The background worker handles the actual HTTP (auth, 401 retry, etc. — all existing logic in `apiRequest`).
- **Why background-routed:** `authToken` lives at `chrome.storage.local.authToken` (top-level, not on `user`). Background's `apiRequest()` (background/background.js:24) already reads it, handles 401-retry-once, and clears storage on persistent 401. Reusing that path means the analytics shim doesn't duplicate auth logic and doesn't need direct token access.
- **Reset:** `reset()` clears queue + identity (used on logout).

Event shape sent to backend:
```json
{
  "batch": [
    {
      "event": "care_plan_audit_opened",
      "distinct_id": "user_abc123",
      "timestamp": "2026-05-21T18:04:11.123Z",
      "properties": { /* super props merged in */ },
      "$set": { /* identify / setPersonProperties */ },
      "groups": { "facility": "fac_42" }
    }
  ]
}
```

Special events use PostHog reserved names so the server can pass them through unchanged: `$identify`, `$set`, `$groupidentify`.

## Vite wiring

Modify the existing `stubPosthogInStore` plugin in `vite.config.js:82` to alias to the shim instead of emitting an empty module:

```js
function stubPosthogInStore(mode) {
  const isStore = mode === 'store';
  return {
    name: 'stub-posthog',
    resolveId(source) {
      if (isStore && source.startsWith('posthog-js')) {
        return path.resolve(__dirname, 'content/utils/analytics-superltc.js');
      }
    },
  };
}
```

Flip the `ENABLED` gate so store builds aren't skipped by the placeholder-key check. Add a build define `__ANALYTICS_FORCE_ON__` (true under `mode === 'store'`) and update `analytics.js:19`:

```js
const ENABLED = __ANALYTICS_FORCE_ON__ || (KEY && KEY !== 'phc_PLACEHOLDER');
```

## Background-script handler

Add a new message type next to the existing ones in `background/background.js`:

```js
if (message.type === 'analyticsBatch') {
  (async () => {
    try {
      await apiRequest('/api/v1/analytics/events', {
        method: 'POST',
        body: JSON.stringify({ batch: message.batch }),
      });
    } catch {
      // best-effort: swallow. apiRequest already handles 401 → token clear.
    }
    sendResponse({ ok: true });
  })();
  return true;
}
```

Unauthed users: `apiRequest` throws `'Not authenticated'` when `authToken` is absent → caught and dropped. No special-casing needed in the shim.

## Backend route

```
POST /api/v1/analytics/events
host:  superltc.com  (same origin as existing extension API; CONFIG.API_BASE)
auth:  Bearer <authToken>  (existing middleware)
body:  { batch: Event[] }
limits: batch ≤ 100, each event ≤ 32KB
resp:  200 {} (always — ack before forwarding)
```

Server responsibilities:
1. Auth check (existing middleware).
2. Apply **per-token rate limit**: 1,000 events/hr. Past cap, drop silently, log once per window.
3. Apply **server-side sampling** (see below). Stamp `$sample_rate` on sampled events.
4. Inject PostHog project key + `surface: 'extension-store'` super prop.
5. POST to `https://us.i.posthog.com/batch/`. Fire-and-forget — never block the 200.

Pseudocode:
```js
app.post('/api/v1/analytics/events', requireAuth, async (req, res) => {
  res.status(200).json({});
  const { batch } = req.body || {};
  if (!Array.isArray(batch) || !batch.length) return;
  if (batch.length > 100) return;

  if (!withinRateLimit(req.user.id, batch.length)) return;

  const sampled = batch
    .map(applySampling)
    .filter(Boolean);

  if (!sampled.length) return;

  fetch('https://us.i.posthog.com/batch/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.POSTHOG_PROJECT_KEY,
      batch: sampled.map(e => ({
        ...e,
        properties: { ...e.properties, surface: 'extension-store' },
      })),
    }),
  }).catch(() => {});
});
```

## Server-side sampling

Cuts volume on the three observability-grade events without losing trends. PostHog uses `$sample_rate` to scale counts in queries — so a 25% sample with `$sample_rate: 4` reports correct totals.

| Event | Sample rate | $sample_rate prop |
|---|---|---|
| `pcc_page_viewed` | 25% | 4 |
| `mds_planner_view_switched` | 25% | 4 |
| `mds_cc_view_switched` | 25% | 4 |
| `report_24hr_filter_changed` | 50% | 2 |
| *(everything else)* | 100% | (omit) |

Implemented as a server-side table so it can be tuned without re-releasing the extension.

## What's intentionally not in scope

- **Feature flags / `/decide/` proxy** — `onFeatureFlags` is only used for dev-mode replay-URL logging. Store build doesn't need it.
- **Session recording / `/s/` proxy** — recording is off in store builds (no SDK shipped).
- **Retries / offline queue** — best-effort. If a flush fails, those events are lost.
- **Anonymous events** — no token = no send. We don't track unauthed users on the store build.

## Files to add / change

- **add** `content/utils/analytics-superltc.js` — shim
- **edit** `vite.config.js` — `stubPosthogInStore` resolves to shim under `mode==='store'`; new `__ANALYTICS_FORCE_ON__` define
- **edit** `content/utils/analytics.js:19` — `ENABLED` reads the new define
- **edit** `background/background.js` — add `analyticsBatch` message handler
- **add backend** `POST /api/v1/analytics/events` — auth + rate limit + sample + forward
- **add backend** sampling config table (event_name → rate)

## Rollout

Single PR per the team convention for instrumentation work — no phased rollout, no flag. Ship the backend route first, then the store build pointing at it.

## Open questions

- **Resolved:** token shape. Auth lives at `chrome.storage.local.authToken` (not on `user`). Reusing background `apiRequest()` sidesteps the issue — shim never touches the token.
- **For backend team:** decide whether the route should also dual-write to a local `analytics_events` table (cheap insurance against ever wanting to drop PostHog without re-shipping the extension). Not blocking shipment.
