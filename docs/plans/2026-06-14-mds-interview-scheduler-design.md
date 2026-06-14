# MDS Interview Auto-Scheduler — Design

**Date:** 2026-06-14
**Status:** Design approved, ready for implementation plan
**Module:** `content/modules/mds-interview-scheduler/` (Preact)

## Problem

Before a nurse creates or changes an MDS in PointClickCare (PCC), several resident
interviews must already exist as locked UDAs inside that ARD's lookback window:

- **BIMS** (Section C)
- **PHQ-9** (Section D)
- **GG** functional assessment (Section GG)
- **Pain** (Section J)

Today the nurse has to know which are required for the assessment type, check each
window by hand, and create any missing UDA manually from the assessment library.
We want to tell them — at the moment they save the MDS — exactly what's covered and
what still needs scheduling, and create the missing ones for them.

## Backend (already built)

`GET /api/extension/mds/interview-coverage` (PR #674 `Superjonathan123/mds-interview-coverage`,
**must be merged + deployed before the path is live**).

- **Auth:** Bearer token, same as all `/api/extension/*`. Module gate: `mdsSolver`.
- **Stateless:** computed live from the patient's UDA list on every call, so it stays
  correct as the ARD/type change. Nothing is stored.
- **Query params:** `patientExternalId`, `facilityName`, `orgSlug`, `ardDate`
  (`YYYY-MM-DD`), `description` (the PCC assessment description — drives requirements +
  GG window), and optional `a0310g` (`1. Planned` / `2. Unplanned`).
- **Returns** per required interview: `type`, `window {start,end}`, `status`
  (`covered` | `needed`), `coveringUda` (when covered), `outOfWindowUda` (when a matching
  locked UDA exists but is out of range), and `recommendedScheduleDate` (the window
  deadline) on needed items. Only the interviews the assessment type *requires* appear.
  Requirement rules (IPA omits Pain, unplanned/unknown discharge → GG only, tracking →
  nothing) and windows are baked in server-side.

Full field semantics: see `.context/attachments/bDYno9/` handoff and the backend repo's
`core/utils/mds-interview-coverage.ts`.

## Key decisions

### Evaluate once, at Save — not live

We considered a live side-panel that re-evaluates as the nurse edits the ARD/type.
Rejected: the nurse changes the date, then the type, then another field, each shifting
the required set and windows. A panel that constantly re-renders (even debounced) reads
as confusing flicker, and staging toggle state across re-fetches adds complexity for
little gain.

**Chosen:** do nothing visible while they edit. Intercept Save, evaluate the *final*
form once, and ask in a modal. The form is settled at Save, so there is no staleness to
manage and no toggle state to keep in sync.

### Commit on PCC's own Save — no separate button

The interviews are scheduled as part of saving the MDS. A standalone "Schedule now"
button would let the nurse create UDAs for an MDS they never save (stray UDAs). Piggy-
backing on PCC's Save keeps creation tied to a real save.

### UDAs are independent records → schedule-first is safe

A scheduled BIMS/PHQ/GG/Pain UDA attaches to the *resident*, not to the MDS row, and does
not reference the MDS. So we can create the UDAs *before* letting PCC persist the MDS,
without replicating PCC's risky MDS-create POST. We let PCC save the MDS with its own
untouched flow.

### Mechanism is a proven in-repo pattern

Firing the UDA-creation POSTs in the background (no touching PCC's page JS) is exactly
what the `care-plan-stamp` module already does:

- `content/modules/care-plan-stamp/pcc-discover.js` — `fetch(url, {credentials:'same-origin'})`
  then scrapes `ESOLminiToken` out of the returned HTML.
- `content/modules/care-plan-stamp/pcc-stamp.js` — replicates PCC form POSTs
  (`createCustomFocus/Goal/Intervention`) with an `onProgress` callback and an
  `orchestrateStamp()` driver.

We reuse this shape for creating UDAs via the `newassess.jsp` POST.

## The save choke point

The `newmds.xhtml` popup's Save button is:

```html
<input type="button" id="idSaveBtn"
       onclick="if (canProceedWithSubmission()) {submitSave()};">
```

- `canProceedWithSubmission()` — PCC's validation/confirm gate.
- `submitSave()` — the single global function that does the actual form POST.

The COT / iSC-change / ARD-change confirm flow (hidden fields `COTOkay`,
`iSCChangeConfirmOK`, `aRDChangeConfirmOK`, `warningConfirmOK`) is a **server roundtrip**:
the popup re-POSTs, the server returns the page with `cotAcceptedCreateNewAssessment='Y'`,
and an inline script at the bottom of the page auto-calls `submitSave()` again. Every real
save — button click *and* auto-confirm-resubmit — funnels through `submitSave()`.

The same popup serves both `operation=N` (create new MDS) and `operation=X` (change an
existing MDS's ARD/type). Both are in scope; changing the ARD is exactly when a previously
covering UDA can fall out of window (the `outOfWindowUda` case).

Editing A0310/ARD fields on this popup is all client-side JS (`checkA0310A`,
`updateSuggestions`, `ardOnChangeCallback`) — no full page reload — so there is no live
churn to manage between load and Save.

The popup is small (`window.resizeTo(700,650)` on load); our modal renders into the popup
document and may need to fill / lightly resize it.

## Flow

### On popup load (silent — no UI)

Prefetch once, in the background:
- The facility UDA library — scrape `newassess.jsp`'s `std_assessment` `<option>`s and
  keyword-match each interview type to a `std_assessment` id (see Library matching below).

This is the slow part, so it's ready before the nurse hits Save. Nothing is shown.

### On Save (our `submitSave()` wrapper, before PCC's)

1. Read the final ARD + A0310 codes straight off `frmData` (plus `ESOLclientid`,
   `ESOLminiToken`). Derive `description` / `a0310g` for the coverage call.
2. Call `/interview-coverage` once. Show a brief "checking what's needed…" spinner.
3. **Nothing needed → proceed straight to the original `submitSave()`. No modal.**
   (Silent passthrough.)
4. **Interviews needed → show our modal:** e.g. *"This 5-Day MDS needs 3 interviews
   scheduled — BIMS is already covered ✓. Create these now?"* One checkbox per needed
   item (default checked), each showing "schedule by {recommendedScheduleDate}." When a
   needed item has an `outOfWindowUda`, note it ("you have one from 3/12, but this ARD's
   window pushed it out of range"). Buttons: **Create & Save** / **Skip & Save**.
5. **Create & Save** → fire the UDA-creation POSTs (with progress), then call the original
   `submitSave()`. **Skip & Save** → call the original `submitSave()` directly.

### Confirm-roundtrip self-heals

After UDAs are created on pass 1, PCC's COT/ARD confirm roundtrip reloads the popup and
auto-calls `submitSave()` again. On that pass, coverage now reads everything as covered,
so step 3 (silent passthrough) runs — no double prompt, no double creation. Idempotency is
free because the coverage endpoint is stateless and re-reads the live UDA list.

## Library matching

Facility assessment names are **not uniform** — they vary per facility (e.g.
`HCG- BRIEF INTERVIEW FOR MENTAL STATUS (3.0 BIMS)`, `HCG- PHQ-9 (MDS 3.0)`,
`Nursing GG Evaluation`, `HCG-Pain Assessment (3.0)`). We keyword-match the
`std_assessment` options to interview types:

- **BIMS** → `bims`, `brief interview for mental status`
- **PHQ** → `phq`, `phq-9`, `phq-2 to 9`, `mood`
- **GG** → `gg`, `functional`, `section gg`
- **Pain** → `pain`, `section j`

Matching is best-effort and a known weak point. When **no** library match is found for a
needed interview, surface it in the modal as *"couldn't find a GG assessment in your
library — schedule manually"* rather than silently dropping it. Matching rules live in one
place so facility-specific aliases can be tuned.

## UDA creation POST

Replicate the `newassess.jsp` save (from the captured curl) as a background
`fetch(..., {method:'POST', credentials:'same-origin'})`:

- Endpoint: `/care/chart/assess/newassess.jsp?ESOLtabType=C&ESOLsave=S`
- Body (form-encoded): `ESOLminiToken`, `ESOLclientid`, the matched `std_assessment` id,
  `assess_date` = the interview's `recommendedScheduleDate`, `assessment_type` (UDA →
  `O`), and the remaining hidden defaults from the form.
- Scrape a fresh `ESOLminiToken` if needed, the same way `pcc-discover.js` does.

## Error handling

- **Coverage call fails / times out at Save:** don't block the MDS save — fall back to
  silent passthrough (let PCC's save proceed) and optionally toast that auto-scheduling was
  unavailable.
- **`PATIENT_NOT_FOUND` (404):** the patient isn't synced — modal explains "sync the
  patient first," still allow Skip & Save.
- **A UDA POST fails:** report it in the progress UI; let the nurse retry or proceed with
  the MDS save anyway. Never block PCC's save on our fetch.
- **No library match:** see Library matching above.

## Residual edge (accepted, low-harm)

If the nurse hits **Create & Save** and then **declines** a COT/ARD-change confirm dialog,
the UDAs exist but the MDS does not. Only happens on the confirm path *and* a cancel, and
the result is stray empty interview UDAs for a real resident (the interviews legitimately
need doing anyway). Not worth engineering around.

## Out of scope (future)

- **Batch / list view** over the MDS In-Progress screen (icons per row showing which UDAs
  are due). Same engine fanned out across the list via a thin future route — build the
  single-assessment integration first.

## Open items before build

- Confirm PR #674 is merged + deployed (path 404s until then).
- Confirm how `description` and `a0310g` are best derived from the `newmds.xhtml` A0310
  field values for the coverage call.
- Decide modal sizing within the 700×650 popup (fill vs. light resize).
