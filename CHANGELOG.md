# Changelog

All notable changes to the Super LTC Chrome extension, newest first.
Version = `manifest.json` `version`. Each entry records what shipped in that
bump so we can tell the current build apart from the last one at a glance.

> **Store note:** **v1.0.67** was zipped for Chrome Web Store submission on
> 2026-07-23 (`super-ltc-store.zip`) to hotfix the broken PDF viewer in the live
> 1.0.66 build (see below). Before that, v1.0.66 was zipped on 2026-07-22,
> v1.0.65 uploaded earlier on 2026-07-22, v1.0.64 on 2026-07-20, v1.0.63 on
> 2026-07-13, and v1.0.57 (`6cd25b6`) before that — v1.0.58–1.0.62 were
> dev/internal only. Update this note when you `zip:store` and upload.

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
