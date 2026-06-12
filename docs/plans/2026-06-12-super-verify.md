# Super Verify Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Super Verify" button next to PCC's native Verify button on the MDS section-listing page that scrapes every section's live answers, POSTs them to `/api/extension/mds/verify`, and shows a full-screen results modal: PDPM reimbursement findings (with accept/dismiss + reason) stacked above a QM trigger preview.

**Architecture:** New Preact module `content/modules/super-verify/` following the `care-plan-stamp` pattern: a vanilla `inject-button.js` (always loaded from `content.js`) that detects `/clinical/mds3/sectionlisting.xhtml` and lazy-loads the Preact modal on click. Scraping is done client-side with same-origin `fetch` of `section.xhtml` pages (parallel, capped at 5 — mirrors super-scraper's Go implementation), parsed with `DOMParser` into the flat `{ value, isLocked }` blob the backend expects. The verify POST goes through the existing background `API_REQUEST` relay. Accept/dismiss reuses the existing `/api/extension/mds/items/{mdsItem}/decision` endpoint (PDPM detections only; reason required on dismiss only). QM section is render-only.

**Tech Stack:** Preact + hooks, vanilla injection script, vitest for the parser, CSS via `css-bootstrap.js` `?inline` imports, `qmc-` tone classes for QM visuals.

**Branch context:** Run in a fresh worktree off `main` (Conductor will create it). Do NOT base off `qm/command-center`.

---

## Backend contract (locked — server side already shipped)

`POST /api/extension/mds/verify` — full details in `docs/plans/2026-06-12-mds-verify-api-handoff.md` (read it before Task 4). Essentials:

**Request body:**
```jsonc
{
  "orgSlug": "...",                    // required
  "facilityName": "...",               // required
  "externalPatientId": "12345",        // required
  "externalAssessmentId": "6189558",   // required
  "ardDate": "2026-06-01",             // ALWAYS send when scrapeable (makes day-0 work)
  "assessmentType": "Quarterly",       // optional
  "answers": {
    "sectionStatuses": { "A": "Completed", "GG": "In Progress" },
    "answers": { "A0500A": { "value": "Smith", "isLocked": true }, ... }
  }
}
```

**Response:** `{ success: true, ...all pdpm-potential fields (calculation, enhancedDetections, gapAnalysis, potential, scores, compliance, sectionProgress), qm: MdsVerifyQmSection | null }`.

**`qm.measures[]` entry fields used by the UI:** `id`, `label`, `triggers`, `excluded`, `exclusionReason`, `evidence[] {mdsItem, value, assessmentArdDate, assessmentType, note}`, `clearGuidance {clearsOnNextObra, actionType, clearDate, daysUntilClear, actions[]}`, `facilityCount {current, ifLocked, isNewTrigger, wouldClearOnLock} | null`.

**Errors to handle:** `400` invalid/empty scrape (bad DOM — show "couldn't read this MDS", don't retry), `403` access/module, `404 ASSESSMENT_NOT_FOUND` (resend with ardDate — we always send it, so surface as error), `404 PATIENT_NOT_FOUND` (patient not synced — show message), `500` PDPM failure. `qm: null` is NOT an error — render PDPM half, hide QM section.

**Dismiss/accept:** reuse `POST /api/extension/mds/items/{mdsItem}/decision` with `{ externalAssessmentId, facilityName, orgSlug, decision: 'agree'|'disagree', note, mdsColumn, ...getMDSContextBodyFields() }` — see `content/mds-overlay.js` `postItemDecision()` (~line 4417). Prior decisions arrive in `enhancedDetections[].userDecision`.

---

## PCC scraping contract (mirrors super-scraper Go code)

- **Section discovery:** on the section-listing page itself, parse `#mdssectionlist > .section_box`; per box: `.section_label` → "Section A" → code `A`; `.section_status` text → status ("Signed" / "Unsigned" / "Not Applicable"). Skip "Not Applicable" sections.
- **Section fetch:** `GET /clinical/mds3/section.xhtml?ESOLassessid={assessId}&sectioncode={code}` with `fetch(url, { credentials: 'same-origin' })`. No CSRF token needed. **Parallel with concurrency 5** (super-scraper uses a weighted semaphore of 5 — match it).
- **Assessment id:** `ESOLassessid` from the page URL (also present as `assessId` hidden input in `#verifyBtnForm`). Client id: hidden input `clientId` in `#verifyBtnForm`, falling back to `scrapeClientIdFromDOM()` from `content/super-menu/context.js`.
- **Per-item parsing** (priority order, per super-scraper `GetMdsSection`):
  1. `.readonlyquestionvalue` divs → locked/signed item values
  2. `.responses > li > a > nobr` → selected multi-choice values
  3. `input` / `select` fields in question tables → raw `value` / checked state
- **Item key:** the input/question element `id` (e.g. `A0500A`, `GG0130B1`). Keep `ack_`-prefixed keys and underscore composites (`A_SHORTA`) as-is — backend accepts them.
- **Locked:** presence of `div.locked_response` within the question container → `isLocked: true`.
- **Values:** always strings; blank → `""`. Non-string → coerce `""`.
- **Guardrail:** if the final answers map is empty, abort client-side with a friendly error — never POST an empty blob.

> The implementer should verify selectors against a real PCC section page early (Task 2 fixture). The Go reference is `super-scraper/internal/providers/pointclickcare/requests.go:2826-3036` if selectors need adjusting.

---

### Task 1: Module skeleton + CSS registration

**Files:**
- Create: `content/modules/super-verify/inject-button.js` (stub: empty init, exported `injectSuperVerifyButton`)
- Create: `content/css/super-verify.css` (empty for now, header comment)
- Modify: `content/content.js` — add `import './modules/super-verify/inject-button.js';` next to the care-plan-stamp imports (~line 88)
- Modify: `content/css-bootstrap.js` — add `import superVerify from './css/super-verify.css?inline';` in the module-specific block and append `superVerify` to `CSS_BUNDLE`

**Steps:**
1. Create the three files / two edits above.
2. Run: `npm run build` — expect clean build.
3. Commit: `git commit -m "feat(super-verify): module skeleton + css registration"`

---

### Task 2: MDS section parser (pure logic, TDD)

**Files:**
- Create: `content/modules/super-verify/lib/mds-section-parser.js`
- Create: `content/modules/super-verify/lib/__tests__/mds-section-parser.test.js`
- Create: `content/modules/super-verify/lib/__tests__/fixtures/section-sample.html` (hand-built minimal fixture covering all four value shapes; if a saved real PCC section page is available, sanitize and use it)

**Step 1: Write failing tests** against `parseSectionHtml(html) -> { answers: { [itemId]: { value, isLocked } } }` and `parseSectionListing(docOrHtml) -> [{ code, status, disabled }]`:

```js
import { describe, it, expect } from 'vitest';
import { parseSectionHtml, parseSectionListing } from '../mds-section-parser.js';

describe('parseSectionHtml', () => {
  it('extracts readonly (locked) values', () => {
    const html = `<div class="question" id="q_A0500A">
      <div class="locked_response"><div class="readonlyquestionvalue" id="A0500A">Smith</div></div></div>`;
    expect(parseSectionHtml(html).answers['A0500A']).toEqual({ value: 'Smith', isLocked: true });
  });
  it('extracts selected multi-choice values from .responses', () => {
    const html = `<div class="question"><ul class="responses">
      <li><a id="J1800"><nobr>1. Yes</nobr></a></li></ul></div>`;
    expect(parseSectionHtml(html).answers['J1800'].value).toBe('1');
  });
  it('extracts text input values and defaults isLocked false', () => {
    const html = `<table><tr><td><input id="GG0130B1" value="04"></td></tr></table>`;
    expect(parseSectionHtml(html).answers['GG0130B1']).toEqual({ value: '04', isLocked: false });
  });
  it('keeps ack_ and underscore-composite keys verbatim', () => { /* ack_GG0130B1, A_SHORTA */ });
  it('coerces missing/non-string values to empty string', () => { /* blank input */ });
  it('ignores elements whose ids do not look like MDS items', () => { /* e.g. id="saveBtn" */ });
});

describe('parseSectionListing', () => {
  it('parses code + status per section_box and flags Not Applicable as disabled', () => {
    const html = `<div id="mdssectionlist">
      <div class="section_box"><span class="section_label">Section A</span><h2>Identification</h2><span class="section_status">Signed</span></div>
      <div class="section_box"><span class="section_label">Section GG</span><h2>Functional</h2><span class="section_status">Not Applicable</span></div></div>`;
    expect(parseSectionListing(html)).toEqual([
      { code: 'A', status: 'Signed', disabled: false },
      { code: 'GG', status: 'Not Applicable', disabled: true },
    ]);
  });
});
```

(Adjust fixture markup to match the real PCC DOM once inspected — the *behavioral* assertions are the contract.)

**Step 2:** Run `npx vitest run content/modules/super-verify` — expect FAIL (module not found).

**Step 3: Implement** `mds-section-parser.js`. Pure functions, `DOMParser` for string input, accept a `Document` too. Key rules:
- MDS item id regex: `/^(ack_)?[A-Z]{1,3}[0-9]{4}[A-Z0-9]*$|^[A-Z]+_[A-Z0-9]+$/` — used to filter candidate ids.
- Multi-choice value: take the leading code before the first `.`/space in the `<nobr>` text (e.g. `"1. Yes"` → `"1"`); if no code prefix, use full trimmed text.
- `isLocked`: true when the item's value came from `.readonlyquestionvalue` or an ancestor/sibling `.locked_response` exists.
- Section code from label: `label.replace(/^Section\s+/i, '').trim()`.

**Step 4:** `npx vitest run content/modules/super-verify` — expect PASS.

**Step 5:** Commit: `feat(super-verify): MDS section HTML parser`

---

### Task 3: Parallel scraper orchestrator (TDD on concurrency + blob shape)

**Files:**
- Create: `content/modules/super-verify/lib/mds-scraper.js`
- Create: `content/modules/super-verify/lib/__tests__/mds-scraper.test.js`

**Step 1: Failing tests** for `scrapeAssessmentAnswers({ assessId, fetchImpl, doc, onProgress })`:
- discovers sections from `doc` (the live section-listing document), skips disabled ones
- fetches `/clinical/mds3/section.xhtml?ESOLassessid={assessId}&sectioncode={code}` for each (assert URLs called via a stub `fetchImpl`)
- **concurrency capped at 5**: with 8 sections and a `fetchImpl` that tracks in-flight count, max in-flight ≤ 5
- merges all section answers into one flat map; builds `sectionStatuses` `{ A: 'Signed', ... }`
- calls `onProgress({ done, total, section })` after each section completes
- throws a typed error (`EmptyScrapeError`) if the merged answers map is empty
- a section fetch that returns a login-redirect page (`<title>Login` or `accounts.pointclickcare.com` in final URL) → throws `SessionExpiredError`

**Step 2:** Run, expect FAIL.

**Step 3: Implement.** Simple promise-pool (no deps):

```js
async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(lanes);
  return results;
}
```

`fetchImpl` defaults to `(url) => fetch(url, { credentials: 'same-origin' }).then(r => r.text())` — injectable for tests. Build the final blob exactly as the backend wants: `{ sectionStatuses, answers }`.

**Step 4:** Run vitest — PASS. **Step 5:** Commit: `feat(super-verify): parallel section scraper (cap 5)`

---

### Task 4: Verify API client

**Files:**
- Create: `content/modules/super-verify/lib/verify-api.js`
- Create: `content/modules/super-verify/lib/__tests__/verify-api.test.js` (stub `chrome.runtime.sendMessage` via `globalThis.chrome`)

**Step 1: Failing tests** for `postVerify({ assessId, patientId, answersBlob })`:
- builds body with `orgSlug`/`facilityName` from `window.getCurrentParams()` and `ardDate`/`assessmentType` from `window.getPCCAssessmentMetaFromDOM()` (both globals from `content/super-menu/context.js` — stub them)
- sends `{ type: 'API_REQUEST', endpoint: '/api/extension/mds/verify', options: { method: 'POST', body } }`
- on `result.success` → returns `result.data`
- maps failures to typed errors: `result.status === 404 && body.code === 'PATIENT_NOT_FOUND'` → `PatientNotSyncedError`; 400 → `BadScrapeError`; 403 → `AccessError`; else generic with server message

Also `postDetectionDecision({ mdsItem, mdsColumn, decision, note, assessId })` → POSTs to `/api/extension/mds/items/${encodeURIComponent(mdsItem)}/decision` with the exact body shape from `mds-overlay.js postItemDecision` (including `...window.getMDSContextBodyFields?.()`), then dispatches `window.dispatchEvent(new CustomEvent('super:item-decision'))` on success (keeps the existing PDPM analyzer in sync).

**Steps 2–4:** fail → implement → pass. **Step 5:** Commit: `feat(super-verify): verify + decision API client`

---

### Task 5: Button injection on sectionlisting.xhtml

**Files:**
- Modify: `content/modules/super-verify/inject-button.js` (replace stub)

Clone the structure of `content/modules/care-plan-stamp/inject-button.js` (page check → idempotent inject → polling init → MutationObserver re-init). Specifics:

- Page check: `window.location.pathname.includes('/clinical/mds3/sectionlisting.xhtml')`.
- Anchor: PCC's own verify form — `document.querySelector('#verifyBtnForm')`; insert our `<a class="mdsbutton" id="super-verify-btn">` **after the form** (`form.parentNode.insertBefore(el, form.nextSibling)`). Fallback anchor if the vendor verify form is absent (some orgs won't have it): insert after `#refreshMDSDataButton`, else append to `#mdsactionbuttons`.
- Button markup matches the native `mdsbutton` anchors (icon span + `<span>Super Verify</span>`), tinted with the same indigo gradient treatment as the care-plan button so it reads as ours. Use an inline ✨ or a small SVG instead of a PCC image.
- On click: read `assessId` + `clientId` from `#verifyBtnForm` hidden inputs (fallback: `ESOLassessid` URL param; `scrapeClientIdFromDOM()`); check auth via `chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' })`; then lazy-`import('preact')` + `import('./SuperVerifyModal.jsx')` and render into a `#super-verify-overlay` div (copy `_openModal` from care-plan-stamp, including FAB-hide + `body.overflow` handling).
- `data-track="super_verify_button_clicked"` on the button (allowlist in Task 9).

**Verify:** `npm run build`, reload extension, open an in-progress MDS in PCC → button appears next to Verify, idempotent across refreshes.

**Commit:** `feat(super-verify): inject Super Verify button on MDS section listing`

---

### Task 6: Modal shell + scrape/verify flow

**Files:**
- Create: `content/modules/super-verify/SuperVerifyModal.jsx`
- Create: `content/modules/super-verify/hooks/useSuperVerify.js`
- Modify: `content/css/super-verify.css`

**`useSuperVerify({ assessId, patientId })`** state machine: `idle → scraping → verifying → done | error`. On mount:
1. `scraping`: call `scrapeAssessmentAnswers` with `doc = document` (we're ON the section-listing page) and `onProgress` → expose `{ done, total, section }` for the progress UI.
2. `verifying`: `postVerify(...)`.
3. `done`: expose `data` (PDPM fields + `qm`).
Expose `retry()`. Map typed errors to user-facing copy:
- `SessionExpiredError` → "Your PointClickCare session expired — refresh the page and log in."
- `EmptyScrapeError` / `BadScrapeError` → "Couldn't read the MDS answers on this page. Refresh and try again."
- `PatientNotSyncedError` → "This resident hasn't synced to Super yet. Open their chart once, then retry."
- generic → server message + Retry button.

**`SuperVerifyModal.jsx`** full-screen overlay (reuse `.super-overlay`/`.super-backdrop`/`.super-modal` conventions; ~900px wide card, scrollable body):
- Header: "Super Verify" + resident/ARD line (from `getPCCAssessmentMetaFromDOM()` + scraped patient name) + close X.
- **Scraping state:** a section checklist — one row per section with code, name, and a spinner→check as each completes ("Pulling Section GG… 7/19"). This is the "little loading thing" — drive it from `onProgress`.
- **Verifying state:** single spinner line "Checking PDPM + Quality Measures…".
- **Done:** render `<VerifyResults data={...} />` (Task 7/8).
- Esc + backdrop close; restore body scroll on unmount.

**Verify:** build, manual run against a real in-progress MDS (progress list fills, results or a clean error render).

**Commit:** `feat(super-verify): modal shell with scrape progress + verify flow`

---

### Task 7: Results — PDPM half (reimbursement first) with accept/dismiss

**Files:**
- Create: `content/modules/super-verify/components/VerifyResults.jsx`
- Create: `content/modules/super-verify/components/PdpmFindings.jsx`
- Create: `content/modules/super-verify/components/DecisionControls.jsx`
- Modify: `content/css/super-verify.css`

Layout (stacked, PDPM first per product decision):
1. **Summary strip:** current HIPPS + rate from `data.calculation`, potential delta from `data.gapAnalysis` / `data.potential.withMissedItemsCoded` ("$X/day being left on the table"). Reuse `formatPaymentRates` from `content/utils/payment.js` and the visual language of `content/modules/pdpm-analyzer/components/HippsDisplay.jsx` / `PaymentCard.jsx` — import those components directly if their props fit (`detail`-shaped data is identical to `pdpm-potential`); otherwise build slim local versions. **Do not** mount `PDPMAnalyzer.jsx` itself (it owns its own fetching hook).
2. **Detections list:** one card per `data.enhancedDetections[]` entry: item code + human label (reuse the `MDS_ITEM_LABELS` map — extract it from `PDPMAnalyzer.jsx` into `content/modules/pdpm-analyzer/lib/mds-item-labels.js` and import from both places), what the solver thinks the value should be, HIPPS/$ impact, evidence snippet.
3. **DecisionControls** per detection:
   - If `userDecision` already present → render the decided state (✓ Accepted / ✗ Dismissed + note) with an "undo"-free read-only chip (matches existing overlay behavior).
   - Accept → one click, calls `postDetectionDecision({ decision: 'agree', note: '' })`, optimistic UI with spinner, decided-state on success.
   - Dismiss → expands an inline reason textarea; **Save disabled until non-empty reason**; calls `postDetectionDecision({ decision: 'disagree', note })`.
   - Errors: toast via `SuperToast.show({ message, type: 'error' })` and revert.

**Verify:** build + manual: accept and dismiss round-trip (check network tab → 200, reopen verify → `userDecision` reflected).

**Commit:** `feat(super-verify): PDPM findings with accept/dismiss (reason required on dismiss)`

---

### Task 8: Results — QM preview half

**Files:**
- Create: `content/modules/super-verify/components/QmPreview.jsx`
- Modify: `content/modules/super-verify/components/VerifyResults.jsx` (mount below PDPM half)
- Modify: `content/css/super-verify.css` (reuse `qmc-` tone variables/classes from `content/css/qm-command-center.css` where possible; prefix new classes `svq-`)

Render only when `data.qm != null`; if null, omit the section entirely (no error). Sub-sections, in order:

1. **"If this MDS locks" hero:** `measures.filter(m => m.triggers && !m.excluded)`. Each row: measure label, facility count `current → ifLocked` (bold the arrow when `facilityCount.isNewTrigger` — "this lock ADDS a resident to {label}"), rose tone. Guard `facilityCount === null` → show trigger without counts.
2. **"Will clear on lock" (good news):** `measures.filter(m => m.facilityCount?.wouldClearOnLock)` — emerald tone, "codes clean — clears on lock".
3. **Per-trigger expandable detail:** evidence rows (`mdsItem = value`, ARD, note — concrete numbers, evidence-forward per QM UX feedback) + clear guidance (`clearGuidance.actions[]` labels, `daysUntilClear`/`clearDate` as "ages out Sep 12 (93 days)", `clearsOnNextObra` chip). Borrow the timeline/evidence presentation from `content/modules/qm-board/components/ResidentDrillIn.jsx` visual style — don't import the component (it's wired to board data), copy the markup idioms.
4. **Excluded measures:** collapsed "Excluded (n)" disclosure listing label + `exclusionReason`. Never show excluded entries as triggers.
5. Empty state when nothing triggers: emerald "No quality measures trigger from this MDS as coded."

Per the handoff: treat `facilityCount` as "this resident's effect," not a facility recount — copy should say "adds/removes this resident," never "facility total will be N".

**Verify:** build + manual against an assessment known to trigger ≥1 measure (or temporarily stub `qm` in the hook to eyeball all states), then remove stubs.

**Commit:** `feat(super-verify): QM trigger preview section`

---

### Task 9: Analytics (one comprehensive pass — never phased)

**Files:**
- Modify: `content/utils/analytics.js` — add EVENT_SCHEMA allowlist entries (REQUIRED: events not in the allowlist are silently dropped)
- Modify: the super-verify files to emit them

Events (all via `window.SuperAnalytics.track` / `track()` import, no PHI — ids and counts only):
- `super_verify_button_clicked` — `{ assessment_id }` (data-track attr from Task 5 + allowlist)
- `super_verify_scrape_completed` — `{ assessment_id, n_sections, n_answers, duration_ms }`
- `super_verify_scrape_failed` — `{ assessment_id, error_kind }`
- `super_verify_results_viewed` — `{ assessment_id, n_detections, n_qm_triggers, qm_available }`
- `super_verify_failed` — `{ assessment_id, status, error_kind }`
- `super_verify_decision_saved` — `{ item_code, decision, has_reason }`

**Steps:** add schema entries → emit → `npm run check:tracking` passes → `npm run build`.

**Commit:** `feat(super-verify): analytics instrumentation`

---

### Task 10: Final verification + polish

1. `npx vitest run` — all green.
2. `npm run build` — clean; load `dist/` in Chrome.
3. Manual end-to-end on a real in-progress MDS:
   - Button renders next to vendor Verify; not duplicated after navigation.
   - Click → progress checklist fills (sections in parallel — watch network tab: ≤5 concurrent `section.xhtml`).
   - Results: HIPPS/$ summary, detections with accept (1 click) and dismiss (reason required), QM section with counts + evidence.
   - Close/reopen → prior decisions shown from `userDecision`.
   - Error paths: log out of Super → friendly auth message; try on a locked/complete MDS → still works (all items `isLocked`).
4. Check nothing regressed on the MDS overlay page (`super:item-decision` listeners still fire).
5. Commit any fixes; then use superpowers:finishing-a-development-branch (PR against `main`).

---

## Out of scope (explicit)

- QM trigger dismissal (no endpoint; QM section is informational).
- Un-doing a saved decision from this modal.
- Caching scrape results between opens (re-scrape each click — answers may have changed).
- Background/orchestrator sync triggering on `PATIENT_NOT_FOUND` (just message + retry).
