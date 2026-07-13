# Diagnosis Query Picker + Note Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Feed the ICD-10 picker from the `generate-note` response (`preferredIcd10` + `icd10Options`) instead of a raw search, render a compact recommended-first curated list with free-text search demoted behind a disclosure, and make the physician note the visual anchor — across all three send surfaces.

**Architecture:** Extract one pure, unit-tested helper (`buildSuggestedList`) that turns `{preferred, options}` into an ordered, deduped, recommended-flagged list. Both pickers (vanilla + Preact) render from it in a new "curated mode" (when `options` are supplied) and fall back to the existing seed-search mode when they are not. Each of the three mount sites already fetches `generate-note`, so wiring is threading two already-in-scope fields into props and reordering so the note leads. Attach behavior is **Option A**: nothing pre-attached; `preferred` is a one-tap; codeless-send stays valid.

**Tech Stack:** Vanilla JS + Preact (hybrid), Vitest (jsdom) for pure-helper tests, Vite build. UI rendering has no component-test harness in this repo (only pure `__tests__/*.test.js`), so picker rendering is verified by `npm run build` + manual check on each surface — the plan is explicit about that.

**Design doc:** `docs/plans/2026-07-12-diagnosis-query-picker-redesign-design.md`

---

## Contract for the new picker (both implementations)

New optional props/opts, added alongside the existing ones:
- `preferred`: `{code, description} | null` — the backend's `preferredIcd10`.
- `options`: `Array<{code, description}>` — the backend's `icd10Options`.

**Curated mode** (active when `options` is a non-empty array):
- Render `buildSuggestedList({preferred, options})` as the default list.
- The recommended row (first, `recommended: true`) is emphasized with a ★ / "Recommended" treatment and an explicit **Attach** affordance.
- Do **not** auto-run a seed search on mount.
- Free-text search input + results live behind a "Search for a different code" disclosure that starts collapsed. Expanding it uses the existing `searchIcd10` path unchanged.
- Clicking any curated row attaches it (same `setSelected`/`onChange` as a search result). Nothing is attached until clicked.

**Legacy mode** (no `options`): unchanged current behavior (seed search on mount). This keeps any caller we haven't wired working.

Attach → chip and codeless-remove behavior are unchanged in both modes.

---

## Task 1: Pure `buildSuggestedList` helper (TDD)

**Files:**
- Modify: `content/queries/lib/icd10-picker-util.js`
- Test: `content/queries/lib/__tests__/icd10-picker-util.test.js`

**Step 1: Write the failing tests** — append to the existing test file:

```js
import { buildSuggestedList } from '../icd10-picker-util.js';

describe('buildSuggestedList', () => {
  it('returns [] when there is no preferred and no options', () => {
    expect(buildSuggestedList({ preferred: null, options: [] })).toEqual([]);
    expect(buildSuggestedList({})).toEqual([]);
  });

  it('puts preferred first and flags it recommended', () => {
    const out = buildSuggestedList({
      preferred: { code: 'D50', description: 'Iron deficiency anemia' },
      options: [
        { code: 'D50', description: 'Iron deficiency anemia' },
        { code: 'D51', description: 'Vitamin B12 deficiency anemia' },
      ],
    });
    expect(out).toEqual([
      { code: 'D50', description: 'Iron deficiency anemia', recommended: true },
      { code: 'D51', description: 'Vitamin B12 deficiency anemia', recommended: false },
    ]);
  });

  it('adds preferred even when it is absent from options', () => {
    const out = buildSuggestedList({
      preferred: { code: 'D50', description: 'Iron deficiency anemia' },
      options: [{ code: 'D51', description: 'B12' }],
    });
    expect(out.map(r => r.code)).toEqual(['D50', 'D51']);
    expect(out[0].recommended).toBe(true);
    expect(out[1].recommended).toBe(false);
  });

  it('lists options with none recommended when preferred is null', () => {
    const out = buildSuggestedList({
      preferred: null,
      options: [{ code: 'D51', description: 'B12' }, { code: 'D52', description: 'Folate' }],
    });
    expect(out).toEqual([
      { code: 'D51', description: 'B12', recommended: false },
      { code: 'D52', description: 'Folate', recommended: false },
    ]);
  });

  it('dedupes by code and drops entries without a code, preserving option order', () => {
    const out = buildSuggestedList({
      preferred: { code: 'D50', description: 'Iron' },
      options: [{ code: 'D50', description: 'dup' }, {}, null, { description: 'no code' }, { code: 'D51', description: 'B12' }],
    });
    expect(out.map(r => r.code)).toEqual(['D50', 'D51']);
  });

  it('coerces missing descriptions to empty string', () => {
    const out = buildSuggestedList({ preferred: { code: 'D50' }, options: [] });
    expect(out).toEqual([{ code: 'D50', description: '', recommended: true }]);
  });
});
```

**Step 2: Run to verify it fails** — `npx vitest run content/queries/lib/__tests__/icd10-picker-util.test.js`
Expected: FAIL — `buildSuggestedList is not a function`.

**Step 3: Implement** — add to `icd10-picker-util.js`:

```js
/**
 * Build the ordered, deduped suggestion list for the picker's curated mode.
 * Preferred goes first (recommended: true); remaining options follow in order.
 * Dedupes by code, drops entries without a code, coerces descriptions.
 * @param {{preferred?: {code, description}|null, options?: Array<{code, description}>}} input
 * @returns {Array<{code: string, description: string, recommended: boolean}>}
 */
export function buildSuggestedList({ preferred, options } = {}) {
  const seen = new Set();
  const out = [];
  const push = (entry, recommended) => {
    if (!entry) return;
    const code = entry.code;
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({ code, description: entry.description || '', recommended });
  };
  push(preferred, true);
  for (const o of Array.isArray(options) ? options : []) push(o, false);
  return out;
}
```

**Step 4: Run to verify pass** — same vitest command. Expected: PASS (all buildSuggestedList cases + existing suites green).

**Step 5: Commit**

```bash
git add content/queries/lib/icd10-picker-util.js content/queries/lib/__tests__/icd10-picker-util.test.js
git commit -m "feat(diagnosis-query): buildSuggestedList helper for curated code picker"
```

---

## Task 2: Vanilla picker — curated mode

**Files:**
- Modify: `content/queries/icd10-code-picker.js`

**Step 1: Extend the signature and import.** Add `buildSuggestedList` to the import from `./lib/icd10-picker-util.js`. Change `create(container, { seedQuery = '', initialSelected = null, onChange = () => {} } = {})` to also destructure `preferred = null, options = []`.

**Step 2: Compute mode once inside `create`:**

```js
const curated = buildSuggestedList({ preferred, options });
const isCurated = curated.length > 0;
```

**Step 3: Curated markup.** When `isCurated`, render the curated list as the default `results` content and wrap the search input in a collapsed disclosure. Reuse the existing `super-icd10-picker__result` button structure so `onResultsClick` keeps working, but add a `--recommended` modifier + an "Attach" affordance on the recommended row:

```js
function renderCuratedList() {
  const rows = curated.map(r => `
    <!-- NO_TRACK: intra-widget code-picker result; business event fires at query send -->
    <button type="button" class="super-icd10-picker__result${r.recommended ? ' super-icd10-picker__result--recommended' : ''}"
            data-code="${escapeHTML(r.code)}" data-desc="${escapeHTML(r.description || '')}">
      ${r.recommended ? '<span class="super-icd10-picker__result-badge">★ Recommended</span>' : ''}
      <span class="super-icd10-picker__result-code">${escapeHTML(r.code)}</span>
      <span class="super-icd10-picker__result-desc">${escapeHTML(r.description || '')}</span>
      ${r.recommended ? '<span class="super-icd10-picker__result-attach">+ Attach</span>' : ''}
    </button>
  `).join('');
  resultsEl.innerHTML = rows;
}
```

**Step 4: Disclosure.** In curated mode, hide `.super-icd10-picker__search` behind a toggle button (`data-role="toggle-search"`, label "Search for a different code"). On click, reveal the input and focus it. Add the listener in the listeners block and remove it in `destroy()`. Keep the input's existing `onInput`/debounce/`runSearch` untouched — expanding just unhides it.

**Step 5: Init branch.** Replace the mount-time seed search:

```js
renderSelection();
if (isCurated) {
  renderCuratedList();              // no network call; curated list is the default
} else if (!selected && seedQuery && seedQuery.trim().length >= 2) {
  runSearch(seedQuery, { heading: 'Suggested for this diagnosis' });  // legacy fallback
}
```

Also: when a selection is removed in curated mode, re-render the curated list instead of re-running the seed search (`onSelectionClick`).

**Step 6: Verify build** — `npm run build`. Expected: build succeeds, no reference errors.

**Step 7: Commit**

```bash
git add content/queries/icd10-code-picker.js
git commit -m "feat(diagnosis-query): vanilla picker curated mode (recommended-first + disclosed search)"
```

---

## Task 3: Preact picker — mirror curated mode

**Files:**
- Modify: `content/modules/query-items/components/Icd10CodePicker.jsx`

**Step 1: Props + import.** Add `preferred = null, options = []` to props; import `buildSuggestedList` alongside `normalizeSearchResults`.

**Step 2: Derived mode.** Compute inside the component:

```js
const curated = buildSuggestedList({ preferred, options });
const isCurated = curated.length > 0;
const [searchOpen, setSearchOpen] = useState(false);
```

**Step 3: Skip the seed effect in curated mode.** Guard the mount seed effect so it only runs when `!isCurated`:

```js
useEffect(() => {
  if (!isCurated && !selected && seedQuery && seedQuery.trim().length >= 2) {
    runSearch(seedQuery, 'Suggested for this diagnosis');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [seedQuery]);
```

**Step 4: Render.** When `isCurated` and no `selected`, render the curated list (map over `curated`, `--recommended` modifier + ★/Attach on `r.recommended`, `onClick={() => pick(r)}`), and put the search `<input>` + results behind a "Search for a different code" toggle (`searchOpen`). When not curated, keep the current always-visible search block. The `pick` and `remove` handlers stay as-is (in curated mode `remove` should reset `searchOpen` to false and not re-seed).

**Step 5: Verify build** — `npm run build`. Expected: success.

**Step 6: Commit**

```bash
git add content/modules/query-items/components/Icd10CodePicker.jsx
git commit -m "feat(diagnosis-query): Preact picker curated mode mirror"
```

---

## Task 4: Wire single-query modal + note-first layout

**Files:**
- Modify: `content/queries/query-send-modal.js` (mount ~L176–199; note/HTML ~L518–522; `generate-note` stored in `_state.noteData` ~L114)

**Step 1: Pass curated data to the picker.** In the `Icd10CodePicker.create(...)` call, add:

```js
this._picker = window.Icd10CodePicker.create(pickerContainer, {
  seedQuery,                                   // kept as legacy fallback
  preferred: this._state.noteData?.preferredIcd10 || null,
  options: this._state.noteData?.icd10Options || [],
  initialSelected: this._state.selectedIcd10,
  onChange: (selected) => { this._state.selectedIcd10 = selected; }
});
```

**Step 2: Note-first order.** In the modal body template, move the note block above the `#super-query-icd10-picker` container so the physician note is the anchor and the compact picker sits beneath it. (Verify against the real template region around L518.)

**Step 3: Verify build** — `npm run build`. Expected: success.

**Step 4: Commit**

```bash
git add content/queries/query-send-modal.js
git commit -m "feat(diagnosis-query): single-query modal — curated picker + note-first"
```

---

## Task 5: Wire batch Review & Send + note-first card

**Files:**
- Modify: `content/modules/query-items/components/BatchReviewModal.jsx` (ReviewCard ~L128–174)
- Verify only: `content/modules/query-items/hooks/useBatchQuery.js` (already stores `preferredIcd10` / `icd10Options` per item ~L64–66 — no change expected)

**Step 1: Pass curated data per card.**

```jsx
<Icd10CodePicker
  seedQuery={seedQuery}
  preferred={gq.preferredIcd10 || null}
  options={gq.icd10Options || []}
  selected={gq.selectedIcd10 || null}
  onChange={(selected) => onUpdateIcd10(gq.item.mdsItem, selected)}
  disabled={disabled}
/>
```

**Step 2: Note-first in the card.** Reorder the card body so the "Query Note" field block renders **before** the ICD-10 picker field block (currently picker is first, ~L148, note second, ~L158).

**Step 3: Verify build** — `npm run build`. Expected: success.

**Step 4: Commit**

```bash
git add content/modules/query-items/components/BatchReviewModal.jsx
git commit -m "feat(diagnosis-query): batch review — curated picker + note-first card"
```

---

## Task 6: Wire legacy MDS overlay modal

**Files:**
- Modify: `content/mds-overlay.js` (`fetchAndPopulateNote` ~L4397; picker mount ~L4443–4458; `fetchAIGeneratedNote` returns `{note, preferredIcd10, icd10Options}` ~L4201–4231)

**Step 1: Capture the full note response.** Where the code currently does `const { note } = await fetchAIGeneratedNote(result);`, capture `preferredIcd10` and `icd10Options` too, and stash them where the picker-setup code can read them (same scope as `selectedIcd10`).

**Step 2: Pass to the picker.** In the `window.Icd10CodePicker.create(...)` call, add `preferred` + `options` from the captured response. If picker creation currently runs before the note fetch resolves, defer it (or re-create it) so the curated data is available at mount — the picker container already exists (`#super-query-icd10-picker-legacy`).

**Step 3: Verify build** — `npm run build`. Expected: success.

**Step 4: Commit**

```bash
git add content/mds-overlay.js
git commit -m "feat(diagnosis-query): legacy MDS overlay — curated picker data"
```

---

## Task 7: Styles — recommended row, disclosure, note anchor

**Files:**
- Modify: the picker/modal stylesheet (find with `grep -rl "super-icd10-picker__result" content/css content` — likely `diagnosis-query-modal.css`; confirm the batch surface loads the same classes).

**Step 1: Add styles** for `super-icd10-picker__result--recommended` (emphasis: border/background/left accent), `__result-badge` (★ Recommended pill), `__result-attach` (right-aligned Attach affordance), and the "Search for a different code" toggle (link/secondary button, collapsed by default). Ensure the note section reads as the anchor (adequate height, clear edge/heading) on the single-query modal.

**Step 2: Verify build** — `npm run build`. Expected: success.

**Step 3: Commit**

```bash
git add content/css
git commit -m "style(diagnosis-query): recommended-row emphasis + search disclosure"
```

---

## Task 8: Full verification across all three surfaces

**Step 1: Unit tests** — `npx vitest run content/queries/lib/__tests__/icd10-picker-util.test.js`. Expected: all green.

**Step 2: Build** — `npm run build`. Expected: success, bundle emitted.

**Step 3: Manual check (load `dist/`, per CLAUDE.md — `super-ext` symlink).** For **each** surface — single-query modal, batch Review & Send, legacy MDS overlay — confirm:
- The recommended code (e.g. D50 for anemia) appears **first and emphasized**; the wrong D46.x list is gone.
- The full `icd10Options` list is visible; free-text search is hidden until "Search for a different code" is clicked.
- Nothing is attached until the nurse clicks (Option A); Attach → chip; removing the chip returns to codeless.
- The note is the visual anchor (single modal: note above picker; batch card: note above picker).
- Sending codeless still works; sending with an attached code still works.

**Step 4: Use superpowers:verification-before-completion** to confirm each claim above with actual observed output before declaring done.

**Step 5: Final commit / PR** — per `project_pr_workflow_super_ltc` memory: push to the `Super-LTC/chrome-ext` remote as `Superjonathan123/icd10-picker-ux` and `gh pr create --repo Super-LTC/chrome-ext --base main`. Only when the user asks to open the PR.

---

## Notes / guardrails

- **Option A everywhere:** never pre-attach `preferred`. It is always a one-tap; codeless is the default and one click back. This preserves the shipped "no AI-guessed codes attached" contract.
- **Legacy mode intact:** any caller not passing `options` keeps the old seed-search behavior — no regressions on unwired paths.
- **Analytics:** deferred (NO_TRACK on this widget; the business event fires at query send). Do not add tracking.
- **DRY:** all ordering/dedup logic lives in `buildSuggestedList`; both pickers render from it. Don't duplicate the ordering in the components.
