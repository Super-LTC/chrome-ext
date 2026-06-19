# Demo ↔ Real App Parity: MDS Section I

**Date:** 2026-06-18
**Goal:** Make the demo's MDS Section I one-to-one with the real extension. Build to extend to other sections later.

## Problem

The demo reinvents the real app's badge logic and has drifted into three defects:

1. **Two contradictory sources of truth.** `PCCDemoApp.jsx` injects badges from a hardcoded `AI_VERDICT` table, while the popover that opens on click reads separate fixtures in `demo-mock-data.js`. They disagree — e.g. `I0600: 'Yes'` (red "code it" badge) vs fixture `status: 'dont_code'` (popover "No Evidence", cardiology ruling it out).
2. **Wrong item↔code map.** The demo's `getItemLabel`/`AI_VERDICT` and most `itemDetail` fixtures use a scrambled legacy numbering. On the real captured page `I4200` = Alzheimer's (demo: "MDRO"), `I2900` = Diabetes (demo: "Drug-Induced Depression"), `I2000` = Pneumonia (demo: "Diabetes"), etc. Every verdict landed on the wrong disease.
3. **Inline-styled badges** that don't match production's `.super-badge--*` CSS.

## Ground truth (captured `mds-section-i.html`)

Signed assessment, patient "Doe, Jane" (2657226), assessment 4860265. All items coded **No** except **I0700 Hypertension = Yes**, **I2900 Diabetes = Yes**, **I6200 Asthma/COPD = Yes**, **I0020 primary category = 12**.

## Design

### 1. Single source of truth for badge logic
Extract `normalizeAnswer`, `formatAnswerForDisplay`, `determineStatus` from `content/mds-overlay.js` into pure module `content/super-menu/mds-badge.js`. Production imports them back (behavior identical; `determineStatus` takes `{ dismissed }` instead of reaching into `SuperOverlay`). The demo imports the same functions — badge logic can never diverge.

### 2. Canonical Section I fixtures
`demo/demo-section-i-fixtures.js` exports `SECTION_I_DETAIL` — 12 curated entries keyed by **real** MDS codes, matching the real item-detail API shape (`{ item: { mdsItem, itemName, status, evidence, keyFindings, suggestedIcd10 }, diagnosisSummary, treatmentSummary }`). Statuses limited to real values: `code`, `dont_code`, `needs_physician_query`.

Scenario (honest against the page's coded answers):

| Item | Page | Super | Result |
|---|---|---|---|
| I0200 Anemia, I5600 Malnutrition, I1700 MDRO, I5700 Anxiety | No | code | 🔴 mismatch — Recommend Coding |
| I0700 HTN, I2900 Diabetes, I6200 Asthma/COPD | Yes | code | 🟢 match — confirmed |
| I0400 CAD, I0900 PVD, I2300 UTI, I5800 Depression | No | needs_physician_query | 🟡 review — Query Physician |
| I0600 Heart Failure | No | dont_code | 🟢 match — agrees, ruled out |

### 3. Badge injection rewrite
`PCCDemoApp.jsx`: drop `AI_VERDICT`/`getItemLabel`. For each page item present in `SECTION_I_DETAIL`, build `aiAnswer` (answer derived from status: `dont_code`→No else Yes), read the coded answer, run shared `determineStatus`, render with real `.super-badge--{status}` classes + real icon markup. Labels come from fixtures.

### 4. Non-breaking routing
`demo-mock-chrome.js` `/api/extension/mds/items/{code}` checks `SECTION_I_DETAIL` first, then falls back to `DEMO_API_RESPONSES.itemDetail` — preserves the MDS Command Center demo, which still uses the old (separate-scenario) fixtures.

## Out of scope (separate follow-up)
MDS Command Center dashboard fixtures still use scrambled codes; that's a different surface. Extending to Sections N/etc. drops in new fixture files + captured pages the same way.
