# Care Plan Audit — CAA-grouped rendering (Round 7)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat Add/Verify/Remove left-rail in Comprehensive Review mode with a single full-width scroll of expandable CAA buckets (one row per Care Area Assessment), driven by the new `audit.byCAA` field the backend already returns. Existing item-renderer components (`AddBucketPane`, `RemoveBucketPane`, `VerifyBucketPane`, `FocusCard`) are reused inline within each expanded row.

**Architecture:** Pure UI redesign on the extension side. Backend response is unchanged from the extension's perspective except that `audit.byCAA[]` is now read instead of (well, in addition to) the flat lists. Each `byCAA[i]` entry contains the same item objects as the flat lists — the same `toAdd[]` / `toCheck[]` / `toRemove[]` shapes — so item-level wiring (stamp / resolve / verify / skip / FocusCard) stays unchanged. Only the **container** layer changes: from a two-column `AuditFocusList` rail + per-bucket-pane to a one-column `CAARowList` of inline-expanding accordions.

**Tech Stack:** Preact + hooks (no new deps). All work inside `content/modules/care-plan-stamp/`.

---

## Decisions locked from brainstorming + handoff

1. **Single full-width scroll** (not two-column). Drop the left rail. Each CAA row is a wide accordion in the modal body.
2. **Default expansion:** all rows collapsed at open. `covered` rows have no expand caret (informational only). `gap` and `partial` rows expand on click; nurse-controlled, no auto-collapse on opening a sibling.
3. **Color discipline:** red ONLY for `gap`. Amber for `partial`. Muted green/gray for `covered`.
4. **Standard-universals collapse** (`§3` of handoff): if `bucket.toAdd.every(it => it.ruleId.startsWith('universal.')) && bucket.toAdd.length >= 3 && bucket.existingFocusIds.length === 0`, render a single "Add all standard universals" mass-stamp button at the top of the expanded section, alongside a "Review individually" toggle that reveals the per-item cards.
5. **Per-CAA state** keyed by `caa` machine name (e.g. `'falls'`). `expanded` boolean per row. Auto-keep-open after user expands.
6. **Item-level state** — `auditFocusStates`, `resolveStatus`, `stampedAddIds`, `skippedAddIds`, `verifyLocal` — keep all of these unchanged. They're keyed by `ruleId` / `focusId` / array index in the original flat lists. The CAA view reads `bucket.toAdd[i]` directly; since `byCAA[i].toAdd` items are the same object instances as `audit.toAdd[]`, key lookups by `ruleId` and `focusId` work without re-indexing.
7. **Bulk CTAs per CAA bucket** — small contextual buttons at the bottom of each expanded section: "Stamp all N adds" / "Resolve all N removes" / "Mark all N verified". Mirrors current per-bucket bulk handlers — reuse the existing `_bulkAddAll` / `_bulkResolveAll` / `_bulkVerifyAll` handlers, scoped to bucket items.
8. **No "show raw" debug toggle in v1.** Drew's Stage 3 mentions it; defer until after Stage 1+2 ship. Comment marker in the modal so we know where to add it.
9. **Telemetry** — track `care_plan_audit_caa_expanded` (with caa name + status) and `care_plan_audit_universals_mass_stamped` (with caa name + N). Existing item-level events (`_item_stamped`, etc.) are unchanged.
10. **Drop the bulk-CTA footer + auto-advance** introduced in Round 6 Task 10. They were tied to the bucket-at-a-time IA; in the CAA view they don't apply. Per-CAA bulk buttons (decision 7) replace them.
11. **Drop `auditSelected` state and the right-pane wiring** entirely. The new model is "one item selected at a time PER expanded CAA" — but actually, simpler: all items in an expanded CAA render simultaneously (stacked vertically). No selection state at all.

---

## Backend contract recap

```ts
audit: {
  toAdd, toCheck, toRemove,                       // flat lists — unchanged
  byCAA: Array<{
    caa: string,                                  // 'falls', 'cardiac', etc.
    displayName: string,                          // 'Falls / Safety'
    status: 'covered' | 'partial' | 'gap',
    existingFocusIds: string[],                   // internal IDs (telemetry only)
    existingFocusTexts: string[],                 // truncated focus text snippets
    toAdd: AuditToAddItem[],                      // SAME instances as flat audit.toAdd
    toCheck: AuditToCheckItem[],
    toRemove: AuditToRemoveItem[],
  }>,
  hasCoverageCheckData, computedAt,
  replacementsSaved, libraryGaps,
}
```

Array is **already sorted** in `CAA_DISPLAY_ORDER` — render in array order, don't re-sort.

---

## File layout

**New files:**
- `content/modules/care-plan-stamp/components/CAARow.jsx` — one expandable CAA accordion. Owns: header (icon + name + status pill + count summary + caret) and expanded body (existing focuses list + universals-cluster collapse + stacked item cards + bucket-bulk buttons).
- `content/modules/care-plan-stamp/components/CAAList.jsx` — wraps all CAA rows. Owns the per-CAA expanded state map and renders `<CAARow>` for each `byCAA[i]`.

**Modified:**
- `content/modules/care-plan-stamp/CarePlanStampModal.jsx` — Replace the entire comprehensive-mode columns block (lines ~718-848) with a single `<CAAList>` mount. Drop `auditSelected` state. Keep all item-level handlers (`_stampAuditAddItem`, `_resolveAuditItem`, `_verifyAuditItem`, `_skipAuditAddItem`, `_patchAuditFocusState`) — they receive `(item, idx, ...)` already. `_bulkAddAll` / `_bulkResolveAll` / `_bulkVerifyAll` need a small refactor to accept a scope (a list of items rather than the global audit).
- `content/css/care-plan-stamp.css` — Append CAA-row styles. The old `super-audit-rail*` / `super-audit-section*` / `super-audit-bulk-*` classes can be left (dead code) or removed in a cleanup commit at the end. Leave them for now.

**Deletable after this round (cleanup commit at end):**
- `content/modules/care-plan-stamp/components/AuditFocusList.jsx` — no longer mounted. Delete in Task 6 cleanup.

**Untouched (still in active use):**
- `AddBucketPane.jsx`, `RemoveBucketPane.jsx`, `VerifyBucketPane.jsx` — render the item cards inside the expanded CAA body. **Verify each is still imported and used by `CAAList`/`CAARow` after the wiring lands.**
- `FocusCard.jsx`
- `ScopeToggle.jsx`
- `audit-api.js`, `audit-banner.js`, `audit-review-button.js`, `inject-button.js`, `pcc-resolve.js`

---

## Phasing

| Phase | Tasks | Output |
|---|---|---|
| 1 | 1-3 | CAARow + CAAList components + replace the modal's columns block |
| 2 | 4-5 | Standard-universals collapse + telemetry |
| 3 | 6 | Cleanup: remove AuditFocusList, remove dead `auditSelected` state, regression smoke |

Total effort: ~3-4 hours focused. ~1 day interleaved.

---

# Phase 1 — CAA row rendering

## Task 1: Create `CAARow.jsx`

**Files:**
- Create: `content/modules/care-plan-stamp/components/CAARow.jsx`

**Component responsibilities:**
1. Render the header (always visible): status icon, display name, status pill, count summary, expand/collapse caret.
2. When expanded, render the body:
   - Existing focuses on this CAA (dim subtitle list)
   - Standard-universals mass-stamp UI (only when detection rule matches and `expandedMode === 'collapsed'`)
   - Stacked AddBucketPane / VerifyBucketPane / RemoveBucketPane cards (when `expandedMode === 'individual'` or universals rule doesn't apply)
   - Per-CAA bulk buttons at the bottom (stamp-all / resolve-all / verify-all) for whichever buckets have actionable items
3. `covered` rows are non-expandable — render no caret, no click handler.

**Prop interface:**
```jsx
<CAARow
  bucket={byCAAEntry}                  // { caa, displayName, status, existingFocusIds, existingFocusTexts, toAdd, toCheck, toRemove }
  expanded={boolean}
  onToggle={() => void}                // no-op for covered
  expandedMode={'collapsed' | 'individual'}  // universals-cluster ui state
  onSetExpandedMode={(mode) => void}
  // Item action callbacks (proxied to modal handlers):
  getFocusState={(item) => focusState}            // for AddBucketPane
  onPatchFocusState={(item, patch) => void}
  onStampAdd={(item) => Promise<void>}
  onSkipAdd={(item) => Promise<void>}
  resolveStatus={{ [focusId]: 'pending'|'done'|'error' }}
  resolveError={{ [focusId]: string }}
  verifyLocal={{ [verifyKey]: 'verified'|'kept' }}
  onMarkVerified={(item) => void}
  onKeep={(item) => void}
  onResolveItem={(item, bucket) => Promise<void>}
  // Bulk callbacks for this CAA's scope only:
  onBulkAdd={(items) => Promise<void>}
  onBulkResolve={(items) => Promise<void>}
  onBulkVerify={(items) => void}
  onUniversalsMassStamp={(items) => Promise<void>}
  stamping={boolean}
  stampedAddIds={Set<string>}
  skippedAddIds={Set<string>}
  dropdowns={object}
/>
```

**Step 1.** Create the file with this content:

```jsx
import { h } from 'preact';
import { AddBucketPane } from './AddBucketPane.jsx';
import { VerifyBucketPane } from './VerifyBucketPane.jsx';
import { RemoveBucketPane } from './RemoveBucketPane.jsx';

/**
 * One CAA accordion. Header shows status + counts; body (when expanded)
 * renders existing focuses + per-bucket item cards + bulk actions.
 *
 * Rows with status='covered' are non-expandable — informational only.
 */
export const CAARow = ({
  bucket,
  expanded,
  onToggle,
  expandedMode = 'collapsed',
  onSetExpandedMode,
  getFocusState,
  onPatchFocusState,
  onStampAdd,
  onSkipAdd,
  resolveStatus,
  resolveError,
  verifyLocal,
  onMarkVerified,
  onKeep,
  onResolveItem,
  onBulkAdd,
  onBulkResolve,
  onBulkVerify,
  onUniversalsMassStamp,
  stamping,
  stampedAddIds,
  skippedAddIds,
  dropdowns,
}) => {
  const status = bucket.status;
  const isCovered = status === 'covered';
  const tone = status === 'gap' ? 'gap' : status === 'partial' ? 'partial' : 'covered';

  // Filter out items the nurse already handled in this session.
  const liveAdds = (bucket.toAdd || []).filter((it) => !stampedAddIds?.has(it.ruleId) && !skippedAddIds?.has(it.ruleId));
  const liveRemoves = (bucket.toRemove || []).filter((it) => resolveStatus?.[it.focusId] !== 'done');
  const liveChecks = bucket.toCheck || [];

  const isUniversalsCluster =
    liveAdds.length >= 3 &&
    liveAdds.every((it) => it.ruleId.startsWith('universal.')) &&
    (bucket.existingFocusIds?.length || 0) === 0;

  return (
    <div className={`super-caa-row super-caa-row--${tone} ${expanded ? 'is-expanded' : ''}`}>
      {/* NO_TRACK: row toggle tracked via parent (caa_expanded) on first open */}
      <button
        type="button"
        className="super-caa-row__head"
        onClick={isCovered ? undefined : onToggle}
        disabled={isCovered}
        aria-expanded={expanded}
      >
        <span className={`super-caa-row__icon super-caa-row__icon--${tone}`}>
          {tone === 'gap' ? '✗' : tone === 'partial' ? '⚠' : '✓'}
        </span>
        <span className="super-caa-row__name">{bucket.displayName}</span>
        <span className={`super-caa-row__pill super-caa-row__pill--${tone}`}>{status}</span>
        <span className="super-caa-row__counts">{_formatCounts(bucket, liveAdds, liveChecks, liveRemoves)}</span>
        {!isCovered && (
          <span className="super-caa-row__caret">{expanded ? '▾' : '▸'}</span>
        )}
      </button>

      {expanded && !isCovered && (
        <div className="super-caa-row__body">
          {(bucket.existingFocusTexts?.length || 0) > 0 && (
            <div className="super-caa-row__existing">
              <div className="super-caa-row__existing-label">On plan</div>
              <ul className="super-caa-row__existing-list">
                {bucket.existingFocusTexts.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {isUniversalsCluster && expandedMode === 'collapsed' ? (
            <div className="super-caa-row__universals">
              <div className="super-caa-row__universals-text">
                {liveAdds.length} standard universals proposed
              </div>
              <div className="super-caa-row__universals-actions">
                <button
                  type="button"
                  className="super-btn super-btn--primary"
                  onClick={() => onUniversalsMassStamp(liveAdds)}
                  disabled={stamping}
                  data-track="care_plan_audit_universals_mass_stamped"
                >
                  Add all {liveAdds.length}
                </button>
                {/* NO_TRACK: pure-UI toggle to per-item view */}
                <button
                  type="button"
                  className="super-btn super-btn--secondary"
                  onClick={() => onSetExpandedMode('individual')}
                  disabled={stamping}
                >
                  Review individually
                </button>
              </div>
            </div>
          ) : (
            <>
              {liveAdds.map((item) => {
                const realIdx = bucket.toAdd.indexOf(item);
                return (
                  <div className="super-caa-row__item" key={`add-${item.ruleId}`}>
                    <AddBucketPane
                      item={item}
                      focusState={getFocusState(item)}
                      onPatch={(patch) => onPatchFocusState(item, patch)}
                      onStamp={() => onStampAdd(item)}
                      onSkip={() => onSkipAdd(item)}
                      stamping={stamping}
                      dropdowns={dropdowns}
                    />
                  </div>
                );
              })}

              {liveChecks.map((item, i) => (
                <div className="super-caa-row__item" key={`check-${item.focusId || item.kind || i}`}>
                  <VerifyBucketPane
                    item={item}
                    localState={verifyLocal?.[`${bucket.caa}:${i}`]}
                    onMarkVerified={() => onMarkVerified(item, `${bucket.caa}:${i}`)}
                    onKeep={() => onKeep(item, `${bucket.caa}:${i}`)}
                    onResolve={() => onResolveItem(item, 'verify')}
                    resolveStatus={resolveStatus?.[item.focusId]}
                  />
                </div>
              ))}

              {liveRemoves.map((item) => (
                <div className="super-caa-row__item" key={`remove-${item.focusId}`}>
                  <RemoveBucketPane
                    item={item}
                    onResolve={() => onResolveItem(item, 'remove')}
                    status={resolveStatus?.[item.focusId]}
                    errorMessage={resolveError?.[item.focusId]}
                  />
                </div>
              ))}
            </>
          )}

          {/* Per-CAA bulk buttons — only when expandedMode is individual or universals rule doesn't apply */}
          {(!isUniversalsCluster || expandedMode === 'individual') && (liveAdds.length + liveChecks.length + liveRemoves.length) > 1 && (
            <div className="super-caa-row__bulk">
              {liveAdds.length > 1 && (
                <button
                  type="button"
                  className="super-btn super-btn--primary"
                  onClick={() => onBulkAdd(liveAdds)}
                  disabled={stamping}
                  data-track="care_plan_audit_caa_bulk_stamp"
                >
                  Stamp all {liveAdds.length} adds
                </button>
              )}
              {liveRemoves.length > 1 && (
                <button
                  type="button"
                  className="super-btn super-btn--danger"
                  onClick={() => onBulkResolve(liveRemoves)}
                  disabled={stamping}
                  data-track="care_plan_audit_caa_bulk_resolve"
                >
                  Resolve all {liveRemoves.length}
                </button>
              )}
              {liveChecks.length > 1 && (
                <button
                  type="button"
                  className="super-btn super-btn--secondary"
                  onClick={() => onBulkVerify(liveChecks, bucket.caa)}
                  data-track="care_plan_audit_caa_bulk_verify"
                >
                  Mark all {liveChecks.length} verified
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function _formatCounts(bucket, liveAdds, liveChecks, liveRemoves) {
  const existing = (bucket.existingFocusIds?.length || 0);
  const parts = [];
  if (existing > 0) parts.push(`${existing} ${existing === 1 ? 'focus' : 'focuses'}`);
  if (liveAdds.length > 0) parts.push(`${liveAdds.length} to add`);
  if (liveChecks.length > 0) parts.push(`${liveChecks.length} to verify`);
  if (liveRemoves.length > 0) parts.push(`${liveRemoves.length} to remove`);
  return parts.join(' · ');
}
```

**Step 2.** Append CSS to `content/css/care-plan-stamp.css`:

```css

/* ============================================================
   Comprehensive Review — CAA rows (Round 7)
   ============================================================ */

.super-caa-list {
  display: flex; flex-direction: column;
  padding: 12px 20px 80px;
  overflow-y: auto;
  height: 100%;
  background: #f8fafc;
}

.super-caa-row {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 8px;
  overflow: hidden;
  transition: box-shadow 120ms, border-color 120ms;
}
.super-caa-row.is-expanded { box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06); border-color: #cbd5e1; }
.super-caa-row--gap { border-left: 4px solid #e11d48; }
.super-caa-row--partial { border-left: 4px solid #d97706; }
.super-caa-row--covered { border-left: 4px solid #94a3b8; opacity: 0.85; }

.super-caa-row__head {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 12px 16px;
  background: transparent; border: 0; text-align: left;
  font: inherit; cursor: pointer; color: #0f172a;
}
.super-caa-row__head:hover:not(:disabled) { background: #f8fafc; }
.super-caa-row__head:disabled { cursor: default; }

.super-caa-row__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  border-radius: 50%; font-size: 12px; font-weight: 700;
}
.super-caa-row__icon--gap { background: #fee2e2; color: #b91c1c; }
.super-caa-row__icon--partial { background: #fef3c7; color: #92400e; }
.super-caa-row__icon--covered { background: #d1fae5; color: #047857; }

.super-caa-row__name {
  flex: 1; font-size: 14px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.super-caa-row__pill {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.5px;
  padding: 3px 8px; border-radius: 999px;
}
.super-caa-row__pill--gap { background: #fee2e2; color: #b91c1c; }
.super-caa-row__pill--partial { background: #fef3c7; color: #92400e; }
.super-caa-row__pill--covered { background: #d1fae5; color: #047857; }

.super-caa-row__counts {
  font-size: 12px; color: #64748b;
  margin-left: auto; padding-left: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 320px;
}
.super-caa-row__caret { color: #64748b; font-size: 12px; padding-left: 6px; }

.super-caa-row__body {
  padding: 0 16px 16px;
  border-top: 1px solid #f1f5f9;
}

.super-caa-row__existing {
  margin: 12px 0;
  padding: 10px 14px;
  background: #f8fafc; border-radius: 8px;
  font-size: 12px; color: #475569;
}
.super-caa-row__existing-label {
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  font-size: 10px; color: #64748b; margin-bottom: 6px;
}
.super-caa-row__existing-list { margin: 0; padding-left: 18px; line-height: 1.5; }

.super-caa-row__universals {
  margin: 12px 0;
  padding: 14px 16px;
  background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px;
  display: flex; align-items: center; gap: 14px;
}
.super-caa-row__universals-text { flex: 1; font-size: 13px; font-weight: 500; color: #3730a3; }
.super-caa-row__universals-actions { display: flex; gap: 8px; }

.super-caa-row__item {
  margin-top: 12px;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
/* AddBucketPane / RemoveBucketPane / VerifyBucketPane already render .super-audit-pane
   which has its own padding — override here to avoid double padding inside .super-caa-row__item */
.super-caa-row__item .super-audit-pane { padding: 0; }

.super-caa-row__bulk {
  display: flex; gap: 8px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
```

**Step 3.** Commit:
```bash
git add content/modules/care-plan-stamp/components/CAARow.jsx content/css/care-plan-stamp.css
git commit -m "feat(care-plan-audit): CAARow accordion component"
```

---

## Task 2: Create `CAAList.jsx`

**Files:**
- Create: `content/modules/care-plan-stamp/components/CAAList.jsx`

Owns the per-row expanded state map (keyed by `caa`) and the per-row universals-cluster mode (`'collapsed' | 'individual'`). Wires CAARow's onToggle to manage state. Forwards all item-level callbacks through.

```jsx
import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { CAARow } from './CAARow.jsx';

/**
 * Renders all CAA rows in `audit.byCAA` order (already pre-sorted by backend).
 *
 * Owns:
 *  - per-row expanded boolean (keyed by caa)
 *  - per-row universals expanded mode ('collapsed' | 'individual')
 *  - telemetry on first expand
 *
 * All item-action callbacks are forwarded from parent.
 */
export const CAAList = ({
  byCAA,
  patientId,
  // Item handlers proxied from modal:
  getFocusState,
  onPatchFocusState,
  onStampAdd,
  onSkipAdd,
  onMarkVerified,
  onKeep,
  onResolveItem,
  onBulkAdd,
  onBulkResolve,
  onBulkVerify,
  onUniversalsMassStamp,
  resolveStatus,
  resolveError,
  verifyLocal,
  stamping,
  stampedAddIds,
  skippedAddIds,
  dropdowns,
}) => {
  const [expanded, setExpanded] = useState({});            // { [caa]: true }
  const [universalsMode, setUniversalsMode] = useState({}); // { [caa]: 'collapsed' | 'individual' }
  const [seenCaaExpanded, setSeenCaaExpanded] = useState(new Set());

  const handleToggle = useCallback((bucket) => {
    setExpanded((prev) => {
      const next = { ...prev, [bucket.caa]: !prev[bucket.caa] };
      // Telemetry on first expand only.
      if (next[bucket.caa] && !seenCaaExpanded.has(bucket.caa)) {
        window.SuperAnalytics?.track?.('care_plan_audit_caa_expanded', {
          patient_id: patientId,
          caa: bucket.caa,
          status: bucket.status,
          n_add: bucket.toAdd?.length || 0,
          n_check: bucket.toCheck?.length || 0,
          n_remove: bucket.toRemove?.length || 0,
        });
        setSeenCaaExpanded((s) => new Set([...s, bucket.caa]));
      }
      return next;
    });
  }, [patientId, seenCaaExpanded]);

  const handleSetMode = useCallback((caa, mode) => {
    setUniversalsMode((prev) => ({ ...prev, [caa]: mode }));
  }, []);

  if (!byCAA || byCAA.length === 0) {
    return (
      <div className="super-caa-list">
        <div className="super-audit-empty">
          <div className="super-audit-empty__icon">✓</div>
          <div className="super-audit-empty__title">Care plan looks complete</div>
          <div className="super-audit-empty__subtitle">No CAA buckets need attention.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="super-caa-list">
      {byCAA.map((bucket) => (
        <CAARow
          key={bucket.caa}
          bucket={bucket}
          expanded={!!expanded[bucket.caa]}
          onToggle={() => handleToggle(bucket)}
          expandedMode={universalsMode[bucket.caa] || 'collapsed'}
          onSetExpandedMode={(mode) => handleSetMode(bucket.caa, mode)}
          getFocusState={getFocusState}
          onPatchFocusState={onPatchFocusState}
          onStampAdd={onStampAdd}
          onSkipAdd={onSkipAdd}
          resolveStatus={resolveStatus}
          resolveError={resolveError}
          verifyLocal={verifyLocal}
          onMarkVerified={onMarkVerified}
          onKeep={onKeep}
          onResolveItem={onResolveItem}
          onBulkAdd={onBulkAdd}
          onBulkResolve={onBulkResolve}
          onBulkVerify={onBulkVerify}
          onUniversalsMassStamp={onUniversalsMassStamp}
          stamping={stamping}
          stampedAddIds={stampedAddIds}
          skippedAddIds={skippedAddIds}
          dropdowns={dropdowns}
        />
      ))}
    </div>
  );
};
```

**Commit:**
```bash
git add content/modules/care-plan-stamp/components/CAAList.jsx
git commit -m "feat(care-plan-audit): CAAList wrapper w/ per-row expansion state"
```

---

## Task 3: Replace the modal's comprehensive-mode body

**Files:**
- Modify: `content/modules/care-plan-stamp/CarePlanStampModal.jsx`

**Step 1.** Refactor existing handlers to accept items directly (not array indices), so they can be called from the CAA view where indexing is per-bucket.

Currently `_stampAuditAddItem(idx)` looks up `audit.toAdd[idx]`. Change to `_stampAuditAddItem(item)` looking up `item.ruleId` directly when needed. Same for `_skipAuditAddItem`. `_resolveAuditItem` already takes `(item, fromBucket)`. `_verifyAuditItem` takes `(idx, decision)` — change to `(item, verifyKey, decision)` where verifyKey is the CAA-scoped key like `'falls:0'`.

Update `_patchAuditFocusState`. Currently keyed by `(bucket, idx, patch)` → key `${bucket}:${idx}`. Change to key by `ruleId`: `auditFocusStates[item.ruleId]`. Simpler and survives reordering.

**Step 2.** Refactor bulk handlers to accept a scope:

```javascript
const _bulkAddScoped = useCallback(async (items) => {
  if (!items || items.length === 0 || !careplanId || !miniToken) return;
  const candidates = items
    .filter((it) => !stampedAddIds.has(it.ruleId) && !skippedAddIds.has(it.ruleId))
    .filter((it) => {
      if (!it.focus) return false;
      const state = auditFocusStates[it.ruleId] || _emptyFocusState();
      const composed = _composeFocus(it.focus, state);
      return !composed.description.includes('___');
    });
  if (candidates.length === 0) return;

  setStage('stamping');
  setProgress({ phase: 'starting', focusIndex: 0, focusTotal: candidates.length });
  try {
    const focuses = candidates.map((it) => {
      const state = auditFocusStates[it.ruleId] || _emptyFocusState();
      return _composeFocus(it.focus, state);
    });
    const result = await window.CarePlanStampClient.orchestrateStamp({
      proposal: { patientId, focuses },
      careplanId,
      miniToken,
      onProgress: (p) => setProgress(p),
    });
    setStampedAddIds((prev) => {
      const next = new Set(prev);
      candidates.forEach((it) => next.add(it.ruleId));
      return next;
    });
    setStage('ready');
    window.SuperAnalytics?.track?.('care_plan_audit_bulk_stamped', {
      patient_id: patientId,
      n_stamped: result?.focusesStamped ?? candidates.length,
      scope: 'caa_bulk',
    });
  } catch (e) {
    setErrorMsg(e.message || 'Bulk stamp failed');
    setStage('ready');
  }
}, [careplanId, miniToken, patientId, auditFocusStates, stampedAddIds, skippedAddIds]);

const _bulkResolveScoped = useCallback(async (items) => {
  const candidates = (items || []).filter(
    (it) => resolveStatus[it.focusId] !== 'done' && resolveStatus[it.focusId] !== 'pending' && it.pccFocusId
  );
  for (const item of candidates) {
    // eslint-disable-next-line no-await-in-loop
    await _resolveAuditItem(item, 'remove');
  }
}, [resolveStatus, _resolveAuditItem]);

const _bulkVerifyScoped = useCallback((items, caa) => {
  setVerifyLocal((prev) => {
    const next = { ...prev };
    (items || []).forEach((_, i) => {
      const key = `${caa}:${i}`;
      if (!next[key]) next[key] = 'verified';
    });
    return next;
  });
  window.SuperAnalytics?.track?.('care_plan_audit_bulk_verified', {
    patient_id: patientId,
    caa,
    n_verified: items?.length || 0,
  });
}, [patientId]);

const _universalsMassStamp = useCallback(async (items) => {
  await _bulkAddScoped(items);
  window.SuperAnalytics?.track?.('care_plan_audit_universals_mass_stamped', {
    patient_id: patientId,
    n_stamped: items?.length || 0,
  });
}, [_bulkAddScoped, patientId]);
```

The previous `_bulkAddAll` / `_bulkResolveAll` / `_bulkVerifyAll` can be removed — they're no longer reachable once the rail is gone.

**Step 3.** Adapt `_verifyAuditItem` for CAA-scoped key:

```javascript
const _verifyAuditItem = useCallback((item, verifyKey, decision) => {
  setVerifyLocal((prev) => ({ ...prev, [verifyKey]: decision }));
  if (!item) return;
  window.SuperAnalytics?.track?.('care_plan_audit_item_verified', {
    patient_id: patientId,
    focus_id: item.focusId,
    kind: item.kind,
    decision,
  });
}, [patientId]);
```

**Step 4.** Remove `auditSelected` state, the `displayAudit` `useMemo`, the `_advanceAuditSelection` callback. They're no longer needed. Search-and-delete is fine.

**Step 5.** Replace the entire `mode === 'comprehensive' && ...` block (currently the giant IIFE-with-AuditFocusList at lines ~718-848) with:

```jsx
{mode === 'comprehensive' && (stage === 'ready' || stage === 'stamping') && audit && (
  <CAAList
    byCAA={audit.byCAA || []}
    patientId={patientId}
    getFocusState={(item) => auditFocusStates[item.ruleId] || _emptyFocusState()}
    onPatchFocusState={(item, patch) => _patchAuditFocusStateByRuleId(item.ruleId, patch)}
    onStampAdd={_stampAuditAddItem}
    onSkipAdd={_skipAuditAddItem}
    resolveStatus={resolveStatus}
    resolveError={resolveError}
    verifyLocal={verifyLocal}
    onMarkVerified={(item, verifyKey) => _verifyAuditItem(item, verifyKey, 'verified')}
    onKeep={(item, verifyKey) => _verifyAuditItem(item, verifyKey, 'kept')}
    onResolveItem={(item, fromBucket) => _resolveAuditItem(item, fromBucket)}
    onBulkAdd={_bulkAddScoped}
    onBulkResolve={_bulkResolveScoped}
    onBulkVerify={_bulkVerifyScoped}
    onUniversalsMassStamp={_universalsMassStamp}
    stamping={stage === 'stamping'}
    stampedAddIds={stampedAddIds}
    skippedAddIds={skippedAddIds}
    dropdowns={dropdowns}
  />
)}
```

**Step 6.** Add the `_patchAuditFocusStateByRuleId` helper (replaces `_patchAuditFocusState`):

```javascript
const _patchAuditFocusStateByRuleId = useCallback((ruleId, patch) => {
  setAuditFocusStates((prev) => ({
    ...prev,
    [ruleId]: { ..._emptyFocusState(), ...(prev[ruleId] || {}), ...patch },
  }));
}, []);
```

**Step 7.** Update `_stampAuditAddItem` to take `item` instead of `idx`:

```javascript
const _stampAuditAddItem = useCallback(async (item) => {
  if (!audit || !careplanId || !miniToken) return;
  if (!item?.focus) return;
  const state = auditFocusStates[item.ruleId] || _emptyFocusState();
  const composed = _composeFocus(item.focus, state);
  if (composed.description.includes('___')) {
    setErrorMsg('Please fill in any blank slots before stamping.');
    return;
  }
  setStage('stamping');
  setProgress({ phase: 'starting', focusIndex: 0, focusTotal: 1 });
  try {
    const result = await window.CarePlanStampClient.orchestrateStamp({
      proposal: { patientId, focuses: [composed] },
      careplanId,
      miniToken,
      onProgress: (p) => setProgress(p),
    });
    setStampedAddIds((prev) => new Set([...prev, item.ruleId]));
    setStage('ready');
    window.SuperAnalytics?.track?.('care_plan_audit_item_stamped', {
      patient_id: patientId,
      rule_id: item.ruleId,
      n_goals: result?.goalsStamped ?? 0,
      n_interventions: result?.interventionsStamped ?? 0,
    });
  } catch (e) {
    setErrorMsg(e.message || 'Stamp failed');
    setStage('ready');
  }
}, [audit, careplanId, miniToken, patientId, auditFocusStates]);
```

Similarly `_skipAuditAddItem(item)` takes item directly and uses `item.ruleId`.

**Step 8.** Imports — replace `AuditFocusList` import with `CAAList`:

```javascript
import { CAAList } from './components/CAAList.jsx';
```

Drop the imports for `AuditFocusList`, `AddBucketPane`, `RemoveBucketPane`, `VerifyBucketPane` (they're now imported inside CAARow.jsx).

**Step 9.** Commit:
```bash
git add content/modules/care-plan-stamp/CarePlanStampModal.jsx
git commit -m "feat(care-plan-audit): replace flat-bucket rail with CAA accordion list"
```

**Step 10.** Manual verify:
- Build: `npm run build` (this is the deferred typecheck point — Drew confirmed last round)
- Reload extension, open Comprehensive Review on a test patient (Grieselding, Louis — `AC7245239`)
- Confirm: ~23 CAA rows render in expected order, status icons + counts match the eval-script output, expanded rows show existing focuses + per-item cards correctly

---

# Phase 2 — universals collapse + telemetry

## Task 4: Verify universals-cluster collapse renders correctly

The detection rule lives in `CAARow.jsx`. Verify on Grieselding, Louis — the Psychosocial bucket should match (`bucket.toAdd.every(it => it.ruleId.startsWith('universal.')) && bucket.toAdd.length >= 3 && bucket.existingFocusIds.length === 0`).

Manual check after build:
1. Expand Psychosocial row → should show "4 standard universals proposed" with [Add all 4] + [Review individually]
2. Click [Add all 4] → all four universal focuses stamp; row collapses to "✓ covered" after re-fetch (NOTE: re-fetch is NOT implemented — items just drop from `liveAdds` filter)
3. Click [Review individually] → mode flips to 'individual', shows the per-item cards

No code changes expected here unless step 1 or 3 misbehaves.

**Commit (no-op or fix-only):** if everything works, no commit. If a fix lands:
```bash
git add content/modules/care-plan-stamp/components/CAARow.jsx
git commit -m "fix(care-plan-audit): <specific fix>"
```

---

## Task 5: Confirm telemetry events fire

Open DevTools console, expand 3 CAA buckets, mass-stamp universals on Psychosocial. Confirm these fire (look for `SuperAnalytics.track` in console or your PostHog dashboard):

- `care_plan_audit_caa_expanded` (one per first-expand per bucket; includes `caa`, `status`, `n_add`, `n_check`, `n_remove`)
- `care_plan_audit_universals_mass_stamped` (once per mass-stamp click)
- `care_plan_audit_item_stamped` (per individual stamp inside an expanded CAA)
- `care_plan_audit_bulk_stamped` (per-CAA bulk stamp)
- `care_plan_audit_bulk_verified` (per-CAA bulk verify, with `caa`)

Existing events (`care_plan_audit_modal_opened`, `_scope_toggled`, `_opened_from_*`) should still fire from prior wiring — no changes there.

If any event is missing, add it in the obvious location and commit:
```bash
git add content/modules/care-plan-stamp/
git commit -m "chore(care-plan-audit): fill in missing telemetry"
```

---

# Phase 3 — cleanup

## Task 6: Remove dead code

**Files:**
- Delete: `content/modules/care-plan-stamp/components/AuditFocusList.jsx`
- Modify: `content/css/care-plan-stamp.css` (remove `.super-audit-rail*`, `.super-audit-section*`, `.super-audit-bulk-*` classes — they're no longer referenced)

**Step 1.** Confirm no other files reference `AuditFocusList`:
```bash
grep -rn "AuditFocusList" content/ docs/ 2>/dev/null
```
Should return zero matches (or only the docs/plans references — those are fine).

**Step 2.** Delete:
```bash
rm content/modules/care-plan-stamp/components/AuditFocusList.jsx
```

**Step 3.** Open CSS file. Remove the entire `/* Comprehensive Review — audit left rail */` block and the `/* Bulk CTA footer */` block. The CAA rows + audit-pane + audit-reason + super-btn-* + super-audit-banner + super-audit-empty + super-audit-removecard + super-audit-verifycard styles all stay.

**Step 4.** Final build:
```bash
npm run build
```
Expect: ✓ built, no errors.

**Step 5.** Commit:
```bash
git add content/modules/care-plan-stamp/components/AuditFocusList.jsx content/css/care-plan-stamp.css
git commit -m "chore(care-plan-audit): remove obsolete flat-bucket left rail"
```

---

## Out-of-scope (do not implement in this round)

- **"Show raw" debug toggle** that falls back to flat-bucket rendering. Drew's Stage 3 — defer until after nurse feedback on the CAA view.
- **Per-CAA collapse-on-resolved behavior** (auto-mark CAA `covered` once nurse handles all its items in-session). Currently rows just show shrinking counts. Cosmetic improvement, defer.
- **Department-sliced filter** on the CAA list. Drew's Surface D from Round 6 — separate future doc.
- **Re-fetch audit after stamp** to recompute `byCAA` status. Today the local filters (`stampedAddIds`, `resolveStatus.done`) hide actioned items; full re-evaluation requires backend round-trip. Defer.

---

## Risk notes

1. **Item identity by `ruleId`.** The plan keys `auditFocusStates` by `item.ruleId`. If the backend ever returns two different `toAdd` items with the same `ruleId` (e.g. multiple AKI focuses across different CAAs), they'd share state. Verify this can't happen — `ruleId` is library-entry-scoped, library entries are unique. If it can, fall back to compound key `${item.caa}:${item.ruleId}` and adapt `_stampAuditAddItem` accordingly.

2. **`AddBucketPane` was designed for "selected single item" context.** It still renders fine inline (single item per render), but the wrapping `.super-caa-row__item` adds its own padding/border which may visually fight the pane's internal layout. The CSS includes a `.super-caa-row__item .super-audit-pane { padding: 0 }` override to neutralize this — eyeball it on a real patient.

3. **Existing focuses readout (`existingFocusTexts`)** is truncated server-side to ~100 chars. If a focus text contains HTML entities, render plain text (not innerHTML) — the snippet above uses `{t}` which is safe by default in Preact.

4. **Build is no longer deferred.** Drew confirmed last round that typecheck-at-end works; from this round forward, run `npm run build` before each push.

5. **`AddBucketPane` accepts `getFocusState(item)`** but currently `AddBucketPane` only takes a `focusState` prop directly. The plan passes `focusState={getFocusState(item)}` per render — correct. Don't mistakenly pass `getFocusState` as a prop.

---

## Phasing summary

| Phase | Tasks | Output |
|---|---|---|
| 1 | 1-3 | CAARow + CAAList + modal swap. End state: nurse sees the CAA list. |
| 2 | 4-5 | Universals cluster verified. Telemetry verified. |
| 3 | 6 | AuditFocusList + dead CSS removed. Final build passes. |

Total: 3-4 hours focused.
