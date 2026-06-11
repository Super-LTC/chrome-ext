# Managed Care Panel — Extension Design (v1)

**Date:** 2026-06-11
**Backend:** `Superjonathan123/ext-recert-generate` (23 commits, unpushed). Contracts: `.context/chrome-ext-recert-handoff.md`
**Status:** Design validated in conversation; backend questions all settled.

## What this is

The extension side of recertification ("clinical update") generation. Nurses trigger
packet generation from PCC, track runs centrally, and open finished packets via a
30-min scoped view-link on the dashboard. The extension never renders PHI packets.

This panel is the **seed of the Managed Care module** — the tracker, carve-outs, and
alerts land inside it later as tabs. The chrome built now (header button + FAB action
+ panel shell) does not change when those arrive.

## Naming decisions (settled)

- **"Managed Care"**, not "Records"/"Packets"/"Doc Requests". ADR document pulls were
  considered and **deliberately dropped from this design** — no backend, no timeline.
  When ADR arrives it becomes a tab in this panel or its own button; nothing here
  blocks either.
- v1 ships one flow: **New Clinical Update** (the recert wizard).

## Two doors, one panel

One panel component, one prop (`patientId` or not).

### Door 1 — Patient header button ("Managed Care")

- Injected into PCC's resident header `.rh-icon-buttons` group (next to print/kebab —
  the markup in the new PCC header). Needs a tolerant injector: header has
  compact/standard/expanded variants and older facilities may differ. Precedent:
  `content/super-menu/meddiag-augment.js`.
- **Gated per-facility** via `GET /recertifications/module-status?facilityName=&orgSlug=`
  (same model as the F-Tag FAB gate in `fab.js`).
- Opens the panel **scoped to this patient**:
  - "New Clinical Update" → wizard, prefilled from `form-data.managedCareStay`
    (payer, auth window, requested days).
  - Below: this patient's run history — recent first, older paged (`limit`/`offset`).
    History is **unified**: dashboard-created runs appear too (confirmed, same table).
- Badge on the button: in-flight spinner-dot / count of completed-unseen runs for
  this patient.

### Door 2 — FAB action ("MC", permanent)

- New action in the speed dial (`content/super-menu/fab.js`). Permanent, not
  transient — this is a destination/workspace, not a notification chip.
- Opens the same panel **unscoped**: all runs, grouped **Today / Yesterday / Earlier**
  (client-side off `createdAt` — no server date filter by design).
- Default filter: **my runs** (`mine=true`). Toggle to show everyone's
  (`createdByName` shown on rows in that mode).
- Badge on the MC action (bubbled to the S button's existing badge) while anything
  is in flight or completed-unseen — **counts across all locations regardless of the
  location toggle**.

## Location toggle (central view)

- **"This location: <name>"** (default; `facilityName=` from PCC chrome) ⇄
  **"All locations"** (omit the param → all locations the user can access).
  Persist the choice.
- In All-locations mode, rows get a facility chip; hidden in single-location mode.
- Row's primary action ("Open on dashboard →") is facility-agnostic — view-link
  opens superltc.com, no PCC location flip needed. An "open patient in PCC" row
  affordance (requires the ESOL location-flip request) is **v1.1**.

## Run rows

| Status | Row treatment |
|---|---|
| `completed` | **"Open on dashboard →"** — mint view-link **on click** (never pre-mint), open in new tab |
| in-progress (`pending`/`fetching_documents`/`extracting`/`all_documents_extracted`/`generating_defense`) | spinner + status label |
| in-progress AND `updatedAt` > **30 min** ago | **"Taking longer than expected (started Xm ago)"** — required client-side: no server stall-sweep exists; a crashed Lambda leaves the run in-progress forever. Offer Archive + start-new. |
| `failed` | `errorMessage` (now on list rows directly) + **Retry** + **Archive** |

**Retry = re-create + archive** (settled — retry-in-place deliberately disabled
server-side because a late-stage re-fire would hang):
1. Read the failed run's stored config off the record.
2. `POST /recertifications` with the same config → `POST {id}/generate`.
3. `POST {failedId}/archive` so the dead row drops out of the default list.

Do **not** design UI around retry-in-place; it's a tracked backend fast-follow.

## Polling & badge model

- Kicked-off run IDs persist in `chrome.storage.local` (survives PCC navigation).
- While any tracked run is in-flight, the active page's content script polls
  `GET /recertifications?mine=true` (~10s) — one list call covers the whole batch;
  per-id polling (~5s) only while the panel is open on a specific run.
- Terminal transition (completed/failed) → toast ("Barr's clinical update is ready —
  Open on dashboard →") + badge update. The **tray is the durable answer; the toast
  is a bonus.**
- "Unseen" is client-side: completed-run IDs stay badged until the panel showing
  them is opened; state in `chrome.storage.local`.

## Wizard (3 steps, from form-data)

1. **Payer/auth** — prefilled from `managedCareStay`; `payerTypeOptions` /
   `authorizationTypeOptions` as real selects (dashboard doesn't have these; we can).
2. **Documents** — `documentTypeGroups` + display names; per-type range overrides.
3. **Review & generate** — `create` then immediately `generate` (create does not
   auto-start).

**Presets:** picking one fills the whole wizard; resolve `relativeDateWindow` tokens
client-side (`-Nd` = N days before today, `today` = today). "Save as preset" → saves
**personal** scope (`POST /recertifications/presets`); org presets are
admin/dashboard-managed. `form-data.presets` returns both, with `scope`.

`form-data` keys off `patientId` only — don't pass `facilityName` (confirmed no-op).

## Identifiers

- Patient: PCC external client id (e.g. `1718185` from the resident header) →
  `patientId` on list/form-data, `externalPatientId` on create.
- Facility: PCC facility name string → `facilityName` (server resolves, tolerates
  PCC suffix). Never pre-resolve internal `locationId` client-side.
- Bad `facilityName`/`patientId` on list → empty list, not an error. On create → 404.

## Deferred / out of scope (v1)

- ADR document pulls (no backend) — naming/layout already accommodates it.
- Patient picker to start a run from the central view (v1.1; start is header-only).
- "Open patient in PCC" cross-facility row link (needs ESOL location flip).
- Upload-to-PCC (backend placeholder exists on the view page).
- Backend fast-follows tracked on Jonathan's side: (i) verified retry-in-place,
  (ii) recert stall-sweep cron. Both additive; no UI redesign when they land.

## Build notes

- Complex/stateful → **Preact module** per CLAUDE.md: `content/modules/managed-care/`
  (panel, tray rows, wizard), launcher pattern like `QMBoardLauncher`.
- New `track()` events need `EVENT_SCHEMA` allowlist entries (silent-drop gotcha).
- Module gating + header injection both keyed off the facility name read from PCC
  chrome (`#pccFacLink` timing caveat — see fab.js retry pattern).
- Test on stage `jonathan`; the test facility must have the `recertifications`
  module enabled or create/generate 403s.
