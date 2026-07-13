# Diagnosis Query — Code Picker + Note Redesign

**Date:** 2026-07-12
**Branch:** Superjonathan123/icd10-picker-ux
**Status:** Design agreed, ready for implementation

## Problem

The "Send Diagnosis Query" review step (step 1) has an inverted information
hierarchy and a wrong data source:

1. **Selection isn't obviously selectable.** The suggestion rows render like a
   read-only reference table — no affordance that the nurse should pick one.
2. **Wrong / junk suggestions.** The picker fires its own
   `/api/extension/icd10-search?q=<diagnosis name>` and shows raw search order.
   For "Anemia" this surfaces D46.x *refractory* anemia variants — clinically
   wrong — while the correct code (D50 Iron deficiency anemia) isn't shown.
3. **The note is buried.** The tall code picker fills the viewport, pushing
   "Note for Physician" — the actual deliverable the physician reads — below the
   fold with no scroll cue.
4. **Competing messaging.** `Optional` + "No code attached…" + "SUGGESTED FOR
   THIS DIAGNOSIS" all fight, leaving the call-to-action ambiguous.

## Key insight — we already get the codes for free

`POST /api/extension/diagnosis-queries/generate-note` already returns everything
the picker needs, ranked and curated:

```json
{
  "note": "Patient has a documented history of anemia…",
  "preferredIcd10": { "code": "D50", "description": "Iron deficiency anemia" },
  "icd10Options": [
    { "code": "D50", "description": "Iron deficiency anemia" },
    { "code": "D51", "description": "Vitamin B12 deficiency anemia" },
    { "code": "D52", "description": "Folate deficiency anemia" },
    { "code": "D53", "description": "Other nutritional anemias" },
    { "code": "D55-D59", "description": "Hemolytic anemias" }
  ]
}
```

The picker should consume `preferredIcd10` + `icd10Options` as its default list.
Free-text search becomes the escape hatch only, for when the nurse wants
something outside the curated set.

## Design

### Layout (note leads)

```
Patient header
NOTE FOR PHYSICIAN            ← full-height, editable, the visual anchor
  [ generated note text … ]                              [edit]
SUGGESTED CODE FOR PHYSICIAN            Optional
  ★ D50   Iron deficiency anemia            [+ Attach]   ← preferred, emphasized
  ○ D51   Vitamin B12 deficiency anemia
  ○ D52   Folate deficiency anemia
  ○ D53   Other nutritional anemias
  ○ D55–D59  Hemolytic anemias
  🔍 Search for a different code ⌄          ← free-text search, disclosed
                                   [ Cancel ] [ Next ]
```

- **Note is first and full-height** so the physician-facing content is the
  anchor, not an afterthought.
- **Full `icd10Options` list visible** (only ~5 curated rows, not the old junk),
  `preferredIcd10` emphasized at the top with a ★ / "Recommended" treatment.
- **Free-text search hidden** behind "Search for a different code" disclosure —
  escape hatch, not the front door. When expanded it uses the existing
  `/api/extension/icd10-search` flow.

### Attach behavior — Option A (deliberate attach preserved)

Respects the existing shipped contract: **no AI-guessed code is pre-attached.**

- Nothing is attached on open. `preferredIcd10` (D50) shows as a one-tap
  **[+ Attach]** — the right code is one tap instead of a search, but the nurse
  still deliberately attaches it.
- Send stays **codeless-by-default**; sending without a code remains valid.
- After Attach, the code renders as a removable chip
  (`Attached: [ D50 Iron deficiency anemia ✕ ]`).

## Affected files

- `content/queries/query-send-modal.js` — pass `preferredIcd10` + `icd10Options`
  from the `generate-note` result into the picker; reorder modal so note leads.
  (Current wiring ~L184–199; codeless contract ~L395–407.)
- `content/queries/icd10-code-picker.js` — vanilla picker: accept
  `preferred` + `options` props, render curated list + emphasized recommended
  row, demote free search behind disclosure, drop the auto-seed search on mount.
- `content/modules/query-items/components/Icd10CodePicker.jsx` — Preact mirror.
- `content/queries/lib/icd10-picker-util.js` — keep `normalizeSearchResults`
  for the free-search path (still discards non-code/description fields there).
- `content/queries/query-api.js` — `searchIcd10` unchanged (used by the
  disclosed free-search only).
- `diagnosis-query-modal.css` — recommended-row emphasis, disclosure, note
  section height/edge, chip styles.

## Out of scope / non-goals

- No change to the free-search backend or `searchIcd10`.
- No change to the codeless-send contract or the print/e-sign paths.
- Analytics deferred (consistent with the existing NO_TRACK stance on this flow).
