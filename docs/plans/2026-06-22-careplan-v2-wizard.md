# Care Plan V2 Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render the V2 care-plan experience (care-area-grouped step-through wizard + shields + Skipped fold + kardex-prefilled/position-locked detail) for orgs whose `/audit` response returns `engineVersion: 'v2'`, while leaving every v1 (non-pilot) org's UI byte-for-byte unchanged.

**Architecture:** ONE UI branched on `audit.engineVersion`, **not a fork**. The existing `AuditDashboard` stays the v2 entry (user decision: augment, not wizard-only) with a v2-only **Stamp-all** button for the trust path. When the nurse drills in **and** the audit is v2, render a new `AuditWizard` (care-area-grouped sidebar with status shields, progress bar, Skipped/Covered folds, Stamp & next) instead of today's `AuditRail`. Detail reuses `FocusCard` via a `variant="v2"` flag (kardex pre-filled + editable, positions locked/display-only, color-coded "Why" box). All v2 behavior is gated behind a single `isV2(audit)` helper; a hidden dev toggle (`?cpv2=1` / `?cpv2=mock`) lets us exercise it before the backend deploys, and the same helper reads the real `engineVersion` so the 3 pilot orgs (hcg/eac/fcsc) light up automatically on deploy.

**Tech Stack:** Preact + Vite, vitest for pure-logic unit tests, `vite.demo.config.js` standalone harness + playwright (chromium) for UI screenshot verification. CSS in `content/css/care-plan-stamp.css`.

**Scope (locked with product owner):**
- ✅ Comprehensive mode gets the v2 dashboard(existing)+wizard. ✅ Stamp-all on the dashboard (v2 only). ✅ Skipped fold. ✅ Shields. ✅ kardex pre-filled/editable + position locked.
- ❌ Initial mode: keep today's list unchanged (rationale/autoSelect already work there).
- ❌ Resolve mode (toRemove/toCheck): deferred. Dashboard may still show resolve chips as today; no new Resolve surface.

**Key facts established during research:**
- `git diff origin/main...HEAD -- content/modules/care-plan-stamp/` is **empty** → all existing care-plan code (dashboard, rail, `FocusRationale`, score-sort, `_recKardex` remap, autoSelect pre-skip) is **already on main and shipped to all orgs**. "V1 exactly as today" = keep it. The rationale/score/autoSelect affordances already no-op for v1 because the response omits those fields; no gating change needed for them.
- `audit.engineVersion` is at `auditResp.audit.engineVersion` (top-level of the audit object). The modal builds `audit = { ...auditResp.audit, _ruleIdToCAA, _focusIdToCAA }` at `CarePlanStampModal.jsx:212`.
- `audit.skipped[]` is NEW — each item is the same shape as a `toAdd` item (`ruleId, reason, evidence[], caa, focus, rationale, autoSelect, score`). The modal does not read it yet.
- Care-area label resolution already exists: `areaLabel(audit, item)` in `content/modules/care-plan-stamp/careArea.js`. Status derivation already exists in `AuditDashboard.jsx:208` (`_areaStatus`: toAdd&&onPlan→partial, toAdd→gap, onPlan→covered) and matches the mock's dot semantics.
- Stamping is shared/unchanged: single = `_stampAuditAddOne(item)` (stamps + advances), batch = `_commitAuditAdds(overrideItems?)`, both via `window.CarePlanStampClient.orchestrateStamp`. Skip persistence = `window.CarePlanStampAPI.persistSkip({patientId,orgSlug,facilityName,ruleId,isSkipping})` → POST/DELETE `/care-plan/skips`.
- The v2 detail differs from v1 only in presentation per DESIGN §6a: **position auto-assigned + locked (display-only chip, no picker)**; **kardex editable recommendation pre-filled** with the engine's resolved value (not the current "Select Kardex (none)" opt-in). Today the modal remaps every audit toAdd intervention to `_recKardex = kardexCategory; kardexCategory = null` at `CarePlanStampModal.jsx:219-229` — that remap must be **skipped under v2** so the kardex stays pre-filled.

---

## Phase 0 — Dev flag, fixture, and harness (verify-first scaffolding)

### Task 0.1: `isV2` + dev override helper

**Files:**
- Create: `content/modules/care-plan-stamp/v2-flag.js`
- Test: `content/modules/care-plan-stamp/v2-flag.test.js`

**Behavior:**
- `engineVersionOf(audit)` → `audit?.engineVersion === 'v2' ? 'v2' : 'v1'`.
- `devForceV2()` → true when `localStorage.getItem('superltc_cpv2')` is `'1'`/`'mock'` OR `new URLSearchParams(location.search).get('cpv2')` is `'1'`/`'mock'`. Wrapped in try/catch (storage/location may throw in some contexts) → false on error.
- `devForceMock()` → true only when the value is `'mock'`.
- `isV2(audit)` → `devForceV2() || engineVersionOf(audit) === 'v2'`.
- Export all four on `window.CarePlanV2 = { isV2, engineVersionOf, devForceV2, devForceMock }` AND as ES exports (so vitest + demo harness can import).

**Step 1 — failing test** (`v2-flag.test.js`): pure-function tests for `engineVersionOf` and `isV2` passing a fake `audit`; for the dev-toggle functions, inject a fake `location`/`localStorage` (the module reads `globalThis.location`/`globalThis.localStorage`, so set them in the test). Cases: `engineVersionOf({engineVersion:'v2'})==='v2'`, `engineVersionOf({})==='v1'`, `isV2({engineVersion:'v2'})===true`, `isV2({})===false`, with `?cpv2=1` → `isV2({})===true`, `devForceMock()` true only for `'mock'`.

**Step 2** Run: `npx vitest run content/modules/care-plan-stamp/v2-flag.test.js` → FAIL (module missing).

**Step 3** Implement `v2-flag.js`. Read globals defensively:
```js
function _qs() { try { return new URLSearchParams(globalThis.location?.search || ''); } catch { return new URLSearchParams(); } }
function _ls(k) { try { return globalThis.localStorage?.getItem(k); } catch { return null; } }
export function devForceMock() { const v = _qs().get('cpv2') || _ls('superltc_cpv2'); return v === 'mock'; }
export function devForceV2() { const v = _qs().get('cpv2') || _ls('superltc_cpv2'); return v === '1' || v === 'mock'; }
export function engineVersionOf(audit) { return audit?.engineVersion === 'v2' ? 'v2' : 'v1'; }
export function isV2(audit) { return devForceV2() || engineVersionOf(audit) === 'v2'; }
if (typeof window !== 'undefined') window.CarePlanV2 = { isV2, engineVersionOf, devForceV2, devForceMock };
```

**Step 4** Run vitest → PASS.

**Step 5** Commit: `feat(careplan-v2): engineVersion + dev-toggle flag helper`.

### Task 0.2: Mock v2 audit fixture

**Files:**
- Create: `content/modules/care-plan-stamp/__fixtures__/mock-audit-v2.js`

Build a fixture object `{ audit: { engineVersion:'v2', hasCoverageCheckData:true, toAdd:[...], onPlan:[...], skipped:[...], toRemove:[], toCheck:[], byCAA:[...], assessmentLinkages:[...] } }` transcribed from `.context/careplan-v2-wizard-MOCK.html` (19 toAdd focuses across 13 care areas + 8 covered areas + ≥2 skipped). Each `toAdd` item must carry: `ruleId`, `score`, `caa`, `caaName`, `reason`, `rationale: { basis, basisLabel, evidence[] }`, `autoSelect`, and `focus: { description, descriptionSegments?, goals:[{description}], interventions:[{description, kardexCategory, positions:[id]}] }`. Map the mock's "why why-diagnosis/order/standard" → `rationale.basis` of `diagnosis|order|standard`; the "Why" sentence → `rationale.basisLabel`. Use canonical kardex strings (e.g. `'monitors'`,`'communication'`) for `kardexCategory` and a single position id per intervention. Export default + on `window.CarePlanV2MockAudit`.

Commit: `test(careplan-v2): mock v2 audit fixture from wizard mock`.

### Task 0.3: Standalone demo harness page

**Files:**
- Create: `demo/careplan-v2-wizard.html`
- Create: `demo/careplan-v2-wizard.js`
- Modify: `vite.demo.config.js` (add the new html input if inputs are enumerated; check first)

`careplan-v2-wizard.js` imports preact `render`, the mock-chrome/global shims used by other demo pages (`demo/demo-mock-chrome.js`, `demo/demo-mock-globals.js` — confirm names), the mock fixture, and mounts `<CarePlanStampModal>` with `defaultMode="comprehensive"` and a forced-v2 + injected-audit path. Simplest: set `localStorage.superltc_cpv2='mock'` and stub `window.CarePlanAuditAPI.fetchAudit`, `window.CarePlanStampDiscover.*`, `window.CarePlanStampClient.orchestrateStamp` to resolve the fixture / no-op so the modal renders the wizard without a live PCC page. Pull the care-plan CSS (`content/css/care-plan-stamp.css`, `variables.css`) into the html `<link>`s.

**Verify:** `npm run demo:build` succeeds; serve and screenshot (Phase 5). Commit: `chore(careplan-v2): standalone wizard demo harness`.

---

## Phase 1 — Pure wizard model (TDD)

### Task 1.1: `buildWizardModel(audit)`

**Files:**
- Create: `content/modules/care-plan-stamp/wizardModel.js`
- Test: `content/modules/care-plan-stamp/wizardModel.test.js`

**Behavior** — pure function, no Preact. Given the enriched `audit` (with `_rowId`s + `_ruleIdToCAA`/`_focusIdToCAA` already stamped by the modal), return:
```
{
  groups: [ { area, status, items: [toAddItem...] } ],   // ONLY areas with toAdd items; status from _areaStatus(area counts incl. onPlan)
  coveredAreas: [ area... ],                              // areas with onPlan but no toAdd
  total: number,                                          // groups' items count (the wizard's "of M")
  orderedItems: [toAddItem...],                           // flat, in sidebar order (gap groups first, then partial), for prev/next + "Focus i of M"
}
```
- Area label via `areaLabel(audit, item)` (import from `./careArea.js`).
- Group status via the same rules as `AuditDashboard._areaStatus` — extract that into wizardModel and have the dashboard import it (DRY; one definition). Status order gap(0) < partial(1) < covered(3); sort groups by (status, area name).
- `coveredAreas` = areas that appear in `onPlan` but have zero `toAdd` — sorted by name.

Write tests covering: grouping by area, gap-before-partial ordering, covered areas extraction, `orderedItems` flat order matches sidebar, empty audit → empty model.

TDD steps: failing test → run (FAIL) → implement → run (PASS) → commit `feat(careplan-v2): pure buildWizardModel grouping/shields`.

### Task 1.2: skipped partition read

Add `skippedItems(audit)` to `wizardModel.js` → `audit.skipped || []` (defensive). Trivial; fold its test into 1.1's file. Commit with 1.1 or as `feat(careplan-v2): expose skipped bucket`.

---

## Phase 2 — Wizard + FocusCard v2 variant

### Task 2.1: `FocusCard` v2 variant (kardex prefilled, positions locked, why-box, header)

**Files:**
- Modify: `content/modules/care-plan-stamp/components/FocusCard.jsx`

Add props (all optional, default to today's behavior): `variant` (`'v1'`|`'v2'`), `areaBadge` (string), `positionLabel` (string e.g. "Focus 3 of 19"). When `variant==='v2'`:
- Header: render `<span class="cpas-detail__badge-sec">{areaBadge}</span>` + `<span class="cpas-detail__pos">{positionLabel}</span>` instead of the rule label + skip chip + "Add to Careplan" button (the wizard owns the footer). Keep `isStamped` "Added" pill behavior.
- Interventions: positions render as **locked display-only chips** (reuse a new `<PositionChipLocked label={positionLabels[p]||p}/>` — no picker, no remove, no "+ position"). Kardex `ChipSelect` keeps `value={iv.kardexCategory}` (pre-filled, NOT `_recKardex`/null), editable, `placeholder` unused; drop the `recommendedId` badge in v2 (it IS the value now).
- "Why" box: keep `FocusRationale`, but the v2 CSS gives it the color-by-basis treatment matching the mock (`why-standard/assessment/diagnosis/order`). No JS change beyond ensuring `rationale.basis` reaches `FocusRationale` (it already does via `RATIONALE_BASIS_CLASS`).

Do **not** change any v1 code path. Verify v1 still builds.

Commit: `feat(careplan-v2): FocusCard v2 variant (locked positions, prefilled kardex)`.

### Task 2.2: `AuditWizard` component

**Files:**
- Create: `content/modules/care-plan-stamp/components/AuditWizard.jsx`

Props: `audit`, `dropdowns`, `auditFocusStates`, `stampedAddIds`, `skippedAddIds`, `caaFilter` (optional — when entered from a care-area chip, default that group open + select its first item), `selected`/`onSelect` (rowId), `onPatchFocusState(ruleId,patch)`, `onStampNext(item)`, `onSkip(item)`, `onReopen(item)` (un-skip from fold), `onStampAll()`, `stamping`.

Layout (per `.context/careplan-v2-wizard-MOCK.html`):
- **Sidebar**: progress (`done` = toAdd items in `stampedAddIds`; `total` = model.total) + bar; one collapsible `.grp` per `model.groups[]` with a shield `.dot is-{status}`, area name, count badge, caret; body lists items as `.si` buttons with `.si-dot` (filled when stamped), truncated focus text (`focusLabel`-style or focus description). A **Skipped (N)** collapsible fold (from `skippedItems(audit)` ∪ local `skippedAddIds`) whose rows have a "Reopen" affordance → `onReopen(item)`. A **Covered (N)** collapsed fold listing `model.coveredAreas`.
- **Main**: `FocusCard variant="v2"` for the selected toAdd item (areaBadge = its area, positionLabel = "Focus i of total"), then a wizard footer: `[Skip]` → `onSkip(item)`, `[✓ Stamp & next →]` → `onStampNext(item)`. Disable footer while `stamping` or when the item still needs input (reuse `_descNeedsInput`/`_focusUnfilledTokenKeys` via props passed from modal, or compute from composed). Show "✓ Added" state when `stampedAddIds.has(ruleId)`.

The wizard is a presentation component — all stamping/skip/persist logic stays in the modal and is passed as callbacks (reuse existing handlers). No new API calls inside the component.

Commit: `feat(careplan-v2): AuditWizard care-area-grouped step-through`.

---

## Phase 3 — Modal wiring + gating

**Files:** Modify `content/modules/care-plan-stamp/CarePlanStampModal.jsx`

### Task 3.1: import + v2-aware audit load
- Import `isV2`, `engineVersionOf` from `../v2-flag.js`; `buildWizardModel`, `skippedItems` from `../wizardModel.js`; `AuditWizard` component.
- In the load effect (~`:190-259`): if `devForceMock()`, replace the `fetchAudit` call with the bundled fixture. Compute `const v2 = isV2(auditResp.audit)`.
- **Gate the kardex remap** (`:219-229`): only run the `_recKardex = kardexCategory; kardexCategory = null` remap when `!v2`. Under v2, leave `kardexCategory` pre-filled.
- Keep `_rowId` stamping for `skipped[]` too: `(audit.skipped||[]).forEach((it,i)=>{ it._rowId = \`skip-${i}-${it.ruleId}\`; })`.

### Task 3.2: render branch
- Dashboard (`comprehensiveStep==='dashboard'`): pass a new `onStampAll` prop to `AuditDashboard` **only when `isV2(audit)`** that calls `_commitAuditAdds()` (whole-audit). Render a "Stamp all N" button in the dashboard summary (AuditDashboard change, v2-gated by the prop being present).
- Drill-in (`comprehensiveStep!=='dashboard' && !=='on_plan'`): branch — `isV2(audit) ? <AuditWizard .../> : (<AuditRail/> + detail panes as today)`. The wizard gets the existing handlers: `onStampNext={_stampAuditAddOne}`, `onSkip={_skipAuditAddItemV2}` (see 3.3), `onReopen={_reopenSkipped}` (see 3.3), `onStampAll={()=>_commitAuditAdds()}`, `onPatchFocusState={_patchAuditFocusStateByRuleId}`, `selected/onSelect={selectedRail/setSelectedRail}`, `caaFilter`.
- `on_plan` step unchanged (CoveredOverview).

### Task 3.3: skip persistence + reopen for v2
- Today `_skipAuditAddItem` already persists (POST /skips) at `:778`. Good — reuse it as `onSkip`. Ensure the skipped item also surfaces in the wizard's Skipped fold: the fold reads `skippedItems(audit)` (backend) **plus** any `skippedAddIds` (this-session skips) — map session-skipped `toAdd` items into the fold by `_rowId`.
- Add `_reopenSkipped(item)`: call `persistSkip({...,isSkipping:false})`; optimistically move the item from `skipped`/`skippedAddIds` into the live `toAdd` working set so the nurse can act now (mirror `unSkipFocus`). Track via a local `reopenedRowIds`/state update on `audit.toAdd`. Select it.

### Task 3.4: V1 regression guard
- Confirm: when `engineVersionOf(audit)==='v1'` and no dev toggle, NONE of the new branches fire — dashboard renders identically, drill-in renders `AuditRail`, no Stamp-all button, kardex remap runs as before, skipped fold absent.

Commit per task: `feat(careplan-v2): wire AuditWizard + skipped fold behind engineVersion`.

---

## Phase 4 — CSS

**Files:** Modify `content/css/care-plan-stamp.css`

Add wizard styles transcribed/adapted from the mock `<style>` (namespaced under the existing `cpas-` scheme, reusing `variables.css` tokens): sidebar `.cpas-wiz-*` groups, shield `.dot.gap/.partial/.covered`, progress bar, `.si`/`.si-dot` rows, Skipped/Covered folds, detail `.cpas-detail__badge-sec`/`__pos`, why-box color variants (`is-standard/assessment/diagnosis/order`), locked position chip, wizard footer. Match the mock's palette (indigo `#4f46e5`, gap `#f43f5e`, partial `#f59e0b`, covered `#10b981`). Do not modify existing v1 selectors.

Commit: `style(careplan-v2): wizard + shields + folds styling`.

---

## Phase 5 — Verification

1. `npx vitest run content/modules/care-plan-stamp/` → all green.
2. `npm run build` → succeeds (includes `check:tracking`; any new `track()` calls need an allowlist entry — prefer NO new events this build, reuse existing `care_plan_audit_*`).
3. `npm run demo:build` then serve `dist`/preview; playwright (chromium, http URL — not file://) screenshot `demo/careplan-v2-wizard.html` at 1100px wide. Compare against `.context/careplan-v2-wizard-MOCK.html`: care-area groups with shields, progress, why-box colors, kardex/position chips, Skipped + Covered folds, Stamp & next.
4. **V1 regression:** in the demo harness (or a second fixture with `engineVersion:'v1'` / no field and no dev toggle), confirm the drill-in still renders the old `AuditRail` and the dashboard has no Stamp-all button.
5. Update `.context/todos.md` and write a short memory note on the engineVersion switch location.

Commit: `test(careplan-v2): verify wizard renders + v1 regression`.

---

## Notes / risks
- **No new analytics events** if avoidable (`check:tracking` will fail the build otherwise). Reuse `care_plan_audit_step_entered`, `care_plan_audit_item_skipped`, `care_plan_audit_commit_stamped`. If a Stamp-all event is wanted, add it to the analytics allowlist in the same PR (see memory: instrumentation ships in one PR).
- **Reuse, don't fork:** `FocusCard` extended in place; `_areaStatus` moved to `wizardModel.js` and imported by both dashboard and wizard; all stamping via existing modal handlers.
- **Backend not deployed:** everything verifiable now via `?cpv2=mock` + fixture; real switch reads `audit.engineVersion` so pilots (hcg/eac/fcsc) work on deploy with zero ext change.
