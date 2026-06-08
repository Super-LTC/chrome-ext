# Assessment Linkage on the Care-Plan Audit — Frontend Design

**Date:** 2026-06-06
**Backend handoff:** `Superjonathan123/careplan-assessment-triggers`
**Scope shipped here:** Scope 1 — annotation layer only

## Background

The audit response (`POST /api/extension/care-plan/audit`) now returns
`audit.assessmentLinkages: AssessmentLinkage[]` — a per-assessment (UDA + MDS)
cross-check. Each row carries a `caa` (care area) drawn from the **same vocabulary**
as `toAdd[].caa` / `onPlan[].caa`.

Key insight from the handoff: **triggering ≠ linkage**. Anything that "fires" already
flows through `buildAutoPopProposal` and lands in `toAdd` (no focus yet) or `onPlan`
(focus exists) — including trauma. So a `gap` row never represents an orphan that needs
its own action surface. **Treat `assessmentLinkages` as an attribute layer, not a new
action path.** No separate "assessment-driven" bucket, no dedup logic.

## Decision

Ship the linkage line as a read-only annotation on existing surfaces, joined on `caa`:

1. **ON PLAN detail pane** — for a focus's `caa`, render covered linkages:
   `Linked assessments: Braden 16 · PHQ-9 14`. This is the "they have a Braden — is it
   on the plan?" review check.
2. **To-add detail pane** — mirror the same annotation as the *rationale* for the
   proposed focus: e.g. the skin to-add shows `Braden 17`. Same attribute layer, both
   buckets. This is where the gap's value lives (sharpening the why), without a parallel
   add surface.
3. **Dashboard header** — a light count line: `N linked · M gaps` from
   `assessmentLinkages` status tallies.

Everything guards on `audit.assessmentLinkages` being present (older backends omit it).

## Join logic

Build `Map<caa, AssessmentLinkage[]>` once from `audit.assessmentLinkages`.

- ON PLAN pane: linkages where `status === 'covered'` and `caa === item.caa`, display `sourceLabel`.
- To-add pane: linkages where `caa === item.caa` and `sourceLabel != null`, display `sourceLabel`.

`matchedFocus` is focus *text* (display only). We join on `caa`, not text, per the shared
vocabulary — robust against text drift.

## Deferred

- Scope 2 (gaps as independent actions) — unnecessary; gaps already map to `toAdd` tiles.
- Scope 3 (by-care-area regroup) — the big lift; deferred until we watch a nurse use the
  inline annotation and learn whether it already delivers the cross-check.

## Files touched

- `content/modules/care-plan-stamp/CarePlanStampModal.jsx` — build the map; annotate both panes.
- `content/modules/care-plan-stamp/components/AuditDashboard.jsx` — header count.
- `content/css/care-plan-stamp.css` — `.cpas-linked-assessments` styling.
- `demo/demo-care-plan-audit-fixtures.js` — `caa` keys + `assessmentLinkages` for the demo.
