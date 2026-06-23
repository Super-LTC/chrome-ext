# MDS Verify — Chrome Extension Handoff

**Endpoint:** `POST /api/extension/mds/verify`
**Status:** shipped on branch `Superjonathan123/mds-verify-button-endpoint`, validated against prod data (QM pipeline 6/6, normalizer fixed for real PCC keys).
**Owner of server side:** SuperLTC web. **This doc is for the Chrome-ext frontend.**

All example payloads below are **synthetic** — no PHI.

---

## 1. What it is

The "Verify" button: a last-chance MDS scrubber shown while the nurse is on an **in-progress MDS in PCC**. The extension scrapes the full live answers blob off the screen (our DB copy may be stale), POSTs it here, and in **one round-trip (~2–4s)** we:

1. Persist the scraped answers as the latest truth (so our copy stops being stale) + reconcile detections against them.
2. Return the **PDPM reimbursement payload** — identical to what `GET /api/extension/mds/pdpm-potential` returns today (you already render this).
3. Return the **QM preview** — "if this MDS locks as coded, the resident lands in the Falls / worsening-bladder / ADL-decline / … numerator," with the exact evidence and the facility count going `current → if-locked`.

**You only need to build the `qm` section.** The PDPM half is the same object you already render from `pdpm-potential` — keep that renderer, just feed it from this response.

---

## 2. The call

```
POST /api/extension/mds/verify
Authorization: Bearer <extension token>      // same token as every /api/extension/* call
Content-Type: application/json
```

### Request body

```jsonc
{
  "orgSlug": "acme-snf",               // required
  "facilityName": "Burlington",         // required — PCC facility name (as shown in PCC)
  "externalPatientId": "12345",         // required — PCC patient id
  "externalAssessmentId": "6189558",    // required — PCC assessment id
  "ardDate": "2026-06-01",              // optional ("YYYY-MM-DD"); see "day-0" below
  "assessmentType": "Quarterly",        // optional — helps resolve + labels a day-0 shell
  "answers": {                          // required — the scraped live blob (see §3)
    "sectionStatuses": { "A": "Completed", "GG": "In Progress" },
    "answers": {
      "A0500A":  { "value": "Smith", "isLocked": true },
      "GG0130B1":{ "value": "04",    "isLocked": false },
      "J1800":   { "value": "1" },         // isLocked optional → defaults false
      "A_SHORTA":{ "value": "1" }
    }
  }
}
```

---

## 3. Building the `answers` blob (the scrape contract)

`answers.answers` is a flat map of **MDS item id → `{ value, isLocked? }`**.

- **Keys** are MDS item ids exactly as PCC labels them: `A0500A`, `GG0130B1`, `O0110M1`, `J1800`, `A2400C`, plus the underscore composites PCC emits (`A_SHORTA/B/C`, and `ack_`-prefixed acknowledgement keys). All of these are accepted.
- **`value`** is the raw string value on screen (`"04"`, `"1"`, `"Smith"`, `""` for blank). Non-string values are coerced to `""`.
- **`isLocked`** = whether PCC shows the item locked/signed. Optional, defaults `false`.
- **`sectionStatuses`** is `{ sectionLetter: statusString }` (e.g. `{ "A": "Completed" }`). Optional.

**Guardrails (important):**
- The map must be **non-empty** and keys must look like MDS items. An empty or wrong-page scrape returns **400** — this is deliberate so a botched scrape can't wipe the stored answers. If you get `400 "Invalid MDS item key: …"`, you scraped the wrong DOM.
- Send the **full** blob (~800 items is fine for one POST), not a diff.

---

## 4. Success response (`200`)

```jsonc
{
  "success": true,

  // ── PDPM half: the SAME object as GET /api/extension/mds/pdpm-potential ──
  // (minus that route's own `success`). Top-level keys:
  "assessmentId": "abc123",
  "externalAssessmentId": "6189558",
  "assessment": { "id": "...", "externalPatientId": "12345", "ardDate": "2026-06-01", "description": "Quarterly" },
  "compliance": { /* BIMS / PHQ-9 / GG / orders / therapy-doc checks */ },
  "sectionProgress": { /* per-section completion */ },
  "scores": { /* BIMS, PHQ-9, functional score breakdown */ },
  "calculation": { /* current HIPPS + component CMGs + rates */ },
  "enhancedDetections": [ /* per-item findings w/ HIPPS/$ impact + userDecision */ ],
  "gapAnalysis": { /* per-component revenue: ptot/slp/nursing/nta current→potential→delta */ },
  "potential": { /* withMissedItemsCoded, overcodedRemoved, detectionsStale, … */ },

  // ── QM half: NEW. null when complianceModule is off OR QM build degraded ──
  "qm": {
    "stayType": "long",                 // "short" | "long" | "unknown"
    "facilityDate": "2026-06-11",        // facility-local "today"
    "measures": [ /* one per applicable measure — see §5 */ ]
  }
}
```

> `qm` is `null` in two cases: the org doesn't have the **complianceModule**, or the QM computation failed (PDPM still returns — QM is best-effort and never fails the whole call). Render the PDPM half regardless; show the QM section only when `qm != null`.

---

## 5. The `qm.measures[]` entry — what to render

Each entry is a `QmMeasureEntry` plus a `facilityCount`:

```jsonc
{
  "id": "falls_all",                    // QmMeasureId (stable key — see §8 for the full list)
  "label": "Falls (J1800)",
  "applicable": true,                    // false entries are already filtered out for you
  "triggers": true,                      // THE flag: does this MDS put the resident in the numerator
  "excluded": false,                     // true = resident excluded from the measure cohort
  "exclusionReason": null,

  "evidence": [                          // exact items driving the trigger
    { "mdsItem": "J1800", "value": "1", "assessmentId": "abc123",
      "assessmentArdDate": "2026-06-01", "assessmentType": "Quarterly",
      "note": "Fall since prior assessment" }
  ],

  "clearGuidance": {                     // present when triggers === true
    "clearsOnNextObra": false,           // would a clean OBRA comprehensive today clear it?
    "actionType": "time",                // time | clinical | modification | dx_query | stay_locked | none
    "clearDate": "2026-09-12",           // ISO — when it rolls off by time (optional)
    "daysUntilClear": 93,                // from facilityDate (optional, can be negative)
    "actions": [                         // 0+ human-facing next steps
      { "label": "Falls stay in the 275-day scan; ages out Sep 12", "detail": "...", "effectiveDate": "2026-09-12" }
    ]
  },

  "cliffInfo": { /* optional: cliffDate, cliffLabel, urgency, clearPathLabel, … */ },

  "facilityCount": {                     // null if the facility report lacked this measure
    "current": 7,                        // residents currently in the numerator facility-wide
    "ifLocked": 8,                       // current + 1 IFF this MDS newly adds this resident
    "isNewTrigger": true,                // this MDS newly triggers (resident not already in)
    "wouldClearOnLock": false            // resident IS in numerator today, this codes clean, clears on target replace
  }
}
```

### Suggested UI cuts (all derivable client-side)
- **Hero / "what this MDS does":** `measures.filter(m => m.triggers)`. For each, show `facilityCount.current → ifLocked` with an emphasis when `isNewTrigger` (this lock *adds* a resident to the numerator).
- **"Good news / will clear":** `m.facilityCount.wouldClearOnLock` — resident is in the numerator today but this MDS codes clean.
- **"How to fix":** `clearGuidance.actionType` + `clearGuidance.actions[]` (and `cliffInfo.clearPathLabel` / `urgency` when present).
- **Evidence drill-in:** `m.evidence[]` — the exact `mdsItem=value` (and prior) that fired it.
- Don't show `excluded: true` measures as triggers; optionally list them as "excluded (why)".

**`facilityCount` semantics (don't over-read it):** it's a single-resident upper-bound delta. `ifLocked` only ever adds this resident; it does **not** subtract other residents whose targets this lock might displace, and `wouldClearOnLock` is a flag, not a `-1`. Treat it as "this resident's effect on the count," not an authoritative post-lock facility recount.

---

## 6. Errors

| Status | Body | Meaning / what to do |
|---|---|---|
| 400 | `error: "Missing required fields…"` | a required body field is absent |
| 400 | `error: "Invalid MDS item key: …"` / empty-map | bad/empty scrape — you grabbed the wrong DOM; don't retry blindly |
| 403 | `error: "Access denied to this location"` | user lacks access to that facility |
| 403 | module 403 | org lacks the **`mdsSolver`** module (hard requirement) |
| 404 | `error: "Organization not found"` / `"Facility not found"` | bad `orgSlug` / `facilityName` |
| 404 | `code: "ASSESSMENT_NOT_FOUND"` | assessment isn't synced **and** no `ardDate` given → resend **with `ardDate`** |
| 404 | `code: "PATIENT_NOT_FOUND"` | patient isn't synced yet → trigger a patient sync first, then retry |
| 500 | `error: …` | PDPM build failed. (QM failures do **not** 500 — they come back as `qm: null`.) |

---

## 7. Day-0 / when the assessment isn't synced yet

Verify supplies the answers, so we may not have discovered the assessment via the orchestrator yet. Flow:

1. We try to resolve `externalAssessmentId` (and fallbacks) → if found, use it.
2. If not found and **`ardDate` is provided**, we create a minimal In-Progress shell and proceed.
3. If not found and **no `ardDate`** → `404 ASSESSMENT_NOT_FOUND`. **So: always send `ardDate` when you have it** (you do — it's on the PCC screen). That makes verify work first-try on brand-new assessments.
4. If the **patient** isn't synced → `404 PATIENT_NOT_FOUND` (sync the patient first).

---

## 8. Reference

**`QmMeasureId` (stable measure keys):**
`uti`, `catheter`, `falls_major_injury`, `antipsychotic_long`, `weight_loss`, `pressure_ulcer_long`, `phq9_depression`, `adl_decline`, `physical_restraints`, `low_risk_incontinence`, `discharge_function`, `antipsychotic_new`, `pressure_ulcer_short`, `influenza_vaccine`, `antianxiety_hypnotic_rate`, `antianxiety_hypnotic_use`, `falls_all`, `behavior_symptoms`, `bb_new_worsened`, `walk_indep_worsened`.

**TypeScript shapes** (source of truth is `core/types/qm-planner.types.ts` + `core/utils/qm-verify-projection.ts` in the web repo):

```ts
type QmStayType = 'short' | 'long' | 'unknown';

interface QmEvidence {
  mdsItem: string; value: string;
  assessmentId: string; assessmentArdDate: string; assessmentType: string;
  note?: string;
}

interface QmClearAction { label: string; detail?: string; effectiveDate?: string; }

interface QmClearGuidance {
  clearsOnNextObra: boolean;
  actionType: 'time' | 'clinical' | 'modification' | 'dx_query' | 'stay_locked' | 'none';
  clearDate?: string;
  daysUntilClear?: number;
  actions: QmClearAction[];
}

interface QmFacilityProjection {
  current: number; ifLocked: number;
  isNewTrigger: boolean; wouldClearOnLock: boolean;
}

interface MdsVerifyQmEntry {
  id: string;            // QmMeasureId
  label: string;
  applicable: boolean;
  triggers: boolean;
  excluded: boolean;
  exclusionReason?: string;
  evidence: QmEvidence[];
  clearGuidance?: QmClearGuidance;     // present when triggers === true
  cliffInfo?: unknown;                  // QmCliffInfo — optional, for cliff dates/urgency
  facilityCount: QmFacilityProjection | null;
}

interface MdsVerifyQmSection {
  stayType: QmStayType;
  facilityDate: string;                 // "YYYY-MM-DD"
  measures: MdsVerifyQmEntry[];
}

interface MdsVerifyResponse {
  success: true;
  // …all GET /api/extension/mds/pdpm-potential fields (assessment, calculation,
  //   enhancedDetections, gapAnalysis, potential, scores, compliance, sectionProgress…)
  qm: MdsVerifyQmSection | null;
}
```

---

## 9. Dismiss / check-off

To dismiss or check off a finding from the Verify panel, **reuse the existing detection user-decision endpoint** — nothing new server-side. The `enhancedDetections[].userDecision` field already round-trips the nurse's prior decisions, so reflect those on render.

---

## 10. Sequence (recommended)

1. Nurse opens an in-progress MDS in PCC → extension shows "Super Verify".
2. On click: scrape the full answers blob (§3), POST to `/api/extension/mds/verify` with `ardDate` included.
3. Render PDPM half (existing renderer) + the new QM section (§5).
4. Dismiss/check-off → existing user-decision endpoint (§9). No need to re-POST verify unless answers changed on screen.

Questions on field semantics → ping the web side; the server contract is locked on the branch above.

---

## Appendix: PCC action-bar DOM (injection target)

The native button bar on `/clinical/mds3/sectionlisting.xhtml` (`#mdsactionbuttons`) contains, in order: `#backToMDSListButton`, `#refreshMDSDataButton`, a third-party `<form id="verifyBtnForm" action="/clinical/assess/mds3verifyrequest/verify.xhtml">` wrapping `#verifyButton` (keep it — Super Verify goes NEXT to it), a Print button, and Change ARD/Type. The form's hidden inputs carry `clientId` and `assessId` — the most reliable source for both ids on this page.
