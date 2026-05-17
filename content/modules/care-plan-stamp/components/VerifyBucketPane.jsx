import { h } from 'preact';

/**
 * Right-pane content for one selected `toCheck` audit item.
 *
 * Kind-specific UI:
 *   - history_focus     → "Historical framing" + [Keep] [Resolve in PCC]
 *   - soft_remove       → "Soft remove candidate" + [Keep] [Resolve in PCC]
 *   - partial_coverage  → "AI partial coverage" + [Mark verified]
 *   - unrecognized_focus→ "Custom nurse focus" + [Keep] (informational)
 *
 * v1: Mark verified / Keep are local-state only (no server persistence).
 * Resolve is wired through the parent (uses window.CarePlanResolveAPI).
 */
export const VerifyBucketPane = ({
  item,             // audit.toCheck[idx]: { kind, detail, reason, focusId, pccFocusId, pccFocusStdItemId }
  localState,       // 'verified' | 'kept' | undefined
  onMarkVerified,   // () => void
  onKeep,           // () => void
  onResolve,        // () => Promise<void>   — only used for soft_remove / history_focus
  resolveStatus,    // 'pending' | 'done' | 'error' | undefined
}) => {
  if (!item) return null;
  const config = _kindConfig(item.kind);

  return (
    <div className="super-audit-pane">
      <div className="super-audit-reason super-audit-reason--verify">
        <div className="super-audit-reason__label">{config.label}</div>
        <div className="super-audit-reason__text">{item.reason}</div>
      </div>

      <div className="super-audit-verifycard">
        <div className="super-audit-verifycard__label">{config.detailLabel}</div>
        <div className="super-audit-verifycard__text">{item.detail}</div>
      </div>

      <div className="super-audit-pane__actions">
        {_renderActions(item, {
          localState,
          onMarkVerified,
          onKeep,
          onResolve,
          resolveStatus,
        })}
      </div>
    </div>
  );
};

const _kindConfig = (kind) => ({
  history_focus:      { label: 'Historical framing',     detailLabel: 'Focus' },
  soft_remove:        { label: 'Soft remove candidate',  detailLabel: 'Focus' },
  partial_coverage:   { label: 'Partial coverage',       detailLabel: 'Diagnosis' },
  unrecognized_focus: { label: 'Custom focus',           detailLabel: 'Focus' },
}[kind] || { label: 'Verify', detailLabel: 'Detail' });

const _renderActions = (item, { localState, onMarkVerified, onKeep, onResolve, resolveStatus }) => {
  if (localState === 'verified') {
    return <div className="super-audit-done">✓ Marked verified (this session)</div>;
  }
  if (localState === 'kept') {
    return <div className="super-audit-done super-audit-done--neutral">Kept on plan</div>;
  }

  if (item.kind === 'unrecognized_focus') {
    return (
      // NO_TRACK: care_plan_audit_item_verified tracked in modal _verifyAuditItem
      <button type="button" className="super-btn super-btn--secondary" onClick={onKeep}>
        Keep on plan
      </button>
    );
  }

  if (item.kind === 'partial_coverage') {
    return (
      // NO_TRACK: care_plan_audit_item_verified tracked in modal _verifyAuditItem
      <button type="button" className="super-btn super-btn--primary" onClick={onMarkVerified}>
        Mark verified
      </button>
    );
  }

  // history_focus or soft_remove
  const canResolve = !!item.pccFocusId;
  return (
    <>
      {/* NO_TRACK: care_plan_audit_item_verified tracked in modal _verifyAuditItem */}
      <button type="button" className="super-btn super-btn--secondary" onClick={onKeep}>
        Keep
      </button>
      <button
        type="button"
        className="super-btn super-btn--danger"
        onClick={onResolve}
        disabled={resolveStatus === 'pending' || !canResolve}
        title={canResolve ? undefined : 'PCC focus ID missing — resolve manually in PCC'}
      >
        {resolveStatus === 'pending' ? 'Resolving…' : 'Resolve in PCC'}
      </button>
    </>
  );
};
