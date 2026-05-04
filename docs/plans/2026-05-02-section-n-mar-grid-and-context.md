# Section N MAR Grid Anchoring + Lookback Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two UX bugs that make nurses misread the Section N (insulin/injection) overlay as "the solver missed a day" when the solver is correct.

**Architecture:** Frontend-only changes in `content/mds-overlay.js` (and a tiny passthrough in `content/section-transformers.js`). (1) Anchor the MAR/TAR grid columns to the API's `dateRange` instead of deriving them from events, and visually distinguish "no order active" from "no event recorded." (2) Plumb `lookbackWindow` through Section N numeric items and render a "Lookback: …" line under Super Answer, mirroring Section J/H.

**Tech Stack:** Vanilla JS Chrome extension built with Vite. No test runner; verification is manual via `npm run build` + extension reload + repro on a known assessment.

**Repro case (single source of truth for verification):**
- Patient: Emma Karcic, asmt `8gvn7lfgvzzq`, external ID `15838804`
- Facility: Columbus Alzheimers Care Center (Lionstone), `America/New_York`
- ARD: 2026-04-29 → lookback 4/23 – 4/29 (7 days)
- Insulin Lispro order start 4/24 (4/23 is genuinely outside the order range)
- MAR has 6 distinct given days. Solver answer = **6**. Correct.
- PCC URL: `https://www30.pointclickcare.com/clinical/mds3/section.xhtml?ESOLassessid=15838804&sectioncode=N`

---

## Pre-flight (Task 0): Verify API contract

**Files:** none (read-only inspection)

Before writing any code, confirm the data the renderer receives is shape-correct. If any of these fail → **stop and report back**, do not paper over with frontend defaults.

**Step 1: Open the overlay on Emma Karcic's Section N (asmt 15838804) in Chrome with DevTools open.**

**Step 2: In the Network tab, find the response that feeds `renderSplitAdministrations` (search for `administration` in URL).** Confirm in the JSON body:
- `dateRange.startDate` is a date-only string `YYYY-MM-DD` (e.g. `"2026-04-23"`), not a UTC datetime that could shift days when parsed.
- `dateRange.endDate` is a date-only string and equals ARD (`2026-04-29`).
- `order.startDate` is populated (`2026-04-24` for Lispro). `order.endDate` may be `null` (open-ended order — that is normal).

**Step 3: In the Network tab, find the solver response feeding the Section N items (search for the assessment ID).** Confirm in the JSON body:
- `n0300`, `n0350a`, `n0350b` each have a `lookbackWindow` field with `{ startDate, endDate, daysCovered }` shape (Section J/H already produce this; we are confirming the Section N solver does too).

**Step 4: Record findings in plan.** If `lookbackWindow` is missing for Section N items → that is a backend gap. Note it in the PR description; Task 5 below adds the frontend passthrough but the backend solver may also need a one-line addition. **Do not invent a fallback in the frontend.**

**Step 5: Commit nothing.** This is inspection only.

---

## Task 1: Anchor MAR grid columns to `dateRange`

**Files:**
- Modify: `content/mds-overlay.js` — `buildAdminGridData` (~line 3083)

**Step 1: Read current `buildAdminGridData` (lines 3083–3131) to anchor the change.**

**Step 2: Change the function signature to accept `dateRange`.**

```js
function buildAdminGridData(adminRecords, dateRange) {
  const allTimes = new Set();
  // ...
}
```

**Step 3: Replace the date-collection logic (lines 3085–3097) with date-range enumeration.**

Generate one entry per day in `[dateRange.startDate, dateRange.endDate]` inclusive, regardless of events:

```js
function buildAdminGridData(adminRecords, dateRange) {
  const allTimes = new Set();

  // Collect time slots from events (unchanged behavior)
  for (const record of adminRecords) {
    if (!record.events) continue;
    for (const event of record.events) {
      if (event.time) allTimes.add(event.time);
    }
  }

  // Generate dates from the lookback window, not from events.
  // This ensures days with zero events still appear as columns.
  const dates = enumerateDateRange(dateRange.startDate, dateRange.endDate);

  // ... (sort times, build grid — unchanged below)
}
```

**Step 4: Add the `enumerateDateRange` helper near the other date helpers (~line 3328, near `shiftDateRange`).**

```js
// Returns YYYY-MM-DD strings for every day in [start, end] inclusive.
function enumerateDateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatDateForAPI(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
```

**Step 5: Remove the `const dates = [...allDates].sort();` line and the `allDates` Set entirely** — no longer needed.

**Step 6: Update both callers of `buildAdminGridData` to pass `dateRange`.**

Two call sites:
- `~line 3023`: `const gridData = buildAdminGridData(adminRecords);` → `buildAdminGridData(adminRecords, dateRange)`
- `~line 2637`: `const gridData = buildAdminGridData(adminRecords || []);` → `buildAdminGridData(adminRecords || [], dateRange)`

Both already have `dateRange` in scope (destructured from the API response).

**Step 7: Build and verify no syntax errors.**

```bash
npm run build
```
Expected: clean build (~270ms), bundle output to `dist/`.

**Step 8: Reload extension in `chrome://extensions`, refresh PCC page, open Emma's Section N overlay.**

Expected: MAR grid now shows **7 columns** (4/23, 4/24, 4/25, 4/26, 4/27, 4/28, 4/29). 4/23 column exists but every cell renders as `-` (existing empty rendering — Task 2 will improve this).

**Step 9: Smoke-test on a Section N assessment where the patient was on insulin for the full lookback window.**

Expected: grid still shows 7 columns, all dates have given/refused/etc. cells, no regression.

**Step 10: Commit.**

```bash
git add content/mds-overlay.js
git commit -m "fix(overlay): anchor MAR grid columns to dateRange instead of events"
```

---

## Task 2: Distinguish "no order active" from "no event recorded"

**Files:**
- Modify: `content/mds-overlay.js` — `renderAdminGrid` (~line 3151), `renderGridCell` (~line 3199)

**Decision rationale:** The pre-order vs. in-range-but-empty distinction is per-**date**, not per-**cell** (every time slot on a pre-order date is pre-order). Compute once per date in `renderAdminGrid` and pass an `isOutsideOrder` flag down to `renderGridCell`. Avoids re-checking the order range inside the per-cell loop.

**Step 1: Update `renderAdminGrid` signature to accept `order`.**

```js
function renderAdminGrid(gridData, order) {
  // ...
}
```

**Step 2: Compute the per-date "outside order" flag once before the row loop.**

```js
const dateOutsideOrder = {};
for (const date of dates) {
  dateOutsideOrder[date] = isDateOutsideOrderRange(date, order);
}
```

**Step 3: Add the `isDateOutsideOrderRange` helper near the other date helpers.**

Treat `order.endDate == null` as "open-ended" — only flag dates *before* `order.startDate`:

```js
function isDateOutsideOrderRange(dateStr, order) {
  if (!order || !order.startDate) return false;
  const date = parseDate(dateStr);
  const start = parseDate(order.startDate);
  if (date < start) return true;
  if (order.endDate) {
    const end = parseDate(order.endDate);
    if (date > end) return true;
  }
  return false;
}
```

**Step 4: Pass `isOutsideOrder` into `renderGridCell` from the row loop.**

```js
const cells = dates.map(date => {
  const cell = grid[time]?.[date];
  return renderGridCell(cell, dateOutsideOrder[date]);
}).join('');
```

**Step 5: Update `renderGridCell` to handle the three empty-cell cases.**

```js
function renderGridCell(cell, isOutsideOrder) {
  if (!cell) {
    if (isOutsideOrder) {
      return '<td class="super-admin-grid__cell super-admin-grid__cell--no-order" title="No order active">·</td>';
    }
    return '<td class="super-admin-grid__cell super-admin-grid__cell--empty" title="No event recorded">-</td>';
  }
  // ... existing cell rendering unchanged
}
```

(If a cell *exists* on a date that's outside the order range, that's a data anomaly — render it normally and let the existing styling show. Don't hide real data.)

**Step 6: Update both callers of `renderAdminGrid` to pass `order`.**

- `~line 2674`: `renderAdminGrid(gridData)` → `renderAdminGrid(gridData, order)`
- `~line 3065`: `renderAdminGrid(gridData)` → `renderAdminGrid(gridData, order)`

Both already have `order` in scope.

**Step 7: Add CSS for the new `--no-order` modifier.**

Find the existing `.super-admin-grid__cell--empty` rule in `content/css/` (grep for it). Add a sibling rule:

```css
.super-admin-grid__cell--no-order {
  background: var(--super-gray-100, #f3f4f6);
  color: var(--super-gray-400, #9ca3af);
  font-style: italic;
}
```

The `·` middle-dot glyph + muted styling makes pre-order columns visually distinct from `-` "no event" cells. Tooltip on hover gives the full reason.

**Step 8: Build.**

```bash
npm run build
```

**Step 9: Reload extension, repro Emma's case.**

Expected:
- 4/23 column: every cell is `·` with tooltip "No order active", greyed background.
- 4/24–4/29 columns: cells are `-` "No event recorded" where the slot was empty, otherwise the existing given/refused/code rendering.

**Step 10: Smoke-test the full-window case.**

Expected: no `--no-order` cells render; all 7 columns look like before. No regression.

**Step 11: Commit.**

```bash
git add content/mds-overlay.js content/css/
git commit -m "fix(overlay): distinguish 'no order active' from 'no event recorded' in MAR grid"
```

---

## Task 3: Preserve empty-events shortcut

**Files:**
- Modify: `content/mds-overlay.js` — empty-events branches at ~line 2675 and ~line 3065

**Decision:** When the API returns zero admin records, do NOT render an empty 7-column grid of `-` and `·` cells. Keep the existing "No events found in this date range" message — clearer than a wall of greyed cells.

**Step 1: Inspect the existing condition at line 2673–2676.**

```js
${adminRecords && adminRecords.length > 0
  ? renderAdminGrid(gridData)
  : '<div class="super-admin-empty">No events found in this date range</div>'
}
```

**Step 2: Confirm the condition still triggers correctly after Task 1.**

After Task 1 changes, `gridData.dates` will be 7 long even when `adminRecords` is empty (because we enumerate from `dateRange`). The `adminRecords.length > 0` guard *outside* `renderAdminGrid` still works correctly — the empty-records branch never calls `renderAdminGrid`. Verify by reading lines 2672–2677 and 3064–3068 to confirm both call sites use the same guard.

**Step 3: If either call site relied on `gridData.dates.length === 0` instead of `adminRecords.length === 0`, fix it to use `adminRecords` length.**

(Likely no change needed — both already gate on `adminRecords.length`. But re-check after Task 1 to be sure.)

**Step 4: Build and reload.**

```bash
npm run build
```

**Step 5: Manually verify the empty-events case.**

Find any patient with a Section N item whose insulin order is in the response but the API returns `adminRecords: []` (or temporarily mock it via DevTools). Expected: "No events found in this date range" message, no grid.

**Step 6: Commit.**

```bash
git add content/mds-overlay.js
git commit -m "fix(overlay): keep empty-events fallback message intact after grid anchoring"
```

(If Step 3 was a no-op, this commit may be empty — skip it.)

---

## Task 4: Plumb `lookbackWindow` through Section N transformers

**Files:**
- Modify: `content/section-transformers.js` (~lines 604–658)

**Step 1: Add `lookbackWindow` to the column data for `N0300` (line ~617, inside the `columns: { '': { ... } }` object).**

```js
items.push({
  mdsItem: 'N0300',
  description: getSectionNDescription('N0300'),
  columns: {
    '': {
      answer: String(sectionData.n0300.answer),
      confidence: sectionData.n0300.confidence,
      rationale: sectionData.n0300.rationale,
      evidenceCount: sectionData.n0300.evidenceCount || 0,
      distinctDays: sectionData.n0300.distinctDays,
      injections: sectionData.n0300.injections,
      lookbackWindow: sectionData.n0300.lookbackWindow,  // ← add
      isNumeric: true
    }
  }
});
```

**Step 2: Same addition for `N0350A` (~line 636) — `lookbackWindow: sectionData.n0350a.lookbackWindow`.**

**Step 3: Same addition for `N0350B` (~line 655) — `lookbackWindow: sectionData.n0350b.lookbackWindow`.**

**Step 4: Build.**

```bash
npm run build
```

**Step 5: Reload, open Emma's Section N overlay, open DevTools → Console.**

Run:
```js
// Inspect the most recent N0350A result on the page
document.querySelector('[data-mds-item="N0350A"]')  // adapt selector if needed
```

Or simpler: add a temporary `console.log(ai.lookbackWindow)` in `mds-overlay.js:985` and verify it logs `{ startDate: "2026-04-23", endDate: "2026-04-29", daysCovered: 7 }` for N0350A. Remove the log before committing.

**Step 6: Commit.**

```bash
git add content/section-transformers.js
git commit -m "fix(transformers): plumb lookbackWindow through Section N numeric items"
```

---

## Task 5: Render Section N lookback context line

**Files:**
- Modify: `content/mds-overlay.js` — popover body (~line 1024, inside the `super-popover-body` template)

**Decision:** Mirror the Section J/H pattern: a small `super-lookback-info` line directly under the Super Answer row. Do not include "X counted" in the line — the answer above already shows the count, redundancy reads awkward (per review feedback).

**Step 1: Add a helper near the other Section helpers (~line 1393, near `renderIncontinenceEpisodeDates`).**

```js
// Helper: Render lookback context line for Section N numeric items
function renderSectionNLookback(mdsItem, lookbackWindow) {
  const isNumericN = mdsItem === 'N0300' || mdsItem === 'N0350A' || mdsItem === 'N0350B';
  if (!isNumericN || !lookbackWindow) return '';
  return `<div class="super-lookback-info">Lookback: ${lookbackWindow.startDate} – ${lookbackWindow.endDate} (${lookbackWindow.daysCovered} days)</div>`;
}
```

**Step 2: Compute the HTML in the popover render block (~line 1014, alongside the other `*HTML` consts).**

```js
const sectionNLookbackHTML = renderSectionNLookback(result.mdsItem, ai.lookbackWindow);
```

**Step 3: Insert it into the template directly after the Super Answer row, before `${result.pccAnswer ? ...}` (~line 1035).**

```js
<div class="super-answer-row">
  ...
</div>
${sectionNLookbackHTML}

${result.pccAnswer ? ` ... ` : ''}
```

**Step 4: Build.**

```bash
npm run build
```

**Step 5: Reload, repro Emma's case on N0350A.**

Expected:
```
Super Answer: 6
Lookback: 2026-04-23 – 2026-04-29 (7 days)
```

**Step 6: Verify the line does NOT render on non-Section-N numeric items.**

Open a Section J item (e.g., J1800 falls). Expected: no duplicate lookback line under Super Answer (Section J already renders its own via `renderFalls`).

**Step 7: Commit.**

```bash
git add content/mds-overlay.js
git commit -m "feat(overlay): add lookback context line under Super Answer for Section N items"
```

---

## Task 6: Annotate insulin order list with active range

**Files:**
- Modify: `content/mds-overlay.js` — `renderMedications` (~line 1413)

**Step 1: Find the per-med detail line in `renderMedications` (~line 1433).**

Current:
```js
<div class="super-med-item__details">
  ${routeInfo}${typeInfo}${adminInfo}
  ${isClickable ? '<span class="super-med-view">View →</span>' : ''}
</div>
```

**Step 2: Add an "active range" span when `firstAdministered` and `lastAdministered` are present.**

```js
const activeRange = (med.firstAdministered && med.lastAdministered)
  ? `<span class="super-med-active">active ${med.firstAdministered} – ${med.lastAdministered}</span>`
  : '';
```

Insert it before `adminInfo` in the details template:

```js
<div class="super-med-item__details">
  ${routeInfo}${typeInfo}${activeRange}${adminInfo}
  ${isClickable ? '<span class="super-med-view">View →</span>' : ''}
</div>
```

**Step 3: Add CSS for `.super-med-active` matching the muted style of sibling spans.** (Find `.super-med-route` in the CSS files; add a sibling rule with same color/size/spacing.)

**Step 4: Build, reload, repro Emma's case.**

Expected: under "Insulin Injections (1)", the Lispro entry reads roughly:
```
Insulin Lispro
SubQ · Rapid-Acting · active 4/24 – 4/29 · 14 admins · View →
```

**Step 5: Smoke-test on a med without `firstAdministered` (e.g. mock data entry without those fields).**

Expected: line renders fine without the active range span — no "active undefined – undefined" string.

**Step 6: Commit.**

```bash
git add content/mds-overlay.js content/css/
git commit -m "feat(overlay): show order active range on insulin med list entries"
```

---

## Task 7: Final integration verification

**Step 1: Hard-refresh the extension and PCC page.**

```bash
npm run build
# then in chrome://extensions, click reload on Super LTC
# then hard-refresh the PCC tab (Cmd+Shift+R)
```

**Step 2: Open Emma Karcic's Section N (asmt 15838804). Verify the full expected state:**

- **Super Answer row:** `Super Answer: 6` followed by `Lookback: 2026-04-23 – 2026-04-29 (7 days)`.
- **Insulin Injections list:** `Insulin Lispro · SubQ · Rapid-Acting · active 4/24 – 4/29 · 14 admins · View →` (or similar; exact admin count depends on data).
- **Click "View →" on Lispro to open the MAR grid:**
  - 7 columns: 4/23, 4/24, 4/25, 4/26, 4/27, 4/28, 4/29.
  - 4/23 column: greyed `·` cells with tooltip "No order active".
  - 4/24–4/29 columns: existing given (`✓`) / refused / chart-code rendering, unchanged.
  - Empty cells inside order range: `-` with tooltip "No event recorded".
  - Footer event count and legend unchanged.

**Step 3: Smoke-test no-regression cases:**

- A patient on insulin for the full lookback window (no `--no-order` cells).
- A Section J falls item (no Section N lookback line bleed-through).
- A patient with `adminRecords: []` for an insulin order (empty message, no grid).

**Step 4: If everything passes, push the branch and open the PR.**

```bash
git push -u origin <branch>
gh pr create --title "fix(overlay): anchor MAR grid to lookback window + add Section N lookback context" --body "..."
```

PR body should include:
- The two issues fixed
- The repro case (Emma Karcic, ARD 4/29, Lispro from 4/24)
- A note on whether Task 0's pre-flight surfaced any backend gaps (e.g., if `lookbackWindow` was missing from the Section N solver response)
- Screenshots of before/after for the MAR grid and the Super Answer block

---

## Out of scope (do not implement in this PR)

- Distinguishing "PCC dropped a scheduled event" from "this slot wasn't scheduled that day" — needs per-day historical scheduling data we don't store.
- Replacing the shared MAR grid with a per-N0350A custom day grid — current changes should be enough; revisit only if nurses still misread.
- Any backend changes. If Task 0 surfaced that `lookbackWindow` is missing from the Section N solver response, file a follow-up backend ticket — this PR stays frontend-only.
