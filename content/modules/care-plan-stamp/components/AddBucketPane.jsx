import { h } from 'preact';
import { FocusCard } from './FocusCard.jsx';

/**
 * Right-pane content for one selected `toAdd` audit item.
 *
 * Renders the proposed focus via the shared FocusCard, prepended with a
 * reason banner (why this is suggested + coverage signal), plus Stamp/Skip
 * actions at the bottom.
 *
 * Stamp action stamps THIS focus only (single-item stamp from the modal).
 * Bulk "Add all" is handled by the modal's section-CTA in Task 10.
 */
export const AddBucketPane = ({
  item,              // audit.toAdd[idx]: { ruleId, reason, coverageSignal, focus }
  focusState,        // local edit state
  onPatch,           // (patch) => void
  onStamp,           // () => Promise<void>
  onSkip,            // () => void
  stamping,          // boolean
  dropdowns,
}) => {
  if (!item?.focus) {
    return (
      <div className="super-audit-pane">
        <div className="super-audit-empty">
          <div className="super-audit-empty__title">Library gap</div>
          <div className="super-audit-empty__subtitle">
            Backend flagged this rule but the library has no proposed focus yet.
            {item?.reason ? ` (${item.reason})` : ''}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="super-audit-pane">
      <div className="super-audit-reason super-audit-reason--add">
        <div className="super-audit-reason__label">Why this is suggested</div>
        <div className="super-audit-reason__text">{item.reason}</div>
        {item.coverageSignal === 'ai_says_missing' && (
          <span className="super-audit-reason__signal is-red">AI: gap</span>
        )}
        {item.coverageSignal === 'ai_says_partial' && (
          <span className="super-audit-reason__signal is-amber">AI: partial</span>
        )}
      </div>

      <FocusCard
        composed={item.focus}
        rawFocus={item.focus}
        state={focusState}
        onUpdate={onPatch}
        dropdowns={dropdowns}
      />

      <div className="super-audit-pane__actions">
        <button
          type="button"
          className="super-btn super-btn--secondary"
          onClick={onSkip}
          disabled={stamping}
        >
          Skip
        </button>
        <button
          type="button"
          className="super-btn super-btn--primary"
          onClick={onStamp}
          disabled={stamping}
        >
          Stamp focus
        </button>
      </div>
    </div>
  );
};
