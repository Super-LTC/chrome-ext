import { h } from 'preact';

export const AuditUniversalsPane = ({ items, onStampAll, onExpandInline, stamping }) => {
  return (
    <div className="cpas-detail">
      <div className="cpas-detail__header">
        <div className="cpas-detail__badge">💡 STANDARD UNIVERSALS</div>
      </div>

      <div className="cpas-audit-section">
        <div className="cpas-audit-section__label">
          {items.length} universal focuses always proposed at admission
        </div>
        <ul className="cpas-audit-universals-list">
          {items.map((it) => (
            <li key={it.ruleId}>
              <strong>{it.ruleId.replace('universal.', '').replace(/_/g, ' ')}</strong>
              {it.focus?.description ? <> — {it.focus.description.slice(0, 100)}</> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="cpas-audit-actions">
        {/* NO_TRACK: pure-UI expansion into per-item review */}
        <button type="button" className="cpas-btn cpas-btn--ghost" onClick={onExpandInline}>
          Review individually
        </button>
        <button
          type="button"
          className="cpas-btn cpas-btn--primary"
          onClick={onStampAll}
          disabled={stamping}
        >
          Stamp all {items.length}
        </button>
      </div>
    </div>
  );
};
