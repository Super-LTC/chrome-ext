# Changelog

All notable changes to the Super LTC Chrome extension, newest first.
Version = `manifest.json` `version`. Each entry records what shipped in that
bump so we can tell the current build apart from the last one at a glance.

> **Store note:** **v1.0.63** was zipped for Chrome Web Store submission on
> 2026-07-13 (`super-ltc-store.zip`). Before that, the last store upload was
> v1.0.57 (`6cd25b6`) — v1.0.58–1.0.62 were dev/internal only. Update this note
> when you `zip:store` and upload.

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
