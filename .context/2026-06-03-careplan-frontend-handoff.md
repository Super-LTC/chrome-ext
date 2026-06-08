# Care Plan — Frontend → Backend Handoff

**Audience:** backend agent (superltc.com / superapp). **Date:** 2026-06-03.
**Goal:** explain exactly what the Chrome extension does for the care-plan
features, which backend routes it calls, what request/response shapes it
expects, and how the UI consumes them — so backend changes don't silently
break the extension.

There are **four** distinct surfaces. All share one idea: the backend
analyzes a patient's diagnoses/MDS against their PCC care plan and tells the
extension what's covered, what's missing, and (for the wizard) what to write.

| # | Surface | Backend route | Shape returned |
|---|---------|---------------|----------------|
| 1 | **Auto-Pop wizard — Initial** | `POST /api/extension/care-plan/auto-pop` | `proposal` (focuses to create) |
| 2 | **Auto-Pop wizard — Comprehensive (Audit)** | `POST /api/extension/care-plan/audit` | `audit` (toAdd / toCheck / toRemove / onPlan) |
| – | wizard skip persistence | `POST`/`DELETE /api/extension/care-plan/skips` | fire-and-forget |
| 3 | **MDS overlay shields (Section I)** | `GET /api/extension/patients/{id}/mds-coverage` | per-MDS-item coverage |
| 4 | **Diagnosis-list shields (medDiagChart)** | `GET /api/extension/patients/{id}/diagnoses/status-overview` | per-diagnosis CP + query status |

All calls go through the background service worker via
`chrome.runtime.sendMessage({ type: 'API_REQUEST', endpoint, options })`,
which attaches the bearer token from `chrome.storage.local`. The content
script never talks to superltc.com directly.

**Critical ID note:** everywhere below, `patientId` is the **PCC clientid**
(e.g. `"923145"` — the number in PCC's `ESOLclientid` URL param), NOT our
internal UUID. The backend's proposal used to echo an internal UUID in
`proposal.patientId`; the extension overrides it with the PCC clientid from
the URL before stamping, because PCC's JSP endpoints reject the UUID with
HTTP 555.

---

## How PCC stamping works (shared by surfaces 1 & 2)

The extension does NOT ask the backend to write to PCC. The backend only
*proposes* content; the extension writes it into PCC via same-origin form
POSTs against PCC's own JSP endpoints (session cookies). This is why the
backend must return content as plain strings + canonical category hints, not
PCC-internal IDs (those are per-facility and scraped live by the extension).

**At modal open**, the extension scrapes from PCC (`pcc-discover.js`):
- `careplanId` — from `careplandetail_rev.jsp` (regex `ESOLcareplanid=(\d+)`)
- `miniToken` — CSRF nonce from the focus form
- **org dropdowns** — Kardex categories, Position/team IDs, Review-department
  IDs, with `{id → label}` maps. These IDs differ per facility, so they're
  read live every time.
- **existing focus texts** — walks ALL paginated pages of the care plan and
  collects every focus statement string, sent to the backend as
  `existingFocusTexts[]` for server-side dedupe.

**Stamp order** (per focus, sequential — `pcc-stamp.js`):
`focus → goals → interventions`. PCC echoes the new row ID in a
`refreshParent()` script which we regex out. No rollback on partial failure.

PCC JSP endpoints used (FYI — backend doesn't call these):
- `neededitcust_rev.jsp` — create custom focus
- `goaledit_rev.jsp` — create custom goal (parent via `ESOLneedid=focusId`)
- `intereditcust_rev.jsp` — create custom intervention
- `neededit_rev.jsp` — edit/resolve an existing focus
- `needwizard/goalwizard/interwizard_rev.jsp` — live library browse

---

## 1. Initial Auto-Pop — `POST /api/extension/care-plan/auto-pop`

**When:** "✨ AI Care Plan" button on `careplandetail_rev.jsp`. Default mode
is `initial` when the plan is empty. Used to populate a new admit's care plan
from scratch.

**Request body** (`stamp-api.js → fetchProposal`):
```jsonc
{
  "patientId": "923145",          // PCC clientid (string)
  "facilityName": "Bethesda...",
  "orgSlug": "gardenmeadow",
  "scope": "initial",
  "existingFocusTexts": ["...", "..."],   // all current plan focus statements
  "orgDropdowns": { "kardex": {...}, "positions": {...}, "reviewDepts": {...} }, // id→label maps (optional)
  "tokenValues": { "code_status": "DNR" },  // optional, prior token picks
  "patientName": "lopez, paul"     // optional
}
```
> POST (not GET) because `existingFocusTexts` + dropdown maps push large
> facilities past nginx's 8 KB URL limit.

**Response — `proposal`:**
```jsonc
{
  "patientId": "...",              // ignored by client; URL clientid wins
  "focuses": [
    {
      "ruleId": "diabetes_mellitus",     // stable key; used for skip/dedupe/dedupe-by
      "description": "Risk for unstable blood glucose r/t Diabetes Mellitus",
      "descriptionSegments": [           // OPTIONAL but preferred — see below
        { "kind": "text",  "text": "Advance directive: " },
        { "kind": "token", "tokenKey": "code_status", "needsFilling": true,
          "options": ["Full Code","DNR","DNI"] }
      ],
      "alreadyOnPlan": false,            // true → pre-skipped in UI
      "reviewDepartments": [9042],       // PCC review-dept IDs (numeric); default [9042]=Nursing
      "goals": [ { "description": "Blood glucose will remain 70-180..." } ],
      "interventions": [
        {
          "description": "Monitor blood glucose per MD order",
          "instruction": "...",          // optional
          "kardexCategory": "monitors",  // canonical string OR numeric facility ID
          "positionOne": "nurse_any",    // canonical string OR numeric facility ID
          "positions": [9042]            // optional multi-position array (preferred over positionOne)
        }
      ]
    }
  ],
  "skippedFocuses": [ /* same focus shape; previously skipped, shown collapsed */ ]
}
```

**Key contract points the backend must honor:**
- **`ruleId` is the identity key.** The UI tracks skip/stamp/dedupe by it.
  Must be stable across calls for the same logical focus.
- **`descriptionSegments`** is how fill-in-the-blanks work. Tokens with
  `needsFilling: true` (e.g. `code_status`, advance directive) gate stamping —
  the nurse must pick a value first. If you bake a blank as raw `___` inside a
  `kind:"text"` segment instead of a token, the extension has a safety-net
  guard (`/_{3,}/`) that blocks stamping, but the **right fix is backend**:
  emit blanks as `kind:"token"`, `needsFilling:true`.
- **`alreadyOnPlan`** focuses are pre-skipped (the backend does keyword
  matching against `existingFocusTexts` via its `RULE_KEYWORDS` map — keep that
  server-side; the extension does NOT match).
- **Kardex/position canonicals:** backend may return either a numeric facility
  ID (already resolved against `orgDropdowns`) OR a canonical string like
  `"monitors"`/`"nurse_any"`. If you return a string, the extension resolves it
  to the facility's numeric ID using a synonym table (`pcc-add-intervention.js`
  KARDEX_SYNONYMS / POSITION_SYNONYMS) — but **prefer returning resolved
  numeric IDs**; the synonym fallback is narrow. Fields you can't resolve →
  omit them (don't send bad IDs); the extension just won't set that field.
- **NKDA suppression is backend-only now.** The client filter was removed —
  don't surface a Medication-Allergies focus for no-known-drug-allergy
  residents in either `focuses[]` or audit `toAdd[]`.

**UI flow:** nurse reviews each focus in a rail+pane, edits text/goals/
interventions inline, fills tokens, skips already-on-plan. "Add to Careplan"
(single) or "Add all" → sequential PCC POSTs → reload careplandetail page.

**Skip persistence** — `POST`/`DELETE /api/extension/care-plan/skips`
`{ patientId, orgSlug, facilityName, ruleId }`. Fire-and-forget, idempotent
(`ON CONFLICT DO NOTHING` / 404-on-delete ignored). Purely wizard-cosmetic
(survives re-open); coverage/dashboards do NOT read this table. Skipped focuses
get filtered out of the next auto-pop's `focuses` and returned in
`skippedFocuses` instead.

---

## 2. Comprehensive Audit — `POST /api/extension/care-plan/audit`

**When:** "✨ AI Care Plan" on an established plan (default `comprehensive`),
the audit banner on `careplandetail_rev.jsp`, or the banner on
`view_review.jsp`. Audits an existing plan rather than building from scratch.

**Request body** (`audit-api.js → fetchAudit`): same as auto-pop minus
`scope` — `{ patientId, facilityName, orgSlug, patientName?, orgDropdowns?,
tokenValues?, existingFocusTexts? }`.

**Response — `audit`** (may be top-level or under `.audit`):
```jsonc
{
  "toAdd": [        // missing focuses to create — same focus shape as auto-pop, wrapped:
    { "ruleId": "...", "focus": { /* full focus: description, descriptionSegments,
                                     goals, interventions, reviewDepartments } } }
  ],
  "toCheck": [      // existing focuses with gaps — "verify / partial coverage"
    {
      "focusId": "929781",            // PCC focus ID (existing)
      "pccFocusId": "929781",
      "pccFocusStdItemId": "...",     // may differ from pccFocusId for existing focuses
      "focusText": "...",
      "coverageStatus": "partial_coverage",
      "suggestionSource": "ai",       // 'ai' shows an AI badge
      "suggestedInterventions": [
        { "description": "...", "kardexCategory": "monitors", "positionOne": "nurse_any" }
      ]
    }
  ],
  "toRemove": [     // focuses that look stale/resolvable
    { "focusId": "...", "pccFocusId": "...", "focusText": "..." }
  ],
  "onPlan": [       // already covered — informational, no action
    { "ruleId": "...", "focusId": "...", "focusText": "..." }
  ],
  "byCAA": [        // OPTIONAL grouping by CAA/diagnosis for display labels
    { "displayName": "Diabetes", "toAdd": [...], "toCheck": [...], "toRemove": [...] }
  ]
}
```

**Contract points:**
- The **banner** (surface for entry) just sums `toAdd/toCheck/toRemove`
  lengths; `onPlan` is excluded from the count. Zero in all three → "care plan
  looks complete". So the same dedupe must be applied server-side using
  `existingFocusTexts` or the banner over-reports vs. the modal.
- Every item needs enough identity for the extension to synthesize a `_rowId`
  (it uses `ruleId` for toAdd, `focusId`/`detail` for toCheck/toRemove). Keep
  `ruleId` on `toAdd`/`onPlan` and `focusId` on `toCheck`/`toRemove`.
- **`toAdd`** stamps exactly like Initial (new focus → goals → interventions).
- **`toCheck` (partial_coverage)** → the extension adds `suggestedInterventions`
  to the EXISTING `pccFocusId` (no new focus). Kardex/position are shown as
  *recommendations* only (`_recKardex`/`_recPosition`) — they default to "None"
  and the nurse must explicitly pick, because mass-stamping to the Kardex
  angers nurses. Same canonical→ID resolution as above.
- **`pccFocusStdItemId` vs `pccFocusId`:** for the add-intervention POST, open
  question whether `ESOLgenneedid` should be the std-item ID rather than the
  focus ID for existing focuses. If the backend can supply both reliably,
  include both.
- **`toRemove`** is **not wired end-to-end** — `pcc-resolve.js` is a stub. The
  UI shows the bucket and a Confirm action, but resolving a focus in PCC needs
  the real `neededit_rev.jsp` POST fields captured. Backend can return
  `toRemove`; the extension just can't action it yet.

---

## 3. MDS overlay shields — `GET /api/extension/patients/{id}/mds-coverage`

**When:** the MDS overlay renders Section I (`mds-overlay.js → CarePlanDots`).
Query params: `?facilityName=&orgSlug=`. Async, non-blocking — failure is
swallowed (no shield rendered).

**Response shape consumed:**
```jsonc
{
  "items": {
    "I2300": {                      // keyed by MDS item code
      "overallStatus": "partial",   // 'covered' | 'partial' | 'missing' → green/amber/red shield
      "label": "UTI",
      "unchecked": false,           // true = coded on MDS but never AI-evaluated (red, special copy)
      "matchedDiagnoses": [
        {
          "code": "N39.0",
          "carePlanStatus": "covered",      // per-diagnosis status
          "matchedFocus": "Risk for...\n--...",  // string; UI takes first line as focus name
          "reason": "..."                    // short explanation shown in inline panel
        }
      ]
    },
    "I8000": { "matchedDiagnoses": [ /* matched by ICD-10 code */ ] }
  },
  "otherDiagnoses": [ { "code": "...", "carePlanStatus": "...", "matchedFocus": "...", "reason": "..." } ]
}
```

**UI:** a colored **shield dot** appended next to each Section I item's badge.
Click → inline panel showing status label + focus name + reason. I8000 rows
are matched by ICD-10 code (scanned from the DOM) against `matchedDiagnoses`
then `otherDiagnoses`. `overallStatus`/`carePlanStatus` values must be exactly
`covered` / `partial` / `missing` (anything else → treated as missing/red).

---

## 4. Diagnosis-list shields — `GET /api/extension/patients/{id}/diagnoses/status-overview`

**When:** PCC's `medDiagChart.xhtml` diagnosis table
(`meddiag-augment.js`). One call per render; refetched on icd10-viewer modal
close and on a 60s backstop interval. Query params: `?facilityName=&orgSlug=`.
Adds two columns to PCC's `#meddiaglisting` table: **CP** (care-plan shield)
and **Query**.

**Response shape consumed** (rows matched to the table by ICD-10 code):
```jsonc
{
  "diagnoses": [
    {
      "code": "E11.9",
      "carePlanStatus": {                 // null → grey shield "No care plan evaluation"
        "status": "covered",              // 'covered' | 'partial' | 'missing' → green/amber/red
        "matchedFocus": { "focusText": "Risk for unstable glucose...", "isResolved": false },
        "reason": "..."
      },
      "queryStatus": { /* drives the Query chip — pending / signed / re-query overdue */ }
    }
  ]
}
```

**UI:** CP cell → shield (`status` color, `matchedFocus.focusText` in tooltip).
Click → anchored care-plan detail panel (Focus / Intervention cards). Null
`carePlanStatus` → grey shield. Query cell is the separate cert/query feature
(paper-airplane = pending, check = signed, red = ≥60d re-query overdue).

---

## Status / gotchas summary for backend

- **Initial + Comprehensive `toAdd`/`toCheck` stamping: working in prod.**
  Verified against the test patient (DO NOT USE lopez, paul, clientid 923145,
  Bethesda).
- **`toRemove` resolve: NOT wired** (extension-side `pcc-resolve.js` stub).
- **Surfaces 3 & 4 (shields): working display-wise.** Backend just needs the
  `status`/`carePlanStatus` enums to stay exactly `covered|partial|missing`.
- **Always dedupe server-side using `existingFocusTexts`** — banner and modal
  both depend on it agreeing.
- **Return resolved numeric Kardex/position IDs when you can**; canonical
  strings are a fallback only.
- **Emit fill-in blanks as `descriptionSegments` tokens** (`needsFilling:true`),
  never raw `___`.
- **Keep NKDA allergy focus suppression server-side.**
- **`ruleId` stability** is load-bearing for skip/dedupe/single-add tracking.
```
