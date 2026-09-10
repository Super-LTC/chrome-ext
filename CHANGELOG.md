# Changelog

All notable changes to the Super LTC Chrome extension, newest first.
Version = `manifest.json` `version`. Each entry records what shipped in that
bump so we can tell the current build apart from the last one at a glance.

> **Store note:** **v1.0.76** was zipped for Chrome Web Store submission on
> 2026-09-02 (`super-ltc-store.zip`) — it carries the Clinical Update
> patient-reference fix (#92): the wizard was sending the facility MRN as the
> PCC client id and failing on every submit. Before that, **v1.0.75** was zipped on
> 2026-09-01 (`super-ltc-store.zip`) — it carries the 24-hour report's per-user
> category filters (#91), the Functional Decline therapy/runway/payer parity
> pass (#90), the neutral `not_expected` care-plan shield (#87), and the FAB
> suppression on PCC's New/Change MDS popup, on top of 1.0.74. Before that,
> **v1.0.74** was zipped on
> 2026-08-20 — it carries the care-plan library-routing
> and re-key fixes (#84–#86), cert Skip/Delay (#88), and the ARD off-by-one-day
> fix (#89), on top of 1.0.72. **1.0.73 was skipped**: the store rejected it as
> already published, but no 1.0.73 exists anywhere in this repo's history — so
> some build outside git holds that number in the store, and what it contains is
> unknown. Same class of drift as 1.0.68. Before that, **v1.0.72** was zipped on
> 2026-08-12 — it carries the care-plan verify fix (#82)
> that stops false "did not save" reports and duplicate re-sends, on top of
> 1.0.71. Before that, **v1.0.71** was zipped on
> 2026-08-06 — it carries the DFS verify ARD-scoping
> fix (#80) on top of 1.0.70. Before that, **v1.0.70** was zipped on
> 2026-08-05 — it carries the Case Mix tab, the QM
> quarter roster + drill-in fixes, the ICD-10 library search, and the care-plan
> stamp verification fix. Before that, **v1.0.69** was zipped on 2026-07-26 —
> the first store build carrying the
> EID migration (1.0.68, below) and PCC username capture. **v1.0.68 was never
> uploaded**: it was bumped when #59 merged, then #60 landed on top of it, so
> 1.0.69 supersedes it. Before that, v1.0.67 was zipped on 2026-07-23 to hotfix
> the broken PDF viewer in the live 1.0.66 build, v1.0.66 was zipped on
> 2026-07-22, v1.0.65 uploaded earlier on 2026-07-22, v1.0.64 on 2026-07-20,
> v1.0.63 on 2026-07-13, and v1.0.57 (`6cd25b6`) before that — v1.0.58–1.0.62
> were dev/internal only. Update this note when you `zip:store` and upload.

## [1.0.76] — 2026-09-02

One merged PR (#92) on top of 1.0.75, and it is a customer-reported break: the
Clinical Update button — the entry point to the managed-care/recert wizard — has
been failing on every submit for the residents whose chart URL doesn't carry a
client id. Three commits: stop sending the wrong number, find the right one, and
keep the resident's name out of a URL while doing it.

### Fixed
- **"Patient not found for the provided external id" on every Clinical Update
  submit** (#92). Reported on Lilac / Ventura, 2026-09-02. The Clinical Update
  button was the one patient-anchored surface that never adopted the shared
  patient-ref ladder: it called `resolveStableClientId()`, which returns null
  outright when the URL carries no `ESOLclientid`, and then read the resident
  header's "Client ID: NNN" span as if that were the client id. It isn't — PCC
  labels the FACILITY MRN "Client ID" in that header. The value is numeric, so
  it passed every shape check and went out as `externalPatientId`, matching no
  patient. Prod the same day settles that it never could: across 42,169 active
  residents with a numeric MRN, ZERO have an MRN equal to their own PCC client
  id. `getPatientFromHeader()` now uses `resolveStablePatientRef()` like every
  other surface and returns both anchors; the span fallback survives only for
  the case where it might still be right, a header printing something other
  than the MRN. Both anchors ride launcher → panel → wizard → API, and
  `pccPublicId` + `facilityName` now reach create, list, form-data and
  open-create-link so the backend can resolve by MRN, location-scoped, when the
  numeric id is gone. Panel scoping keys off "either anchor present" rather
  than the numeric id, so the New button and the patient-scoped run list still
  appear on flipped pages.

### Added
- **The client id read off the resident header photo** (#92). The Ventura chart
  settles what that page actually exposes: no `ESOLclientid` in the URL at all,
  and the only number in the resident header is `(11006)` — the MRN, wearing
  PCC's "Client ID" label. But the id *is* on the page. PCC serves the header
  photo as `<numeric client id>.jpg`; on that chart `21068632.jpg`, which is
  exactly that patient's stored `external_patient_id` in prod. New
  `scrapeClientIdFromResidentPhoto()` reads it and sits ABOVE the "Client ID:"
  span in the shared scraper, so every surface already on the ladder — MDS
  Run-it, verify, ARD recommendation — now gets a real id where it used to get
  an MRN. `resolveStablePatientRef()` tries the photo when the URL carries no
  client id at all. That case used to return null by design — don't guess a
  resident from the DOM, a LIST page would latch onto a random one — and the
  rule still holds: the scrape is scoped to the resident header, which a list
  page doesn't have, and requires 6+ digits, so it can never be an MRN (4–5).
  Both guards are tested, including the wound-thumbnail and list-page false
  positives.
- **Resident name as the last-resort anchor** (#92). The wizard sends the
  resident-header name behind both ids. The server matches it within the
  facility and refuses on ambiguity or on a near-miss surname — it will not
  guess between two residents.

### Changed
- **The resident's name no longer rides in a GET URL** (#92). `formData()` is a
  GET, so every param lands in the URL — access logs, proxies, browser history.
  A name is directly re-identifying in a way an opaque client id isn't, so it
  was dropped from that call. It still goes in the POST body on create, where
  the name tier is actually needed; the prefill resolves off the ids, which
  covers every case seen so far.

### Known, not fixed here
- The photo-filename read is a DOM contract with PCC, not an API: if PCC ever
  serves header photos under a different name, the ladder falls back to the URL
  and span reads it had before, silently.
- The nurse's edited care-plan focus *text* still doesn't persist (carried over
  from 1.0.72, 1.0.74 and 1.0.75).
- Nothing verifies extension payload keys against backend routes at build time
  (carried over from 1.0.74 and 1.0.75).

## [1.0.75] — 2026-09-01

Three merged PRs (#87, #90, #91) plus one unticketed fix, on top of 1.0.74.
Nothing here is a customer-reported break — 1.0.74 cleared those. This is the
next layer: two screens the nurse lives in getting the controls they were
missing, one chip catching up to a backend status that would otherwise render
as a false red, and a launcher learning where it isn't wanted.

### Added
- **"My filters" on the 24-hour report** (#91). The category filter was a
  dropdown that reset every time she closed the panel, so the nurse who only
  cares about falls re-picked "falls" every morning, in every building. It now
  sticks, per user, across facilities. A popover in the panel header carries
  eight category checkboxes; "Choose specific types instead" opens the 29
  subcategories, because the real complaint is usually finer than a category —
  medication errors but not "med not available", infections but not new
  admissions. Copy works to separate it from the schedule control beside it:
  that one is a BUILDING setting anyone can change for everyone, this one is
  hers, hence the "Only you see this" line. Two things it deliberately does
  not do: it never hides the fact that it's hiding (an amber "N findings are
  hidden by your filters" bar sits above the list whenever anything is held
  back, with a Show-them toggle, and revealed rows carry their own marker), and
  the reveal is not a second preference — it resets on day change, a peek. The
  server owns the taxonomy and does the filtering, so the panel renders
  whatever categories come back rather than a hard-coded list that drifts from
  what the AI emits; saving therefore invalidates every cached day, not just
  the one on screen. Tri-state math lives in a pure `utils/filterState.js`
  (19 tests, mutation-tested). New allowlisted events:
  `report_24hr_filters_saved`, `report_24hr_hidden_revealed` — counts and
  fixed taxonomy slugs only. **Requires Super-LTC/superapp#1148.**
- **Therapy status, OBRA runway and stay/payer filters on Functional Decline**
  (#90). Brings the extension's screen to parity with the web app; the fields
  were already coming back from `/api/extension/qm-planner/gg-decline-dashboard`
  with no surface to show them. Runway cards (Closing / Act now / Time to
  correct / Monitor / No OBRA) are a second click-to-filter axis beside
  severity: severity says how bad it is, runway says whether anything can still
  be done before the next OBRA codes it. Adds stay / payer / therapy filters
  and a soonest-ARD sort, each exposing its Unknown bucket — silently dropping
  residents we can't classify is a safety defect, not untidiness. Row chips are
  "On therapy" (never the raw NetHealth `typeOfCare` — "Skilled" doesn't read
  as *someone is already treating them*) and the OBRA chip, with only "Therapy
  ended Nd" loud. Facility name dropped from rows: the screen is scoped to one
  building. `lib/gg-decline-view.js` is ported from the web repo's
  `gg-decline-view.ts` per the qm-handoff convention, with the mirrored test
  file as the anti-drift guard — the two surfaces make the same clinical claims
  and must not diverge. 32 tests, 9/9 mutations caught.

### Fixed
- **Severity summary cards on Functional Decline weren't clickable** (#90).
  They were plain divs, so severity filtering existed on web and not here. The
  per-patient drill-in had the matching gap: its route bypassed the enrichment,
  so the roster showed therapy/OBRA chips and clicking a resident showed none.
- **`not_expected` diagnoses rendered as a red "Not Care Planned"** (#87). The
  backend shield redesign (superapp#1128) introduced `not_expected` for
  diagnoses no care-plan library entry claims — neutral, not a gap. With no
  branch for it the chip fell into the red default, recreating the exact
  false-red the redesign existed to remove. Now a grey shield reading "No Care
  Plan Expected", same tone as "no evaluation yet".
- **The FAB sat on top of PCC's New/Change MDS popup.**
  `/clinical/mds3_popup/newmds.xhtml` is a small chromeless window holding one
  short form — no patient chart, no facility chrome, nothing the speed dial can
  open — so the launcher was pure obstruction. `isFabSuppressedPage()` guards
  `createBubbles()`, which also skips the badge / module-status / restore work
  behind it. The SPA URL watcher rebuilds the launcher if that window navigates
  on to a real page, so suppression can't outlive the popup. The MDS interview
  scheduler still injects itself there — it has its own popup check and never
  touched the FAB.

### Known, not fixed here
- `demo/` was deliberately left out of #90: its Functional Decline fixture
  predates the therapy/runway/payer fields and needs its own pass.
- The nurse's edited care-plan focus *text* still doesn't persist (carried over
  from 1.0.72 and 1.0.74).
- Nothing verifies extension payload keys against backend routes at build time
  (carried over from 1.0.74) — #91 and #90 both lean on field names that a
  backend rename would break silently.

## [1.0.74] — 2026-08-20

Six merged PRs (#83–#89) on top of 1.0.72. The bulk of it is the care-plan
stamp path: three of these fixes are the same complaint seen from three
angles — focuses a nurse picked from her facility's PCC library were written
as custom rows, custom rows attached to a re-keyed focus silently vanished,
and none of it could be diagnosed because the stamp path emitted nothing on
failure. Also here: cert Skip and Delay, which have never worked from the
extension, and ARDs rendering a day early everywhere in the MDS Command
Center.

### Fixed
- **Every ARD read one day behind PCC** (#89). WeCare's MDS auditor reported
  it across Heritage and Jameson — H1860 showed Aug 8 for a PCC ARD of Aug 9.
  ARDs arrive as bare `YYYY-MM-DD`, and `new Date('2026-08-09')` parses that
  as UTC midnight, so `toLocaleDateString` renders the day before in every US
  timezone. Stored data was never wrong, only the display. New
  `content/utils/date-only.js` pins date-only values to local midnight, and
  the ARD renders route through it: `AssessmentRow` (ARD, "Complete by" =
  ARD + 14, and the countdown fallback), the global `formatDate` used by the
  MDS list, the facility dashboard, `PDPMAnalyzer`, and `QueryItemsHeader`.
  Sort comparators are deliberately untouched — a uniform shift doesn't
  change ordering — and real instants (`sentAt`, `signedAt`) keep `new Date()`.
  `vitest.config.js` already pins TZ to America/Los_Angeles so this class of
  bug fails a test instead of shipping green on a UTC runner.
- **Cert Skip and Delay have never worked** (#88). Reported as "the skip
  button does nothing when you click skip and add a reason", and confirmed
  against prod: the route destructures `{ skipReason }`, cert-api posted
  `{ reason }`, so the guard fired on every request, for every user, since the
  endpoint shipped. Delay had the identical mismatch. Revoke happens to post
  the key its route wants, which is why the pattern went unnoticed. The
  backend names are the shared contract — the web app's own skip dialog posts
  `skipReason` — so the extension is the side that had to move. What made it
  invisible: all three modals swallowed the failure (`.catch(() =>
  setSubmitting(false))`), so the 400 came back, the spinner reset, and the
  modal just sat there. They now surface the server's message inline. A
  payload-key contract test covers all three endpoints.
- **"Add from PCC library" picks were written as custom rows** (#85). Every
  focus a nurse added through that button was recreated through the custom
  endpoints — `orchestrateStamp` routes on `libraryStdId`, and the pick
  carried its std id only as `_libraryStdNeedId`, a UI field for the remove
  chip. So PCC never applied the library's Kardex category or positions (every
  intervention landed hardcoded RN), and charts filled with "New Custom Goal /
  New Custom Intervention" under focuses taken deliberately from the
  facility's library — the complaint that had a clinical team threatening to
  turn the feature off. The pick now sets `libraryStdId`, so the write goes
  through PCC's own wizard and PCC applies Kardex and positions itself; the
  personalization pass still diffs the nurse's text against what the wizard
  printed and applies her edits post-add. The hardcoded `kardexCategory` /
  `positions` are gone from library items.
- **Custom writes on a re-keyed focus attached nothing — or deleted the row**
  (#86). PCC sometimes re-keys a library focus on save: create mints a draft
  id, the save's 302 hands back a different committed id. Wizard adds already
  send the pair (`ESOLneedid`=draft, `ESOLgenneedid`=committed), which is why
  they work; the custom endpoints sent the committed id in both fields, and
  PCC treats that as an orphaned target. A new custom goal or intervention
  200s and never attaches — and an *edit* of an existing row 200s and deletes
  it. The deletion is on film in a HAR: four interventions on the chart at
  23:24:55, the personalization pass edits one with `needid == genneedid` at
  23:25:03, gone at 23:25:06. When PCC doesn't re-key, draft equals committed
  and the same-id-twice form is accidentally correct, which is why three days
  of reports looked transient. It never was: 6 of 35 stamps over three days,
  ~17%, every one `route:library`. The draft id is now threaded through every
  custom-write site — create goal/intervention, the personalization editor's
  form GET (the row-killer, since the form echoes back whatever pair opened
  it), the verify-repair retry, and `pcc-add-intervention`, which now resolves
  the real `editNeed(gen, need)` pair from the live plan. Custom-created
  focuses are byte-identical.
- **The stamp path could not report its own failures** (#84). Three customer
  reports in a week had to be diagnosed from the production database.
  `care_plan_audit_commit_stamped` was emitted *after* an early return on the
  failure branch, so it only ever fired on success — `n_failed` was
  structurally always 0, and the event went dark fleet-wide on Aug 5, the day
  read-back verification shipped. A thrown stamp emitted nothing at all.
  `attachLibraryItems` skipped its whole block on an empty id list — no wizard
  call, no error — while the focus was still created, so every layer above
  reported success over a focus with nothing under it. `parser_blind` had been
  emitted since the read-back landed but was never allowlisted, so `track()`
  dropped every one. And `care_plan_autopop_library_focus_added` was a bare
  click counter that couldn't tell five interventions from none. All four now
  report — and the new `routed_as` field is what surfaced the library-routing
  bug fixed in #85.
- **MDS overlay telemetry went dark on some machines** (#83). The store shim →
  analytics proxy path silently drops whole batches: the fleet's heaviest
  badge clicker delivered zero client events for 12 days while completing
  hundreds of API calls a day. Render outcomes and badge clicks now also ride
  the background API_REQUEST channel (`POST /api/extension/mds/overlay-state`),
  captured server-side where they can't be lost client-side. Beacons:
  `rendered` (with `itemsTotal` vs `itemsRendered` — a gap means badges found
  no DOM anchor, the silent-failure mode that hid for weeks), `no_items`,
  `no_run_yet`, `solve_running`, `init_failed`, and badge clicks.
  Fire-and-forget; never delays or breaks the overlay.

### Known, not fixed here
- The nurse's edited focus *text* still doesn't persist (carried over from
  1.0.72).
- Nothing verifies extension payload keys against the backend routes at build
  time — #88's test pins the extension's side of the wire, but a backend
  rename would still pass it.
- The engine's non-Kardex twin selection is server-side and ships separately.

## [1.0.72] — 2026-08-12

One fix: the care-plan verify step no longer reports rows this extension wrote
as lost, and no longer re-sends them. Reported by an MDS coordinator on
2026-08-07 and again 2026-08-12: after adding a custom focus she was told
"1 goal and 7 interventions did not save" — but every row was already on her
chart, twice, because the same false zero had also triggered a repair re-send.
One merged PR (#82) on top of 1.0.71.

### Fixed
- **Verify counted extension-written custom rows as missing, then duplicated
  them** (#82). Custom rows have no library item behind them, so the custom-add
  path sends the std ids (`ESOLstdneedid`/`ESOLstdgoalid`/`ESOLstdinterid`) as
  `-1`, and PCC echoes that sentinel into the row actions (`editGoal(…,-1,…)`).
  `parsePlanPage` demanded digits in every slot, std ids included, so no row
  the extension has ever written was visible to the read-back: it reported 0
  attached, `_verifyAndRepairFocus` read that as "nothing landed", re-sent the
  batch, and duplicated the focus. The parser now requires digits only in the
  slots it consumes (row id and parent focus) and steps over the std slots —
  while still ignoring the page's own `function editGoal(...)` declaration.
  Deeper guard: the parser now also counts bare `editGoal(`/`editIntervention(`
  occurrences on the page and reports whether it accounted for every row; when
  it can't (`parser_blind`, new telemetry field), a zero is treated as parser
  blindness rather than chart truth — no repair, no shortfall toast, optimistic
  counts stand. Replaying the incident against the old regex confirms that
  layer alone would have prevented the duplication. Tests cover the `-1` shape,
  a mixed plan, the blindness signal, and the exact sentence the nurse reads.
  Not addressed: her edited focus text still not persisting, and a genuine
  partial drop on the library route (3 of 5 interventions); duplicates already
  on charts need manual cleanup.

## [1.0.71] — 2026-08-06

One fix: the Super Verify DFS callout is now scoped to the assessment actually
on screen. Reported by Joanna Lucius (Director of Quality, Garden Springs) at
Heritage Painesville: two residents' verify buttons showed a Discharge Function
Score as met/short on Quarterlies — but DFS is only determined on End of PPS
Part A Stay assessments. One merged PR (#80) on top of 1.0.70.

### Fixed
- **DFS callout spoke on assessments that didn't determine it** (#80; regression
  against SUP-258's intent; backend counterpart in superapp). `useDfsPatient`
  fetched a resident's DFS standing without telling the server which assessment
  was open, so the server answered "newest Part A stay in the last 365 days" —
  and the callout rendered `Met · +7` / `12 short` on Quarterlies months after
  that stay ended. Now `VerifyResults` reads the ARD via
  `window.getPCCAssessmentMetaFromDOM()` (the same DOM read `postVerify` uses)
  and `useDfsPatient` sends it as `ardDate`, re-fetching when it changes, so the
  server scopes to the assessment on screen: End of PPS Part A Stay → observed
  vs expected (met/short); mid-Part-A (5-Day, Quarterly, IPA) → live target;
  anything else → nothing. Endpoint construction is extracted to a pure
  `buildDfsEndpoint` with tests pinning that the ARD is actually on the request.
  The scraper only emits valid `YYYY-MM-DD` (else null, and null isn't sent) —
  a malformed value would match nothing server-side and blank the callout on
  the one assessment that *should* show it. Backward compatible both ways, but
  the server falls back to the old unscoped answer when no ARD arrives, so this
  extension half is what actually ends the wrong-panel failure mode. Verified
  against prod for both reported residents plus three whose PPS Discharge ARD
  trails the Part A end date by a day.

## [1.0.70] — 2026-08-05

A new Case Mix tab in the MDS Command Center (Ohio Medicaid CMI, one building),
the QM board's quarter drill-in finished properly (right quarter, labelled
roster, CSV export), full-library ICD-10 search from the code dropdown, and the
fix for the silent care-plan stamp failure a nurse reported. Seven merged PRs
(#68, #73–#78) on top of 1.0.69.

### Added
- **Case Mix tab — one building's Medicaid CMI, gated to Ohio** (#74, #76;
  backend superltc #1100). The whole CMI surface inside PCC as a Command Center
  tab, scoped to the building whose page is open. The **server decides
  entitlement**: `enabled` rides in the case-mix response (the extension has no
  facility→state map), and every failure path — 403/404/network/thrown —
  resolves to `enabled:false` so the tab simply doesn't appear. Ships both
  populations (capture = assessed inside the quarter, payable = record in
  effect on the picture date); the work list is always sourced from **payable**,
  because capture carry-forward is structurally zero (verified 0/0/0/0/0/0
  across six Ohio buildings — the default view would otherwise never show it).
  The second pass (#76) replaced the Capture/Payable + Medicaid toggles with the
  web roster's controls (search, record status, counts basis), gave the trend a
  real plot area (gridlines, dashed closed-quarter average, value labels, floor
  printed under the truncated axis), made clinical-mix rows expand an inline
  resident list, and gated per-resident projections on `basisMatches &&
  changed` — previously 72 of 97 rendered "projections" were jumps the engine
  never claimed. Open quarter shows a measured carry-forward band ("likely
  1.69–1.75 by quarter end", hollow cap), not a fake forecast — the projection
  mean backtested *worse* than doing nothing. Read-only; no override editing.
- **QM quarter card opens an exportable roster** (#78). Clicking a
  Projected/Predicted/Published quarter now opens the full resident × measure
  grid (the artefact people bring to the QM meeting) instead of just re-scoping
  the tiles. `lib/quarter-roster-view.js` settles what a cell means; the
  load-bearing rule is that `skipped` is **not** an exclusion — the denominator
  is `applicable && !excluded && !skipped`, and tests assert per-column
  reconciliation (✕ == numerator, ✕ + · == denominator) as an invariant.
  Glyphs are SHP's alphabet on purpose. CSV export (filtered set, UTF-8 BOM,
  quoted names); no print button — `window.print()` from a content script
  prints the PCC page, not the overlay.
- **ICD-10 — search the full library from the code dropdown** (#68, SUP-264).
  The evidence panel's dropdown said "Search by code or name…" but only
  filtered the codes Comprehend returned for the group — typing "diabetes" on
  an I69 group said "No matches". Library results from
  `/api/extension/icd10-search` (debounced 250ms, 2-char floor, stale-token
  guarded, 15-row cap) now merge into the same list below the group's own
  codes — one box, one list, no section header. Fixed alongside: staging a
  library code spread `items[0]`, carrying an unrelated annotation's id and
  silently deleting a real finding on approve (library codes now stage with a
  null id); and the per-keystroke render drifted from `render()`'s split
  (both now go through one `_renderCodeDropdownBody`).

### Fixed
- **Care plan — verify what PCC actually attached; stop reporting success when
  it didn't** (#73). A nurse lost two care plans' worth of work: focus saved,
  goals and interventions didn't, and the extension toasted "Added to care
  plan" both times. `orchestrateStamp` resolves rather than throws on partial
  attach, and three of the four Add paths (including `_stampAuditAddOne`, the
  one all production telemetry shows nurses using) treated that as success;
  the library path counted any HTTP 200 as all-goals-stamped. Now the stamp
  **reads back** `careplandetail_rev.jsp` — each row is tagged with its parent
  focus — for exact per-focus counts, pinned by unit tests against a real
  captured page (5 focuses / 9 goals / 39 interventions). Focus resolution
  matches on the text we wrote, not the phantom id PCC returns on save. Repair
  retries once and only when *nothing* attached (a duplicated row is worse
  than a reported shortfall). Also closes the telemetry gaps that kept this
  invisible: `care_plan_audit_commit_stamped` had no failure signal, and
  `care_plan_polish_swapped` was never allowlisted so `track()` dropped it.
  New `care_plan_stamp_verified` event carries the discriminators; verification
  is on by default (`?cpverify=0` disables). Root cause of PCC's drop still
  not isolated — this makes it visible, recoverable, and measurable.
- **QM — drill into the quarter the reader picked** (#75). `ScopedMeasureDetail`
  never passed `back` to `useQuarterRates`, so all four quarter cards returned
  the *current* quarter's roster; the heading also labelled off the live board,
  so fixing the data alone would have shipped right numbers under a wrong
  title. The headline now labels off the roster actually loaded and says
  "(closed)" for locked quarters. Board modal went 100vw→80vw with a
  widest-table floor — the old `max-width: 1100px` cap was the real bug
  (`.qmc-scroll` is `overflow-x: hidden`, so clipped columns were unreachable).
- **QM — drill-in roster is a labelled accordion, not a chip** (SUP-263, #77).
  The "View denominator" pill read as a filter and got missed; now a full-width
  disclosure row below the worklist carrying its counts ("4 of 62 counted by
  CMS this quarter · 20 excluded"), still collapsed by default — the worklist
  (live census) and roster (windowed CMS cohort) answer different questions and
  must not stack. Dead `.qmc-recon__denom` CSS deleted. The name-format half of
  SUP-263 ships with the web deploy (superapp #1105), not an extension release.

## [1.0.69] — 2026-07-26

Captures the logged-in PCC username so MDS authorship can be attributed to a
real Super user. Ships on top of the unreleased 1.0.68 (below), so this store
build carries both.

### Added
- **PCC username capture for MDS authorship** (#60, SUP-216). `mds_assessments.
  created_by` names the MDS coordinator who opened an assessment, but as a PCC
  login username (`kmcdonald5`), which joined to Super users at 0% — 838 of 838
  misses had no candidate at any threshold, because those people have no Super
  account. The extension is the only place both identities are visible at once,
  so it observes the binding instead of guessing it. Once per Super user / org /
  week on boot: read `ESOLuserid` off the page (free), same-origin GET
  `editmyprofile.jsp`, parse the login name, POST it. Fire-and-forget — every
  failure path is silent and leaves the cache untouched so the next boot retries.
  Two corruption modes are pinned as tests: PCC renders the org code as a loose
  text node *outside* the input (`Login Name: eac.<input value="jcameron">`), so
  reading the input's `value` excludes it structurally rather than by stripping a
  prefix; and dots *inside* the value are real (22 of 895 prod usernames, e.g.
  `jennifer.russell1`), so the value is sent verbatim — normalizing would collide
  distinct people. The cache keys on `esolUserId` + `superUserId` + `orgSlug`
  together: gating on `esolUserId` rather than the username avoids the very fetch
  the cache exists to prevent, and the `superUserId` stamp is what keeps user A
  binding, logging out, and user B logging in on the same browser profile from
  leaving B permanently unbound.

## [1.0.68] — 2026-07-23 *(never uploaded to the Web Store — superseded by 1.0.69)*

PCC replaced numeric URL/link ids with ephemeral, login-bound `EID_` tokens. The
extension must never send an EID to the backend. This release resolves stable
numeric ids (URL if numeric, else DOM recovery) and rides `pccPublicId` (MRN) as
the durable patient anchor the backend (superapp #966/#967) accepts when the
numeric id is EID-dead.

### Fixed
- **Stable id resolution across every MDS surface** (#59, SUP-177). New
  `client-id.js` helpers: `resolveStableAssessmentId()` (toggleToolsWindow DOM
  scan), `scrapePccPublicIdFromDOM()` (MRN from title/header), and
  `resolveStablePatientRef()` (`{externalPatientId?, pccPublicId?}`); the string
  contract of `resolveStableClientId()` is unchanged. The `context.js` chokepoints
  (`appendMDSContextParams` / `getMDSContextBodyFields`) now emit `pccPublicId`,
  and `getMDSContext` / `getChatContext` no longer forward the raw EID. In
  `mds-overlay.js`, `getMDSPageParams` returns a numeric-or-null `assessmentId`
  plus a separate `rawAssessmentId` for page detection, and every
  `externalAssessmentId` send-site omits the field when null instead of
  stringifying `"null"` / an EID. Super Verify, the ICD-10 viewer (which also had
  an internal-id leak into the external slot), query-send-modal and care-plan-stamp
  dedup were routed onto the resolver; Preact MDS hooks inherit the fix via the
  chokepoints.
- **Fail-closed regressions on flipped pages.** Super Verify's `_readIds` returned
  a numeric-only id, so `if (!assessId)` blocked the modal on pages with no
  recoverable numeric id — but that id also drives same-session PCC navigation,
  where an `EID_` token works fine. It now prefers the numeric and falls back to
  the raw token so the modal opens and scrapes, with `verify-api` still guarding
  the backend. Separately, `getMDSContext` gated scope `'mds'` on the resolved
  numeric, so a flipped page silently downgraded to patient/global scope and the
  side panel stopped rendering; detection now keys on raw `ESOLassessid` presence.
  Non-flipped facilities were never affected.
- **False "PCC returned an error" on accepted diagnosis pushes.**
  `submitDiagnosis` flagged failure when the response HTML merely *contained*
  `class="errormsg"` or the substring `Error:` — but PCC ships an empty
  `errormsg` container on success and its pages carry stray `Error:` strings, so
  diagnoses PCC actually added were reported as failed. It now fails only when a
  `.errormsg` element contains actual text. A verbose response dump sits behind
  `PCC_DIAG_DEBUG`, default off.
- **Infinite "Loading MDS analysis…" spin on NO_RUN_YET.** `initSuperOverlay`
  declared `const params` inside the `try`, while both the EID diagnostics and the
  "Run it" card in the `catch` referenced it — so any section fetch error (e.g. a
  404 `NO_RUN_YET`) threw `ReferenceError: params is not defined` before the
  spinner could be hidden. `params` is now function-scoped.
- **`diagnosis-queries/generate-note` 400s.** The backend now requires org
  scoping; both callers send `orgSlug` (+ `facilityName`).

### Changed
- **I8000 evidence uses the shared split/slide-out viewer** (#59). The I8000
  audit/suggestion detail opened evidence in a separate stacked modal, unlike
  every other MDS item, whose evidence grows the panel sideways inline. A new
  `normalizeI8000Evidence()` maps the endpoint's evidence shapes (chunk-encoded
  document ids, order/medication `sourceId`s, clinical notes) into what
  `renderEvidence` + `parseEvidenceForViewer` + `enterSplitView` already
  understand, so clicking evidence opens the inline split viewer with wordBlock
  highlights and Back returns to the detail. Also fixes cards being unclickable
  entirely: document-chunk evidence has no `sourceId`, but `i8000EvidenceAction`
  gated on `sourceId` alone. The dead I8000-specific evidence path was removed.
- **Interview-coverage/batch row correlation** (#59, superapp #967). `rowMap` is
  index-parallel `string|null` (the resolved `externalAssessmentId` per row), not
  the coverage objects — those live in `results` keyed by `.key`. Each row maps
  via `rowMap[i] → results.find(x => x.key === rowMap[i])`; a null entry marks a
  row the backend couldn't resolve. The incorrect `data.rowMap || data.results`
  fallback was dropped, since the two shapes aren't interchangeable.

## [1.0.67] — 2026-07-23

Hotfix release: the ICD-10 / medical-diagnosis PDF viewer was dead in the live
1.0.66 store build (`Failed to load PDF: Setting up fake worker failed… Cannot
read properties of undefined (reading 'WorkerMessageHandler')`).

### Fixed
- **PDF viewer — pdf.js main/worker version mismatch.** The Dependabot bump in
  #49 raised `pdfjs-dist` 3.11.174 → 4.10.38 in `package-lock.json` and updated
  `lib/pdf.min.js` / `lib/pdf.worker.min.js` to 4.10.38 — but the bundle shipped
  as 1.0.66 was built against a stale `node_modules` still holding 3.11.174. That
  paired a **v3 main API** (bundled `window.pdfjsLib`) with a **v4 worker file**;
  pdf.js rejects the mismatched worker, falls back to a main-thread "fake worker,"
  and the v4 worker doesn't expose `WorkerMessageHandler` where the v3 loader
  looks for it, so every PDF failed to open. No source change was needed —
  reinstalling `pdfjs-dist@4.10.38` and rebuilding aligns the bundled API with the
  worker (both 4.10.38). **Republish required:** 1.0.66 users stay broken until
  this ships to the Web Store.

## [1.0.66] — 2026-07-22

Care Plan Initial Admit polish parity, IPA capture-window deadlines, and an
org-admin job title in the Team tab. Five merged PRs (#53–#57) plus a copy
tweak on top of 1.0.65.

### Added
- **IPA — capture-window deadlines** (#56, SUP-171). Backend v6 (superapp #961)
  dedupes candidates per resident, drops triggers whose service ended beyond its
  RAI capture window, and annotates the survivors with `serviceEndedAt` +
  `captureWindowClosesAt`. Wired in:
  - **Card chip** — recommended cards with a closing window show an amber
    "⏳ Treatment ended — capture window closes <date>" chip (soonest across the
    candidate's triggers).
  - **Review modal** — per-trigger line: "Treatment ended <date> — an assessment
    with an ARD by <date> can still capture this."
  - Nurse-verify copy drops the "(no active order in our records)" parenthetical,
    which the real ended-service data now contradicts.
- **Care Plan — Initial Admit polish swap + authoring bar** (#55/#57, SUP-116).
  The backend auto-pop route now skips its inline AI review for concept-mapped
  orgs (Garden Springs Initial Admit 504 fix), so the wizard paints
  deterministically in ~1s and the polish arrives via the V3 cached-generate
  side-channel — exactly like Comprehensive Review. Authored content merges into
  **untouched** proposal focuses in place (row identity preserved, Kardex stays
  opt-in; nurse-edited/stamped rows never overwritten); the FocusList sidebar
  shows the same "✨ Polishing plan… %" bar and "Polished N" note as the worklist.
- **Team — org-admin job title** (#53/#54). The org-admin detail view in the ext
  Team tab now has a "Job title" picker, matching the web person panel. Picking a
  role saves its template as the person's baseline bundle — inert while they hold
  full admin access, but their default if they're later moved to Staff.

### Fixed
- **Care Plan — "Needs input" cleared after removing goals/interventions**
  (#55/#57). Deleting a not-applicable goal/intervention left "Needs input" stuck
  on and blocked "Add to Careplan": the gate scanned the raw proposed focus, but
  deletions live in per-focus edit state. Scan is now a pure, tested
  `unfilledTokenKeys()` fed the edited lists at all 9 gate call sites (91/91
  care-plan tests pass, 5 new).
- **Care Plan — obvious un-skip** (#55/#57). Un-skip read as a status label, not a
  button ("it didn't give me the option to bring it back in"). Skipped focuses now
  show an in-card banner with an explicit "+ Include this focus" CTA. From
  Brittany Burner's initial-admit feedback (2026-07-22).

## [1.0.65] — 2026-07-22

Care Plan Comprehensive mode wired to the backend's V3 cached-generate flow, and
the extension Team tab. Four merged PRs (#37, #50–#52) on top of 1.0.64.

### Added
- **Care Plan — V3 cached generate** (#37, SUP-116). Comprehensive mode now wires
  to the backend's cached-generate flow (superltc SUP-66 / PR #875). The audit
  stays the membership source (toAdd/toRemove/toCheck via the concept layer); the
  cached endpoint only adds on top, never blocks:
  - **Real authoring progress** — while the background AI polish runs, the sticky
    header shows "✨ Polishing plan… N%" with a live bar fed by the server's
    `authoringProgress {done,total}` (polls the same URL ~4s, cheap cache reads;
    stops on modal close, fingerprint change, or 90s).
  - **Polished-content swap** — when `authored=true`, AI-selected
    goals/interventions swap into **untouched** toAdd rows only, matched by
    `libraryStdId`; anything the nurse edited, stamped, or skipped is never
    overwritten. Kardex stays opt-in via `_recKardex`.
  - **Chart-quality banner** — junk/under-synced charts (`no_active_dx`,
    `placeholder_dx_codes`, `no_orders_synced`, `no_coded_mds`) render a
    dismissible amber warning in nurse language instead of a silently sparse plan.
  - **Failure floor** — 409 (org not concept-mapped), any error, or authoring
    never landing → the worklist is pixel-identical to the prior build.
- **Extension Team tab** (#50–#52). A Team tab in the Settings overlay with full
  parity to the web app plus regions: sub-tabs, a wider modal, and inline pickers
  (#51); inline feature chips with expandable sub-features and a people grid (#52).

## [1.0.64] — 2026-07-20

Certifications, diagnosis queries, settings, and the MDS In-Progress list. Ten
merged PRs (#38–#48) that accumulated after the 1.0.63 bump, plus the cert audit
redesign and the diagnosis-query ICD-10 edit.

### Added
- **Certifications — "All" tab** (#39). A facility-wide list of EVERY cert for a
  facility regardless of status or how long ago it was signed — the gap between
  the dashboard's 7-day signed window and the discharged archive, built for a
  100% compliance audit. Consumes `GET /api/extension/certifications/audit`;
  server-driven status + signed-date-range filters, paginated "Load more", and an
  "Export CSV" that pulls the entire filtered set across all pages (UTF-8 BOM for
  Excel). Facility-wide, so hidden in the per-patient overlay.
- **Certifications — "All" tab grouped patient → stay → certs.** The flat table
  is now a grouped list: patient header (name, MRN, rollup "N need action", cert
  count) → stay block (payer, Medicare day, Part A start, stay status, next open
  due) → cert rows (type, status, due, signer, "Just signed"). A patient can have
  several Part A stays (readmits/interruptions), so the stay tier is real. Adds a
  client-side search over patient name + MRN, and expand/collapse per patient.
  Server-side filters vs client-side search are labelled as different scopes: the
  search says when it only covers loaded rows. New shared pure
  `certifications/cert-grouping.js` (`groupCertsByStay`, `filterCertsBySearch`,
  `isCertActionNeeded`) with tolerant field resolution, so the same helper works
  against both the full `CertificationWithDetails` shape and the leaner audit
  projection. Unit + component tests.
- **Certifications — AI "Generate clinical reason"** (#41, SUP-124). Generate /
  Regenerate button beside the Clinical Reason field in the recert Send and Edit
  modals. Calls `POST /api/extension/certifications/{id}/generate-clinical-reason`
  and drops the draft into the editable field for the nurse to review — never
  auto-saves. Shared `GenerateReasonButton` handles in-flight state and errors.
- **Settings overlay** (#40). A gear action on the super-dial FAB opens a Preact
  Settings panel (dynamic-import launcher, mirroring `QMBoardLauncher`) with
  Weekly Reports and Profile tabs plus a "Team (soon)" placeholder.
- **Diagnosis queries — view + edit a sent query** (#45, SUP-131). See and edit
  the note on an already-sent query until the physician signs it; the signing
  portal reads live, so no revoke/resend. Read-only once signed.
- **Diagnosis queries — effective (onset) date + ARD timing** (#45, SUP-143).
  Nurse-set effective date with an ARD countdown badge and a non-blocking
  outside-lookback-window warning, on BOTH send surfaces (vanilla
  `QuerySendModal` and the Preact batch review) and the detail modal's edit view.
  New shared pure `queries/lib/query-timing.js`; `QueryAPI` gains `patchQuery` +
  `previewTiming`. Fully backwards compatible — queries with no `timing` degrade
  to no badge/guidance, and `effectiveDate` is only sent when moved off default.
- **Diagnosis queries — edit from the Command Center Queries tab** (#47). The
  same note + effective-date edit, reachable from the MDS Command Center list.
- **Diagnosis queries — change the ICD-10 code on Edit** (SUP-147). The edit view
  on both surfaces now carries the shared ICD-10 picker, prefilled with the code
  currently attached and seeded with the diagnosis name. Saves as a non-empty
  `recommendedIcd10` via PATCH, changing what the physician is offered at signing
  (they can still search and pick any code). Requires backend #934.
- **MDS In-Progress list — filter bar** (#46, SUP-145). Super-branded toolbar
  above the PCC MDS List "In Progress" table: search (name + MRN), discipline
  chips with a per-letter Sections popover, Type dropdown, Due (Overdue / ≤3d),
  and a missing-interview toggle. AND-combined, "Showing X of Y", matched section
  letters bolded in the native cell. Pure client-side — every dimension comes
  from data already on the page or already fetched.

### Changed
- **Certifications — "Send" → "View"** (#44, SUP-130). The cert-row/timeline
  button only opens the send-preview modal (the send happens inside it), so the
  label was misleading — as was the old "Resend".
- **Certifications — badges wired to the new backend fields** (#44, SUP-130,
  backend PR #931, additive with local fallbacks). "Action Needed" counts only
  time-pressured certs (`cert.actionNeeded`) instead of every active cert, fixing
  the "shows 2, should be 1" over-count; the tab still lists the full worklist,
  only the number narrows. The Signed sub-tab badge becomes a "newly signed, not
  yet seen" nudge (`cert.isNewlySigned`) rather than a total. The `cert_signed`
  seen-clear moved from entering the Certs view (which lands on Action Needed,
  where signatures aren't shown) to opening the Signed sub-tab, where they're
  actually viewed — keeping the list badge and FAB badge on one basis.
- **Weekly report is user-global; scope → delivery mode** (#43, SUP-140). The
  report always covers every building the user can access, so the building scope
  toggle is replaced by a delivery choice that only appears with more than one
  building: one combined roll-up vs one email per building
  (`deliveryMode: rollup | per_building`). Single-building users get a read-only
  line naming the covered building. `getWeeklyReport()` drops the
  facilityName/orgSlug params; `saveWeeklyReport()` sends `deliveryMode`.
- **Settings — Profile tab redesign.** Removed the nested-boxes treatment (a
  bordered card wrapping divided rows wrapping bordered inputs). Position
  suggestion chips are quiet fills rather than outlined pills — an outlined pill
  under an outlined input read as five more empty fields — and now show an active
  state for the current title. Email is a read-only row instead of a disabled
  input. Adds a live "How you'll appear" preview (initials, name, title ·
  building) so the fields' purpose is visible, and a proper resting state for the
  Save button instead of a faded primary.
- **Super Verify GA'd to all users** — carried over from 1.0.63; the interview
  scheduler is now the only surface behind `mds-beta-gate.js`.

### Fixed
- **Super Verify "View" opened the Care Plan, not the MDS section** (#38,
  SUP-129). The deep link used the legacy `/care/chart/mds/mdssection.jsp`
  endpoint, which redirects to the Care Plan. Switched to
  `/clinical/mds3/section.xhtml`, already used by the section scraper and query
  modal — same assessId, same `[A-Z]+` sectioncode format.
- **Certification dates rendered a day early in the "All" tab.** `fmtDate` parsed
  `'YYYY-MM-DD'` with `new Date()`, which reads it as UTC midnight and then
  formats in local time — every due / signed / Part A start date displayed one
  day earlier in any US timezone. **The CSV export was affected too**, so audits
  exported before this build carry shifted dates. Both display and CSV now go
  through the module's existing `parseDateOnly`; a component test locks the exact
  dates in.

## [1.0.63] — 2026-07-05

QM Board rounding-out release. Two QM PRs that had merged after the 1.0.62 bump.

### Added
- **QM Board — Florida QIP overlay** (#22, web PR #823 parity). Five-Star ⇄
  Florida QIP sub-toggle in the Regional scorecard for FL facilities
  (`hasActiveQip(facilityState)`). New `FlQipView` renders Official vs Projected
  cards + measure table, editable non-MDS inputs, a coding-accuracy panel
  (prognosis + flu, dismiss/undo, click-to-expand dx detail), and a coverage
  modal. New `hooks/useFlQip.js` (GET official, PATCH inputs, POST/DELETE
  coding-dismissal via the API_REQUEST message pattern).
- **QM Board — per-measure resident drill in the Florida QIP table** (#23).
  Clicking a measure's Projected rate in the FL QIP view opens the shared
  `MeasureDetail` drill (same surface as the Five-Star scorecard, This-quarter ⇄
  Last-quarter flip) — no new endpoint, reuses the roster/quarter data FlQipView
  already gets from its `QmFiveStarScorecard` parent. All 9 FL QIP measures drill;
  the Official (CMS) column stays static (lagged, risk-adjusted, no resident-level
  detail), and the 3 adjusted measures show a "live/observed view — official
  governs" caveat. Five-Star star-point estimates are suppressed in the FL QIP
  drill (wrong scoring context).
- **QM Board — CNA aide scorecard promoted to a top-level mode** (#21, web PR
  #808 parity). Aide scoring moves out from under Functional Decline → "Aides"
  and becomes a third QM Board mode: **Coordinator | Regional | CNA**. Functional
  Decline is now just the residents roster.

### Added
- **Care Plan V2 — Care Area Map home screen + token fixes.** The comprehensive
  review now opens on a care-area map (`CareAreaMap.jsx`): every care area as a
  clickable cell (gap / removal / verify / held-back / covered / skipped /
  not-indicated) with work counts and CTAs, routing into the existing worklist.
  New `segmentTokens.js` gives goal/intervention tokens stable unique keys
  (duplicate `tokenKey`s used to collide — picking one value filled several
  blanks). FocusCard v2 redesign, pcc-stamp/pcc-library-stamp/pcc-discover
  reworks, tests moved into `__tests__/` with new coverage.
- **I8000 overlay: clickable evidence + Query Physician.** Evidence cards in the
  I8000 suggestion/audit modal now open their source (progress-note viewer,
  order/MAR administrations grid, documents/UDAs) via the shared evidence
  dispatcher, with a "View note ›" affordance and `i8000_evidence_opened`
  analytics. Suggestions with `needs_physician_query` get a "? Query Physician"
  action that hands off to the shared QuerySendModal (AI note from
  queryReason/queryEvidence, ICD-10 picker seeded with the category name —
  nurse-picked codes only, per the no-AI-codes rule). The backend
  `/sections/I/i8000` endpoint is now live; stale "undeployed" comments removed.

### Changed
- **Super Verify GA'd to all users.** The ✨ Super Verify button on the MDS
  section-listing page no longer requires the backend MDS beta allowlist — it
  now injects for everyone (same rollout pattern as the coverage-overlay GA,
  `e550bad`). No backend change needed: `/api/extension/mds/verify` was never
  allowlist-gated, only org `mdsSolver` module + location access. The interview
  scheduler is now the only surface still behind `mds-beta-gate.js`.
- **CNA aide scorecard clarity redesign** (#21). Reframed from an analytics
  dashboard into a nurse's-glance view in terms of *dependence*: one-line plain
  verdict + status dot, per-category "less dep." / "more dep." (magnitude as
  "a bit"/"way", never a bare number), a "getting more accurate?" trend (hidden
  under ~3 weeks, accuracy inverted so "matches team" is on top), and dated
  newest-first "recent scores to review" with the GG scale key (1 = fully
  dependent → 6 = independent). Print PDF mirrors all of it. Shared label logic
  in `lib/aide-scoring.js`; new unit tests.
- **QM Regional scorecard clearability unified with worklist/drill** (#21). The
  scorecard no longer re-derives clearing from the raw
  `clearGuidance.clearsOnNextObra` boolean (which was true for clinical/trajectory
  measures too, mislabeling them green "can clear now"). It now routes through the
  shared `clearGroupForEntry` + `clearTiming`, splitting counts into "N clear with
  an MDS" (green) vs "N need a clinical fix" (amber), colors per-resident badges by
  clear-kind, and adds the "if held" caveat for worsening-trajectory measures.
  Pure frontend — backend already computed the correct classification.

---

## Earlier releases (backfilled summary)

- **[1.0.62]** — Managed-care inline gear UDA filter + bigger "Complete By" text;
  "Complete By" deadline column on the MDS In-Progress list.
- **[1.0.61]** — QM Coordinator + Regional two-mode board (#18); managed-care UDA
  assessment filter + de-piled recert list calls (#20); Section I I8000 overlay
  audit + NTA diagnosis suggestions (#19); MDS "RUNNING" → "Analyzing…" state (#17);
  GA'd the interview/UDA coverage overlay to all users.
- **[1.0.58 / 1.0.59]** — QM windowed denominator + points-forward Five-Star
  (web PR #733 parity).
- **[1.0.57]** — Chrome Web Store submission build (last store upload).

[1.0.63]: https://github.com/Superjonathan123/chrome-ext/compare/71f89b2...HEAD
