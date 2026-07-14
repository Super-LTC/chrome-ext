import { h } from 'preact';
import { useState, useMemo, useEffect, useRef } from 'preact/hooks';

/**
 * Right pane for a `partial_coverage` toCheck item.
 *
 * Default-checks every suggested intervention; nurse can untick individuals,
 * edit description/kardex/position inline, delete rows, or add custom ones.
 * Primary CTA stamps the resulting edited+checked interventions onto the
 * existing PCC focus via window.CarePlanAddInterventionAPI.addInterventions
 * (see content/modules/care-plan-stamp/pcc-add-intervention.js).
 *
 * Kardex/Position from the backend are treated as RECOMMENDATIONS — rows
 * default to "None", and the recommended option is decorated with a ✨ inside
 * the dropdown. Nurses opt in instead of nurses opting out (filling the Kardex
 * indiscriminately makes them very angry).
 */

const KIND_LABEL = { kardex: 'K', position: 'Team' };

const RecommendableChipSelect = ({
  kind, value, options, labels,
  onChange, placeholder, disabled, recommendedId,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const currentLabel = value != null ? (labels[String(value)] || '') : '';
  const isRecommended = recommendedId != null && value != null && Number(value) === Number(recommendedId);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
    const onDocClick = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const list = options || [];
    const q = query.trim().toLowerCase();
    const base = q ? list.filter((o) => o.label.toLowerCase().includes(q)) : list;
    // Pin the recommended option to the top if it matches the current filter.
    if (recommendedId == null) return base;
    const recIdx = base.findIndex((o) => Number(o.id) === Number(recommendedId));
    if (recIdx <= 0) return base;
    const copy = base.slice();
    const [rec] = copy.splice(recIdx, 1);
    return [rec, ...copy];
  }, [options, query, recommendedId]);

  const choose = (id) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <span
      className={`cpas-partial-intervention__chip cpas-partial-intervention__chip--${kind} ${value == null ? 'is-empty' : ''} ${isRecommended ? 'is-recommended' : ''}`}
      ref={rootRef}
    >
      {/* NO_TRACK: pure-UI dropdown toggle */}
      <button
        type="button"
        className="cpas-partial-intervention__chip-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-label={`${kind === 'kardex' ? 'Kardex category' : 'Team'} (optional)`}
      >
        <span className="cpas-partial-intervention__chip-badge" aria-hidden="true">{KIND_LABEL[kind] || ''}</span>
        <span className="cpas-partial-intervention__chip-text">
          {currentLabel || placeholder}
        </span>
        {isRecommended && <span className="cpas-partial-intervention__chip-sparkle" aria-hidden="true">✨</span>}
        <span className="cpas-partial-intervention__chip-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="cpas-partial-intervention__chip-pop" role="listbox">
          <input
            ref={inputRef}
            type="text"
            className="cpas-partial-intervention__chip-search"
            placeholder="Search…"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          />
          <ul className="cpas-partial-intervention__chip-list">
            <li
              className={`cpas-partial-intervention__chip-option ${value == null ? 'is-selected' : ''}`}
              onClick={() => choose(null)}
            >
              <span className="cpas-partial-intervention__chip-option-label is-none">None</span>
            </li>
            {filtered.length === 0 && (
              <li className="cpas-partial-intervention__chip-empty">No matches.</li>
            )}
            {filtered.map((opt) => {
              const rec = recommendedId != null && Number(opt.id) === Number(recommendedId);
              const selected = value != null && Number(opt.id) === Number(value);
              return (
                <li
                  key={opt.id}
                  className={`cpas-partial-intervention__chip-option ${selected ? 'is-selected' : ''} ${rec ? 'is-recommended' : ''}`}
                  onClick={() => choose(opt.id)}
                >
                  <span className="cpas-partial-intervention__chip-option-label">{opt.label}</span>
                  {rec && (
                    <span className="cpas-partial-intervention__chip-option-rec">
                      <span aria-hidden="true">✨</span> Recommended
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </span>
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
  // Backend kardex/position are RECOMMENDATIONS, not defaults. Stamping rows
  // wholesale to the Kardex makes nurses very angry, so leave them as None
  // until the nurse explicitly picks one.
  const [rows, setRows] = useState(() =>
    (item.suggestedInterventions || []).map((iv) => ({
      description: iv.description || '',
      kardexCategory: null,
      positionOne: null,
      _recKardex: iv.kardexCategory ?? null,
      _recPosition: iv.positionOne ?? null,
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
      _recKardex: null,
      _recPosition: null,
      checked: true,
      _custom: true,
    }]);

  const checkedItems = useMemo(
    () => rows.filter((r) => r.checked).map(({ description, kardexCategory, positionOne }) => ({
      description, kardexCategory, positionOne,
    })),
    [rows]
  );

  // Only the description is required — Kardex/Team are optional recommendations.
  const invalidCount = useMemo(
    () => rows.filter((r) => r.checked && r.description.trim() === '').length,
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
        <div className="cpas-audit-section__body">
          {item.matchedFocusText || 'No single matching focus identified — review whether an existing focus covers this.'}
        </div>
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
                  <RecommendableChipSelect
                    kind="kardex"
                    value={row.kardexCategory}
                    options={dropdowns?.kardexOptions || []}
                    labels={dropdowns?.kardexLabels || {}}
                    recommendedId={row._recKardex}
                    onChange={(v) => patchRow(idx, { kardexCategory: v })}
                    placeholder="Select Kardex (none)"
                    disabled={stampStatus === 'pending'}
                  />
                  <RecommendableChipSelect
                    kind="position"
                    value={row.positionOne}
                    options={dropdowns?.positionOptions || []}
                    labels={dropdowns?.positionLabels || {}}
                    recommendedId={row._recPosition}
                    onChange={(v) => patchRow(idx, { positionOne: v })}
                    placeholder="Select team (none)"
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
          ⚠ {invalidCount} {invalidCount === 1 ? 'row needs' : 'rows need'} a description
        </div>
      )}
    </div>
  );
};
