import { h, Fragment } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { FocusCard } from './FocusCard.jsx';
import { buildWorklistModel, addAllReady, totalTouches } from '../worklistModel.js';

/**
 * AuditWorklist — V2 comprehensive-audit V8 sidebar-worklist.
 *
 * REPLACES the care-area-grouped AuditWizard *and* the AuditDashboard tile step
 * for v2-comprehensive. Layout mirrors .context/careplan-v8-sidebar-MOCK.html:
 *
 *   • a sticky progress strip ("N of M done · K to fill") that absorbs the old
 *     dashboard's overview role,
 *   • a sidebar worklist — one row per focus, grouped Add → Remove → Check, each
 *     add row showing its remaining amber "touches"; then dimmed clickable
 *     "Covered" rows and a non-silent "we removed N — tap to confirm" dropped fold,
 *   • an always-open detail pane (no modal/step gate) that delegates to FocusCard
 *     (variant="v2") for inline-editable goals/interventions, with a per-focus Add
 *     and a compact "why + what-we-auto-filled" receipts panel.
 *
 * PURE PRESENTATION. All stamping / skip / resolve / dropped logic lives in the
 * parent modal and is passed via callbacks. No API calls, no track(), no window.
 *
 * Gate: the parent renders this only when isV2(audit) — V1 orgs never see it.
 */
export const AuditWorklist = ({
  audit,
  dropdowns,
  auditFocusStates,
  composeFocus,
  emptyFocusState,
  stampedAddIds,
  skippedAddIds,
  touchesByRowId,             // Map<_rowId, number>
  resolveStatus,              // { [focusId]: 'pending'|'done'|'error' }
  keptIds,                    // Set<focusId|_rowId> — Remove/Check "keep on plan"
  acknowledgedDropped,        // Set<ruleId>
  selected,
  stamping,
  onSelect,
  onPatchFocusState,
  onStampOne,
  onSkip,
  onReopen,
  onStampAll,
  onResolve,
  onKeep,
  onReAddDropped,
  onConfirmDropped,
}) => {
  const model = useMemo(() => buildWorklistModel(audit), [audit]);
  const stampedSet = stampedAddIds || new Set();
  const skippedSet = skippedAddIds || new Set();
  const keptSet = keptIds || new Set();
  const ackSet = acknowledgedDropped || new Set();
  const touches = touchesByRowId || new Map();
  const rStatus = resolveStatus || {};

  const [coveredOpen, setCoveredOpen] = useState(false);
  const [droppedOpen, setDroppedOpen] = useState(true);

  // ── Progress: every actionable row (add + remove + check) counts toward the
  // tally. "done" = an add stamped/skipped, or a remove/check resolved/kept.
  const removes = audit?.toRemove || [];
  const checks = audit?.toCheck || [];
  const _resolvedOrKept = (it) =>
    rStatus[it.focusId] === 'done' || keptSet.has(it.focusId) || keptSet.has(it._rowId);
  const addsDone = model.orderedAdds.filter((it) => stampedSet.has(it.ruleId) || skippedSet.has(it.ruleId)).length;
  const removesDone = removes.filter(_resolvedOrKept).length;
  const checksDone = checks.filter(_resolvedOrKept).length;
  const done = addsDone + removesDone + checksDone;
  const total = model.totalAdds + removes.length + checks.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const touchesLeft = totalTouches(model, touches, stampedSet, skippedSet);

  // ── "Add all" gate — enabled only when every OPEN add has 0 amber slots.
  const ready = addAllReady(model, touches, stampedSet, skippedSet);
  const openAddCount = model.orderedAdds.filter((it) => !stampedSet.has(it.ruleId) && !skippedSet.has(it.ruleId)).length;

  // ── Resolve the selected item for the detail pane.
  const selItem = useMemo(() => {
    if (!selected) return null;
    const { kind, key } = selected;
    if (kind === 'add') return (audit?.toAdd || []).find((it) => it._rowId === key) || null;
    if (kind === 'remove') return (audit?.toRemove || []).find((it) => it._rowId === key) || null;
    if (kind === 'check') return (audit?.toCheck || []).find((it) => it._rowId === key) || null;
    if (kind === 'covered' || kind === 'on_plan') return (audit?.onPlan || []).find((it) => it._rowId === key) || null;
    if (kind === 'dropped') return (audit?.dropped || []).find((it) => it._rowId === key) || null;
    return null;
  }, [selected, audit]);

  return (
    <div className="cpas-wl">
      <div className="cpas-wl__progress">
        <div className="cpas-wl__progress-t">
          <span><b>{done}</b> of {total} done</span>
          <span className={touchesLeft > 0 ? 'cpas-wl__warn' : 'cpas-wl__ok'}>
            {touchesLeft > 0 ? `${touchesLeft} to fill` : '✓ all filled'}
          </span>
        </div>
        <div className="cpas-wl__pbar"><i style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="cpas-wl__body">
        <aside className="cpas-wl__side">
          <div className="cpas-wl__side-top">
            <button
              type="button"
              className="cpas-wl__addall"
              disabled={!ready || stamping}
              onClick={() => onStampAll?.()}
              title={ready ? 'Add every remaining focus to the care plan' : 'Fill the amber slots first'}
            >
              {openAddCount === 0 ? '✓ All added' : ready ? `✓ Add all (${openAddCount})` : '✓ Add all'}
            </button>
            <div className={`cpas-wl__addall-hint ${!ready && openAddCount > 0 ? 'cpas-wl__warn' : ''}`}>
              {openAddCount === 0
                ? 'every add-focus is on the plan'
                : ready
                  ? `adds all ${openAddCount} at once`
                  : `fill ${touchesLeft} amber slot${touchesLeft === 1 ? '' : 's'} to enable`}
            </div>
          </div>

          <div className="cpas-wl__scroll">
            {model.groups.map((group) => (
              <div key={group.kind} className="cpas-wl__grp">
                <div className="cpas-wl__grp-l">
                  <span className={`cpas-wl__gdot is-${group.kind}`} aria-hidden="true" />
                  {group.label}
                  <span className="cpas-wl__grp-c">{_openInGroup(group, { stampedSet, skippedSet, resolvedOrKept: _resolvedOrKept }) || '✓'}</span>
                </div>
                {group.items.map((item) => {
                  const rowSel = selected?.kind === group.kind && selected.key === item._rowId;
                  const state = _rowState(group.kind, item, {
                    stampedSet, skippedSet, resolvedOrKept: _resolvedOrKept, touches,
                  });
                  const t = touches.get(item._rowId) || 0;
                  return (
                    <button
                      key={item._rowId}
                      type="button"
                      className={`cpas-wl__row is-${group.kind} ${rowSel ? 'is-sel' : ''} ${state}`}
                      onClick={() => onSelect?.({ kind: group.kind, key: item._rowId })}
                    >
                      <span className="cpas-wl__st" aria-hidden="true" />
                      <span className="cpas-wl__rt">{_rowLabel(model, group.kind, item)}</span>
                      {group.kind === 'add' && t > 0 && state !== 'is-done' && (
                        <span className="cpas-wl__tc">{t}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Covered — dimmed, clickable, read-only */}
            {model.covered.length > 0 && (
              <div className="cpas-wl__grp">
                <button
                  type="button"
                  className="cpas-wl__grp-l cpas-wl__grp-l--btn"
                  onClick={() => setCoveredOpen((o) => !o)}
                  aria-expanded={coveredOpen}
                >
                  <span className="cpas-wl__gdot is-covered" aria-hidden="true" />
                  Covered · click to view
                  <span className="cpas-wl__grp-c">{model.covered.length}</span>
                  <span className="cpas-wl__caret" aria-hidden="true">{coveredOpen ? '▾' : '▸'}</span>
                </button>
                {coveredOpen && model.covered.map((item) => {
                  const rowSel = (selected?.kind === 'covered' || selected?.kind === 'on_plan') && selected.key === item._rowId;
                  return (
                    <button
                      key={item._rowId}
                      type="button"
                      className={`cpas-wl__crow ${rowSel ? 'is-sel' : ''}`}
                      onClick={() => onSelect?.({ kind: 'covered', key: item._rowId })}
                    >
                      <span className="cpas-wl__ck" aria-hidden="true">✓</span>
                      {_coveredLabel(model, item)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Dropped — NEVER silent. "we removed N — tap to confirm". */}
            {model.dropped.length > 0 && (
              <div className="cpas-wl__grp cpas-wl__grp--dropped">
                <button
                  type="button"
                  className="cpas-wl__grp-l cpas-wl__grp-l--btn"
                  onClick={() => setDroppedOpen((o) => !o)}
                  aria-expanded={droppedOpen}
                >
                  <span className="cpas-wl__gdot is-dropped" aria-hidden="true" />
                  We removed {model.dropped.length} — tap to confirm
                  <span className="cpas-wl__caret" aria-hidden="true">{droppedOpen ? '▾' : '▸'}</span>
                </button>
                {droppedOpen && model.dropped.map((item) => {
                  const rowSel = selected?.kind === 'dropped' && selected.key === item._rowId;
                  const ack = ackSet.has(item.ruleId || item._rowId);
                  return (
                    <button
                      key={item._rowId}
                      type="button"
                      className={`cpas-wl__drow ${rowSel ? 'is-sel' : ''} ${ack ? 'is-ack' : ''}`}
                      onClick={() => onSelect?.({ kind: 'dropped', key: item._rowId })}
                    >
                      <span className="cpas-wl__dx" aria-hidden="true">{ack ? '✓' : '−'}</span>
                      {_truncate(item.description, 44)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="cpas-wl__main">
          {!selItem ? (
            <div className="cpas-empty"><p>Select a focus from the list</p></div>
          ) : selected.kind === 'add' ? (
            <AddDetail
              item={selItem}
              dropdowns={dropdowns}
              state={(auditFocusStates && auditFocusStates[selItem.ruleId]) || emptyFocusState()}
              composeFocus={composeFocus}
              areaLabel={model.areaOf(selItem)}
              touches={touches.get(selItem._rowId) || 0}
              isStamped={stampedSet.has(selItem.ruleId)}
              isSkipped={skippedSet.has(selItem.ruleId)}
              stamping={stamping}
              onPatchFocusState={onPatchFocusState}
              onStampOne={onStampOne}
              onSkip={onSkip}
              onReopen={onReopen}
            />
          ) : selected.kind === 'remove' ? (
            <ResolveDetail item={selItem} kind="remove" areaLabel={model.areaOf(selItem)}
              status={rStatus[selItem.focusId]} kept={keptSet.has(selItem.focusId) || keptSet.has(selItem._rowId)}
              stamping={stamping} onResolve={onResolve} onKeep={onKeep} />
          ) : selected.kind === 'check' ? (
            <ResolveDetail item={selItem} kind="check" areaLabel={model.areaOf(selItem)}
              status={rStatus[selItem.focusId]} kept={keptSet.has(selItem.focusId) || keptSet.has(selItem._rowId)}
              stamping={stamping} onResolve={onResolve} onKeep={onKeep} />
          ) : selected.kind === 'dropped' ? (
            <DroppedDetail item={selItem} acknowledged={ackSet.has(selItem.ruleId || selItem._rowId)}
              onReAdd={onReAddDropped} onConfirm={onConfirmDropped} />
          ) : (
            <CoveredDetail item={selItem} areaLabel={model.areaOf(selItem)} />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Detail: a to-add focus (FocusCard v2 + per-focus Add / Skip + why receipts) ──
const AddDetail = ({
  item, dropdowns, state, composeFocus, areaLabel, touches, isStamped, isSkipped,
  stamping, onPatchFocusState, onStampOne, onSkip, onReopen,
}) => {
  const composed = composeFocus(item.focus, state);
  // Strip rationale from the card so FocusCard's own "Why this is proposed" box
  // doesn't render — the worklist owns the compact Why + receipts below instead.
  const rawFocus = { ...item.focus, rationale: null };
  const rationale = item.rationale || (item.evidence?.length ? { evidence: item.evidence } : null);
  const blocked = touches > 0;

  return (
    <Fragment>
      <div className="cpas-wl__d-actions">
        {isStamped ? (
          <span className="cpas-wl__done-tag">✓ added to plan</span>
        ) : isSkipped ? (
          <Fragment>
            <span className="cpas-wl__skip-tag">− skipped</span>
            {/* NO_TRACK: parent's onReopen (_reopenSkipped) owns telemetry. */}
            <button type="button" className="cpas-btn cpas-btn--ghost" onClick={() => onReopen?.(item)}>Include</button>
          </Fragment>
        ) : (
          <Fragment>
            <button
              type="button"
              className="cpas-wl__primary"
              disabled={blocked || stamping}
              onClick={() => onStampOne?.(item)}
              title={blocked ? 'Fill in the required input before adding' : 'Add only this focus to the care plan'}
            >
              ✓ Add this focus
            </button>
            {/* NO_TRACK: parent's onSkip (_skipAuditAddItem) owns telemetry. */}
            <button type="button" className="cpas-btn cpas-btn--ghost" disabled={stamping} onClick={() => onSkip?.(item)}>Skip</button>
            {blocked && <span className="cpas-wl__hint">fill {touches} amber slot{touches === 1 ? '' : 's'} first</span>}
          </Fragment>
        )}
      </div>

      <WhyReceipts rationale={rationale} focus={item.focus} />

      <FocusCard
        variant="v2"
        composed={composed}
        rawFocus={rawFocus}
        state={state}
        dropdowns={dropdowns}
        areaBadge={areaLabel}
        isStamped={isStamped}
        onUpdate={(patch) => onPatchFocusState?.(item.ruleId, patch)}
        readOnly={stamping || isStamped}
      />
    </Fragment>
  );
};

// ── Compact "Why" line + collapsed "what we auto-filled ⌄" receipts ──
const WhyReceipts = ({ rationale, focus }) => {
  const [open, setOpen] = useState(false);
  const evidence = rationale?.evidence || [];
  const filled = _autoFilledReceipts(focus);
  const hasReceipts = evidence.length > 0 || filled.length > 0;
  if (!rationale?.basisLabel && !hasReceipts) return null;
  return (
    <div className="cpas-wl__why">
      <span className="cpas-wl__why-k">Why</span>
      {rationale?.basisLabel && <span className="cpas-wl__why-tag">{rationale.basisLabel}</span>}
      {evidence.slice(0, 1).map((e, i) => <span key={i} className="cpas-wl__why-ev">{e}</span>)}
      {hasReceipts && (
        // NO_TRACK: pure-UI disclosure of the AI-fill receipts.
        <button type="button" className="cpas-wl__whymore" onClick={() => setOpen((o) => !o)}>
          {open ? 'hide auto-filled' : 'what we auto-filled ⌄'}
        </button>
      )}
      {open && hasReceipts && (
        <div className="cpas-wl__whyexp">
          {evidence.map((e, i) => (
            <div key={`ev-${i}`} className="cpas-wl__receipt"><span className="cpas-wl__receipt-k">signal</span>{e}</div>
          ))}
          {filled.map((f, i) => (
            <div key={`fl-${i}`} className="cpas-wl__receipt"><span className="cpas-wl__receipt-k">filled</span>{f}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Detail: a remove / check focus (read-only reason + resolve / keep) ──
const ResolveDetail = ({ item, kind, areaLabel, status, kept, stamping, onResolve, onKeep }) => {
  const done = status === 'done' || kept;
  return (
    <section className="cpas-detail">
      <header className="cpas-detail__header cpas-detail__header--v2">
        <span className="cpas-detail__badge-sec">{areaLabel}</span>
        <span className="cpas-detail__pos">{kind === 'remove' ? 'Remove · resolved / discontinued' : 'Check · your judgment'}</span>
      </header>
      <p className="cpas-wl__ftext">{item.focusText || item.description || '—'}</p>
      <div className="cpas-wl__reason">{item.reason || item.detail || ''}</div>
      {done ? (
        <div className="cpas-wl__d-actions">
          <span className="cpas-wl__done-tag">{status === 'done' ? '✓ removed' : '✓ kept on plan'}</span>
        </div>
      ) : (
        <div className="cpas-wl__d-actions">
          {/* NO_TRACK: parent's onResolve (_resolveAuditItem) owns telemetry. */}
          <button type="button" className="cpas-wl__danger" disabled={stamping || status === 'pending'} onClick={() => onResolve?.(item)}>
            {status === 'pending' ? 'Removing…' : 'Remove this focus'}
          </button>
          {/* NO_TRACK: parent's onKeep (_keepFocus) owns telemetry. */}
          <button type="button" className="cpas-btn cpas-btn--ghost" disabled={stamping} onClick={() => onKeep?.(item)}>Keep on plan</button>
          {kind === 'check' && <span className="cpas-wl__hint cpas-wl__hint--chk">your judgment</span>}
        </div>
      )}
      {status === 'error' && <div className="cpas-wl__err">Couldn’t resolve — try again.</div>}
    </section>
  );
};

// ── Detail: a dropped focus (acknowledge-first, structured for re-add) ──
const DroppedDetail = ({ item, acknowledged, onReAdd, onConfirm }) => {
  const canReAdd = !!item.focus; // backend fast-follow: full focus enables true re-add
  return (
    <section className="cpas-detail">
      <header className="cpas-detail__header cpas-detail__header--v2">
        <span className="cpas-detail__badge-sec">Removed by review</span>
        <span className="cpas-detail__pos">over-fire</span>
      </header>
      <p className="cpas-wl__ftext">{item.description || '—'}</p>
      <div className="cpas-wl__reason"><b>Why we removed it.</b> {item.reason || 'Flagged as an over-fire.'}</div>
      {acknowledged ? (
        <div className="cpas-wl__d-actions"><span className="cpas-wl__done-tag">✓ removal confirmed</span></div>
      ) : (
        <div className="cpas-wl__d-actions">
          {canReAdd && (
            // NO_TRACK: parent's onReAdd (_reAddDropped) owns telemetry.
            <button type="button" className="cpas-wl__primary" onClick={() => onReAdd?.(item)} title="The review was wrong — put this focus back">
              Re-add to plan
            </button>
          )}
          {/* NO_TRACK: parent's onConfirm (_confirmDropped) owns telemetry. */}
          <button type="button" className="cpas-btn cpas-btn--ghost" onClick={() => onConfirm?.(item)}>Confirm removal</button>
          {!canReAdd && <span className="cpas-wl__hint">review only — nothing added to the plan</span>}
        </div>
      )}
    </section>
  );
};

// ── Detail: a covered / on-plan focus (read-only) ──
const CoveredDetail = ({ item, areaLabel }) => {
  const evidence = item.rationale?.evidence || item.evidence || [];
  return (
    <section className="cpas-detail">
      <header className="cpas-detail__header cpas-detail__header--v2">
        <span className="cpas-detail__badge-sec">{areaLabel}</span>
        <span className="cpas-detail__pos">✓ on plan · read only</span>
      </header>
      <p className="cpas-wl__ftext">{item.focusText || item.description || item.focus?.description || '—'}</p>
      {evidence.length > 0 && (
        <div className="cpas-wl__why">
          <span className="cpas-wl__why-k">Covered</span>
          {evidence.map((e, i) => <span key={i} className="cpas-wl__why-ev">{e}</span>)}
        </div>
      )}
      <div className="cpas-wl__d-actions">
        <span className="cpas-wl__hint cpas-wl__hint--mut">Nothing to do — this area is already on the care plan.</span>
      </div>
    </section>
  );
};

// ── Helpers (pure) ──

// Auto-fill receipts: token segments the backend pre-filled (kind:token,
// !needsFilling, non-placeholder value) across focus/goals/interventions. Lets
// the nurse spot-check what the AI wrote into the blanks. Never a drug name —
// we only echo the segment value the backend already put in the text.
function _autoFilledReceipts(focus) {
  if (!focus) return [];
  const out = [];
  const seen = new Set();
  const walk = (segs) => {
    for (const s of segs || []) {
      if (s && s.kind === 'token' && !s.needsFilling && s.value && !_isPlaceholder(s.value)) {
        const v = String(s.value).trim();
        if (v && !seen.has(v)) { seen.add(v); out.push(v); }
      }
    }
  };
  walk(focus.descriptionSegments);
  (focus.goals || []).forEach((g) => walk(g.descriptionSegments));
  (focus.interventions || []).forEach((iv) => walk(iv.descriptionSegments));
  return out;
}
function _isPlaceholder(v) {
  const s = String(v || '').trim();
  return !s || /_{3,}/.test(s) || /^\[.*\]$/.test(s);
}

function _rowLabel(model, kind, item) {
  const area = model.areaOf(item);
  const text = kind === 'add' ? (item.focus?.description || '') : (item.focusText || item.description || '');
  const short = _truncate(text, 44);
  return area && area !== 'Other' ? `${area} — ${short}` : short || area || 'Focus';
}
function _coveredLabel(model, item) {
  return item.caaName || model.areaOf(item) || _truncate(item.focusText || item.description || 'Covered', 30);
}
function _truncate(text, n) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}
// Count of rows in a group still needing action (for the sidebar count badge).
function _openInGroup(group, { stampedSet, skippedSet, resolvedOrKept }) {
  if (group.kind === 'add') {
    return group.items.filter((it) => !stampedSet.has(it.ruleId) && !skippedSet.has(it.ruleId)).length;
  }
  return group.items.filter((it) => !resolvedOrKept(it)).length;
}
// Per-row visual state class for the status dot.
function _rowState(kind, item, { stampedSet, skippedSet, resolvedOrKept, touches }) {
  if (kind === 'add') {
    if (stampedSet.has(item.ruleId)) return 'is-done';
    if (skippedSet.has(item.ruleId)) return 'is-skipped';
    return (touches.get(item._rowId) || 0) > 0 ? 'is-needs' : 'is-ready';
  }
  return resolvedOrKept(item) ? 'is-done' : 'is-open';
}
