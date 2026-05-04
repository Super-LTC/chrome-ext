# ICD-10 Suggestions: Documented vs. Inferred — Backend Handoff

**For:** backend agent / API team
**From:** chrome-ext, ICD-10 viewer redesign work
**Date:** 2026-05-04
**Branch context (ext):** `icd10-leaf-multi-add`
**Severity:** clinical-correctness / audit risk
**Status:** **RESOLVED — backend changes shipped (worktree, awaiting merge).** See "Resolution" section at the bottom of this doc for what landed and how to consume it.

> **Important reframe (from backend):** the original framing in this doc
> distinguished `options[]` between "specificity siblings" and "inferred
> related codes" — that turned out to be wrong. `options[]` is actually
> **AWS Comprehend Medical's top-5 confidence-ranked candidate readings of
> a single text mention**. The top is stored as `icd10Code`; the rest go
> into `options[]`. So `options[]` are *lower-confidence alternate
> readings of the same text*, not extra documented codes. The fix is the
> same shape we proposed (flag on each option), but the field name is
> `evidenceKind: 'primary' | 'alternate'`. See Resolution.

---

## TL;DR

The chrome extension's ICD-10 viewer can present a leaf code (e.g. `B96.89`) as a stage-able, NTA-bearing suggestion even when **no document in the patient's chart mentions that specific leaf**. The mentions visible in the evidence panel are tagged for a *different* leaf (`B96.20`). A coder following the suggestion would push `B96.89` to PCC as a confirmed diagnosis with zero supporting evidence — the kind of finding that lands in a compliance review.

Frontend can't disambiguate "this code is documented" from "the model thinks this code might apply" because the API doesn't tell us which is which. This is a backend semantics/contract question, not a frontend rendering question.

---

## What we observe in the wire data

Endpoint: `GET /api/.../icd10/getAnnotationsByBaseCode?baseCode=B96`

Each returned annotation has shape roughly:

```ts
{
  id: string,
  icd10Code: string,          // e.g. "B96.20"
  description: string,
  pdpmCategory: string | null,
  pdpmPoints: number | null,
  documentId, pageNumber, quoteText, ...
  options: [                  // <-- the part that's ambiguous
    { code: "B96.21", description: "...", pdpmCategory: ..., pdpmPoints: ... },
    { code: "B96.29", ... },
    { code: "B96.89", ... },
    { code: "A41.51", ... },  // <-- different base code entirely
    { code: "A04.1",  ... },
    ...
  ]
}
```

**Concrete example we hit (real patient):**
- 17 annotations returned for base `B96`
- All 17 have `icd10Code: "B96.20"` (every single document mention is tagged B96.20)
- Each annotation's `options[]` includes `B96.89` with `pdpmCategory: "NTA", pdpmPoints: 1`
- `B96.89` therefore appears in:
  - The panel's leaf dropdown with an `NTA +1` badge
  - The Top Picks ranking (because the ranker scored the *base* B96 highly, and somewhere upstream B96.89 is rolled in)
- Coder clicks `B96.89`, panel renders all 17 mentions (which are all *B96.20* mentions), header says `B96.89 NTA +1`, big green Add button

A nurse looking at this sees "17 mentions across 1 document" + green Add button + NTA reward + a pile of evidence cards and reasonably concludes B96.89 is documented. It is not.

---

## The ambiguity in `options[]`

The frontend has no way to tell what `options[]` semantically means today. It could be either:

**Interpretation A — "specificity siblings of the documented code"**
The mention says "E. coli infection" and the document doesn't specify which subcategory; the AI offers `B96.20`, `B96.21`, `B96.29` as plausible specifications a coder could pick from based on chart context. **All of these are reasonable to bill** because the underlying *finding* is documented; only the specificity is open. Fine.

**Interpretation B — "model-inferred related codes that may also apply"**
The mention says "E. coli infection." The model adds `A41.51` (sepsis due to E. coli) and `A04.1` (Enterotoxigenic E. coli) to options[] because *if* this E. coli infection is a sepsis case or *if* it's a specific pathotype, those codes might also apply. **These are inferences with no documentary support** and should not be billed without further chart review. Dangerous.

We strongly suspect `options[]` today is a mix of both — and the frontend has no way to tell A from B.

---

## What the frontend currently does

- **Sidebar leaf tree** (lazy-loaded on row select): leaves derived from `Set(annotations.map(a => a.icd10Code))` only. Documented codes only. Honest.
- **Evidence panel dropdown / `_getAvailableCodes()`**: includes both `icd10Code` and every code from every annotation's `options[]`. Inflated set.
- **Mention cards**: each card renders its own `icd10Code` — so technically a sharp-eyed coder *could* notice that the focused leaf doesn't match the cards' codes. But the visual hierarchy doesn't make that pop, and the "17 mentions" count is taken at face value.

This means today:
- The sidebar is doing the right thing (only showing documented leaves).
- The evidence panel + dropdown is showing model alternatives mixed in with documented codes, indistinguishably.
- The "Top Picks" / NTA badging surfaces things like `B96.89` as if they're documented.

---

## What we need from backend

**Distinguish documented from inferred codes in the API response.**

Two viable shapes:

### Shape 1 — split the arrays

```ts
GET /api/.../icd10/getAnnotationsByBaseCode

response: {
  annotations: [
    {
      id, icd10Code, description, pdpmCategory, pdpmPoints,
      documentId, pageNumber, quoteText, ...
      // Specificity siblings: codes the chart finding could justify
      // billing as. Safe to suggest.
      specificityOptions: [
        { code: "B96.21", description, pdpmCategory, pdpmPoints, ... },
        { code: "B96.29", ... },
      ],
      // Model-inferred related codes with no direct documentary support
      // for THIS finding. Frontend will gate staging behind a warning.
      inferredOptions: [
        { code: "A41.51", description, pdpmCategory, pdpmPoints, ... },
        { code: "B96.89", ... },
      ],
    },
    ...
  ]
}
```

### Shape 2 — flag on each option

```ts
options: [
  {
    code: "B96.21",
    description, pdpmCategory, pdpmPoints,
    evidenceKind: "specificity_sibling",   // documented-equivalent
  },
  {
    code: "A41.51",
    description, pdpmCategory, pdpmPoints,
    evidenceKind: "inferred",              // no doc support
  },
]
```

We have a slight preference for **Shape 2** since it's a less invasive contract change and lets backend introduce a richer enum later (e.g. `documented`, `specificity_sibling`, `co_occurrence`, `pure_inference`). But either works.

### Same question for ranking / Top Picks

If the ranker can score a code that has **zero direct mentions** anywhere in the patient's documents (i.e. the code only appears in `options[]`, not as anyone's `icd10Code`), the ranker output should also flag that. Otherwise the sidebar's Top Picks elevates undocumented codes alongside documented ones — same audit problem at the section level.

Suggested:
```ts
GET /api/.../icd10/runIcd10Ranking

each ranked entry: {
  groupCode: "B96",
  rank: 2,
  pdpmCategory: "NTA", pdpmPoints: 1,
  // NEW: how the ranker arrived here
  evidenceBasis: "documented" | "inferred",
  evidenceMentionCount: number,
  ...
}
```

---

## What frontend will do once shipped

1. **Sidebar leaf tree** — already documented-only; no change.
2. **Evidence panel dropdown** — render documented codes normally; render inferred codes with a visible `inferred` chip and a tooltip ("Model suggestion, not directly documented"). **Disable the Add button** when an inferred code is focused, OR show a confirmation modal that requires acknowledgment.
3. **Top Picks** — same treatment if the ranker flags an entry as inferred. Today these blend in with documented top picks.
4. **"N mentions across M documents" counter** — recompute as mentions where `mention.icd10Code === focusedLeafCode`. If zero, replace with "No direct mentions of {focusedLeaf}" and a hint to switch to a documented sibling.

Frontend changes are ready to ship the moment the API distinguishes the two; we won't patch around the ambiguity in the meantime because any heuristic we add (e.g. "treat anything not in `Set(annotations.map(a => a.icd10Code))` as inferred") is a guess that could be wrong if `options[]` semantics shift.

---

## Open questions for backend

1. **What is the model's current intent for `options[]`?** Is it always "specificity siblings" (interpretation A), or does it mix in cross-base inferences (interpretation B)? Quick spot-check: look at any `options[]` where the option's first 3 chars don't match the parent annotation's base code (e.g. parent B96.20 has option A41.51) — those are by definition cross-base inferences.

2. **Is the ranker scoring codes that appear *only* in `options[]`, never as a real `icd10Code`?** If yes, those are inferred-only ranks. If no, then ranker output is fine and only the panel dropdown needs the distinction.

3. **What's the source of truth for `pdpmCategory` and `pdpmPoints` on inferred options?** If a code appears only in options, is its NTA assignment from a static lookup table (always-correct for that ICD code) or model-generated (could be wrong)? Important because right now inferred codes in the panel dropdown render full NTA badges and that's what makes them look authoritative.

4. **Mention count discrepancy** — when frontend says "17 mentions across 1 document" for a focused leaf, that count is the length of the loaded annotations array. Is that array the count of mentions for the *base* group or for the *focused leaf*? If base, the label is misleading whenever the focused leaf is anything other than the most-mentioned leaf.

---

## Reproduction

Patient with E. coli mentions but no documented sepsis or pathotype. Open ICD-10 viewer → Other Suggestions → click `B96 Unspecified Escherichia coli`. Expand sidebar leaves. Notice `B96.20` shown (correctly — has mentions). Open the panel's leaf dropdown. Notice `B96.89`, `A41.51`, `A04.1` listed with full NTA badges. Click any of them. Header updates, evidence cards still show only `B96.20` mentions, Add button is green and primed.

---

## Priority

This is the kind of bug that won't break a build but could break a compliance audit. We should not ship the redesigned multi-leaf UX (which makes the leaf list more prominent) without backend disambiguation, otherwise we're amplifying the existing risk.

If backend wants a 2-line interim mitigation while the proper change ships: gate the ranker output and `options[]` to *only codes that appear as a real `icd10Code` in at least one annotation in this patient's stay*. That removes inferred codes entirely (we lose the optionality but gain correctness). Frontend would not need any change for this interim.

---

## Resolution (2026-05-04)

Backend shipped two non-breaking, additive changes plus a new convenience field. All available behind feature-detect; no coordinated rollout required.

### Change 1 — `evidenceKind` on `options[]`

```ts
type ICD10OptionEvidenceKind = 'primary' | 'alternate';

interface ICD10CodeOptionSchema {
  code: string;
  description: string;
  confidence: number;
  pdpmCategory?: PDPMCategory | null;
  pdpmPoints?: number;
  pdpmCategoryName?: string;          // NEW — see Change 3
  evidenceKind?: ICD10OptionEvidenceKind;   // NEW — see below
}
```

**Semantics:** `evidenceKind: 'primary'` if this code appears as some annotation's `icd10Code` somewhere in the patient's set; `'alternate'` if it only appears in `options[]` arrays (i.e. Comprehend's lower-confidence reading of someone's text mention).

**Populated by:** `enrichOptionsWithPdpm(options, primaryCodesForPatient?)` in `core/services/icd10-annotation.service.ts`. New helper `getPrimaryIcd10CodesForPatient(patientId, { includeFiltered? }) → Promise<Set<string>>` does the patient-wide primary set lookup once per request.

**Available on:** `getAnnotationsByBaseCode` (`/api/extension/icd10-annotations/v2/by-code/[baseCode]`), `getGroupedByPatientId` (`/api/extension/icd10-annotations` v2), the v1 flat list path, and `/api/extension/icd10-annotations/[documentId]`. Anywhere annotations are serialized, options get the tag.

### Change 2 — Diagnoses with evidences (Approved bucket fix)

```
GET /api/patients/[id]/diagnoses?withEvidences=1[&includeFiltered=1]
```

Returns `DiagnosisWithEvidences[]` instead of bare `Diagnosis[]`:

```ts
interface DiagnosisEvidenceItem {
  id, icd10Code, description, confidence,
  evidenceExcerpt, pageNumber, documentId,
  documentTitle, documentEffectiveDate,
  wordBlockIndices,
}

interface DiagnosisWithEvidences extends Diagnosis {
  exactEvidences: DiagnosisEvidenceItem[];     // icd10Code === diagnosis.code
  siblingEvidences: DiagnosisEvidenceItem[];   // same 3-char base, different leaf
  // exact == "this specific code is documented in the chart"
  // sibling == "different leaf in the same family — supporting context, not direct"
}
```

Without the `withEvidences=1` query param: legacy bare `Diagnosis[]` (fully backward compatible).

**Excludes** Comprehend `options[]` codes from evidence attribution (those would be inferred, not documented). **Excludes** struck-out / resolved diagnoses unless `includeFiltered=1`.

### Change 3 — `pdpmCategoryName` on options (and parent annotation)

Optional human-readable category label, populated fresh from the ICD10ToPDPM crosswalk at API serialization time. **No DB migration; computed on the fly.**

Lets the picker show `NTA · 1pt · Cirrhosis of Liver` instead of cryptic `NTA +1`. Parent annotation has had its own `pdpmCategoryName` column for a while (unchanged); the new addition is purely on each entry inside the `options[]` JSONB array.

### Resolved open questions

1. **Ranker scope — confirmed safe.** `rankPatientICD10Groups` (`core/services/icd10-annotation.service.ts:1672`) reads only primary `icd10Code` rows via `getByPatientId`, groups by 3-char base prefix, enriches PDPM via `derivePdpmInfo(firstAnn.icd10Code, ...)`. **No `options[]` reads in the ranker path.** Top Picks at the section level is audit-safe by construction. If anyone changes the ranker input pool to include `options[]` later, that's the moment to add `evidenceKind` to ranker output too. Until then: no change needed at the ranker.

2. **Sibling evidence labeling — load-bearing.** Lumping `siblingEvidences` and `exactEvidences` would re-introduce the same audit issue at the Approved layer (e.g. `K70.31` rendering as confirmation of `K74.60`). Frontend MUST visually distinguish:
   - `exactEvidences` → "N direct evidence(s)" — emerald, prominent
   - `siblingEvidences` → "+M related" — slate, muted, smaller
   Within drill-in, two visually distinct sections labeled "Direct mentions" / "Related (different leaf)".

3. **Mention count for focused leaf — frontend's responsibility, contract supports it.**
   ```ts
   mentionsForFocused = annotations.filter(a => a.icd10Code === focusedLeaf);
   if (mentionsForFocused.length === 0) {
     // Render "No direct mentions of {focusedLeaf}"
     // Optionally suggest a documented sibling: highest-confidence
     // annotation where icd10Code shares the 3-char base AND is
     // a primary icd10Code (or appears as evidenceKind='primary'
     // somewhere in this patient's options arrays).
   }
   ```
   `evidenceKind` isn't strictly required for *this* fix (since the `icd10Code === focusedLeaf` comparison is enough), but it's complementary: when offering a "switch to documented sibling" suggestion, `evidenceKind` tells you which siblings are actually documented vs which are also alternates.

4. **NTA/SLP badges on alternates — clarification for FE rendering.** PDPM enrichment of options uses the same static `derivePdpmInfo` lookup as primaries — the badge value is correct *for the code*, not "model-generated and possibly wrong." So an alternate code with `pdpmCategory: 'NTA', pdpmPoints: 1, pdpmCategoryName: 'Cirrhosis of Liver'` has those values reliably. The audit risk isn't that the badge is wrong — it's that the *suggestion to bill that code at all* lacks documentary support. Frontend should still gate Add on `evidenceKind`, but the badges themselves can render normally.

### What frontend must do

1. **Picker dropdown** (and any "all available codes" lookup):
   ```ts
   const primary = new Set(annotations.map(a => a.icd10Code));
   const alternates = new Set(
     annotations
       .flatMap(a => a.options ?? [])
       .filter(o => o.evidenceKind === 'alternate')
       .map(o => o.code)
   );
   // Default: render `primary` as picker rows.
   // `alternates` go behind a "Show alternate readings" disclosure
   // OR render with a visible amber chip + Add button gated by confirm.
   ```
   Per-mention `options[]` stays attached to each mention card so a coder can override the code on a single mention — `evidenceKind` is informational there, not blocking.

2. **Mention count for focused leaf** — recompute from `annotations.filter(a => a.icd10Code === focusedLeaf).length`. Replace "N mentions across M documents" with "No direct mentions of {focusedLeaf}" when zero, optionally suggesting a documented sibling.

3. **Approved section** — fetch with `?withEvidences=1`. Render `exactCount` direct + `+siblingCount` related as visually distinct chips per the prototype. Show a soft hint when `exactCount === 0 && siblingCount === 0` ("no chart evidence yet").

4. **PDPM label** — render `pdpmCategoryName` next to `pdpmCategory` / `pdpmPoints` when present:
   ```
   Before: [ NTA +1 ]
   After:  [ NTA · 1pt · Cirrhosis of Liver ]
   ```
   Pattern: `[pdpmCategory, pdpmPoints && '${pdpmPoints}pt', pdpmCategoryName].filter(Boolean).join(' · ')`. Names are short ("Diabetes Mellitus", not "Diabetes Mellitus Including All Specified Variants") so they fit in one line in most picker rows. Ship whenever — no coordination required.

5. **Copy/UX language** — public-facing UI shouldn't use the word "inferred" since the actual semantic is Comprehend's lower-confidence reading. Recommended labels: "Alternate reading" or "Lower-confidence reading." Tooltip suggestion: *"AWS Comprehend's lower-confidence reading of the same text — primary code is documented elsewhere."*

### Interim mitigation (still available)

If the ext team can't ship the picker UX redesign immediately, the one-line fix is:
```ts
options.filter(o => o.evidenceKind === 'primary')
```
Removes the audit risk independently of any UX work.

### Files changed (backend, for reference)

```
core/schema/icd10-annotations.sql.ts                                   +30   ICD10OptionEvidenceKind, pdpmCategoryName on option type
core/services/icd10-annotation.service.ts                              +50   enrichOptionsWithPdpm sig + getPrimaryIcd10CodesForPatient
core/services/diagnoses.service.ts                                     +95   DiagnosisWithEvidences + getByPatientIdWithEvidences
web/app/api/patients/[id]/diagnoses/route.ts                           +20   ?withEvidences=1 support
web/app/api/extension/icd10-annotations/route.ts                        +5   primaryCodes derivation
web/app/api/extension/icd10-annotations/[documentId]/route.ts          +10   primaryCodes fetch
web/components/patients/icd10-code-sidebar.tsx                         +60   evidence count + click-through (web prototype reference)
web/components/patients/icd10-viewer-page.tsx                           +5   ?withEvidences=1 fetch (web prototype reference)
```
