import { h, Fragment } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { FocusCard, FocusRationale } from './FocusCard.jsx';
import { buildWizardModel, skippedItems } from '../wizardModel.js';
import { areaLabel } from '../careArea.js';

/**
 * AuditWizard — V2 comprehensive-audit step-through.
 *
 * PURE PRESENTATION. All stamping / skip / persist logic lives in the parent
 * modal and is passed in via callbacks (onStampNext, onSkip, onReopen,
 * onStampAll, onSelect, onPatchFocusState). This component renders:
 *
 *   • a sidebar with a progress bar + collapsible care-area groups (each with a
 *     status dot, count badge, and selectable focus rows that fill a "done dot"
 *     once stamped), plus a "Skipped (N)" fold and a "Covered (N)" fold.
 *   • a detail pane that delegates to FocusCard (variant="v2") and owns the
 *     Skip / Stamp&next footer.
 *
 * No API calls, no track() calls, no window access — props in, callbacks out.
 *
 * The care-area grouping + ordering comes entirely from buildWizardModel(); we
 * never regroup here so the wizard and dashboard can't drift.
 */
export const AuditWizard = ({
  audit,
  dropdowns,
  auditFocusStates,
  composeFocus,
  emptyFocusState,
  stampedAddIds,
  skippedAddIds,
  needsInputByRowId,
  selected,
  caaFilter,
  stamping,
  onSelect,
  onPatchFocusState,
  onStampNext,
  onSkip,
  onReopen,
  onStampAll,
}) => {
  const model = useMemo(() => buildWizardModel(audit), [audit]);
  const { groups, coveredAreas, total, orderedItems } = model;

  const stampedSet = stampedAddIds || new Set();
  const skippedSet = skippedAddIds || new Set();
  const needsInput = needsInputByRowId || {};

  // ── Skipped fold contents ──
  // skippedItems(audit) (the backend's set-aside bucket) UNIONed with any toAdd
  // items the nurse skipped this session (surfaced via skippedAddIds). Dedupe by
  // ruleId — a session-skipped toAdd item and a backend skipped item could in
  // principle share a ruleId; the toAdd copy wins (it carries focus edits).
  const skippedList = useMemo(() => {
    const sessionSkipped = (audit?.toAdd || []).filter((it) => skippedSet.has(it.ruleId));
    const backendSkipped = skippedItems(audit);
    const seen = new Set(sessionSkipped.map((it) => it.ruleId));
    const merged = [...sessionSkipped];
    for (const it of backendSkipped) {
      if (!seen.has(it.ruleId)) { seen.add(it.ruleId); merged.push(it); }
    }
    return merged;
  }, [audit, skippedSet]);

  // ── Progress ──
  const done = (audit?.toAdd || []).filter((it) => stampedSet.has(it.ruleId)).length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  // ── Collapsible state ──
  // Groups default OPEN; the Skipped/Covered folds default CLOSED. Open groups
  // are tracked by area name in a Set.
  const [openGroups, setOpenGroups] = useState(() => new Set(groups.map((g) => g.area)));
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [coveredOpen, setCoveredOpen] = useState(false);

  const toggleGroup = (area) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(area)) next.delete(area); else next.add(area);
    return next;
  });

  // ── caaFilter: expand + select once on first mount when nothing is selected.
  // Guarded so we don't fight parent-driven selection on later renders.
  useEffect(() => {
    if (!caaFilter || selected) return;
    const grp = groups.find((g) => g.area === caaFilter);
    if (!grp || grp.items.length === 0) return;
    setOpenGroups((prev) => new Set(prev).add(caaFilter));
    onSelect?.({ kind: 'add', key: grp.items[0]._rowId });
    // Run once on mount (caaFilter is a first-render hint).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resolve the selected item for the detail pane ──
  const selectedItem = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === 'add') {
      return (audit?.toAdd || []).find((it) => it._rowId === selected.key) || null;
    }
    if (selected.kind === 'skipped') {
      return skippedList.find((it) => it._rowId === selected.key) || null;
    }
    if (selected.kind === 'on_plan') {
      // Covered care-area chips from the dashboard route here. These items have
      // no stampable `focus` — render a read-only "on plan" pane (below).
      return (audit?.onPlan || []).find((it) => it._rowId === selected.key) || null;
    }
    return null;
  }, [selected, audit, skippedList]);

  return (
    <div className="cpas-wiz">
      <aside className="cpas-wiz__side">
        <div className="cpas-wiz__prog">
          <div className="cpas-wiz__prog-head">
            <span className="cpas-wiz__prog-text">{done} of {total} reviewed</span>
            {onStampAll && (
              // NO_TRACK: convenience CTA; telemetry fires in the parent's onStampAll.
              <button
                type="button"
                className="cpas-btn cpas-btn--ghost cpas-wiz__stamp-all"
                onClick={() => onStampAll()}
                disabled={stamping}
                title="Add every remaining focus to the care plan"
              >
                Stamp all remaining
              </button>
            )}
          </div>
          <div className="cpas-wiz__bar">
            <div className="cpas-wiz__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {groups.map((group) => {
          const isOpen = openGroups.has(group.area);
          return (
            <div key={group.area} className={`cpas-wiz__grp ${isOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="cpas-wiz__grp-head"
                onClick={() => toggleGroup(group.area)}
                aria-expanded={isOpen}
              >
                <span className={`cpas-wiz__dot is-${group.status}`} aria-hidden="true" />
                <span className="cpas-wiz__grp-name">{group.area}</span>
                <span className="cpas-wiz__grp-count">{group.items.length}</span>
                <span className="cpas-wiz__caret" aria-hidden="true">▾</span>
              </button>
              {isOpen && (
                <div className="cpas-wiz__grp-body">
                  {group.items.map((item) => {
                    const isStamped = stampedSet.has(item.ruleId);
                    const isSkipped = skippedSet.has(item.ruleId);
                    const isSelected = selected?.kind === 'add' && selected.key === item._rowId;
                    return (
                      <button
                        key={item._rowId}
                        type="button"
                        className={`cpas-wiz__item ${isSelected ? 'is-selected' : ''} ${isStamped ? 'is-done' : ''} ${isSkipped ? 'is-skipped' : ''}`}
                        onClick={() => onSelect?.({ kind: 'add', key: item._rowId })}
                      >
                        <span className="cpas-wiz__item-dot" aria-hidden="true" />
                        <span className="cpas-wiz__item-label">{_rowLabel(item)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {skippedList.length > 0 && (
          <div className={`cpas-wiz__fold ${skippedOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="cpas-wiz__fold-head"
              onClick={() => setSkippedOpen((o) => !o)}
              aria-expanded={skippedOpen}
            >
              <span className="cpas-wiz__dot is-skipped" aria-hidden="true" />
              <span className="cpas-wiz__grp-name">Skipped</span>
              <span className="cpas-wiz__grp-count">{skippedList.length}</span>
              <span className="cpas-wiz__caret" aria-hidden="true">▾</span>
            </button>
            {skippedOpen && (
              <div className="cpas-wiz__grp-body">
                {skippedList.map((item) => {
                  const isSelected = selected?.kind === 'skipped' && selected.key === item._rowId;
                  return (
                    <div
                      key={item._rowId}
                      className={`cpas-wiz__item is-skipped ${isSelected ? 'is-selected' : ''}`}
                    >
                      <button
                        type="button"
                        className="cpas-wiz__item-main"
                        onClick={() => onSelect?.({ kind: 'skipped', key: item._rowId })}
                      >
                        <span className="cpas-wiz__item-label">{_rowLabel(item)}</span>
                      </button>
                      {/* NO_TRACK: un-skip; the parent's onReopen owns telemetry. */}
                      <button
                        type="button"
                        className="cpas-btn cpas-btn--ghost cpas-wiz__reopen"
                        onClick={() => onReopen?.(item)}
                        title="Move this focus back into review"
                      >
                        Reopen
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {coveredAreas.length > 0 && (
          <div className={`cpas-wiz__fold ${coveredOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="cpas-wiz__fold-head"
              onClick={() => setCoveredOpen((o) => !o)}
              aria-expanded={coveredOpen}
            >
              <span className="cpas-wiz__dot is-covered" aria-hidden="true" />
              <span className="cpas-wiz__grp-name">Covered</span>
              <span className="cpas-wiz__grp-count">{coveredAreas.length}</span>
              <span className="cpas-wiz__caret" aria-hidden="true">▾</span>
            </button>
            {coveredOpen && (
              <div className="cpas-wiz__grp-body cpas-wiz__cov">
                {coveredAreas.map((area) => (
                  <div key={area} className="cpas-wiz__covered">✓ {area}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="cpas-wiz__main">
        {!selectedItem ? (
          <div className="cpas-empty">Select a focus from the list</div>
        ) : selected.kind === 'on_plan' ? (
          <OnPlanDetail item={selectedItem} audit={audit} />
        ) : selected.kind === 'skipped' ? (
          <SkippedDetail
            item={selectedItem}
            audit={audit}
            dropdowns={dropdowns}
            composeFocus={composeFocus}
            emptyFocusState={emptyFocusState}
            auditFocusStates={auditFocusStates}
            onReopen={onReopen}
          />
        ) : (
          <AddDetail
            item={selectedItem}
            audit={audit}
            orderedItems={orderedItems}
            total={total}
            dropdowns={dropdowns}
            composeFocus={composeFocus}
            emptyFocusState={emptyFocusState}
            auditFocusStates={auditFocusStates}
            stampedSet={stampedSet}
            needsInput={needsInput}
            stamping={stamping}
            onPatchFocusState={onPatchFocusState}
            onStampNext={onStampNext}
            onSkip={onSkip}
          />
        )}
      </div>
    </div>
  );
};

// ── Detail: a to-add focus (editable + Skip / Stamp&next footer) ──
const AddDetail = ({
  item, audit, orderedItems, total, dropdowns, composeFocus, emptyFocusState,
  auditFocusStates, stampedSet, needsInput, stamping, onPatchFocusState, onStampNext, onSkip,
}) => {
  const state = (auditFocusStates && auditFocusStates[item.ruleId]) || emptyFocusState();
  const composed = composeFocus(item.focus, state);
  const rawFocus = {
    ...item.focus,
    rationale: item.rationale || (item.evidence?.length ? { evidence: item.evidence } : null),
  };
  const isStamped = stampedSet.has(item.ruleId);
  const idx = orderedItems.findIndex((it) => it._rowId === item._rowId);
  const positionLabel = idx >= 0 ? `Focus ${idx + 1} of ${total}` : `Focus of ${total}`;
  const blocked = !!needsInput[item._rowId];

  return (
    <Fragment>
      <FocusCard
        variant="v2"
        composed={composed}
        rawFocus={rawFocus}
        state={state}
        dropdowns={dropdowns}
        areaBadge={areaLabel(audit, item)}
        positionLabel={positionLabel}
        isStamped={isStamped}
        onUpdate={(patch) => onPatchFocusState(item.ruleId, patch)}
        readOnly={stamping || isStamped}
      />
      <div className="cpas-wiz__footer">
        {isStamped ? (
          // Already added: nothing left to do but advance. "Next →" routes
          // through onStampNext, which the parent treats as a pure advance for
          // already-stamped items.
          <button
            type="button"
            className="cpas-btn cpas-btn--primary"
            onClick={() => onStampNext(item)}
            disabled={stamping}
          >
            Next →
          </button>
        ) : (
          <Fragment>
            <button
              type="button"
              className="cpas-btn cpas-btn--ghost"
              onClick={() => onSkip(item)}
              disabled={stamping}
            >
              Skip
            </button>
            <button
              type="button"
              className="cpas-btn cpas-btn--primary"
              onClick={() => onStampNext(item)}
              disabled={stamping || blocked}
              title={blocked ? 'Fill in the required input before adding' : 'Add this focus and continue'}
            >
              ✓ Stamp &amp; next →
            </button>
          </Fragment>
        )}
      </div>
    </Fragment>
  );
};

// ── Detail: a skipped focus (read-only + Reopen footer) ──
const SkippedDetail = ({
  item, audit, dropdowns, composeFocus, emptyFocusState, auditFocusStates, onReopen,
}) => {
  const state = (auditFocusStates && auditFocusStates[item.ruleId]) || emptyFocusState();
  const composed = composeFocus(item.focus, state);
  const rawFocus = {
    ...item.focus,
    rationale: item.rationale || (item.evidence?.length ? { evidence: item.evidence } : null),
  };
  return (
    <Fragment>
      <FocusCard
        variant="v2"
        composed={composed}
        rawFocus={rawFocus}
        state={state}
        dropdowns={dropdowns}
        areaBadge={areaLabel(audit, item)}
        positionLabel="Skipped"
        isStamped={false}
        onUpdate={() => {}}
        readOnly
      />
      <div className="cpas-wiz__footer">
        <button
          type="button"
          className="cpas-btn cpas-btn--primary"
          onClick={() => onReopen?.(item)}
        >
          Reopen
        </button>
      </div>
    </Fragment>
  );
};

// ── Detail: an already-on-plan focus (read-only) ──
// Reached when a *covered* care-area chip is clicked on the dashboard. onPlan
// items carry no stampable `focus` — just the existing focus text + rationale,
// so this is a lightweight read-only pane (no FocusCard, no footer actions).
const OnPlanDetail = ({ item, audit }) => {
  const rationale = item.rationale
    || (item.evidence?.length ? { evidence: item.evidence } : null);
  return (
    <section className="cpas-detail">
      <header className="cpas-detail__header cpas-detail__header--v2">
        <span className="cpas-detail__badge-sec">{areaLabel(audit, item)}</span>
        <span className="cpas-detail__pos">✓ On plan</span>
      </header>
      <div className="cpas-detail__statement">
        {item.focusText || item.description || item.focus?.description || '—'}
      </div>
      {rationale && (
        <FocusRationale
          rationale={{
            ...rationale,
            basisLabel: rationale.basisLabel ? `Covered · ${rationale.basisLabel}` : 'Covered',
          }}
        />
      )}
    </section>
  );
};

// ── Helpers ──

// A short, ellipsized row label. Mirrors AuditDashboard._truncate: prefer the
// focus description (the human-readable focus statement), capped ~60 chars.
function _rowLabel(item) {
  const text = item?.focus?.description || '';
  const trimmed = String(text).replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'Focus';
  return trimmed.length > 60 ? trimmed.slice(0, 59).trimEnd() + '…' : trimmed;
}
