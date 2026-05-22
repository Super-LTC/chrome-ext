# Store Analytics — Backend Handoff

**For:** whoever is implementing the backend route (you).
**Branch:** `feat/store-analytics-proxy` in chrome-ext repo. Extension side is done and merged-ready.
**Date:** 2026-05-21

---

## TL;DR

One new authed route. Receives a batch of analytics events from the store-build extension, forwards them to PostHog server-side. Best-effort: ack fast, swallow errors, never block the client.

```
POST /api/v1/analytics/events
```

---

## Why this exists

Chrome Web Store builds of the extension don't ship the `posthog-js` library — privacy/policy reasons. A new client-side shim (`content/utils/analytics-superltc.js`) replaces it. The shim batches events (2s window or 50 events) and posts them here. This route's job is to forward to PostHog with the project key, which only the server should know.

The extension's `analytics.js` already enforces PHI guardrails before events leave the client. The server doesn't need to re-validate for PHI — it should still apply rate limits and sampling.

---

## Request

```http
POST /api/v1/analytics/events
Authorization: Bearer <token>          // standard superltc session token
Content-Type: application/json
```

Body:
```json
{
  "batch": [
    {
      "event": "care_plan_audit_opened",
      "distinct_id": "user_abc123",
      "timestamp": "2026-05-21T18:04:11.123Z",
      "properties": {
        "source": "fab",
        "ext_version": "1.0.38",
        "surface": "extension",
        "pcc_page_type": "patient"
      },
      "groups": { "facility": "fac_42" }
    }
  ]
}
```

Notes on the event shape:
- `event`: string. May be a normal event name OR a PostHog reserved name: `$identify`, `$set`, `$groupidentify`.
- `distinct_id`: string. May be `null` on `$set` events — handle gracefully (drop or pass through; PostHog ignores it).
- `timestamp`: ISO 8601 string. Client clock — don't trust it for ordering, just pass through to PostHog.
- `properties`: object. May include `$set` (person properties on a normal event), arbitrary string/number/bool fields.
- `groups`: optional object. PostHog group keys (`{ facility: "fac_42" }`).
- For `$identify` events: client puts person props at top-level `$set` (not under `properties.$set`). Forward verbatim — PostHog accepts both.
- For `$groupidentify` events: properties carry `$group_type`, `$group_key`, `$group_set`. Forward verbatim.

---

## Response

```
200 OK
Content-Type: application/json
{}
```

**Important:** return `200 {}`, not `204 No Content`. The extension's background worker uses an `apiRequest()` helper that calls `response.json()` unconditionally. A 204 body would throw `SyntaxError`, get caught silently, and pollute "success" debugging.

Return 200 even when forwarding to PostHog fails. Best-effort means the client shouldn't know — it's already sent its events and moved on.

---

## What the route should do

1. **Auth check.** Existing session middleware. Reject unauthenticated requests with the usual 401 (the client handles persistent 401 → logout via the existing apiRequest path; no special-casing needed here).
2. **Validate shape.** `body.batch` is an array, ≤ 100 events. Each event ≤ 32KB serialized. Reject malformed payloads with 400.
3. **Rate limit per user/token.** Soft cap: ~1,000 events/hr/user. Past cap, drop the batch silently and log once per window. A misbehaving extension install shouldn't blow up the PostHog bill.
4. **Apply server-side sampling** to chatty observability events (see table below). Stamp `$sample_rate` on sampled events so PostHog scales counts correctly. Drop the rest.
5. **Enrich each event** with `properties.surface = 'extension-store'` (lets you filter store users from internal/dev users in PostHog).
6. **Forward to PostHog.** Acknowledge the client first (`res.status(200).json({})`), then forward async. Don't block the response on PostHog latency.

### Pseudocode

```js
app.post('/api/v1/analytics/events', requireAuth, async (req, res) => {
  res.status(200).json({});  // ack first

  const { batch } = req.body || {};
  if (!Array.isArray(batch) || !batch.length || batch.length > 100) return;
  // (optional: check each event size ≤ 32KB)

  if (!withinRateLimit(req.user.id, batch.length)) return;

  const enriched = batch
    .map(applySampling)        // drops or stamps $sample_rate
    .filter(Boolean)
    .map(e => ({
      ...e,
      properties: { ...(e.properties || {}), surface: 'extension-store' },
    }));

  if (!enriched.length) return;

  fetch('https://us.i.posthog.com/batch/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.POSTHOG_PROJECT_KEY,
      batch: enriched,
    }),
  }).catch(() => {});  // best-effort
});
```

---

## Sampling table

These three event categories are observability-flavored (you care about trends, not every fire). Sample them server-side so the rules can be tuned without re-releasing the extension.

| Event name pattern | Sample rate | `$sample_rate` to stamp |
|---|---|---|
| `pcc_page_viewed` | 25% | 4 |
| `mds_planner_view_switched`, `mds_cc_view_switched` | 25% | 4 |
| `report_24hr_filter_changed` | 50% | 2 |
| *(everything else)* | 100% | (omit) |

Implementation suggestion: a small config map you can override via env or a tiny table. The exact rates are a starting point — tune from PostHog ingestion volume after a week.

Reserved events (`$identify`, `$set`, `$groupidentify`) should **never** be sampled. They're identity state, not events.

---

## PostHog forwarding details

- **Endpoint:** `POST https://us.i.posthog.com/batch/`
- **Auth:** include `api_key` in the JSON body (the project key — keep this in env, never log it).
- **Project:** Super LTC project 247257 (org `019a7007-b36b-0000-eabb-a6f4492a1b67`).
- **Don't add `$ip`** unless you want to override PostHog's automatic IP capture. The forwarder runs server-side so PostHog will see your server's IP by default — fine for the privacy posture (no per-user IP).

---

## Optional: dual-write to a local table

Not required, cheap insurance. If you ever want to drop PostHog without re-shipping the extension, having the events in your own DB is the easy path. Schema something like:

```sql
analytics_events (
  id              uuid pk,
  user_id         uuid,
  event           text,
  distinct_id     text,
  ts              timestamptz,    -- client-supplied
  received_at     timestamptz default now(),
  properties      jsonb,
  groups          jsonb
)
```

Write happens after sampling, before/parallel to PostHog forward. Index `(event, received_at)` and `(user_id, received_at)`.

Punt on this if you want; the route works without it.

---

## Testing the integration

The extension is ready to test against your route as soon as it exists.

1. **Local backend:** the dev extension build (`npm run build`) talks to `http://localhost:3000` via `CONFIG.API_BASE` in `background/background.js`. But dev build uses real PostHog, NOT your route. To test your route end-to-end, use the **store build** pointed at your local backend (you'll need to temporarily change `CONFIG.API_BASE` for the store mode, or test against staging).

2. **Confirm batching works:** open the extension, trigger several events in quick succession. You should see ONE POST with a batch array containing all events, not many POSTs.

3. **Confirm best-effort:** kill your local backend mid-session. The extension should keep working with zero visible errors. Service worker console may show "API error" lines from the swallowed catch, that's fine.

4. **Confirm reserved events:** click around to trigger `$identify` (happens on auth bootstrap) and `$groupidentify` (when `group('facility', ...)` is called). Forward to PostHog and confirm person/group profiles appear correctly.

5. **Confirm sampling:** generate ~100 `pcc_page_viewed` events. PostHog should show ~25 events with `$sample_rate: 4` set.

---

## Files in the extension you may want to read

All on branch `feat/store-analytics-proxy` in the chrome-ext repo (worktree at `.worktrees/store-analytics-proxy`).

- `content/utils/analytics-superltc.js` — the client shim. See exactly what shape the events take.
- `content/utils/analytics.js` — the existing analytics funnel. PHI guardrails live here, not on the server.
- `content/utils/analytics-schema.js` — full allowlist of events and their permitted properties. Useful if you want a reference for what's coming in.
- `background/background.js` (search `analyticsBatch`) — the message handler that calls your route. Note it uses `apiRequest()` which calls `response.json()`, hence the `200 {}` requirement.

---

## What's out of scope for the backend

- Anonymous events. The shim drops batches when no auth token is present (the existing `apiRequest` throws "Not authenticated"). No server-side handling needed.
- Feature flags. Not used in store builds.
- Session recording. Not bundled in store builds.
- Retries. Best-effort client; if the route 5xxs, those events are gone.

---

## Open questions / decisions for you

1. **Sampling implementation:** static config in code, env var, or DB table? Recommend code-first; promote to a table only if you actually need to tune without deploying.
2. **Local dual-write:** ship it now or punt? Cheap to add later if you ever feel the need.
3. **Per-token rate-limit storage:** Redis if you have it; otherwise an in-memory LRU is fine — extension installs are sparse enough that a single process can hold the counters.
