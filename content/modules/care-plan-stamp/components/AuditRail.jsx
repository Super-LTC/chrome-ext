import { h } from 'preact';

/**
 * Round 10 unified rail for Comprehensive Review.
 *
 * Mirrors Initial Admit's FocusList. One unified scroll containing:
 *   - Individual Add rows (sorted: AI-gap → dx → order → universals)
 *   - Remove rows (hidden if 0)
 *   - Inline Verify rows behind a "Show N to verify" fold by default
 *   - Bottom commit button: "Stamp N focuses →"
 *
 * Selection model: `selected` is `{ kind, key }` where key === item._rowId
 * (synthesized at audit load — unique even when focusId is null).
 */
export const AuditRail = ({
  audit,
  ruleIdToCAA,
  focusIdToCAA,
  stampedAddIds,
  skippedAddIds,
  resolveStatus,
  dismissedVerifyIds,
  selected,
  onSelect,
  verifyExpanded,
  onToggleVerifyExpanded,
  onCommit,
  commitDisabled,
  commitCount,
  needsInputCount,
  stamping,
}) => {
  // ---- Partition Add items ----
  const allAdds = (audit.toAdd || []).filter(
    (it) => !stampedAddIds.has(it.ruleId) && !skippedAddIds.has(it.ruleId)
  );

  // Sort: ai_says_missing → dx.* → order.* → universals (always last)
  const sortRank = (it) => {
    if (it.ruleId.startsWith('universal.')) return 4;
    if (it.coverageSignal === 'ai_says_missing') return 0;
    if (it.ruleId.startsWith('dx.')) return 1;
    if (it.ruleId.startsWith('order.')) return 2;
    return 3;
  };
  const sortedAdds = [...allAdds].sort((a, b) => sortRank(a) - sortRank(b));

  // ---- Verify items ----
  const liveChecks = (audit.toCheck || []).filter((it) => !dismissedVerifyIds.has(it.focusId));
  liveChecks.sort((a, b) => {
    const ca = focusIdToCAA.get(a.focusId) || '';
    const cb = focusIdToCAA.get(b.focusId) || '';
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.detail || '').localeCompare(b.detail || '');
  });

  // ---- Remove items ----
  const liveRemoves = (audit.toRemove || []).filter((it) => resolveStatus[it.focusId] !== 'done');
  const hasDate = (r) => /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(r || '');
  liveRemoves.sort((a, b) => Number(hasDate(b.reason)) - Number(hasDate(a.reason)));

  const totalAdds = (audit.toAdd || []).length;
  const liveAddCount = allAdds.length;

  const isActiveRow = (item) => selected?.key === item._rowId;

  const renderAddRow = (item) => (
    <li
      key={item._rowId}
      className={`cpas-list__item ${isActiveRow(item) ? 'is-active' : ''}`}
      onClick={() => onSelect({ kind: 'add', key: item._rowId })}
    >
      <span className="cpas-list__badge" title="Will be added to the care plan">+</span>
      <div className="cpas-list__body">
        <div className="cpas-list__row-top">
          <span className="cpas-list__text">{_shortTitle(item)}</span>
          {item.coverageSignal === 'ai_says_missing' && (
            <span className="cpas-list__tag cpas-list__tag--ai-gap">AI gap</span>
          )}
          {item.coverageSignal === 'ai_says_partial' && (
            <span className="cpas-list__tag cpas-list__tag--ai-partial">AI partial</span>
          )}
        </div>
        <div className="cpas-list__preview">{ruleIdToCAA.get(item.ruleId) || ''}</div>
        {Array.isArray(item.evidence) && item.evidence[0] && (
          <div className="cpas-list__evidence">↳ {_truncate(item.evidence[0], 70)}</div>
        )}
      </div>
    </li>
  );

  const renderVerifyRow = (item) => (
    <li
      key={item._rowId}
      className={`cpas-list__item cpas-list__item--verify ${isActiveRow(item) ? 'is-active' : ''}`}
      onClick={() => onSelect({ kind: 'verify', key: item._rowId })}
    >
      <span className="cpas-list__badge cpas-list__badge--verify">?</span>
      <div className="cpas-list__body">
        <div className="cpas-list__row-top">
          <span className="cpas-list__text">{_verifyTitle(item)}</span>
        </div>
        <div className="cpas-list__preview">
          {(focusIdToCAA.get(item.focusId) || '') + ' · Partial coverage'}
        </div>
        {item.matchedFocusText && (
          <div className="cpas-list__evidence">↳ {_truncate(item.matchedFocusText, 70)}</div>
        )}
      </div>
    </li>
  );

  const renderRemoveRow = (item) => (
    <li
      key={item._rowId}
      className={`cpas-list__item cpas-list__item--remove ${isActiveRow(item) ? 'is-active' : ''}`}
      onClick={() => onSelect({ kind: 'remove', key: item._rowId })}
    >
      <span className="cpas-list__badge cpas-list__badge--remove">−</span>
      <div className="cpas-list__body">
        <div className="cpas-list__row-top">
          <span className="cpas-list__text">{(item.focusText || '').slice(0, 60)}</span>
        </div>
        <div className="cpas-list__preview">
          {(focusIdToCAA.get(item.focusId) || '') + ' · Resolved'}
        </div>
      </div>
    </li>
  );

  return (
    <aside className="cpas-list">
      <div className="cpas-list__header">
        <div className="cpas-list__header-title">ADD</div>
        <div className="cpas-list__header-count">
          {liveAddCount} of {totalAdds}
        </div>
      </div>
      <ol className="cpas-list__items">
        {/* Add rows (universals sorted last via sortRank) */}
        {sortedAdds.map(renderAddRow)}

        {/* Remove rows */}
        {liveRemoves.map(renderRemoveRow)}

        {/* Verify section — collapsed-by-default fold */}
        {liveChecks.length > 0 && !verifyExpanded && (
          <li
            key="verify_fold"
            className="cpas-list__item cpas-list__item--fold"
            onClick={onToggleVerifyExpanded}
          >
            <span className="cpas-list__badge">↓</span>
            <div className="cpas-list__body">
              <div className="cpas-list__row-top">
                <span className="cpas-list__text">
                  Show {liveChecks.length} items to verify
                </span>
              </div>
            </div>
          </li>
        )}
        {verifyExpanded && liveChecks.map(renderVerifyRow)}
      </ol>

      <div className="cpas-list__commit">
        <button
          className="cpas-btn cpas-btn--primary cpas-list__commit-btn"
          disabled={commitDisabled}
          onClick={onCommit}
          data-track="care_plan_audit_commit"
          data-track-prop-source="rail"
        >
          ✓ Stamp {commitCount.focuses} {commitCount.focuses === 1 ? 'focus' : 'focuses'} →
        </button>
        {needsInputCount > 0 && (
          <div className="cpas-list__commit-warn">
            ⚠ {needsInputCount} {needsInputCount === 1 ? 'focus needs' : 'focuses need'} input first
          </div>
        )}
      </div>
    </aside>
  );
};

function _shortTitle(item) {
  const src = item?.focus?.description || item?.ruleId || '';
  const head = src.split(/[,:]/)[0].trim();
  return head.length > 60 ? head.slice(0, 57) + '…' : head;
}

function _verifyTitle(item) {
  const src = item?.detail || item?.reason || item?.focusText || item?.kind || 'Verify item';
  return src.length > 60 ? src.slice(0, 57) + '…' : src;
}

function _truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n).trim() + '…' : str;
}
