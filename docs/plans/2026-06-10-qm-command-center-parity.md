# QM Board → Command Center parity rebuild

**Date:** 2026-06-10
**Source of truth:** two handoff docs (contract-delta + UX parity spec) and the web
components on branch `Superjonathan123/qm-simpleltc-compare` in `../superltc`
(`web/components/quality-measures/*`, PR #626).
**Delivery:** one PR per §8 build-order step (user decision). Each step independently
shippable.

## Goal
Re-enable the QM FAB and rebuild the QM Board to match the web Command Center 1:1:
buckets by **actionability** (at-risk / clearable / will-hit), not cliff urgency; adds a
resident drill-in modal with a 3-beat timeline, measure what-if + Five-Star points, a
Clinical Signals surface, and a standalone Functional Decline FAB/screen. GG decline
leaves the board entirely.

## Key facts established
- The 4 pure modules to port live on the `qm-simpleltc-compare` branch in `../superltc`:
  `qm-view-model.ts`, `qm-tones.ts`, `qm-clinical-signals.ts`, `qm-five-star.ts`. They are
  framework-free; only dependency is the type-only `@core/types/qm-planner.types` import,
  which is stripped when porting to plain `.js`.
- chrome-ext has **no test framework** — tests are plain node `.mjs` scripts
  (`scripts/test-analytics-no-logout.mjs`). The two web test files
  (`scripts/test-qm-{view-model,five-star}.ts`) port to `.mjs` and run with `node`.
- QM FAB is **commented out** in `content/super-menu/fab.js` (button ~L23-25, handler
  ~L93-103). `QMBoardLauncher` (~L452-516) is intact — re-enable = uncomment.
- The board mounts into `#qm-board-overlay` via `render(<QMBoard …>)`; data via
  `useQmBoard` (two endpoints) / `useGgDetail` / `useSnooze`; refetch on
  `super:qm-snooze-changed`. Background wraps `{success,data}`; `unwrap()` peels it.
- Tone classes in the web source are Tailwind; map to the extension's CSS system
  (rose=at-risk, sky=clearable, slate=will-hit, violet=crossers, amber=signals,
  emerald=clear).

## PRs (= §8 steps)
1. **Port the 4 pure modules + tests** → `content/modules/qm-board/lib/*.js`; port both
   test scripts to `scripts/test-qm-*.mjs`, all pass under node. Re-enable the QM FAB
   (contract-delta). Verify `npm run build`.
2. **Rebucket board to actionability** (Surface A) + contract-delta in `derive.js`
   (canary→tile map: add `uti_dx→uti`, drop `weight_decline_canary`/`gg_decline_canary`;
   `clearCta` verbs for `clinical`/`modification`/`dx_query`; `source:'diagnosis'`
   text-only; drop the dead `gg_decline_canary` route).
3. **Resident drill-in modal + 3-beat timeline** (Surface C) — replaces `TriggerDetail`.
   Beat-3 computed exactly per spec. Crossers via `crosserToDrill`.
4. **Measure detail what-if + Five-Star points** (Surface B). Port `qm-five-star`'s
   `fiveStarMeasure`/`pointsForRate`/`nextTier`.
5. **Clinical Signals tabs + dismiss/undo** (Surface D). Optimistic snooze against the
   existing `preventable-alert-snooze` endpoints; folds the old heads-up in.
6. **Functional Decline FAB + screen** (Surface E). New sibling FAB →
   `gg-decline-dashboard` endpoint, `mode` toggle, reuse `GgDeclineDetail` + GG snooze.
   Allowlist new analytics events.

## Cross-cutting
- Every new `track()` / `data-track` needs an `analytics-schema.js` allowlist entry
  (build's `check:tracking` enforces buttons have `data-track`).
- `facilityName + orgSlug` required on every endpoint incl. the new GG one. `patientId`
  in paths = Super LTC internal id. `facilityDate` drives urgency math (facility-local).
