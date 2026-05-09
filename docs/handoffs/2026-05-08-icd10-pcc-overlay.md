# ICD-10 viewer reads stale "approved" set — proposing a PCC-page overlay

**Audience:** Backend
**From:** Drew (chrome-ext)
**Status:** Aligned with backend — proceeding with the query-param approach. See "Resolution" at bottom.

---

## The bug

When a user codes a patient on PCC's Med Diag page (the "AI Code Patient" flow submits new ICD-10 codes to PCC), reopening the ICD-10 viewer shows those codes as **uncoded suggestions** for up to ~24h until the next PCC sync runs.

Two visible symptoms:
1. **Top Ranked / NTA / SLP buckets** still show the just-coded items as suggestions instead of moving them to **Approved**.
2. **Approved sidebar** is missing the new entries.

Same root cause: the API reads from our `diagnoses` table, which is a once-a-day mirror of PCC. The user's submission hits PCC immediately, but our DB doesn't see it until the next sync.

The current post-submit `_refreshApprovedDiagnoses()` in the viewer just refetches our (still stale) DB → no help.

---

## Where the staleness lives

Two endpoints, both stale-by-design:

### 1. `getGroupedByPatientId` — drives the bucket routing
- Route: `web/app/api/extension/icd10-annotations/v2/route.ts` (and v1, summary, by-code/[baseCode])
- Service: `core/services/icd10-annotation.service.ts:2250` (`getGroupedByPatientId`)
- Lines 2298–2313: queries `diagnosesTable` for active rows → `existingBaseCodes: Set<string>` (3-char prefixes)
- Line 2396: `if (existingBaseCodes.has(baseCode))` decides Approved vs Top Ranked / NTA / SLP / Other / Speculative

### 2. `/api/extension/patients/[patientId]/diagnoses` — drives the Approved sidebar list
- Route: `web/app/api/extension/patients/[patientId]/diagnoses/route.ts`
- `DiagnosesService.getByPatientId` → DB rows enriched with `resolveDiagnosisPdpm` + queryHistory

---

## Proposed approach: pass the PCC page's dx list as a request param

The Med Diag page (`#meddiaglisting` in PCC's DOM) is the source of truth — fresher than our DB by hours-to-a-day. The extension can scrape that table on every viewer open and pass it to the API. Backend treats it as authoritative for "what's currently on the dx sheet."

### Why this and not alternatives

| Option | Pro | Con |
|---|---|---|
| **Trigger on-demand PCC sync after submit** | Authoritative, single source | Slow (PCC API roundtrip), needs new sync endpoint, still race-prone |
| **Dual-write (write to PCC + our DB on submit)** | Fast | Two write paths to keep aligned, our DB write can collide with later sync |
| **Client-side overlay only** | No backend change | Backend's bucket routing still wrong; have to overlay logic in 3+ FE places |
| **Pass page list to backend (this proposal)** | Authoritative + immediate, no new sync infra, single point of overlay | Adds an optional param to a few routes |

### What the extension will send

Scraped from `#meddiaglisting`:
```ts
[
  { icd10Code: "C02.9", description: "...", rank: "Primary (#67)",
    onsetDate: "12/4/2023", classification: "...",
    pdpmComorbidity: "SLP", clinicalCategory: "Cancer" },
  // ... ~25-40 rows typical
]
```

Worst-case URL impact: ~40 codes × 7 chars = ~280 chars. Stays GET.

### Proposed API changes

**Change A — annotation grouping (high-value)**

Add optional `pccBaseCodes` (comma-separated 3-char codes) to:
- `GET /api/extension/icd10-annotations` (v1)
- `GET /api/extension/icd10-annotations/v2`
- `GET /api/extension/icd10-annotations/v2/by-code/[baseCode]`
- `GET /api/extension/icd10-annotations/summary`

Plumb into `getGroupedByPatientId(patientId, mdsAssessmentId, includeFiltered, sinceDate, pccBaseCodes?)`. When provided, **replace** the DB-derived `existingBaseCodes` set (`icd10-annotation.service.ts:2311`) with the param. Skip the DB query when param is present.

Why replace, not union: a code the user just struck out in PCC is gone from the page but still in our DB. Union would keep showing it as approved; replace correctly drops it back into Top Ranked.

**Change B — approved diagnoses list (secondary)**

Add `pccCodes` (comma-separated full ICD-10 codes) to:
- `GET /api/extension/patients/[patientId]/diagnoses`

When provided, return:
- All DB rows whose `code` is in `pccCodes` (preserves `id`, evidences, queryHistory)
- Plus synthetic rows for codes in `pccCodes` missing from the DB, enriched via `resolveDiagnosisPdpm` (no `id`, no queryHistory)

This makes the Approved sidebar instantly show just-coded items with PDPM badges, while preserving rich data for codes the DB already knows.

### Could we do A only and skip B?

Yes. **A alone** fixes the more visible bug (suggestions stop appearing for codes that are already coded). For B, we could overlay synthetic rows client-side in the viewer instead. Smaller backend surface, but bucket routing comes through correctly either way.

We'd like your read on which scope feels right.

---

## Questions for you

1. **Does the param shape make sense** — `pccBaseCodes` (3-char, for grouping) and `pccCodes` (full codes, for diagnoses)? Or would you prefer a single richer payload (POST body with the full scraped list) that both endpoints share via a helper?
2. **Replace vs union** for `existingBaseCodes` when the param is present — agree replace is correct?
3. **Scope** — A only (we handle Approved sidebar with client-side overlay), or A + B?
4. **Auth/abuse concern** — passing a code list from the client means the client can influence which annotations the backend hides. Worst case: a malicious client claims `pccBaseCodes` includes everything, and Top Ranked appears empty. Is that a concern given we're already trusting the extension on patient context, or do you want a server-side sanity check (e.g., verify a sample of the codes against the most recent sync)?
5. **Where should the param live in the service signature** — extra arg to `getGroupedByPatientId`, or wrap into an options object now (it's already at 4 args)?
6. **Other endpoints I missed?** — anything else downstream that also reads `diagnosesTable` for "what's on the sheet" and would also need this treatment (e.g., MDS-related routes)?

---

## What we'll do on the chrome-ext side

Independent of the API decision, we'll:
- Add `content/icd10-viewer/pcc-dx-scraper.js` — reads `#meddiaglisting` from the DOM, returns the list above. ~50 lines.
- Wire it into `ICD10Viewer.open()` and `_refreshApprovedDiagnoses()` (called after the AI Code Patient batch submit).
- Pass results into `ICD10API.getAnnotations` / `getApprovedDiagnoses` once the backend params land.

Happy to jump on a call if easier than ping-pong on this doc.

---

## Resolution (2026-05-08)

Backend reviewed and agreed with the query-param approach. Two clarifications worth recording:

**1. The param fix is not just for "I just coded something" — it covers manual PCC edits too.**
Every viewer open re-scrapes the DOM, so a code added directly in PCC yesterday (bypassing our tool entirely) shows as Approved today regardless of DB sync state. The DOM is always the freshest source available; the param makes the read use it.

**2. The param is the correct architecture for the viewer — not a stopgap to delete later.**
We considered building a "page-ping-to-sync" write endpoint so the DB stays fresh and read endpoints stay simple. Rejected for the viewer use case: even with a real-time mirror, the DOM is still seconds fresher than the backend at the moment of "open viewer" (the user may be mid-edit). Matching DOM freshness without the param means a write + read round-trip on every open to do work that one parameterized read accomplishes. The param isn't tech debt; it's the right shape for "render decision based on what the user is currently looking at."

A page-ping-to-sync is still worth building separately for **other consumers** (MDS solver, PDPM validator, triple-check) that run async and don't have the DOM in hand. Those genuinely benefit from a fresher mirror. The viewer keeps using the param even after that lands.

**Decided scope:** Change A (annotation grouping accepts `pccBaseCodes`). Change B (Approved sidebar) handled client-side via synthetic overlay rows. No new write endpoint, no DB upsert. Stateless, additive, falls back to current behavior when the param is absent.
