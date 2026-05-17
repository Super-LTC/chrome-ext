import { h } from 'preact';

export const AuditVerifyPane = ({ item, focusOnPlanText, onDismiss, onOpenInPCC }) => {
  return (
    <div className="cpas-detail">
      <div className="cpas-detail__header">
        <div className="cpas-detail__badge">? VERIFY</div>
      </div>

      {focusOnPlanText && (
        <div className="cpas-audit-section">
          <div className="cpas-audit-section__label">Existing focus on plan</div>
          <div className="cpas-audit-section__body">{focusOnPlanText}</div>
        </div>
      )}

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">AI says</div>
        <div className="cpas-audit-section__body">{item.reason}</div>
      </div>

      <div className="cpas-audit-actions">
        {onOpenInPCC && (
          <button
            type="button"
            className="cpas-btn cpas-btn--ghost"
            onClick={onOpenInPCC}
            data-track="care_plan_audit_verify_open_in_pcc"
          >
            Open focus in PCC ↗
          </button>
        )}
        <button
          type="button"
          className="cpas-btn cpas-btn--primary"
          onClick={onDismiss}
          data-track="care_plan_audit_verify_dismissed_click"
        >
          Dismiss — already adequate
        </button>
      </div>
    </div>
  );
};
