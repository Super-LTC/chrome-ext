# MDS Command Center — Notification System Design

**Date:** 2026-06-02
**Goal:** Turn the floating "S" button into a real notification hub that pulls nurses into a daily habit of opening it. One combined red count; recently-signed items clear when the tab is opened; the fresh 24h report clears when viewed.

---

## 1. Notification taxonomy — two classes, one badge

| Class | Examples | Clears when… | Resets |
|-------|----------|--------------|--------|
| **Action** (do-it) | certs overdue / due-soon, queries needing signature | the work is done (signed / sent) | n/a — driven by live status |
| **FYI** (see-it) | recently-signed certs, recently-signed queries, fresh 24h report | the user **views** it | signed items: sticky (age out by recency window). 24h report: daily (new report each day) |

Both classes sum into **one red count on the "S"** (decision: combined count).
`badgeCount = actionCount + fyiUnseenCount`.

The elegant part: "unseen" is a single uniform check server-side — *"is there a seen-row for (user, notificationKey)?"* The daily reset for the 24h report falls out for free because its key embeds the date (`report_24h:2026-06-02`), so tomorrow's report is a brand-new key. Signed-item keys (`cert_signed:{id}`) are sticky — once seen, gone — and the 7-day recency window ages them out.

---

## 2. Frontend plan

### A. Cert list "due soonest" sort — ✅ DONE (2026-06-02)
`CertsView.jsx` stayGroups sort now orders actionable sub-tabs by each group's most-urgent cert (`getCertSortKey` min) first, newest-admit as tiebreaker. Signed tab keeps newest-first. No backend needed.

### B. Notification aggregation
Single source of truth for the badge number. Two options:
- **(Recommended) Client-computed** from already-fetched dashboards + new `seenByMe` flags. No new GET endpoint; reuses `useCertDashboard` / `useCommandCenter`.
- Server-computed `GET /notifications/summary` if we'd rather not duplicate the count logic client-side.

`fyiUnseenCount = (recently-signed certs where !seenByMe) + (recently-signed queries where !seenByMe) + (today's 24h report unseen ? 1 : 0)`

### C. The "S" FAB badge (`content/super-menu/fab.js`, vanilla)
- Extend `updateMDSBadge()` (currently `FacilityDashboardState.getTotalActionable() + certDash.pending + certDash.overdue`) to **add `fyiUnseenCount`**.
- Refresh triggers: FAB create (today), **+ on Command Center close**, **+ after any mark-seen** (optimistic), **+ a light poll** when the PCC tab regains focus.
- Cache the last-known `fyiUnseenCount` + seen-keys in `chrome.storage.local` so the badge is correct immediately on page nav within the day (don't flash stale counts).

### D. Tab badges + per-item red marks
- **Certs tab** (`CommandCenterHeader.jsx` + `CertsView.jsx`):
  - Add a red dot on the **Signed** sub-tab label = count of unseen recently-signed certs.
  - Per-row red dot on each unseen signed cert in the Signed list (`CertListRow.jsx`).
  - **Opening the Certs tab marks all currently-unseen signed certs as seen** (decision: per-tab clear) → fire mark-seen, fade dots, decrement badge.
- **Queries tab** (`MDSCommandCenter.jsx` QueriesView):
  - Red dot on the "Recently Signed" group header = count unseen.
  - Per-card red dot; **opening the Queries tab clears them all**.
- **24h report** (`fab.js` 24hr launcher + `TwentyFourHourReport.jsx`):
  - Red dot on the 24h entry point when today's report is unseen.
  - **Opening the report → mark `report_24h:{date}` seen**, dot clears, badge decrements.

### E. Mark-seen wiring + optimistic updates
- A tiny `notifications-api.js` client: `markSeen(keys[])` → `POST /api/extension/notifications/seen`.
- On the clearing interactions above: **optimistically** zero the local unseen counts + update the FAB badge instantly, persist seen-keys to `chrome.storage.local`, then fire the POST (best-effort; errors swallowed — never block UI).
- Reconcile on next dashboard fetch (server `seenByMe` becomes the source of truth).

### F. Analytics
- `notification_badge_shown` (count, breakdown), `notification_tab_opened` (which, n_cleared), `notification_report_opened`. Lets us measure whether the badge actually drives clicks.

---

## 3. Backend plan (hand to backend agent)

### Data model
Table `extension_notification_views`:
| col | type | notes |
|-----|------|-------|
| user_id | fk | the nurse |
| org_id / facility_id | fk | scope |
| notification_key | text | `cert_signed:{certId}` \| `query_signed:{queryId}` \| `report_24h:{YYYY-MM-DD}` |
| seen_date | date | facility-local date seen (audit / housekeeping) |
| created_at | timestamptz | |

Unique `(user_id, notification_key)`. "Unseen" = no row for (user, key). Daily reset for the report is via the date-in-key, so no per-day query logic needed.

### Endpoints
1. **`POST /api/extension/notifications/seen`** — body `{ keys: string[] }`. Upsert seen rows for the caller (ON CONFLICT DO NOTHING). Returns `{ success: true }`. Idempotent, best-effort.
2. **Augment existing dashboard payloads** (no new GET if we client-compute):
   - Recently-signed **certs** (the `status: 'signed'` list / cert dashboard): add `signedAt` (if missing) and **`seenByMe: boolean`**.
   - **Queries** dashboard `recentlySigned[]`: add **`seenByMe: boolean`**.
   - Optionally add a `notifications: { actionCount, fyiUnseenCount, report24hUnseen }` block so the FAB can read one number without assembling it.
3. **(Optional) `GET /api/extension/notifications/summary`** — returns the aggregate counts if we prefer server-computed badge.

### Recency window
- "Recently signed" = signed within **last 7 days**. Combined with sticky seen-state, an item shows a dot until either (a) the nurse opens the tab, or (b) it ages past 7 days.

### Auth
Same bearer-token `/api/extension/*` pattern as every other extension route.

---

## 4. Suggested sequencing
1. ✅ Cert "due soonest" sort (shipped — no backend).
2. Backend: `notification_views` table + `POST /seen` + `seenByMe`/`signedAt` on the two dashboards.
3. Frontend: notification aggregation → FAB badge → tab dots → mark-seen wiring → optimistic cache.
4. 24h report red dot + viewed logging.

Items 2–4 ship together as one feature (the badge is meaningless until mark-seen exists).
