# Discharged Cert View — Design

**Date:** 2026-06-07
**Backend handoff:** `Superjonathan123/med-a-discharge-route` (`206a36db6`, `6eadc4ac3`)
**Status:** Approved, ready for implementation

## Goal

Add a **"Discharged"** sub-tab to the certifications view (`CertsView.jsx`) backed by the
new paginated endpoint `GET /api/extension/certifications/discharged`. The tab is the
complete archive of ended Part A stays (newest-discharge-first); outstanding certs on
discharged patients remain fully actionable.

No backend changes. The main cert list already auto-hides long-discharged, fully-signed
patients and pins discharged patients with outstanding certs — the extension needs no
change for that behavior.

## Decisions

- **Placement:** new 6th sub-tab in `CertsView` (alongside Action Needed / Awaiting /
  Overdue / Due Soon / Signed).
- **Rendering:** reuse `StayGroupCard` + `CertListRow` via an adapter; outstanding certs
  (pending/sent/delayed) keep send/sign/skip/revoke actions, signed/skipped stay read-only.
- **Pagination:** explicit "Load more" button (page size 10, append while `hasMore`).
- **Adapter, not backend reshape:** keep the change extension-only.

## Data flow

New method in `content/modules/certifications/cert-api.js`:

```js
async fetchDischarged(facilityName, orgSlug, { limit = 10, offset = 0 } = {}) {
  const params = new URLSearchParams({ facilityName, orgSlug, limit, offset });
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: `/api/extension/certifications/discharged?${params}`,
    options: { method: 'GET' }
  });
  if (!response.success) throw new Error(response.error || 'Failed to fetch discharged');
  return response.data; // { discharged, hasMore, limit, offset }
}
```

Reuses the existing background `API_REQUEST` → `apiRequest()` Bearer-token path.

State in `CertsView`, separate from the shared `certifications` array:
- `dischargedPages`, `dischargedOffset`, `dischargedHasMore`, `dischargedLoading`, `dischargedError`
- Fetch page 1 **lazily** the first time the tab is opened (not on mount).
- "Load more" → `offset += limit`, append while `hasMore`.
- After an action on a discharged cert, refetch the discharged pages (offset 0 → current
  length) rather than `refetchAll()`.

## Response shape (from handoff)

```jsonc
{
  "success": true,
  "discharged": [{
    "stayId", "patientId", "patientName",
    "patientExternalId",            // PCC deep-link
    "partAStartDate", "endDate",    // endDate = discharge date, sort key desc
    "payerType",                    // 'medicare_a' | 'managed_care'
    "outstandingCount",             // certs still pending/sent/delayed
    "certs": [{ "id","stayId","type","status","dueDate","sequenceNumber","signedAt" }]
  }],
  "hasMore", "limit", "offset"
}
```

## Adapter

Map each `discharged[]` entry → the stay-grouped shape `StayGroupCard`/`CertListRow`
consume. Confirm exact target field names by reading those two components first. Mappings:
patient name + external id, `partAStartDate`/`endDate` → start/discharge dates, `payerType`
→ MA/Managed badge, each cert pass-through (absent fields left undefined — rows guard
optional send-history / signed-by).

Discharged-specific card touches (added as optional props so active tabs are unchanged):
- "Discharged {endDate}" header line.
- Red "{outstandingCount} cert still due" badge when `outstandingCount > 0`.

## Tab / states

- `SUB_TABS` gains `{ id: 'discharged', label: 'Discharged' }`; `activeSubTab === 'discharged'`
  renders the discharged branch with its own pages + "Load more".
- **Count badge:** omit until page 1 loads; then optionally show summed `outstandingCount`
  (the actionable subset), not a grand total.
- **Loading / empty / error:** match existing view patterns; "Load more" failure keeps
  loaded pages visible.

## Analytics (must add to `analytics-schema.js` allowlist or events drop silently)

- `cert_discharged_tab_opened` → `{ source }`
- `cert_discharged_load_more` → `{ page }` (bucketed index; categorical, no PHI)

Existing `cert_clicked` / `cert_view_document` work unchanged on discharged rows.

## Non-goals / notes

- A pinned outstanding patient appears in both the main list and Discharged by design —
  no dedupe.
- Optional main-list "Discharged {stayEndDate} — cert still due" badge using the new
  `stayStatus`/`stayEndDate` cert fields is **out of scope** for v1 (YAGNI).
