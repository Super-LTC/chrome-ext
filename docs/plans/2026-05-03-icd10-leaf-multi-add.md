# ICD-10 Leaf Multi-Add (chrome-ext)

**Status:** Stage 1 in progress
**Branch:** `icd10-leaf-multi-add`

## Decisions (locked)

1. **Explicit add only.** Clicking a sidebar group never auto-stages a leaf. User must click `[+ Add]` per leaf.
2. **Ephemeral staging.** No persistence. Reload = staged set cleared. Matches current single-code unapproved behavior.
3. **Approved leaves render with `×` undo.** Mirrors existing `unapprove` pill, applied per-leaf. (Verified: `pcc-client.submitBatch` already exists; `onUnapprove` is wired in evidence panel line 1032.)
4. **Counter denominator: leaves with evidence.** Provisional. Easy to swap to "all API leaves" if it tests poorly.

## Key infra already built (don't rebuild)

- `pcc-client.submitBatch(stagedCodes, clientId, onsetDate, rankId, onProgress)` — parallel writes with progress callback (lines 244-288). Stage 3 is "call this with N codes" not "build batching."
- `onApprove` / `onUnapprove` callbacks already plumbed from evidence panel up through `icd10-viewer.js`. Per-leaf calls reuse the same callbacks.
- Sidebar `stagedBaseCodes` / `approvedBaseCodes` props already exist; no Sidebar changes needed.

**Driver:** Ricky asked for (1) NTA codes at top of list; (2) ability to add multiple Z99 codes (vent + dialysis). Web prototype already solved both via leaf-level multi-add. This plan ports that to the ext.

---

## Goal

Replace the evidence panel's single-select leaf dropdown with a leaf list where each leaf has its own `[+ Add]` button, so the user can stage multiple leaves under the same base group (Z99.11 + Z99.2) before writing to PCC.

Out of scope for this plan (separate, smaller follow-ups):
- Sidebar NTA/SLP/Other re-sectioning (Ricky #1) — tracked separately
- Top Picks `#` rank label removal — cosmetic, defer until web ships Option A
- Null `pdpmCategory` badge fallback — separate one-liner

## Non-goals

- Migrating the entire evidence panel to Preact in one shot. The panel is 1,188 lines of vanilla. We touch only the leaf-picker region + add/staging state. Rest stays vanilla.
- Changing the API. Server endpoints stay; we batch-write at the existing approve/diag-add endpoint.

---

## Current state (verified)

- `content/icd10-viewer/icd10-evidence-panel.js`
  - `selectedCode` (singular) drives header + evidence list
  - Lines 477-530 render a single-select dropdown of leaf codes
  - Line 979 `_selectCode()` switches `selectedCode`, does not stage
  - Approve action on line 1002+ writes the single `selectedCode` to PCC
- `content/modules/icd10-sidebar/Sidebar.jsx` — base-code rows. Sidebar is fine; no changes for this plan.
- `content/icd10-viewer/pcc-client.js` — write path; already supports per-code write, just needs to be called N times (or batched).

## Target UX (mock)

```
┌─ Z99 · Dependence on enabling machines ──────── 1/4 added ─┐
│                                                            │
│  ✓ Z99.11  Dependence on respirator    NTA +2   ✓ Added  × │
│    Z99.2   Dependence on renal dialysis NTA +2   [+ Add]   │
│    Z99.81  Dependence on supplemental oxygen     [+ Add]   │
│    Z99.89  Dependence on other enabling machines [+ Add]   │
│                                                            │
│  Evidence (12 mentions across 4 documents)…                │
└────────────────────────────────────────────────────────────┘
```

Key behavior:
- Each leaf row has its own `[+ Add]` / `✓ Added (×)` button
- "Added" = staged in this session, ready to write
- Header shows `N/M added` counter, never collapses or hides on add
- Evidence list filters to whichever leaf is *focused* (click to focus, separate from add). Default focus = first leaf with mentions.

## Plan revision after code audit

The original 4-stage plan collapses. Discovery: the ext already has session-staging infrastructure end-to-end:
- `icd10-viewer.js:28` — `this.stagedCodes` array
- `icd10-viewer.js:619` — `_handleApprove` stages locally, no API call
- `icd10-viewer.js:684` — `_handleUnstage` undoes
- `icd10-viewer.js:944` — "Push N Codes to PCC" button calls `pcc-client.submitBatch`

What's missing is just the **per-leaf affordance**. So this is one stage.

### Single stage — per-leaf Add buttons

1. Add `stagedLeafCodes: Set<string>` state to the evidence panel + a `setStagedLeafCodes(set)` method called by the viewer whenever its `stagedCodes` changes.
2. In `_renderDiagnosisHeader`:
   - Replace the dropdown (lines 477-530) with an always-visible leaf list under the diagnosis header.
   - Each leaf row: code · desc · pdpm badge · `[+ Add]` / `✓ Added (×)` button.
   - Click row body (not button) → focus that leaf (existing `_selectCode` behavior drives evidence highlight).
   - Header counter: `N/M added`.
   - Remove the top-level `Add` / `Added` button — per-leaf buttons replace it.
3. Refactor `_handleApprove` / `_handleUnapprove` to take `(leafCode, leafDescription)` args; build the approveItem from `this.items[0]` (existing pattern preserves annotationId-borrow behavior).
4. Update viewer to call `ICD10EvidencePanel.setStagedLeafCodes(...)` in `_handleApprove` and `_handleUnstage`.
5. CSS for the leaf list (modify `content/css/icd10-viewer.css` — same file as existing `code-option` styles).

**Files touched:**
- `content/icd10-viewer/icd10-evidence-panel.js` (render block, handlers, state)
- `content/icd10-viewer/icd10-viewer.js` (call setStagedLeafCodes after stage/unstage)
- `content/css/icd10-viewer.css` (leaf-list styles)

**Estimated diff:** ~150 lines net change.

## Open questions (need your call before Stage 2)

1. **Auto-add behavior:** when user clicks a base group in the sidebar, should *any* leaf auto-stage, or do they always have to click `[+ Add]` explicitly? Web went explicit. Recommend same.
2. **Persistence:** does staged state survive a patient re-load mid-session, or is it always ephemeral until written? Web is ephemeral. Recommend same — keeps the model simple.
3. **Approved leaves from prior sessions:** show as `✓ Approved` (read-only) row, or hide once approved? Web shows them. Recommend show, with disabled `[+ Add]` and a "remove" affordance only if PCC supports diag-removal in the ext today (check pcc-client.js).
4. **Header counter denominator:** is it total leaves the API returned, or only leaves with evidence? Recommend "with evidence" since zero-evidence leaves shouldn't be addable.

## Risk register

- **Approve flow change is the riskiest piece.** Stage 3 changes write semantics (1→N writes). Need to verify pcc-client throttles or batches sensibly so we don't hammer PCC on a 4-leaf add.
- **Sidebar stagedBaseCodes prop reflects base-code presence, not leaf set.** Two leaves under Z99 both flag "Z99 staged" the same way. That's fine for the sidebar's UX, but worth noting if anyone expects a leaf count chip in the sidebar.
- **Mock data:** `icd10-mock-data.js` may not have multi-leaf groups today. Stage 1 needs a Z99-with-4-options mock fixture so we can dev offline.

## Verification before merge

- Real patient with Z99 multi-leaf scenario, multi-add → write → reload → both codes present in PCC
- Real patient with single-leaf group → `[+ Add]` works the same as today's approve
- Patient with zero suggestions → no regression, panel renders empty state
- Network-failure mid-write → partial success surfaces correctly

---

## What I'm NOT planning to do

- Touch `Sidebar.jsx`. The sidebar's base-code-only model is fine for this work.
- Migrate the rest of the evidence panel to Preact. Keep it vanilla; only the leaf picker region changes shape.
- Add a new endpoint. Existing write path is enough.
