import { h } from 'preact';

/**
 * Segmented control at the top of the wizard. Switches between the two
 * proposal sources:
 *   - 'initial'       → /api/extension/care-plan/auto-pop (universals)
 *   - 'comprehensive' → /api/extension/care-plan/audit    (full audit)
 *
 * Default picked by patient state (empty plan vs. established) in
 * inject-button.js; nurse can override mid-session and switching re-fetches.
 */
export const ScopeToggle = ({ mode, onChange, disabled }) => {
  const opts = [
    { id: 'initial', label: 'Initial Admit', hint: 'Empty plan · universals only' },
    { id: 'comprehensive', label: 'Comprehensive Review', hint: 'Audit existing plan' },
  ];
  return (
    <div className="super-scope-toggle" role="radiogroup" aria-label="Care plan scope">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={mode === o.id}
          disabled={disabled}
          onClick={() => mode !== o.id && onChange(o.id)}
          className={mode === o.id ? 'super-scope-toggle__opt is-active' : 'super-scope-toggle__opt'}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};
