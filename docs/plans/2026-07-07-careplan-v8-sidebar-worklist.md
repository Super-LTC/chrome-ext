# Care Plan V8 Sidebar-Worklist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the V2 care-plan *care-area-grouped wizard* (Comprehensive mode) with a **sidebar-worklist** layout — one row per focus showing remaining amber "touches", an always-open inline-editable detail panel, a per-focus Add + a gated "Add all", a non-silent `dropped[]` confirmation list, and a collapsed "what we auto-filled" receipts panel. All gated on `engineVersion === 'v2'`; V1 orgs render unchanged.

**Architecture:** Reuse the entire data layer already built for V2 (the `engineVersion`/`isV2` switch, `rationale`, `autoSelect`, `assessmentLinkages`, kardex, PCC-roster care-team picker, and stamping). Add a new **pure model** `worklistModel.js` (mirrors `wizardModel.js`) and a new **presentation** component `AuditWorklist.jsx` that replaces `AuditWizard.jsx` AND the `AuditDashboard` step at the same call-site in `CarePlanStampModal.jsx`. All stamping/skip/resolve logic stays in the parent modal and is passed in via callbacks — the worklist is pure props-in/callbacks-out. Comprehensive mode only this pass (Initial keeps today's V2; a fast-follow re-skins it onto the same chrome).

**Tech Stack:** Preact + hooks (`content/modules/care-plan-stamp/`), Vitest (co-located `*.test.js`, run by `vitest run`), CSS in `content/css/care-plan-stamp.css` (`cpas-wl__` namespace). Dev harness: `?cpv2=mock` loads `__fixtures__/mock-audit-v2.js`.

---

## Decisions locked (from brainstorming, 2026-07-07)

1. **Q1=A:** Worklist + always-open detail + the mock's sticky progress header REPLACES `AuditDashboard` for v2-comprehensive. No tile screen. The header ("N of M done · K to fill") absorbs the overview role.
2. **Q2=A:** Comprehensive only this pass. Do **not** re-touch Initial in this PR. Structure `AuditWorklist` so an add-only Initial variant is a trivial fast-follow.
3. **Q3=A:** Enrich `mock-audit-v2.js` with `toRemove` / `toCheck` / `dropped[]` for offline dev. NOTE: the real `/audit` already ships these for v2 orgs (`reviewAndFill`, web #825). A real-org capture reconciliation (hcg/eac/fcsc) is a **user-provided** follow-up — we cannot hit live PCC from this workspace.
4. **Q4=A:** "Touches" = summed `_focusUnfilledTokenKeys(focus, tokenValues).length` per focus (a flat `___`-only focus with no tokens counts as 1). Real counts are usually 0–2 because the backend `fillBlanks` pass pre-fills most slots — that's the "mostly review & done" state.
5. **Q5=A:** "Add all" gates on **add-focuses only** (every `toAdd` focus has 0 amber slots), matching the mock's `allAddsReady()`. Remove/Check resolve independently and never block it.
6. **Q6:** `dropped[]` today is `{ruleId, description, reason}` only → build the banner **acknowledge-first** but **structured for re-add**: if a `dropped[]` item carries a `focus`, "Re-add" moves it into the live `toAdd` worklist; if not, "Confirm" only dismisses the banner row. Backend will ship the full `focus` on `dropped[]` later; the UI must not break either way.
7. **Q7=A:** New `AuditWorklist.jsx` at the same call-site; retire `AuditWizard.jsx` (delete file, keep git history). Reuse `FocusCard.jsx` (`variant="v2"`) inline editing verbatim.

## Don'ts (from the handoff)
- Don't render drug names — interventions say "as ordered". Don't interpolate a brand/generic name in the UI.
- Don't silently drop the `dropped[]` focuses — always render "we removed N — tap to confirm".
- Don't ungate "Add all".
- Don't read the flag client-side — trust `engineVersion`/`isV2(audit)` off the response.

---

## Reused helpers (already in `CarePlanStampModal.jsx`, passed to the worklist as props)
- `_composeFocus(original, state)` — applies token/factor/goal/intervention edits → composed focus.
- `_emptyFocusState()` — blank per-focus edit state.
- `_focusUnfilledTokenKeys(focus, tokenValues)` — unfilled token keys (touches basis).
- `_descNeedsInput(description, descriptionSegments)` — flat `___`/placeholder blank detector.
- `_filterAuditByCaa`, `areaLabel` (careArea.js) — area labels/filtering.
- Stamping handlers: `_commitAuditAdds` (Add all), `_stampAuditAddOne` (per-focus Add), `_skipAuditAddItem`, `_reopenSkipped`, `_resolveAuditItem` (Remove/toRemove), `_stampPartialCoverage`/`_dismissVerifyItem` (toCheck).

---

## Task 0: Enrich the mock fixture (`toRemove` / `toCheck` / `dropped[]`)

**Files:**
- Modify: `content/modules/care-plan-stamp/__fixtures__/mock-audit-v2.js`

Transcribe from `.context/careplan-v8-sidebar-MOCK.html` (the `F[]` array): 2 Remove rows (Infection r/t sepsis — resolved; Anticoagulation r/t AFib — discontinued), 1 Check row (C. diff history — ambiguous), and a `dropped[]` array with ~2 entries (e.g. a neuropathic-pain drug that over-fired an "MS" focus). Match the documented shapes:

**Step 1: Add `toRemove` entries** (each carries `pccFocusId`, `pccFocusStdItemId`, `focusId`, `caa`/`caaName`, `focusText`, and a `reason`):
```js
toRemove: [
  {
    focusId: 'pcc-focus-infection', pccFocusId: 'pcc-focus-infection', pccFocusStdItemId: 'std-infection',
    caa: 'infection', caaName: 'Infection',
    focusText: 'The resident is at risk for infection related to sepsis.',
    reason: 'Resolved. A41.9 sepsis marked resolved 6/25 · Levofloxacin discontinued 6/28. No active infection diagnosis or antibiotic remains.',
  },
  {
    focusId: 'pcc-focus-anticoag', pccFocusId: 'pcc-focus-anticoag', pccFocusStdItemId: 'std-anticoag',
    caa: 'anticoagulation', caaName: 'Anticoagulation',
    focusText: 'The resident is on anticoagulant therapy related to atrial fibrillation.',
    reason: 'Discontinued. Apixaban (Eliquis) 5 mg order discontinued 6/29; no active anticoagulant remains.',
  },
],
```

**Step 2: Add `toCheck` entry** (ambiguous / your-judgment; carries `pccFocusId`, `kind: 'history_focus'`, `detail`):
```js
toCheck: [
  {
    focusId: 'pcc-focus-cdiff', pccFocusId: 'pcc-focus-cdiff', pccFocusStdItemId: 'std-cdiff',
    caa: 'elimination_gi', caaName: 'Elimination / GI', kind: 'history_focus',
    focusText: 'History of Clostridium difficile colitis.',
    detail: 'Ambiguous — your call. A04.7 resolved 5/30, but the focus is written "history of." We won\'t auto-remove a historical focus.',
  },
],
```

**Step 3: Add `dropped[]`** (top-level under `audit`; `{ruleId, description, reason}` — acknowledge-only shape today):
```js
dropped: [
  { ruleId: 'dx.musculoskeletal', description: 'Resident has impaired mobility related to muscle wasting',
    reason: 'Over-fired: the muscle-wasting dx here is neuropathy-driven; pain focus already covers it.' },
  { ruleId: 'universal.oral_dental_care', description: 'Standard oral / dental care focus',
    reason: 'Removed as a blind universal — no dx/order/MDS signal for this resident.' },
],
```

**Step 4: Confirm no drug names in interventions.** Grep the fixture's intervention `description` fields; any that name a drug must read "as ordered" (e.g. "Administer the ordered analgesic as scheduled", not "Administer Hydrocodone…"). The existing toAdd interventions already say "as ordered" / "medications as ordered" — verify and fix any stragglers.

Run: `grep -niE "hydrocodone|gabapentin|apixaban|eliquis|bisacodyl|pantoprazole|hydroxyzine|metformin|levofloxacin" content/modules/care-plan-stamp/__fixtures__/mock-audit-v2.js`
Expected: matches ONLY inside `reason` / `evidence` / `focusText` strings (rationale is allowed to cite the order), NEVER inside an intervention `description`.

**Step 5: Commit**
```bash
git add content/modules/care-plan-stamp/__fixtures__/mock-audit-v2.js
git commit -m "test(careplan-v8): enrich mock audit with toRemove/toCheck/dropped fixtures"
```

---

## Task 1: Pure worklist model (`worklistModel.js`) + tests

**Files:**
- Create: `content/modules/care-plan-stamp/worklistModel.js`
- Test: `content/modules/care-plan-stamp/worklistModel.test.js`

The model flattens an audit into the ordered worklist rows the sidebar renders, grouped by **kind** (add → remove → check), plus the covered list, the dropped list, and the gate math. No Preact, no DOM — pure functions (mirrors `wizardModel.js`).

**Step 1: Write the failing test**
```js
import { describe, it, expect } from 'vitest';
import { buildWorklistModel, touchesForItem, addAllReady } from './worklistModel.js';

const auditFx = {
  engineVersion: 'v2',
  toAdd: [
    { ruleId: 'dx.pain', _rowId: 'add-0', score: 90, caaName: 'Pain',
      focus: { description: 'Resident has ___ pain', descriptionSegments: [
        { kind: 'text', value: 'Resident has ' },
        { kind: 'token', tokenKey: 'acuity', needsFilling: true, value: '___', options: ['acute','chronic'] },
        { kind: 'text', value: ' pain' } ] } },
    { ruleId: 'dx.chf', _rowId: 'add-1', score: 80, caaName: 'Cardiac',
      focus: { description: 'Resident has heart failure', descriptionSegments: [] } },
  ],
  toRemove: [{ focusId: 'f1', _rowId: 'rem-0', caaName: 'Infection', focusText: 'infection r/t sepsis', reason: 'Resolved.' }],
  toCheck: [{ focusId: 'f2', _rowId: 'chk-0', caaName: 'GI', focusText: 'hx C. diff', detail: 'Your call.' }],
  onPlan: [{ ruleId: 'dx.dm', _rowId: 'op-0', caaName: 'Diabetes', focusText: 'DM2' }],
  dropped: [{ ruleId: 'dx.ms', description: 'MS focus', reason: 'over-fired' }],
};

describe('buildWorklistModel', () => {
  it('groups rows by kind: add, remove, check', () => {
    const m = buildWorklistModel(auditFx);
    expect(m.groups.map((g) => g.kind)).toEqual(['add', 'remove', 'check']);
    expect(m.groups[0].items.map((i) => i._rowId)).toEqual(['add-0', 'add-1']);
  });
  it('sorts add rows by score desc', () => {
    const m = buildWorklistModel(auditFx);
    expect(m.groups[0].items[0].ruleId).toBe('dx.pain'); // 90 before 80
  });
  it('surfaces covered + dropped', () => {
    const m = buildWorklistModel(auditFx);
    expect(m.covered).toHaveLength(1);
    expect(m.dropped).toHaveLength(1);
  });
  it('counts total add rows', () => {
    expect(buildWorklistModel(auditFx).totalAdds).toBe(2);
  });
});

describe('touchesForItem', () => {
  const unfilled = (focus, tv) => { // stand-in for _focusUnfilledTokenKeys
    const keys = new Set();
    (focus.descriptionSegments || []).forEach((s) => {
      if (s.kind === 'token' && s.needsFilling && !(tv[s.tokenKey])) keys.add(s.tokenKey);
    });
    return [...keys];
  };
  it('counts unfilled token slots', () => {
    const item = auditFx.toAdd[0];
    expect(touchesForItem(item, {}, unfilled, () => false)).toBe(1);
  });
  it('is 0 once the slot is filled', () => {
    const item = auditFx.toAdd[0];
    expect(touchesForItem(item, { acuity: 'chronic' }, unfilled, () => false)).toBe(0);
  });
  it('counts a flat ___ focus with no tokens as 1', () => {
    const item = { focus: { description: 'foo ___', descriptionSegments: [] } };
    expect(touchesForItem(item, {}, () => [], () => true)).toBe(1);
  });
});

describe('addAllReady', () => {
  it('false while any add has touches, true when all cleared', () => {
    const touches = new Map([['add-0', 1], ['add-1', 0]]);
    expect(addAllReady(buildWorklistModel(auditFx), touches, new Set(), new Set())).toBe(false);
    expect(addAllReady(buildWorklistModel(auditFx), new Map([['add-0', 0], ['add-1', 0]]), new Set(), new Set())).toBe(true);
  });
  it('ignores stamped/skipped adds when computing readiness', () => {
    const m = buildWorklistModel(auditFx);
    // add-0 still has a touch, but it is stamped → not counted → ready
    const touches = new Map([['add-0', 1], ['add-1', 0]]);
    expect(addAllReady(m, touches, new Set(['dx.pain']), new Set())).toBe(true);
  });
  it('false when there are zero open adds (nothing to add)', () => {
    const m = buildWorklistModel(auditFx);
    expect(addAllReady(m, new Map(), new Set(['dx.pain','dx.chf']), new Set())).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run content/modules/care-plan-stamp/worklistModel.test.js`
Expected: FAIL — "buildWorklistModel is not a function".

**Step 3: Write minimal implementation**
```js
// content/modules/care-plan-stamp/worklistModel.js
//
// Pure (no Preact, no DOM) model for the V8 sidebar-worklist. Flattens a v2
// `audit` into ordered rows grouped by kind (add → remove → check), plus the
// covered list, the dropped list, and the "Add all" gate math. Mirrors the
// role of wizardModel.js but flat (no care-area grouping) — the worklist shows
// every focus as its own row, with remaining amber "touches" per add row.

import { areaLabel } from './careArea.js';

function _score(i) { return typeof i?.score === 'number' ? i.score : 0; }

const KIND_ORDER = ['add', 'remove', 'check'];
const KIND_LABEL = {
  add: 'Add',
  remove: 'Remove · resolved / discontinued',
  check: 'Check · your judgment',
};

/** Ordered worklist rows grouped by kind, plus covered + dropped + totals. */
export function buildWorklistModel(audit) {
  const empty = { groups: [], covered: [], dropped: [], totalAdds: 0, orderedAdds: [] };
  if (!audit || typeof audit !== 'object') return empty;

  const adds = (Array.isArray(audit.toAdd) ? audit.toAdd : [])
    .slice().sort((a, b) => _score(b) - _score(a));
  const removes = Array.isArray(audit.toRemove) ? audit.toRemove : [];
  const checks = Array.isArray(audit.toCheck) ? audit.toCheck : [];

  const groups = [];
  const byKind = { add: adds, remove: removes, check: checks };
  for (const kind of KIND_ORDER) {
    const items = byKind[kind];
    if (items && items.length) groups.push({ kind, label: KIND_LABEL[kind], items });
  }

  const covered = Array.isArray(audit.onPlan) ? audit.onPlan : [];
  const dropped = Array.isArray(audit.dropped) ? audit.dropped : [];

  return {
    groups,
    covered,
    dropped,
    totalAdds: adds.length,
    orderedAdds: adds,
    areaOf: (item) => areaLabel(audit, item) || 'Other',
  };
}

/**
 * Amber "touches" left for one add row. `unfilledTokenKeys` and `flatNeedsInput`
 * are injected from the parent (they close over the modal's private helpers
 * `_focusUnfilledTokenKeys` / `_descNeedsInput`), keeping this file DOM/Preact-free
 * and independently testable.
 *   touches = # unfilled token keys, OR 1 if a flat `___` blank remains with no tokens.
 */
export function touchesForItem(item, tokenValues, unfilledTokenKeys, flatNeedsInput) {
  const focus = item?.focus;
  if (!focus) return 0;
  const keys = unfilledTokenKeys(focus, tokenValues || {});
  if (keys.length > 0) return keys.length;
  return flatNeedsInput(focus) ? 1 : 0;
}

/**
 * "Add all" is enabled ONLY when every OPEN add row (not stamped, not skipped)
 * has 0 touches — AND there is at least one open add row. Remove/Check never
 * gate this (they resolve independently).
 */
export function addAllReady(model, touchesByRowId, stampedIds, skippedIds) {
  const stamped = stampedIds || new Set();
  const skipped = skippedIds || new Set();
  const open = (model.orderedAdds || []).filter(
    (it) => !stamped.has(it.ruleId) && !skipped.has(it.ruleId)
  );
  if (open.length === 0) return false;
  return open.every((it) => (touchesByRowId.get(it._rowId) || 0) === 0);
}

/** Sum of touches across all OPEN add rows — the "fill N amber slots first" number. */
export function totalTouches(model, touchesByRowId, stampedIds, skippedIds) {
  const stamped = stampedIds || new Set();
  const skipped = skippedIds || new Set();
  return (model.orderedAdds || [])
    .filter((it) => !stamped.has(it.ruleId) && !skipped.has(it.ruleId))
    .reduce((n, it) => n + (touchesByRowId.get(it._rowId) || 0), 0);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run content/modules/care-plan-stamp/worklistModel.test.js`
Expected: PASS (all describe blocks green).

**Step 5: Commit**
```bash
git add content/modules/care-plan-stamp/worklistModel.js content/modules/care-plan-stamp/worklistModel.test.js
git commit -m "feat(careplan-v8): pure worklist model (flat rows, touches, add-all gate)"
```

---

## Task 2: Parent touches-map + resolve-status helpers in the modal

**Files:**
- Modify: `content/modules/care-plan-stamp/CarePlanStampModal.jsx` (add helper near `_auditNeedsInputByRowId`, ~line 1385)

The worklist needs a per-row **count** (not the existing boolean `_auditNeedsInputByRowId`). Add a sibling that returns a `Map<_rowId, number>` using `touchesForItem` + the private helpers.

**Step 1: Add `_auditTouchesByRowId`** (place right after `_auditNeedsInputByRowId`):
```js
// Per-row amber-touches COUNT for the V8 worklist. Mirrors _auditNeedsInputByRowId
// but returns a number (unfilled token-key count, or 1 for a flat `___` blank).
function _auditTouchesByRowId(audit, auditFocusStates) {
  const m = new Map();
  (audit?.toAdd || []).forEach((it) => {
    if (!it.focus) { m.set(it._rowId, 0); return; }
    const state = auditFocusStates[it.ruleId] || _emptyFocusState();
    const keys = _focusUnfilledTokenKeys(it.focus, state.tokenValues);
    if (keys.length > 0) { m.set(it._rowId, keys.length); return; }
    const composed = _composeFocus(it.focus, state);
    m.set(it._rowId, _descNeedsInput(composed.description, it.focus.descriptionSegments) ? 1 : 0);
  });
  return m;
}
```

**Step 2: Ensure `_rowId` is stamped on `toRemove`/`toCheck`/`dropped`.** The load effect (~lines 247–251) already stamps `_rowId` on toAdd/toCheck/toRemove/onPlan/skipped. Add a line for `dropped`:
```js
(audit.dropped || []).forEach((it, i) => { it._rowId = `dropped-${i}-${it.ruleId || 'na'}`; });
```

**Step 3: Verify build compiles** (no test yet — this is glue for Task 4).

Run: `npm run build 2>&1 | tail -5`
Expected: build succeeds (no syntax error).

**Step 4: Commit**
```bash
git add content/modules/care-plan-stamp/CarePlanStampModal.jsx
git commit -m "feat(careplan-v8): per-row touches-count helper + dropped _rowId stamping"
```

---

## Task 3: `AuditWorklist.jsx` component

**Files:**
- Create: `content/modules/care-plan-stamp/components/AuditWorklist.jsx`

Pure presentation. Props mirror `AuditWizard` plus the new fields. Layout follows `.context/careplan-v8-sidebar-MOCK.html`:
- **Sticky progress header**: "N of M done · K to fill" + progress bar (`done` = stamped∪skipped adds + resolved removes/checks; `M` = totalAdds; K = totalTouches). Absorbs the dashboard's overview role.
- **Sidebar**: "✓ Add all" button (gated via `addAllReady`; hint text "fill N amber slots to enable" / "adds all N at once" / "every add-focus is on the plan"). Then groups: **Add** (rows w/ touches badge, needs/ready/done dot), **Remove** (red dot), **Check** (amber dot), then **Covered · click to view** (dimmed clickable rows), then the **dropped[]** "we removed N — tap to confirm" fold.
- **Detail panel (always open)**: delegates to `FocusCard variant="v2"` for add rows (inline-editable goals/interventions, kardex opt-in, locked positions, per-focus "✓ Add to Careplan" + Skip). Remove rows → read-only reason + "Remove this focus"/"Keep on plan". Check rows → read-only reason + "your judgment". Covered rows → read-only on-plan panel. Dropped rows → reason + "Re-add"/"Confirm removal".
- **"what we auto-filled ⌄"**: collapsed receipts. Reuse `FocusRationale`; the receipts come from `rationale.evidence[]` + any backend-filled tokens. (Progressive disclosure — default collapsed.)

Props:
```js
export const AuditWorklist = ({
  audit, dropdowns,
  auditFocusStates, composeFocus, emptyFocusState,
  stampedAddIds, skippedAddIds,
  touchesByRowId,                 // Map<_rowId, number>  (Task 2)
  resolveStatus,                  // { [focusId]: 'pending'|'done'|'error' }
  acknowledgedDropped,            // Set<ruleId>
  selected, stamping,
  onSelect, onPatchFocusState,
  onStampOne, onSkip, onReopen, onStampAll,
  onResolve, onKeep,              // Remove/Check
  onReAddDropped, onConfirmDropped, // dropped[]
}) => { /* ... */ };
```

**Step 1: Build the sidebar + header** — import `buildWorklistModel`, `addAllReady`, `totalTouches` from `../worklistModel.js`; `areaLabel` from `../careArea.js`; `FocusCard`, `FocusRationale` from `./FocusCard.jsx`. Render groups from `model.groups`, covered from `model.covered`, dropped fold from `model.dropped`. Row dot state: `done` (stamped/resolved) / `needs` (touches>0) / `ready` (add, touches===0). Touches badge on add rows with `touches>0`.

**Step 2: Build the detail panel** — switch on `selected.kind`:
- `add` → `<AddDetail>` (FocusCard v2 + per-focus Add/Skip footer; Add disabled when `touchesByRowId.get(rowId) > 0`, hint "fill N amber slots first").
- `remove` → `<RemoveDetail>` (reason box; "Remove this focus" → `onResolve(item)`, "Keep on plan" → `onKeep(item)`; reflect `resolveStatus`).
- `check` → `<CheckDetail>` (reason box; "your judgment" — actions route to `onResolve`/`onKeep`).
- `covered` (onPlan) → read-only on-plan panel (reuse the `OnPlanDetail` pattern from AuditWizard).
- `dropped` → reason box; **"Re-add"** (calls `onReAddDropped(item)` — only enabled/shown when `item.focus` exists) + **"Confirm removal"** (`onConfirmDropped(item)`).

**Step 3: "Add all" wiring** — button `disabled={!addAllReady(model, touchesByRowId, stampedAddIds, skippedAddIds) || stamping}`; label/hint per mock. On click → `onStampAll()`.

**Step 4: dropped[] fold** — never auto-hidden. Header "We removed {N} — tap to confirm". Each row selectable → detail shows reason + actions. Acknowledged rows (in `acknowledgedDropped`) render struck-through/dimmed but stay visible.

**Step 5: Drug-name guard (defensive).** Do NOT interpolate any drug name. Render intervention/goal/description text verbatim from the composed focus — never synthesize a drug name. (No code that reads an order's drug string into intervention text.)

**Step 6: Verify component renders in isolation** via the standalone mock harness (Task 6) — no unit test for this presentation component (consistent with `AuditWizard`, which has none; its logic lives in the tested `worklistModel.js`).

**Step 7: Commit**
```bash
git add content/modules/care-plan-stamp/components/AuditWorklist.jsx
git commit -m "feat(careplan-v8): AuditWorklist sidebar-worklist component"
```

---

## Task 4: Wire `AuditWorklist` into the modal; retire `AuditWizard` + dashboard for v2-comprehensive

**Files:**
- Modify: `content/modules/care-plan-stamp/CarePlanStampModal.jsx`
- Delete: `content/modules/care-plan-stamp/components/AuditWizard.jsx`

**Step 1: Replace the render branches.** For v2 comprehensive (`isV2(audit)`), stop routing through `comprehensiveStep`/`AuditDashboard`/`AuditWizard`. Render `AuditWorklist` directly whenever `mode === 'comprehensive' && (stage==='ready'||'stamping') && audit && isV2(audit)`. Keep the V1 (`AuditDashboard`/`AuditRail`) path unchanged for non-v2. Replace the imports:
```js
// remove:  import { AuditWizard } from './components/AuditWizard.jsx';
import { AuditWorklist } from './components/AuditWorklist.jsx';
```

**Step 2: New state** — `acknowledgedDropped` Set + a `keptIds` Set (Check/Remove "keep on plan" dismissals):
```js
const [acknowledgedDropped, setAcknowledgedDropped] = useState(new Set());
const [keptIds, setKeptIds] = useState(new Set());
```

**Step 3: Handlers.** Reuse existing `_stampAuditAddOne`, `_skipAuditAddItem`, `_reopenSkipped`, `_commitAuditAdds`, `_resolveAuditItem`. Add:
```js
const _keepFocus = useCallback((item) => {
  setKeptIds((prev) => new Set(prev).add(item.focusId || item._rowId));
  window.SuperAnalytics?.track?.('care_plan_audit_focus_kept', { patient_id: patientId, focus_id: item.focusId });
}, [patientId]);

const _confirmDropped = useCallback((item) => {
  setAcknowledgedDropped((prev) => new Set(prev).add(item.ruleId));
  window.SuperAnalytics?.track?.('care_plan_audit_dropped_confirmed', { patient_id: patientId, rule_id: item.ruleId });
}, [patientId]);

// Re-add: only possible when the dropped item carries a stampable focus (backend
// fast-follow). Move it into live toAdd (mirrors _reopenSkipped) so it becomes a
// normal add row the nurse can edit + stamp.
const _reAddDropped = useCallback((item) => {
  if (!item?.focus) return; // acknowledge-only until backend ships focus on dropped[]
  setAudit((prev) => {
    if (!prev) return prev;
    const rowId = `add-readd-${item.ruleId}`;
    const already = (prev.toAdd || []).some((it) => it.ruleId === item.ruleId);
    const toAdd = already ? prev.toAdd : [...(prev.toAdd || []), { ...item, _rowId: rowId }];
    return { ...prev, toAdd, dropped: (prev.dropped || []).filter((d) => d.ruleId !== item.ruleId) };
  });
  setSelectedRail({ kind: 'add', key: `add-readd-${item.ruleId}` });
  window.SuperAnalytics?.track?.('care_plan_audit_dropped_readded', { patient_id: patientId, rule_id: item.ruleId });
}, [patientId]);
```

**Step 4: Render `AuditWorklist`** with all props:
```jsx
{mode === 'comprehensive' && (stage === 'ready' || stage === 'stamping') && audit && isV2(audit) && (
  <AuditWorklist
    audit={audit}
    dropdowns={dropdowns}
    auditFocusStates={auditFocusStates}
    composeFocus={_composeFocus}
    emptyFocusState={_emptyFocusState}
    stampedAddIds={stampedAddIds}
    skippedAddIds={skippedAddIds}
    touchesByRowId={_auditTouchesByRowId(audit, auditFocusStates)}
    resolveStatus={resolveStatus}
    acknowledgedDropped={acknowledgedDropped}
    keptIds={keptIds}
    selected={selectedRail}
    stamping={stage === 'stamping'}
    onSelect={setSelectedRail}
    onPatchFocusState={_patchAuditFocusStateByRuleId}
    onStampOne={_stampAuditAddOne}
    onSkip={_skipAuditAddItem}
    onReopen={_reopenSkipped}
    onStampAll={() => _commitAuditAdds()}
    onResolve={(item) => _resolveAuditItem(item, 'worklist')}
    onKeep={_keepFocus}
    onReAddDropped={_reAddDropped}
    onConfirmDropped={_confirmDropped}
  />
)}
```
Guard the old `comprehensiveStep`-based branches (dashboard/wizard/rail) with `&& !isV2(audit)` so v1 keeps them and v2 never renders them. The initial `setSelectedRail` in the load effect (first toAdd) stays — it seeds the always-open detail.

**Step 5: Delete `AuditWizard.jsx`** and remove any now-dead imports it pulled (`buildWizardModel`, `AuditDashboard`'s v2 `onStampAll` path can stay for v1). Keep `wizardModel.js` only if still referenced; if nothing imports it after this, leave it (harmless) or delete in a follow-up — do NOT delete `AuditDashboard`/`AuditRail` (v1 still uses them).

Run: `grep -rn "AuditWizard\|buildWizardModel" content/ --include=*.jsx --include=*.js | grep -v test`
Expected: no live references (only possibly `wizardModel.js`/tests).

**Step 6: Build**

Run: `npm run build 2>&1 | tail -5`
Expected: build succeeds.

**Step 7: Commit**
```bash
git add content/modules/care-plan-stamp/CarePlanStampModal.jsx
git rm content/modules/care-plan-stamp/components/AuditWizard.jsx
git commit -m "feat(careplan-v8): render AuditWorklist for v2-comprehensive; retire grouped wizard + dashboard step"
```

---

## Task 5: CSS (`cpas-wl__` namespace)

**Files:**
- Modify: `content/css/care-plan-stamp.css`

Port the mock's styles under a `cpas-wl__` prefix (worklist), matching the extension's existing `cpas-` conventions. Cover: sticky header + progress bar; sidebar (`bAdd` gated button + hint; group labels w/ status dots; add/remove/check rows w/ st-dot states needs/ready/done; touches count pill; covered `crow`; dropped fold); detail actions (primary/danger/ghost, hint, done-tag); "why" one-line + expander; editable item rows (reuse existing `cpas-iv-row` where possible). Keep amber = `--act:#b45309`, add-green = `--add:#0e9f6e`, remove = `--rem:#e11d48`, check = `--chk:#d97706`.

**Step 1** Add the CSS block. **Step 2** Build + eyeball via harness (Task 6). **Step 3** Commit:
```bash
git add content/css/care-plan-stamp.css
git commit -m "style(careplan-v8): sidebar-worklist styles (cpas-wl namespace)"
```

---

## Task 6: Manual verification (v2 mock harness + V1 regression)

**Files:** none (verification only). Uses `?cpv2=mock`.

**Step 1: Build** `npm run build` → reload the extension (`super-ext <worktree>`) → open a patient's care-plan page with `?cpv2=mock` appended, open the Comprehensive audit.

**Step 2: V2 checks** (against `.context/careplan-v8-sidebar-MOCK.html`):
- Worklist shows Add / Remove / Check groups + Covered rows + "we removed N" dropped fold.
- Each add row shows its touches badge; filling a slot decrements it; row dot goes needs→ready.
- "Add all" is **disabled** with "fill N amber slots to enable" until every add's touches = 0, then enables.
- Per-focus "✓ Add to Careplan" adds one focus, marks it done, advances.
- Remove row → "Remove this focus" resolves (reflects resolveStatus); Check row → "your judgment".
- Covered row → read-only on-plan panel.
- Dropped row → "Re-add" (only if `focus` present) / "Confirm removal"; confirming dims but keeps the row (never silent).
- "what we auto-filled ⌄" expands receipts.
- **No drug names** anywhere in goal/intervention text — interventions say "as ordered".

**Step 3: V1 regression** — open a NON-pilot (v1) patient (no `?cpv2`): the care-plan UI must look exactly as today (dashboard/rail, no worklist, no dropped fold, no touches badges). If V1 changed, the `isV2(audit)` gating is wrong — fix before shipping.

**Step 4: Full test suite**

Run: `npx vitest run`
Expected: all files pass (incl. `worklistModel.test.js`).

**Step 5: Commit** (if any fixup): `git commit -m "fix(careplan-v8): verification fixups"`

---

## Task 7: Analytics allowlist + final review

**Files:**
- Modify: `content/utils/analytics.js` (EVENT_SCHEMA allowlist) — per memory, any new `track()` REQUIRES an allowlist entry or it's silently dropped.

**Step 1: Add allowlist entries** for the new events: `care_plan_audit_focus_kept`, `care_plan_audit_dropped_confirmed`, `care_plan_audit_dropped_readded`. Match the existing schema format for `care_plan_audit_*` events.

**Step 2: Build + run tests** — `npm run build && npx vitest run`. Expected: green.

**Step 3: Request code review** — use superpowers:requesting-code-review before opening the PR. Confirm the four Don'ts hold: no drug names rendered, dropped[] never silent, Add-all gated, flag never read client-side.

**Step 4: Commit + PR**
```bash
git add content/utils/analytics.js
git commit -m "chore(careplan-v8): allowlist new audit worklist analytics events"
```
Open PR with `gh pr create --base main` — title `feat(careplan-v2): v8 sidebar-worklist redesign (Comprehensive)`, body summarizing the 3 new fields + the reused data layer + V1-unchanged gating.

---

## Out of scope (fast-follows, do NOT build here)
- Re-skinning **Initial** mode onto the worklist chrome (trivial once `AuditWorklist` exists; separate PR).
- Backend shipping the full `focus` on `dropped[]` (enables true Re-add; UI is already structured for it).
- Real-org (hcg/eac/fcsc) response reconciliation against the fixture (needs a user-provided capture).
