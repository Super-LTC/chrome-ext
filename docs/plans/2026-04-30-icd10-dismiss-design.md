# ICD-10 Dismiss — Chrome Extension Design

**Status:** Design complete, ready to implement
**Date:** 2026-04-30
**Branch (backend):** `Superjonathan123/icd10-dismiss`
**Backend handoff:** see `core/services/icd10-dismissal.service.ts` and `web/app/api/extension/icd10-annotations/{dismiss,undismiss}/route.ts`

## Summary

Let nurses hide ICD-10 code suggestions they don't want to see for the current admission. Dismissed codes collapse into a single "Hidden" section at the bottom of the sidebar with per-row Undo. Server is source of truth; auto-clears on readmission via the existing backend behavior.

## Decisions

- **Trigger surfaces:** both — hover-`×` on each sidebar row, plus a "Hide for this stay" button in the evidence panel header.
- **Reason picker:** none in v1. Single click dismisses.
- **Hidden grouping:** one global "Hidden" collapsible at the bottom of the sidebar, not per-bucket.
- **Source of truth:** server `bucket.dismissed` field; client uses optimistic overrides only during the in-flight window.
- **Tooltip copy:** *"Hide for this stay. Will return on readmission."*

## Data flow

1. User clicks `×` (sidebar row) or "Hide for this stay" (evidence panel).
2. Sidebar stamps `optimisticOverrides[groupKey] = { dismissed: true }` and re-renders. Row animates from its bucket into the Hidden collapse.
3. Viewer calls `ICD10API.dismissGroup({ patientId, facilityName, orgSlug, groupKey })`.
4. On success: viewer kicks off the v2 summary refetch. Sidebar clears matching optimistic overrides as server state arrives.
5. On failure: rollback the override, toast the error.

Undo is the inverse path via `undismissGroup`.

`groupKey` is passed verbatim from `bucket.group` — never transformed.

## API wiring (`content/icd10-viewer/icd10-api.js`)

Two thin methods, same auth path as the existing v2 read:

```js
async dismissGroup({ patientId, facilityName, orgSlug, groupKey }) { ... }
async undismissGroup({ patientId, facilityName, orgSlug, groupKey }) { ... }
```

Both POST JSON, bearer token from `getExtensionToken()`, error handling matching `getGroupedSummaryByPatientId`.

## State (`content/modules/icd10-sidebar/Sidebar.jsx`)

```js
const [optimisticOverrides, setOptimisticOverrides] = useState({});
// shape: { [groupKey]: { dismissed: true | false } }
```

`buildSections` reads `bucket.dismissed` for each row, then merges with the override (`overrides[groupKey]?.dismissed ?? bucket.dismissed`). Rows with merged `dismissed === true` are pulled out of their original sections and aggregated into `sections.hidden`, preserving each row's `origin` so the Hidden row can show a small chip ("from Top picks", "from Other", etc.).

New props: `onDismiss(groupKey)` and `onUndismiss(groupKey)`.

## UI

### Sidebar row × control
- Absolute-positioned at right edge of `.icd10-sb__row`, hidden by default, fades in on row hover (120ms).
- 16×16 hit target, neutral grey, red-tinted on hover.
- `stopPropagation()` so it doesn't trigger row-select.
- Tooltip: *"Hide for this stay. Will return on readmission."*

### Evidence panel "Hide for this stay" button
- In the panel header next to existing approve/stage controls.
- Eye-off icon + label.
- After click, panel auto-selects the next visible row so the user isn't stranded.

### Hidden collapse (bottom of sidebar)
- Renders only if hidden count > 0.
- Reuses `CollapsibleHeader` with a new `--hidden` variant: muted, eye-off icon.
- Body rows dimmed (~60% opacity) + strikethrough on the description.
- On row hover: brightens, "Undo" link appears at the right edge (replacing the × slot).

### Motion
- CSS-only slide animation: row exits its bucket via `slide-out-right` + height collapse (~220ms ease-out), reappears in Hidden via `slide-in-right`. Undo runs the inverse.
- Trigger: a transient class (`icd10-sb__row--leaving` / `--entering`) toggled around the state change.
- `prefers-reduced-motion` → fade only.

## File changes (~250–350 lines net)

1. **`content/icd10-viewer/icd10-api.js`** — `dismissGroup`, `undismissGroup`.
2. **`content/modules/icd10-sidebar/Sidebar.jsx`** — read `dismissed`, optimistic overrides, partition into visible/hidden, render Hidden section, × button on rows.
3. **`content/icd10-viewer/icd10-sidebar.js`** (vanilla shim) — thread `onDismiss` / `onUndismiss` to the Preact mount.
4. **`content/icd10-viewer/icd10-viewer.js`** — implement the callbacks: call API, toast on error, refetch v2 on success, clear matching overrides.
5. **`content/icd10-viewer/icd10-evidence-panel.js`** — "Hide for this stay" button calling the viewer's dismiss handler with the selected group's `groupKey`.
6. **`content/css/icd10-viewer.css`** — × button, Hidden variant, slide keyframes, reduced-motion fallback.

No new deps. Stays within the hybrid vanilla + Preact architecture (`CLAUDE.md`).

## Edge cases

- **No `admissionDate` (500).** Catch the specific message, toast *"Can't hide — patient has no admission on file"*, suppress × controls for the remainder of the session (cache the failure).
- **403.** Toast *"You don't have access to hide codes for this patient"*, rollback the override.
- **Duplicate clicks.** Disable × for ~500ms after click per row; backend is idempotent regardless.
- **Approved + dismissed.** Rare but legal — render only in Hidden, never in Approved bucket.

## Analytics

`icd10_code_dismissed` and `icd10_code_undismissed`, payload `{ code, origin }` only. ICD-10 codes are reference data, not PHI — matches the existing `icd10_code_clicked` pattern.

## Out of scope (v1)

- Reason picker.
- Per-bucket Hidden subsections.
- Bulk dismiss / select-all.
- Keyboard shortcut.
- Cross-stay "what did I hide last admission" history view.
- Persisting optimistic state across viewer reopens (component state is fine; server stamp arrives on next fetch).

## Manual test plan

- Dismiss from sidebar × → row slides into Hidden.
- Dismiss from evidence panel button → next row auto-selects.
- Reload extension → still hidden (server-persisted).
- Undo from Hidden → slides back into original bucket.
- Patient with no `admissionDate` → graceful toast, × disabled rest of session.
- 403 path (restricted user) → rollback works, toast shown.
- `prefers-reduced-motion` enabled → fade only, no slide.
