# Backend handoff — Notification "seen" state for the MDS Command Center

> The Chrome extension lives in a **separate repo**. This doc is the API contract + data model the extension needs. No extension code changes here.

## Why

We're turning the floating "S" button in the extension into a real notification hub to pull nurses into a daily habit of opening it. The red badge will show **one combined count** of two kinds of items:

- **Action items** (already supported, no backend work): certs overdue/due-soon, queries needing signature. These clear when the work is done.
- **FYI items** (THIS WORK): **recently-signed certs**, **recently-signed queries**, and the **fresh 24-hour report**. These clear when the user *views* them, and must not come back once seen.

The extension needs the backend to (1) remember what each user has already seen, and (2) tell the extension, per item, whether the current user has seen it.

## The model that makes this simple

Represent "seen" as a per-user row keyed by an opaque **notification key**:

- `cert_signed:{certificationId}`
- `query_signed:{diagnosisQueryId}`
- `report_24h:{YYYY-MM-DD}`  ← date is the **facility-local report date**

"Unseen" is then a single uniform check everywhere: **does a seen-row exist for (user, key)?**

This gives us the two different reset behaviors for free:
- **Signed certs/queries are sticky** — once a user has seen `cert_signed:123`, it stays seen forever (it ages out of the UI via the 7-day recency window below, not via reset).
- **The 24h report resets daily** — because the key embeds the date. Today's `report_24h:2026-06-02` being seen says nothing about tomorrow's `report_24h:2026-06-03`. No per-day expiry logic required.

## Data model

Table `extension_notification_views` (name flexible):

| column | type | notes |
|--------|------|-------|
| `id` | pk | |
| `user_id` | fk → user | the nurse who viewed it |
| `org_id` / `facility_id` | fk | scope (match how other extension routes scope) |
| `notification_key` | text | one of the key formats above |
| `seen_date` | date | facility-local date it was first seen (audit/housekeeping) |
| `created_at` | timestamptz | |

**Unique constraint:** `(user_id, notification_key)`. Inserts are `ON CONFLICT DO NOTHING` (idempotent — the extension may POST the same key more than once).

## Endpoints

All under `/api/extension/*`, same **bearer-token auth** as every existing extension route (`Authorization: Bearer <token>`; missing/invalid → `401 { success:false, error:"Missing or invalid Authorization header" }`). The `user_id` is the authenticated caller — never trust a user id from the body.

### 1. `POST /api/extension/notifications/seen`

Mark one or more notifications as seen by the calling user. Best-effort, idempotent.

Request:
```json
{ "keys": ["cert_signed:8123", "query_signed:5520", "report_24h:2026-06-02"] }
```

Success — `200`:
```json
{ "success": true, "marked": 3 }
```

Notes:
- Upsert each key with `ON CONFLICT (user_id, notification_key) DO NOTHING`.
- Ignore/skip malformed keys rather than failing the whole batch (return `marked` = count actually inserted-or-already-present).
- Empty `keys` → `200 { success:true, marked:0 }`.
- Errors use the standard `{ success:false, error }` shape (`400` bad body, `401` auth).

### 2. Augment the two existing "recently signed" payloads with a per-user `seenByMe` flag

The extension already fetches these; we just need two extra fields so it can render per-item red dots and compute the badge.

**a) Recently-signed certifications** — wherever signed certs are returned to the extension (the `status=signed` certifications list and/or the cert dashboard's recently-signed set). For each cert that qualifies as "recently signed" (see recency window), add:
- `signedAt` (ISO timestamp) — if not already present
- `seenByMe` (boolean) — `true` iff a `cert_signed:{cert.id}` seen-row exists for the caller

**b) Recently-signed diagnosis queries** — the `recentlySigned[]` array already returned by the MDS/queries dashboard. For each, add:
- `seenByMe` (boolean) — `true` iff `query_signed:{query.id}` seen-row exists for the caller

### 3. 24-hour report — expose today's-report "seen" state

Wherever the extension fetches the 24h report (or its availability), include for the current report date:
- `reportDate` (`YYYY-MM-DD`, facility-local) — if not already present
- `seenByMe` (boolean) — `true` iff `report_24h:{reportDate}` seen-row exists for the caller

### 4. (Optional but nice) `GET /api/extension/notifications/summary`

If you'd rather the extension not assemble the count itself, return the aggregate:
```json
{
  "success": true,
  "actionCount": 6,            // certs overdue+due + queries needing signature
  "fyiUnseenCount": 4,         // unseen signed certs + unseen signed queries + (today's report unseen ? 1 : 0)
  "report24hUnseen": true
}
```
If you skip this, the extension will compute `fyiUnseenCount` from the `seenByMe` flags in (2) and (3). Either is fine — your call.

## Recency window

"Recently signed" (the set eligible to show a red dot) = **signed within the last 7 days**. Combined with sticky seen-state, an item shows a dot until either the nurse opens the relevant tab (marks it seen) or it ages past 7 days. Keep the window configurable if easy; 7 days is the target.

## How the extension will use this (consumer context)

- **Badge** on the "S" = `actionCount + fyiUnseenCount` (one red number).
- **Opening the Certs tab** → the extension POSTs `seen` for every currently-unseen recently-signed cert key at once (per-tab clear), optimistically drops the badge, then relies on `seenByMe` on the next fetch.
- **Opening the Queries tab** → same for `query_signed:*`.
- **Opening the 24h report** → POSTs `report_24h:{date}`.
- All POSTs are best-effort; the extension never blocks UI on them and swallows errors. So: idempotency matters, latency doesn't.

## Verification checklist

- [ ] `POST /notifications/seen` with 3 keys creates ≤3 rows; calling it again creates 0 new rows and still returns `200`.
- [ ] A signed cert the caller hasn't seen returns `seenByMe:false`; after a `seen` POST for its key, the same endpoint returns `seenByMe:true` for that caller — and still `false` for a different user.
- [ ] Query `recentlySigned[]` items carry `seenByMe`.
- [ ] Today's 24h report returns `seenByMe`; tomorrow's report (new `reportDate`) returns `seenByMe:false` even though today's was seen.
- [ ] Certs/queries signed >7 days ago drop out of the "recently signed" set regardless of seen-state.
- [ ] All routes reject missing/invalid bearer token with `401`.

When this is live, ping me and I'll wire the extension: FAB badge math, per-item red dots, per-tab mark-seen, and the 24h-report viewed call.
