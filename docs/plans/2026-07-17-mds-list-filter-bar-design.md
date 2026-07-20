# MDS List Filter Bar — Design

**Date:** 2026-07-17
**Status:** Approved, ready to build
**Surface:** PointClickCare MDS List → "In Progress" tab (`mdslist.jsp`)
**Module:** extends `content/mds-list-coverage.js`

## Problem

A user (MDS coordinator / SSD) asked:

> "MDS Dashboard – Is there a way to filter what is due to be completed by the discipline? For instance, if an MDS is not signed for section B, C, D, E, Q they would populate to the SSD dashboard."

The MDS "In Progress" list can be long. Each discipline (Social Services, Nursing,
Dietary, Therapy) owns specific MDS sections, and each person only cares about the
residents whose *their* sections are still unsigned. Today there's no way to slice
the list. Beyond discipline, the same list would be more useful sliced by due date,
assessment type, name, and interview-UDA completeness.

## Key insight — it's pure client-side

Every dimension we want to filter on is **already on the page or already fetched**:

| Filter | Data source | Available |
|---|---|---|
| Search by name / MRN | native **Name** column | on page |
| Discipline (unsigned sections) | native **Unsigned Sections** column + a section→discipline map | on page |
| Overdue / Coming due soon | our **Complete By** model (`completeByModel().tone`) | already computed |
| Type of assessment | native **Type** column | on page |
| Missing interview UDA | our **Interviews Due** coverage results (`needed` chips) | already fetched |

No new backend work. The extension already injects "Complete By" / "Interviews Due"
columns and holds the batch coverage results (`ILC.resultsByKey`), so the filter is
a client-side layer on top.

## UX

A single **Super-branded toolbar** injected directly above the MDS "In Progress"
table (only on that screen). It must be visibly ours (indigo gradient + Super logo)
so users don't mistake it for PCC chrome. Left → right:

1. **🔎 Search** — text box; live substring match on Name + MRN (case-insensitive).
2. **Discipline** — toggle chips: `All · SSD · Nursing · Dietary · Therapy · MDS/Admin`.
3. **Sections ▾** — popover of individual section letters (A…S) for a custom pick.
4. **Type ▾** — dropdown, options built dynamically from the distinct values in the
   native Type column (always accurate).
5. **Due** — chips: `All · Overdue · Due soon (≤3d)`.
6. **Missing interview** — toggle chip → rows with any `needed` interview UDA.
7. Right side: **"Showing X of Y"** + **Clear**.

**One underlying piece of state ties discipline + sections together:** a **set of
selected section letters**. Discipline chips are presets that populate that set
(SSD → {B,C,D,E,Q}); the Sections popover edits the same set. Empty set = no section
filter. A row matches the section filter iff its unsigned sections intersect the set.

**Behavior:** filters combine with **AND**; non-matching rows get `display:none`.
When a section/discipline filter is active, the matched section letters in the native
Unsigned Sections cell are **bolded/highlighted** so the user sees *why* a row matched.
Zero matches → a quiet "No MDS match these filters" note. Filters **reset on each
visit** (no persistence — YAGNI).

### Discipline → section map (default, tweakable in code)

```
SSD (Social Services):  B, C, D, E, Q      (user's definition)
Nursing:                GG, H, I, J, L, M, N, O, P
Dietary:                K
Therapy / Rehab:        GG, O
MDS Coord / Admin:      A, V, X, Z          (+ any unmapped section)
```

Overlap is intentional (GG/O count for both Nursing and Therapy). A row matches a
discipline if *any* of that discipline's sections are still unsigned.

### Due buckets

Map to the already-computed `completeByModel().tone` (keyed off `daysRemaining`
against the ARD+14 completion deadline):

- **Overdue** = tone `overdue` (days < 0)
- **Coming due soon** = tone `urgent` (0–3 days)

## Architecture

**Toolbar UI: Preact** (per CLAUDE.md "Preact forward"). The row-hiding on PCC's
table is DOM manipulation either way; only the toolbar widget is Preact. The
`FilterBar` is a **controlled component** — filter state lives in the vanilla
controller (single source of truth), props in / `onChange` out — so re-rendering the
island after PCC repaints the table can't desync state.

**New files**
- `content/mds-list-coverage/FilterBar.jsx` — the Preact toolbar (controlled).
- `content/mds-list-coverage/filter-model.js` — pure logic: `DISCIPLINE_SECTIONS`,
  `DISCIPLINES`, `sectionsForDiscipline()`, `parseSectionList()`, `distinctTypes()`,
  `rowMatchesFilters(rowData, filters)`, `emptyFilters()`.
- `content/mds-list-coverage/__tests__/filter-model.test.js` — tests (must live in
  `__tests__/` — vitest `include` is `content/**/__tests__/**/*.test.js`; the existing
  `scrape.test.js`/`render-model.test.js` outside `__tests__/` are orphaned).

**Edited files**
- `content/mds-list-coverage.js` — mount the island in a stable, idempotently
  re-inserted container above the table (same `ensure…()` discipline as the header
  column); hold `filterState`; `applyFilters()` at the end of each render pass
  (hide rows + highlight matched letters + compute count); extend the
  MutationObserver `isOurNode` guard to treat `super-mlf-*` nodes as ours so the
  toolbar's own DOM writes don't retrigger the render loop.
- `content/mds-list-coverage/scrape.js` — pure extractors for the native Unsigned
  Sections and Type cells, located by **header index** (not a row-wide regex — the
  Type column is also letters). Native columns keep stable indices because our
  injected cells are appended at the end.
- `content/mds-list-coverage/__tests__/scrape-cells.test.js` — cover the new parsers.
- `content/css/mds-list-coverage.css` — toolbar + branding styles.
- `content/utils/analytics-schema.js` — add `mds_list_filter_changed` to
  `EVENT_SCHEMA` (new `track()` calls silently drop without an allowlist entry).

## Data flow per render pass

```
scrapeRows(table)          → [{ externalAssessmentId, rowEl, name, mrn,
                                unsignedSections[], type }]
ILC.resultsByKey[id]       → completeByModel().tone, hasNeededInterview
combine → rowData[]
applyFilters(rowData, filterState):
  for each row: rowEl.style.display = rowMatchesFilters(...) ? '' : 'none'
                highlight matched section letters
  count shown/total → re-render island with fresh { types, count }
```

## Analytics

One event, no PHI:

```
mds_list_filter_changed: ['discipline', 'due', 'missing_only',
                          'type_selected', 'has_search', 'sections_count',
                          'shown', 'total']
```

Fired (debounced) when the filter set changes. `discipline`/`due` are categorical
strings, the rest are booleans/counts. No names, MRNs, or free text.

## Testing / verification

- Unit tests (vitest) for `filter-model` (`rowMatchesFilters`, discipline mapping,
  section parsing) and the new scrape parsers — placed in `__tests__/` so they run.
- `npm run build` succeeds.
- Manual: load on the MDS In Progress list, exercise each filter, confirm counts,
  highlighting, reset-on-navigate, and that PCC unit/status switches keep the bar.

## Non-goals (v1)

- Per-facility configurable discipline mapping (Settings UI) — defaults in code only.
- Persisting filter selection across navigations.
- Sorting. Filtering only.
