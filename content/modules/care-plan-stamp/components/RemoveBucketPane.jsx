import { h } from 'preact';

/**
 * Right-pane content for one selected `toRemove` audit item.
 *
 * Renders the focus text and cessation reason, plus a single primary
 * action that resolves the focus in PCC (via window.CarePlanResolveAPI).
 * Status states: idle / pending / done / error.
 *
 * Parent owns the resolve call + status state — this component is purely
 * presentational.
 */
export const RemoveBucketPane = ({
  item,            // audit.toRemove[idx]: { focusId, focusText, reason, pccFocusId, pccFocusStdItemId }
  onResolve,       // () => Promise<void>
  status,          // 'pending' | 'done' | 'error' | undefined
  errorMessage,    // string | undefined
}) => {
  if (!item) return null;
  const canResolve = !!item.pccFocusId;

  return (
    <div className="super-audit-pane">
      <div className="super-audit-reason super-audit-reason--remove">
        <div className="super-audit-reason__label">Cessation evidence</div>
        <div className="super-audit-reason__text">{item.reason}</div>
      </div>

      <div className="super-audit-removecard">
        <div className="super-audit-removecard__label">Focus to resolve</div>
        <div className="super-audit-removecard__text">{item.focusText}</div>
        {!canResolve && (
          <div className="super-audit-removecard__warn">
            ⚠ PCC focus ID missing — backend couldn't link this focus back to PCC.
            Resolve manually in PCC.
          </div>
        )}
      </div>

      <div className="super-audit-pane__actions">
        {status === 'done' ? (
          <div className="super-audit-done">✓ Resolved in PCC</div>
        ) : (
          <>
            {status === 'error' && (
              <div className="super-audit-error">{errorMessage || 'Resolve failed. Try again.'}</div>
            )}
            <button
              type="button"
              className="super-btn super-btn--danger"
              onClick={onResolve}
              disabled={status === 'pending' || !canResolve}
            >
              {status === 'pending' ? 'Resolving…' : 'Confirm & resolve'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
