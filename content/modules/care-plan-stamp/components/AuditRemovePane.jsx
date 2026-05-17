import { h } from 'preact';

export const AuditRemovePane = ({ item, onResolve, onKeep, resolveStatus, errorMessage }) => {
  const canResolve = !!item.pccFocusId;
  return (
    <div className="cpas-detail">
      <div className="cpas-detail__header">
        <div className="cpas-detail__badge">− REMOVE</div>
      </div>

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">Existing focus on plan</div>
        <div className="cpas-audit-section__body">{item.focusText}</div>
      </div>

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">Evidence</div>
        <div className="cpas-audit-section__body">{item.reason}</div>
      </div>

      <div className="cpas-audit-actions">
        <button
          type="button"
          className="cpas-btn cpas-btn--ghost"
          onClick={onKeep}
          data-track="care_plan_audit_remove_kept_click"
        >
          Keep — still relevant
        </button>
        <button
          type="button"
          className="cpas-btn cpas-btn--primary"
          onClick={onResolve}
          disabled={resolveStatus === 'pending' || !canResolve}
          title={canResolve ? undefined : 'PCC focus ID missing — resolve manually'}
        >
          {resolveStatus === 'pending' ? 'Resolving…' : 'Confirm resolve in PCC'}
        </button>
      </div>
      {resolveStatus === 'error' && (
        <div className="cpas-audit-error">{errorMessage || 'Resolve failed.'}</div>
      )}
      {resolveStatus === 'done' && <div className="cpas-audit-done">✓ Resolved in PCC</div>}
    </div>
  );
};
