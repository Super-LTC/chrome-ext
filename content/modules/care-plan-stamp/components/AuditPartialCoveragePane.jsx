import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';

/**
 * Right pane for a `partial_coverage` toCheck item.
 *
 * Default-checks every suggested intervention; nurse can untick individuals,
 * edit description/kardex/position inline, delete rows, or add custom ones.
 * Primary CTA stamps the resulting edited+checked interventions onto the
 * existing PCC focus via window.CarePlanAddInterventionAPI.addInterventions
 * (see content/modules/care-plan-stamp/pcc-add-intervention.js).
 */

const ChipSelect = ({ kind, value, options, labels, onChange, placeholder, disabled }) => {
  const currentLabel = value != null ? (labels[String(value)] || '') : '';
  return (
    <label className={`cpas-partial-intervention__chip cpas-partial-intervention__chip--${kind} ${value == null ? 'is-empty' : ''}`}>
      <span className="cpas-partial-intervention__chip-text">
        {currentLabel || placeholder}
      </span>
      <span className="cpas-partial-intervention__chip-caret">▾</span>
      <select
        className="cpas-partial-intervention__chip-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.currentTarget.value === '' ? null : e.currentTarget.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {(options || []).map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
};

export const AuditPartialCoveragePane = ({
  item,                  // partial_coverage toCheck item
  onStamp,               // (checkedInterventions: array) => Promise<void>
  onSkip,                // () => void
  stampStatus,           // 'idle' | 'pending' | 'done' | 'error'
  errorMessage,
  dropdowns,             // org dropdowns for resolving kardex/position IDs to labels
}) => {
  const [rows, setRows] = useState(() =>
    (item.suggestedInterventions || []).map((iv) => ({
      description: iv.description || '',
      kardexCategory: iv.kardexCategory ?? null,
      positionOne: iv.positionOne ?? null,
      checked: true,
      _custom: false,
    }))
  );

  const patchRow = (idx, patch) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const deleteRow = (idx) =>
    setRows((rs) => rs.filter((_, i) => i !== idx));

  const addCustom = () =>
    setRows((rs) => [...rs, {
      description: '',
      kardexCategory: null,
      positionOne: null,
      checked: true,
      _custom: true,
    }]);

  const checkedItems = useMemo(
    () => rows.filter((r) => r.checked).map(({ description, kardexCategory, positionOne }) => ({
      description, kardexCategory, positionOne,
    })),
    [rows]
  );

  const invalidCount = useMemo(
    () => rows.filter(r => r.checked && (
      r.description.trim() === '' || r.kardexCategory == null || r.positionOne == null
    )).length,
    [rows]
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

  const ctaDisabled = stampStatus === 'pending' || checkedItems.length === 0 || invalidCount > 0;

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

      {item.existingFocus && (Array.isArray(item.existingFocus.goals) || Array.isArray(item.existingFocus.interventions)) && (
        <div className="cpas-audit-section">
          <div className="cpas-audit-section__label">Existing on this focus</div>
          <div className="cpas-audit-existing">
            {Array.isArray(item.existingFocus.goals) && item.existingFocus.goals.length > 0 && (
              <div className="cpas-audit-existing__block">
                <div className="cpas-audit-existing__heading">Goals ({item.existingFocus.goals.length})</div>
                <ul className="cpas-audit-existing__list">
                  {item.existingFocus.goals.map((g, i) => (
                    <li key={g.pccGoalId || i}>{g.description}</li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(item.existingFocus.interventions) && item.existingFocus.interventions.length > 0 && (
              <div className="cpas-audit-existing__block">
                <div className="cpas-audit-existing__heading">Interventions ({item.existingFocus.interventions.length})</div>
                <ul className="cpas-audit-existing__list">
                  {item.existingFocus.interventions.map((iv, i) => (
                    <li key={iv.pccInterventionId || i}>{iv.description}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">Suggested interventions ({rows.length})</div>
        <ul className="cpas-partial-interventions">
          {rows.map((row, idx) => (
            <li key={idx} className={`cpas-partial-intervention ${row.checked ? 'is-checked' : ''} ${row._custom ? 'is-custom' : ''}`}>
              {/* NO_TRACK: pure-UI checkbox toggle */}
              <input
                type="checkbox"
                checked={row.checked}
                onChange={() => patchRow(idx, { checked: !row.checked })}
                disabled={stampStatus === 'pending'}
              />
              <div className="cpas-partial-intervention__body">
                <textarea
                  className="cpas-partial-intervention__text-edit"
                  value={row.description}
                  onInput={(e) => patchRow(idx, { description: e.currentTarget.value })}
                  placeholder="Intervention description"
                  rows={2}
                  disabled={stampStatus === 'pending'}
                />
                <div className="cpas-partial-intervention__meta">
                  <ChipSelect
                    kind="kardex"
                    value={row.kardexCategory}
                    options={dropdowns?.kardexOptions || []}
                    labels={dropdowns?.kardexLabels || {}}
                    onChange={(v) => patchRow(idx, { kardexCategory: v })}
                    placeholder="Choose category"
                    disabled={stampStatus === 'pending'}
                  />
                  <ChipSelect
                    kind="position"
                    value={row.positionOne}
                    options={dropdowns?.positionOptions || []}
                    labels={dropdowns?.positionLabels || {}}
                    onChange={(v) => patchRow(idx, { positionOne: v })}
                    placeholder="Choose team"
                    disabled={stampStatus === 'pending'}
                  />
                </div>
              </div>
              {/* NO_TRACK: row-level delete is local-state UI */}
              <button
                type="button"
                className="cpas-partial-intervention__delete"
                onClick={() => deleteRow(idx)}
                title="Remove this intervention"
                aria-label="Remove intervention"
                disabled={stampStatus === 'pending'}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {/* NO_TRACK: appending a custom row is local-state UI */}
        <button
          type="button"
          className="cpas-partial-intervention__add"
          onClick={addCustom}
          disabled={stampStatus === 'pending'}
        >
          + Add intervention
        </button>
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
          disabled={ctaDisabled}
          data-track="care_plan_audit_partial_stamped"
        >
          {stampStatus === 'pending'
            ? `Adding ${checkedItems.length}…`
            : `+ Add ${checkedItems.length} ${checkedItems.length === 1 ? 'intervention' : 'interventions'} to this focus`}
        </button>
      </div>
      {invalidCount > 0 && (
        <div className="cpas-list__commit-warn">
          ⚠ {invalidCount} {invalidCount === 1 ? 'row needs' : 'rows need'} description, category, and team
        </div>
      )}
    </div>
  );
};
