import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';

/**
 * Right pane for a `partial_coverage` toCheck item.
 *
 * Default-checks every suggested intervention; nurse can untick individuals.
 * Primary CTA stamps the checked interventions onto the existing PCC focus
 * via window.CarePlanAddInterventionAPI.addInterventions (currently a stub —
 * see content/modules/care-plan-stamp/pcc-add-intervention.js).
 */
export const AuditPartialCoveragePane = ({
  item,                  // partial_coverage toCheck item
  onStamp,               // (checkedInterventions: array) => Promise<void>
  onSkip,                // () => void
  stampStatus,           // 'idle' | 'pending' | 'done' | 'error'
  errorMessage,
}) => {
  const total = item.suggestedInterventions?.length || 0;
  const [checked, setChecked] = useState(() => new Set(Array.from({ length: total }, (_, i) => i)));

  const toggle = (i) => setChecked((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  const checkedItems = useMemo(
    () => (item.suggestedInterventions || []).filter((_, i) => checked.has(i)),
    [item.suggestedInterventions, checked]
  );

  const isAi = item.suggestionSource === 'ai';

  if (stampStatus === 'done') {
    return (
      <div className="cpas-detail">
        <div className="cpas-detail__header">
          <div className="cpas-detail__badge">? VERIFY · PARTIAL COVERAGE</div>
        </div>
        <div className="cpas-audit-section">
          <div className="cpas-audit-done">✓ Added {checkedItems.length} interventions to "{item.matchedFocusText}"</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cpas-detail">
      <div className="cpas-detail__header">
        <div className="cpas-detail__badge">? VERIFY · PARTIAL COVERAGE</div>
        <span className={`cpas-list__tag cpas-list__tag--source-${item.suggestionSource || 'library'}`}>
          {isAi ? 'AI' : 'library'}
        </span>
      </div>

      {isAi && (
        <div className="cpas-audit-ai-warn">
          ⓘ AI-generated suggestion. Review before adding.
        </div>
      )}

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">Triggered by</div>
        <div className="cpas-audit-section__body">
          {(item.sourceDxCodes || []).join(', ') || '—'}
        </div>
      </div>

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">Matched focus on plan</div>
        <div className="cpas-audit-section__body">{item.matchedFocusText || '—'}</div>
      </div>

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">Suggested interventions ({total})</div>
        <ul className="cpas-partial-interventions">
          {(item.suggestedInterventions || []).map((iv, i) => (
            <li key={i} className={`cpas-partial-intervention ${checked.has(i) ? 'is-checked' : ''}`}>
              {/* NO_TRACK: pure-UI checkbox toggle */}
              <input
                type="checkbox"
                checked={checked.has(i)}
                onChange={() => toggle(i)}
                disabled={stampStatus === 'pending'}
              />
              <span className="cpas-partial-intervention__cat">
                [{iv.kardexCategory}/{iv.positionOne}]
              </span>
              <span className="cpas-partial-intervention__text">{iv.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {stampStatus === 'error' && (
        <div className="cpas-audit-error">{errorMessage || 'Add failed. Try again.'}</div>
      )}

      <div className="cpas-audit-actions">
        {/* NO_TRACK: skip handled by parent which fires telemetry */}
        <button type="button" className="cpas-btn cpas-btn--ghost" onClick={onSkip} disabled={stampStatus === 'pending'}>
          Skip
        </button>
        <button
          type="button"
          className="cpas-btn cpas-btn--primary"
          onClick={() => onStamp(checkedItems)}
          disabled={stampStatus === 'pending' || checkedItems.length === 0}
          data-track="care_plan_audit_partial_stamped"
        >
          {stampStatus === 'pending'
            ? `Adding ${checkedItems.length}…`
            : `+ Add ${checkedItems.length} ${checkedItems.length === 1 ? 'intervention' : 'interventions'} to this focus`}
        </button>
      </div>
    </div>
  );
};
