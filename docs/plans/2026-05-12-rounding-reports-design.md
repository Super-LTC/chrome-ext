# Rounding Reports — Chrome Extension Design

**Date:** 2026-05-12
**Status:** Approved, ready to implement
**Backend:** Already shipped on `Superjonathan123/sun-valley` — endpoints at `/api/extension/compliance/rounding-reports[...]`

## Goal

Surface the SuperLTC "rounding reports" (care-plan physical-check sessions) inside the extension. Feature parity with the web app for **list / start / view results / QR-link** — but **not** check-marking. Checks happen on the nurse's phone via QR-scanned mobile flow; the extension is a manager, not a check-off UI.

## Placement

**New top-level tab "Rounding"** inside the MDS Command Center, peer to the existing Compliance tab.

Why MDS-CC and not a standalone FAB:
- MDS-CC is already the facility-ops hub (Assessments, Queries, Certs, Compliance)
- Compliance tab already renders facility-level care-plan coverage — Rounding is the same conceptual domain (facility care-plan execution)
- Avoids cluttering the FAB
- The "CP" FAB stays as-is: patient-level care-plan coverage only

**Rejected alternative:** nesting Rounding inside the Compliance tab. The two have different audiences (floor nurse vs coordinator), different actions (start round + QR vs review coverage gaps), and different state. Compliance tab is already 627 lines — bolting on sessions/QR would mix mental models. A peer tab is cleaner.

## Tab order changes

**Before:** `Planner | Assessments | Queries | Certs | Compliance`
**After:** `Assessments | Queries | Certs | Compliance | Rounding | Planner`

- Default landing tab changes from `'planner'` to `'assessments'`
- Planner moves to the last position
- Planner is conditionally mounted today (`{activeView === 'planner' && <MdsPlanner />}`), so demoting it from default = no more slow auto-loads blocking other tabs
- Planner stays accessible (not deleted) — just not the landing experience

## File structure

```
content/modules/rounding-reports/
  RoundingReports.jsx          # tab container, owns view = 'list' | 'detail'
  components/
    SessionList.jsx            # recent sessions, "Start round" button, empty state
    SessionDetail.jsx          # header, Skilled/Long-term groups, checks, history dots
    QRPopover.jsx              # QR modal, copy-link, refresh, expires-in-30
    StatusBadge.jsx            # ✓/✗/—/⏳ icon mapping (reusable)
  hooks/
    useRoundingReports.js      # list + start (list screen)
    useRoundingSession.js      # detail + QR mint (detail screen)
  api/
    rounding-api.js            # vanilla fetch wrapper, mirrors compliance/dashboard
```

## Sub-view routing

Local `useState` inside `RoundingReports.jsx`:
```js
const [view, setView] = useState({ kind: 'list' });
// or { kind: 'detail', sessionId }
```

- Back button in detail header → `setView({ kind: 'list' })`
- After "Start round" → `setView({ kind: 'detail', sessionId })` and auto-open QR popover
- Returning to list refreshes session list

No router needed.

## API client

`content/modules/rounding-reports/api/rounding-api.js` — vanilla JS, mirrors the pattern used by `compliance/dashboard` calls in the existing codebase. Single `callRoundingReports(path, opts)` helper:

- Resolves `facilityName` via `getChatFacilityInfo()` and `orgSlug` via `getOrg()` (same as Coverage panel does today)
- Sends bearer token (existing token resolution)
- All requests include `facilityName` + `orgSlug` (query for GETs, body for POSTs)
- Throws on `{ success: false }` with the server's error message; UI catches and renders inline banner / toast

Endpoints used:
- `GET /api/extension/compliance/rounding-reports` — list
- `POST /api/extension/compliance/rounding-reports` — start
- `GET /api/extension/compliance/rounding-reports/[id]` — detail
- `POST /api/extension/compliance/rounding-reports/[id]/qr-link` — QR token

## QR rendering

Add `qrcode@^1` to `package.json` (~50 KB). Use `QRCode.toCanvas(canvasEl, url, { width: 200 })` inside `QRPopover.jsx`. Falls back to displaying the raw URL if generation fails.

## Module gating (compliance disabled)

If the list endpoint returns 403, render an inline banner inside the Rounding tab:

> **Compliance module isn't enabled for this facility.** Contact your admin to enable rounding reports.

No FAB or tab hiding — the tab itself shows the banner. Matches the handoff's recommended UX.

## v1 scope

**In:**
- List sessions (in-progress + completed, newest first)
- Start a new session (confirm sheet → auto-open detail + QR)
- Detail view: per-patient grouping (Skilled / Long-term), status badges, history dots (last 5 sessions), notes & hint text
- QR popover: 200×200 QR, copy-link, "Expires in 30 min", refresh button

**Out (v1.x or never):**
- Check-marking inside the extension (nurses do on phone)
- Photo upload
- Snooze / un-snooze interventions
- Deleting sessions
- SMS/email the link (backend route is session-auth only today)
- Dismissed-items report

## Status icon legend (matches web)

| Status | Icon | Color |
|--------|------|-------|
| present | ✓ | green |
| not_present | ✗ | red |
| not_applicable | — | slate |
| pending | ⏳ | amber |

History dot row: 5 colored dots oldest→newest using same palette.

## Mockup reference

See handoff §4 for ASCII mockups of the three screens (List, Detail, QR popover). Build to those visuals.

## Out of scope for this PR

- CP FAB changes (stays patient-only as today)
- Shield dot indicators on PCC pages (unchanged)
- Web-app rounding feature parity beyond v1 (no check-marking)

## Implementation order

1. `rounding-api.js` + types
2. Hooks (`useRoundingReports`, `useRoundingSession`)
3. `StatusBadge.jsx`
4. `SessionList.jsx` + empty/error states
5. `SessionDetail.jsx` (patient groups, history dots)
6. `QRPopover.jsx` (with `qrcode` dep)
7. `RoundingReports.jsx` container wiring
8. Add Rounding tab to `CommandCenterHeader.jsx`, mount in `MDSCommandCenter.jsx`
9. Demote Planner: default tab → assessments, reorder tab buttons
10. `npm run build` + manual smoke in chrome://extensions

## Backend questions

None — handoff spec is complete.
