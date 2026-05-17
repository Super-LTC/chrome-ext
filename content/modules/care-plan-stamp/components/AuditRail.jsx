import { h } from 'preact';

/**
 * Round 9 unified rail for Comprehensive Review.
 *
 * Mirrors Initial Admit's FocusList. One unified scroll containing:
 *   - Individual Add rows (sorted: AI-gap → dx → order → universal-with-AI-signal)
 *   - One grouped "💡 N standard universals" row (collapsible into per-item)
 *   - Inline Verify rows (hidden behind a "Show N to verify" fold by default)
 *   - Bottom commit button: "Stamp N focuses + M universals →"
 *
 * Selection model: `selected` is `{ kind, key }` where:
 *   - kind: 'add' | 'verify' | 'remove' | 'universals_group'
 *   - key:  add → ruleId; verify/remove → focusId; universals_group → 'universals'
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
  onUniversalsExpandInline,
  universalsExpanded,
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
  const standardUniversals = allAdds.filter(
    (it) => it.ruleId.startsWith('universal.') && it.coverageSignal === 'no_ai_data'
  );
  const standardSet = new Set(standardUniversals.map((it) => it.ruleId));
  const individualAdds = allAdds.filter((it) => !standardSet.has(it.ruleId));

  // Sort individualAdds: ai_says_missing → dx.* → order.* → universal-with-AI-signal
  const sortRank = (it) => {
    if (it.coverageSignal === 'ai_says_missing') return 0;
    if (it.ruleId.startsWith('dx.')) return 1;
    if (it.ruleId.startsWith('order.')) return 2;
    return 3;
  };
  individualAdds.sort((a, b) => sortRank(a) - sortRank(b));

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

  const totalAdds = (audit.toAdd || []).filter((it) => !skippedAddIds.has(it.ruleId)).length;
  const liveAddCount = allAdds.length;

  const isActive = (kind, key) => selected?.kind === kind && selected.key === key;

  const renderAddRow = (item) => (
    <li
      key={`add:${item.ruleId}`}
      className={`cpas-list__item ${isActive('add', item.ruleId) ? 'is-active' : ''}`}
      onClick={() => onSelect({ kind: 'add', key: item.ruleId })}
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
      </div>
    </li>
  );

  const renderVerifyRow = (item) => (
    <li
      key={`verify:${item.focusId}`}
      className={`cpas-list__item cpas-list__item--verify ${isActive('verify', item.focusId) ? 'is-active' : ''}`}
      onClick={() => onSelect({ kind: 'verify', key: item.focusId })}
    >
      <span className="cpas-list__badge cpas-list__badge--verify">?</span>
      <div className="cpas-list__body">
        <div className="cpas-list__row-top">
          <span className="cpas-list__text">{_verifyTitle(item)}</span>
        </div>
        <div className="cpas-list__preview">
          {(focusIdToCAA.get(item.focusId) || '') + ' · Partial coverage'}
        </div>
      </div>
    </li>
  );

  const renderRemoveRow = (item) => (
    <li
      key={`remove:${item.focusId}`}
      className={`cpas-list__item cpas-list__item--remove ${isActive('remove', item.focusId) ? 'is-active' : ''}`}
      onClick={() => onSelect({ kind: 'remove', key: item.focusId })}
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
        {/* Individual Add rows */}
        {individualAdds.map(renderAddRow)}

        {/* Standard-universals group OR expanded individuals */}
        {standardUniversals.length > 0 && !universalsExpanded && (
          <li
            key="universals_group"
            className={`cpas-list__item cpas-list__item--group ${isActive('universals_group', 'universals') ? 'is-active' : ''}`}
            onClick={() => onSelect({ kind: 'universals_group', key: 'universals' })}
          >
            <span className="cpas-list__badge cpas-list__badge--group">💡</span>
            <div className="cpas-list__body">
              <div className="cpas-list__row-top">
                <span className="cpas-list__text">
                  {standardUniversals.length} standard universals
                </span>
              </div>
              <div className="cpas-list__preview">
                {standardUniversals
                  .map((u) => u.ruleId.replace('universal.', ''))
                  .slice(0, 3)
                  .join(' · ')}
                {standardUniversals.length > 3 ? ` · +${standardUniversals.length - 3}` : ''}
              </div>
            </div>
          </li>
        )}
        {standardUniversals.length > 0 && universalsExpanded && standardUniversals.map(renderAddRow)}

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
          ✓ Stamp {commitCount.focuses} {commitCount.focuses === 1 ? 'focus' : 'focuses'}
          {commitCount.universals > 0 ? ` + ${commitCount.universals} universals` : ''} →
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
  // split on , or :, take head, truncate to 60
  const head = src.split(/[,:]/)[0].trim();
  return head.length > 60 ? head.slice(0, 57) + '…' : head;
}

function _verifyTitle(item) {
  const src = item?.detail || item?.reason || item?.focusText || item?.kind || 'Verify item';
  return src.length > 60 ? src.slice(0, 57) + '…' : src;
}
