import { h } from 'preact';
import { useState } from 'preact/hooks';

/**
 * Three-bucket left rail for Comprehensive Review mode.
 *
 * Bucket sections:
 *   - Add    (toAdd[])    — propose new focuses
 *   - Verify (toCheck[])  — nurse-judgment items
 *   - Remove (toRemove[]) — high-confidence stale focuses
 *
 * Selected item is identified by { bucket, idx }. Parent owns selection.
 *
 * No tabs — nurses lose track when work hides behind a tab. Collapsible
 * sections show counts even when collapsed so the nurse can see what's
 * pending across all three.
 */
export const AuditFocusList = ({
  audit,
  selected,           // { bucket: 'add'|'verify'|'remove', idx: number }
  onSelect,           // (selected) => void
  initiallyExpanded,  // 'add' | 'verify' | 'remove' — auto-open this bucket
  stamping,           // boolean — disable interactions during stamp/resolve
  resolveStatus,      // { [focusId]: 'pending' | 'done' | 'error' }
}) => {
  const toAdd = audit?.toAdd || [];
  const toCheck = audit?.toCheck || [];
  const toRemove = audit?.toRemove || [];

  // Default: expand the bucket with the most items, OR the requested one.
  const defaultExpanded = initiallyExpanded || (
    toAdd.length >= toCheck.length && toAdd.length >= toRemove.length ? 'add' :
    toCheck.length >= toRemove.length ? 'verify' : 'remove'
  );
  const [expanded, setExpanded] = useState({
    add: defaultExpanded === 'add' || toAdd.length > 0,
    verify: defaultExpanded === 'verify',
    remove: defaultExpanded === 'remove',
  });

  const toggle = (b) => setExpanded((e) => ({ ...e, [b]: !e[b] }));
  const isSel = (b, i) => selected?.bucket === b && selected?.idx === i;

  if (toAdd.length === 0 && toCheck.length === 0 && toRemove.length === 0) {
    return (
      <div className="super-audit-empty">
        <div className="super-audit-empty__icon">✓</div>
        <div className="super-audit-empty__title">Care plan looks complete</div>
        <div className="super-audit-empty__subtitle">No additions, removals, or verifications recommended.</div>
      </div>
    );
  }

  return (
    <div className="super-audit-rail">
      <Section
        title="Add" tone="add" count={toAdd.length}
        expanded={expanded.add} onToggle={() => toggle('add')}
      >
        {toAdd.map((item, i) => (
          <Row
            key={item.ruleId}
            kind="add"
            title={item.focus?.description || item.ruleId}
            subtitle={item.reason}
            badge={item.coverageSignal === 'ai_says_missing' ? 'AI gap'
                 : item.coverageSignal === 'ai_says_partial' ? 'Partial'
                 : null}
            selected={isSel('add', i)}
            disabled={stamping}
            onClick={() => onSelect({ bucket: 'add', idx: i })}
          />
        ))}
      </Section>

      <Section
        title="Verify" tone="verify" count={toCheck.length}
        expanded={expanded.verify} onToggle={() => toggle('verify')}
      >
        {toCheck.map((item, i) => (
          <Row
            key={`${item.kind}-${item.focusId || i}`}
            kind="verify"
            title={item.detail}
            subtitle={item.reason}
            badge={_verifyBadge(item.kind)}
            selected={isSel('verify', i)}
            disabled={stamping}
            onClick={() => onSelect({ bucket: 'verify', idx: i })}
          />
        ))}
      </Section>

      <Section
        title="Remove" tone="remove" count={toRemove.length}
        expanded={expanded.remove} onToggle={() => toggle('remove')}
      >
        {toRemove.map((item, i) => (
          <Row
            key={item.focusId}
            kind="remove"
            title={item.focusText}
            subtitle={item.reason}
            status={resolveStatus?.[item.focusId]}
            selected={isSel('remove', i)}
            disabled={stamping}
            onClick={() => onSelect({ bucket: 'remove', idx: i })}
          />
        ))}
      </Section>
    </div>
  );
};

const Section = ({ title, tone, count, expanded, onToggle, children }) => (
  <div className={`super-audit-section super-audit-section--${tone} ${expanded ? 'is-open' : ''}`}>
    <button type="button" className="super-audit-section__head" onClick={onToggle} aria-expanded={expanded}>
      <span className="super-audit-section__caret">{expanded ? '▾' : '▸'}</span>
      <span className="super-audit-section__title">{title}</span>
      <span className="super-audit-section__count">{count}</span>
    </button>
    {expanded && <div className="super-audit-section__body">{children}</div>}
  </div>
);

const Row = ({ kind, title, subtitle, badge, status, selected, disabled, onClick }) => (
  <button
    type="button"
    className={`super-audit-row super-audit-row--${kind} ${selected ? 'is-selected' : ''} ${status ? `is-${status}` : ''}`}
    onClick={onClick}
    disabled={disabled}
  >
    <div className="super-audit-row__title">{title}</div>
    {subtitle && <div className="super-audit-row__subtitle">{subtitle}</div>}
    {badge && <span className="super-audit-row__badge">{badge}</span>}
    {status === 'done' && <span className="super-audit-row__check">✓</span>}
    {status === 'pending' && <span className="super-audit-row__spinner">…</span>}
    {status === 'error' && <span className="super-audit-row__error">!</span>}
  </button>
);

const _verifyBadge = (kind) => ({
  history_focus: 'History',
  soft_remove: 'Soft remove',
  unrecognized_focus: 'Custom',
  partial_coverage: 'Partial',
}[kind] || null);
