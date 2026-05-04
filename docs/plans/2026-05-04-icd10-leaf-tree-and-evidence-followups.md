# ICD-10 Viewer: Leaf Tree + Evidence Disambiguation Follow-ups

**Branch:** `icd10-leaf-multi-add`
**Date:** 2026-05-04
**Status:** Phase 1 (sidebar leaf tree, NTA-first sort, focused-state survival) shipped on branch. Phase 2 (evidence-vs-inference disambiguation + category-name UX) ready to start once backend changes merge.
**Companion doc:** `2026-05-04-icd10-evidence-vs-inference-handoff.md` — backend changes that unblock Phase 2.

---

## Phase 1 — what's already on this branch

Five commits, building toward "Option C" (leaves nest in sidebar, evidence panel back to single-code focus + dropdown):

1. **per-leaf [+ Add]** in evidence panel — *reverted* (UI was overwhelming for groups with 5+ identical-looking leaves like J44).
2. **revert** — back to original single-code panel + dropdown.
3. **sidebar leaf tree (Option C)** — chevron toggle, lazy-fetch leaves, nested rendering. Solves the multi-leaf navigation problem at the right surface.
4. **auto-expand on select, drop chevron** — selected row reveals its leaves automatically; single-leaf groups show no nested list.
5. **stuck-loading fix** — leaf-fetch effect's loading marker is now always cleared in `finally`, even when cancelled.
6. **NTA-first sort + focused-code header badge** — Top Picks and Other suggestions sort by category priority (NTA → SLP → Nursing → Section-I → plain) with rank/count as tiebreak. Focused code's pdpm badge renders inline next to the code pill.
7. **focused-leaf staged state survives navigation** — `stagedLeafCodes` Set on the panel, mirrored from viewer; Add/Added button reflects the right state when navigating away and back to a previously-staged leaf.

**Files touched:**
- `content/modules/icd10-sidebar/Sidebar.jsx` — `LeafRow`, `LeafList`, `categoryPriority`, auto-expand effect, ref-based dedupe
- `content/icd10-viewer/icd10-sidebar.js` — pass-through props for tree mode
- `content/icd10-viewer/icd10-viewer.js` — `_fetchLeavesForBase`, `_handleSidebarLeafSelect`, `_computeStagedLeafCodes`, `_refreshSidebarStaged` mirrors panel
- `content/icd10-viewer/icd10-evidence-panel.js` — `stagedLeafCodes` Set + `setStagedLeafCodes` + `_isFocusedLeafStaged`, header pdpm badge
- `content/css/icd10-viewer.css` — leaf-tree styling, header badge styling

---

## Phase 2 — follow-ups from the backend evidence/inference fix

Backend has shipped `evidenceKind: 'primary' | 'alternate'` on `options[]`, `pdpmCategoryName` on options + parents, and `?withEvidences=1` on the diagnoses endpoint. See companion handoff doc for full contracts.

### Task 2.1 — Picker dropdown filters alternates by default

**Problem:** `_getAvailableCodes()` in the evidence panel today merges `item.icd10Code` + every `item.options[].code`. That includes Comprehend's lower-confidence alternate readings (`evidenceKind: 'alternate'`), which can surface codes like `B96.89` even when no document mentions that leaf. Audit risk.

**Fix:**
```js
// content/icd10-viewer/icd10-evidence-panel.js — _getAvailableCodes
const primary = new Set();
const alternates = new Map(); // code → option entry (preserve pdpm + name)

for (const it of this.items || []) {
  if (it.icd10Code) primary.add(it.icd10Code);
  for (const opt of it.options || []) {
    // evidenceKind is optional; treat undefined as primary for back-compat
    // with older cached annotations that pre-date the backend change.
    if (opt.evidenceKind === 'alternate') {
      if (!alternates.has(opt.code)) alternates.set(opt.code, opt);
    } else {
      primary.add(opt.code);
    }
  }
}

return {
  primary: Array.from(primary).map(code => /* lookup desc + pdpm */),
  alternates: Array.from(alternates.values()),
};
```

**UX:**
- Default dropdown rows = primary only.
- A `Show {N} alternate readings ▾` disclosure at the bottom of the dropdown reveals alternates.
- Each alternate row gets an amber chip (`Alternate reading`) and a tooltip: *"AWS Comprehend's lower-confidence reading of the same text — primary code is documented elsewhere."*
- **Add button is disabled** when an alternate code is focused. Click on the disabled button shows a confirmation modal: *"This code isn't directly documented in any chart mention. Add anyway?"* — defensible audit posture.

**One-line interim** if 2.1 won't ship soon: just filter alternates out entirely. `o.evidenceKind === 'primary'`. Removes the audit risk without any UX work; loses the optionality but that's fine for an interim.

### Task 2.2 — Mention count for focused leaf is honest

**Problem:** Today's "17 mentions across 1 document" counts the loaded annotations array length, not mentions for the focused leaf. When a coder focuses an alternate (or a leaf with zero direct mentions), the count is misleading.

**Fix:**
```js
// In _renderDiagnosisHeader (or wherever mentions are counted):
const mentionsForFocused = (this.items || [])
  .filter(it => it.icd10Code === this.selectedCode);
const mentionCount = mentionsForFocused.length;
const docCount = new Set(mentionsForFocused.map(m => m.documentId)).size;

if (mentionCount === 0) {
  // Render: "No direct mentions of {focusedLeaf}"
  // Optionally: pick the highest-confidence sibling (same 3-char base,
  // primary evidenceKind) and offer a one-click "Switch to {code}" hint.
}
```

Render the count from the filtered set, not the full annotations array. Doc grouping and rendering already keys off `item.documentId`, so the existing render path naturally surfaces only the documents that have mentions for the focused leaf — no separate filter needed there.

### Task 2.3 — Approved bucket fetches with evidences

**Problem:** Today the Approved section in the sidebar shows code + description for diagnoses already on PCC, with zero indication of whether they have chart support. Nurse can't tell which approved codes are at risk in an audit.

**Fix:**
- Switch the diagnoses fetch in `icd10-viewer.js` to `?withEvidences=1`.
- For each approved row in the sidebar (existing approved-section render):
  - Render `{exactCount} direct` chip — emerald, prominent — when `exactEvidences.length > 0`.
  - Render `+{siblingCount} related` chip — slate, muted, smaller — when `siblingEvidences.length > 0`.
  - When **both are zero**, render a subtle hint: *"no chart evidence yet."*
- **Critical:** never lump `siblingEvidences` into the same evidence list as `exactEvidences` in any drill-in. If we expose them, label them clearly: "Direct mentions of {code}" vs "Related mentions ({sibling code} — same family)." Otherwise we re-introduce the same audit issue at the Approved layer.

**Files:** `icd10-viewer.js` (fetch param), `Sidebar.jsx` (Approved row + chips). New CSS classes for the count chips.

### Task 2.4 — `pdpmCategoryName` rendered everywhere a category is shown

**The user-visible problem (Ricky's ask):**
> "When they click on a code like B96, it shows the list of evidence and stuff. The issue is that it is not evidently clear what category that is. They have to know all the codes."

Coders shouldn't have to memorize that `B96` codes are "Bacterial infections" or that `K70` codes are "Liver disease, alcoholic." The backend now ships `pdpmCategoryName` (e.g. *"Cirrhosis of Liver"*, *"Acute Neurologic"*) on every option AND on the parent annotation. We need to surface it in every place we currently render `pdpmCategory` / `pdpmPoints`.

**Single helper for the label:**
```js
// Reusable: builds "NTA · 1pt · Cirrhosis of Liver" from any
// code-like object that has pdpmCategory / pdpmPoints / pdpmCategoryName.
function formatPdpmLabel(o) {
  return [
    o.pdpmCategory,
    o.pdpmPoints != null ? `${o.pdpmPoints}pt` : null,
    o.pdpmCategoryName,
  ].filter(Boolean).join(' · ');
}
```

**Where to render it:**

a) **Evidence panel header badge** (focused code's pdpm pill, currently shows `NTA +1`)
   - Replace `${label}` with `formatPdpmLabel(focusedMeta)` — keeps the colored pill background, adds the category name inline.
   - Visual: ` [NTA · 1pt · Cirrhosis of Liver] ` next to the code

b) **Panel dropdown rows** (`_getAvailableCodes` render path)
   - Each leaf option in the dropdown shows the full `formatPdpmLabel(opt)` instead of just `NTA +1` / `NURS`.

c) **Sidebar leaf rows** (`LeafRow` in Sidebar.jsx)
   - The leaf row's badge component currently shows abbreviations (`NTA +2`, `NURS`, `I`).
   - Add a tooltip with the full `formatPdpmLabel(leaf)` so hovering reveals "NURSING · Hemiplegia/Hemiparesis."
   - Keep the abbreviated badge inline (sidebar is space-constrained), but the tooltip + the panel header showing the full name = no memorization.

d) **Sidebar base-code rows** (Top Picks, Other) — the existing `tooltip` var on Row already pulls `row.pdpmCategoryName` for the badge title attr. Just make sure that field is being threaded through `enrichRanked` and `flatToRow` (it is — confirmed in `Sidebar.jsx:90+`). Verify in real data that the tooltips show; if not, wire it up.

**The Ricky-facing win:** when he clicks `B96` in the sidebar, the evidence panel header reads `B96 · Bacterial infection` (already does, from groupContext) and the badge reads `NTA · 1pt · Bacterial Infections` (after this change). He doesn't need to remember that B96 codes earn NTA-1; the panel says so.

### Task 2.5 — Drop "inferred" copy if it's anywhere

The original handoff doc used "inferred" for what backend now calls `evidenceKind: 'alternate'`. Public-facing copy must use **"Alternate reading"** or **"Lower-confidence reading"** to be accurate. Tooltip text: *"AWS Comprehend's lower-confidence reading of the same text — primary code is documented elsewhere."*

Search the codebase for `inferred` once Phase 2 lands; rename anything user-facing.

---

## Sequencing

```
Now              ← Phase 1 done, branch ready for review
                 ← Backend changes pending merge

Then (when backend lands):
  2.4 (category names)        ← UX win, low risk, visible everywhere
  2.1 (alternate gating)      ← Audit fix, the headline reason for Phase 2
  2.2 (mention count)         ← Cleanup that 2.1 implicitly enables
  2.3 (Approved evidences)    ← Nice-to-have, but separate UX surface
  2.5 (copy cleanup)          ← Final pass
```

2.4 first because it's the most visible, lowest-risk improvement and ships before backend's `evidenceKind` is even consumed — `pdpmCategoryName` is independent. Then 2.1/2.2 together (they share the dropdown rendering surface). Then 2.3 standalone. Then 2.5 cleanup.

---

## Out of scope

- Migrating evidence panel to Preact (still vanilla, ~1,200 lines). Tasks 2.1–2.5 are all surgical edits to the existing vanilla render path.
- Migrating the dropdown to a fancy combobox component. Existing dropdown stays; we just filter its inputs.
- Changing the ranker output. Backend confirmed the ranker is base-code only, no `options[]` leakage. Top Picks at the section level is audit-safe today.

---

## Verification before merging Phase 2

- B96 case (the original audit example): primary picker rows = `B96.20` only. Alternate disclosure shows `B96.21, B96.29, B96.89, A41.51, A04.1` with amber chips. Add disabled on each alternate; clicking opens confirm modal.
- Z99 case (Ricky's multi-add): primary picker = `Z99.11, Z99.2` (both have mentions). Alternates if any. Multi-add via sidebar leaf tree still works.
- Approved section: every approved diagnosis shows `N direct` and/or `+M related` chips. Diagnoses with no chart evidence at all show the soft "no chart evidence yet" hint.
- Header badge on every focused leaf reads `NTA · 1pt · Cirrhosis of Liver` (or whatever the category name is). No truncation in the typical sidebar width.
- Tooltip on sidebar leaf rows reveals the full category name on hover.
- Mention count is `0` (with empty-state copy) when an alternate is focused; matches the actual `icd10Code === focusedLeaf` count when a primary is focused.
