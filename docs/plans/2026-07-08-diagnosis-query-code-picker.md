# Diagnosis-query code picker (nurse side) — 2026-07-08

## Context

Backend + doctor portal already shipped (other repo). Physician queries no longer
carry an AI-guessed code: the Section I solver / I8000 checker now emit
`recommendedIcd10: []` on every `needs_physician_query` result. `recommendedIcd10`
on the create payload now means **"nurse-attached suggestion"** — whatever the
extension puts there is what the doctor sees under "Suggested". Send `[]` to send a
codeless query.

New endpoint the extension may use:
`GET /api/extension/icd10-search?q=<text>` (bearer auth) →
`{ results: { code, description }[] }`. Searches the whole ICD-10 dictionary by code
or description (min 2 chars). Initial-encounter (…A/…B/…C) codes are already scrubbed
server-side.

## Product decision (confirmed with Jonathan/Andrew)

On every "create / send diagnosis query" surface:

- **Nothing is pre-selected.** No AI-guessed code, ever. The nurse must deliberately
  attach a code if she wants one.
- **Suggestions are easily there:** the code picker auto-runs a library search seeded
  with the diagnosis name (or the source ICD-10 code) the moment it opens, so the top
  relevant codes are one click away — but every code shown comes from the sanctioned
  search endpoint, not an AI guess.
- **"Send without a code" is always one click away** and is the default state. Sends
  `recommendedIcd10: []`; the physician then picks the code.
- **Print is allowed with no code** (physician fills it in on paper).

Nudge, don't gate: "Attaching a code helps the physician — optional."

## Surfaces (all three get the picker)

| # | Surface | File | Kind |
|---|---------|------|------|
| A | QuerySendModal (single) | `content/queries/query-send-modal.js` | vanilla |
| B | Legacy MDS overlay modal (single) | `content/mds-overlay.js` (~4234) | vanilla |
| C | BatchReviewPage (multi, per-card) | `content/modules/query-items/components/BatchReviewModal.jsx` + `hooks/useBatchQuery.js` | Preact |

## Building blocks

1. **`QueryAPI.searchIcd10(q)`** in `content/queries/query-api.js` →
   `GET /api/extension/icd10-search?q=`, returns normalized `{code, description}[]`.
2. **`content/queries/lib/icd10-picker-util.js`** (pure, unit-tested):
   - `toRecommendedIcd10(selected)` → `[]` when nothing selected, else
     `[{ code, description, ...(reason && { reason }) }]`.
   - `normalizeSearchResults(data)` → `{code, description}[]`.
3. **`content/queries/icd10-code-picker.js`** — reusable *vanilla* widget
   (`window.Icd10CodePicker.create(container, { seedQuery, initialSelected, onChange })`).
   Renders selection chip / empty "no code" state + search box + results list;
   auto-searches `seedQuery` on open; debounced typeahead. Used by A and B.
4. **`content/modules/query-items/components/Icd10CodePicker.jsx`** — Preact
   equivalent used per card by C.

## Payload wiring changes

- **A**: drop the `icd10Options`-gated `<select>`; mount `Icd10CodePicker` seeded with
  the diagnosis name. `recommendedIcd10 = toRecommendedIcd10(selected)`. Stop seeding
  `selectedIcd10` from `noteData.preferredIcd10`. Print no longer requires a code.
- **B**: same, replacing the `#super-query-icd10` dropdown. Drop the
  `ai.recommendedIcd10` fallback merge.
- **C**: `updateIcd10(mdsItem, selected|null)` now stores the `{code, description}`
  object (or null). `buildRecommendedIcd10` collapses to
  `toRecommendedIcd10(selected)` — **may now be empty** (portal handles empty).
  `printAll` allowed with empty code. Per-card picker seeded with `item.icd10Code`
  (the row the nurse clicked) falling back to the item name.

## Non-goals

- No change to auto-`code` results (they still resolve `primaryIcd10`).
- `generate-note` still called for the note text; its `preferredIcd10`/`icd10Options`
  are simply no longer used for selection.
- No backend changes (done already).

## Tests

`content/queries/lib/__tests__/icd10-picker-util.test.js` — `toRecommendedIcd10`
(empty/selected/reason) and `normalizeSearchResults` (shape tolerance). Verify with
`npm run build` that all three surfaces compile.
