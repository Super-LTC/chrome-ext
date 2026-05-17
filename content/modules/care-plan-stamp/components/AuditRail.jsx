import { h } from 'preact';
import { useState } from 'preact/hooks';

/**
 * Round 13 unified rail for Comprehensive Review.
 *
 * Adds rows are split into three collapsible sections by ruleId prefix:
 *   - "Baseline (universals)"  → universal.*
 *   - "Diagnosis-driven"       → dx.*
 *   - "Order-driven"           → order.*
 * (anything else falls into "Other".)
 *
 * If `audit.onPlan` is populated, an "On plan" block is rendered after Adds
 * with the same three categories; rows render with `−` and are clickable
 * (read-only detail pane in the modal).
 *
 * Verify is gone entirely (backend no longer ships partial coverage).
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
  selected,
  onSelect,
  onCommit,
  commitDisabled,
  commitCount,
  needsInputCount,
  stamping,
}) => {
  // Each section can be independently collapsed; default = all expanded.
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
  const toggle = (id) => setCollapsedSections((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // ---- Partition Add items ----
  const allAdds = (audit.toAdd || []).filter(
    (it) => !stampedAddIds.has(it.ruleId) && !skippedAddIds.has(it.ruleId)
  );

  // Within a bucket, AI-gap first, then alphabetical by short title.
  const sortBucket = (items) =>
    [...items].sort((a, b) => {
      const ag = a.coverageSignal === 'ai_says_missing' ? 0 : 1;
      const bg = b.coverageSignal === 'ai_says_missing' ? 0 : 1;
      if (ag !== bg) return ag - bg;
      return _shortTitle(a).localeCompare(_shortTitle(b));
    });

  const addBuckets = partition(allAdds);
  Object.keys(addBuckets).forEach((k) => { addBuckets[k] = sortBucket(addBuckets[k]); });

  const onPlanBuckets = partition(audit.onPlan || []);
  // onPlan: alphabetical by focusText
  Object.keys(onPlanBuckets).forEach((k) => {
    onPlanBuckets[k] = [...onPlanBuckets[k]].sort((a, b) =>
      (a.focusText || a.description || '').localeCompare(b.focusText || b.description || '')
    );
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
      </div>
    </li>
  );

  const renderOnPlanRow = (item) => (
    <li
      key={item._rowId}
      className={`cpas-list__item cpas-list__item--onplan ${isActiveRow(item) ? 'is-active' : ''}`}
      onClick={() => onSelect({ kind: 'on_plan', key: item._rowId })}
    >
      <span className="cpas-list__badge cpas-list__badge--onplan" title="Already on this resident's care plan">−</span>
      <div className="cpas-list__body">
        <div className="cpas-list__row-top">
          <span className="cpas-list__text">{_onPlanTitle(item)}</span>
        </div>
        <div className="cpas-list__preview">
          {(item.caa || ruleIdToCAA.get(item.ruleId) || '') + (item.caa || ruleIdToCAA.get(item.ruleId) ? ' · ' : '') + 'On plan'}
        </div>
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

  const addSectionDefs = [
    { id: 'add:universal', title: 'Baseline (universals)', items: addBuckets.universal },
    { id: 'add:dx',        title: 'Diagnosis-driven',      items: addBuckets.dx },
    { id: 'add:order',     title: 'Order-driven',          items: addBuckets.order },
    { id: 'add:other',     title: 'Other',                 items: addBuckets.other },
  ];
  const onPlanSectionDefs = [
    { id: 'on:universal',  title: 'On plan: Baseline',     items: onPlanBuckets.universal },
    { id: 'on:dx',         title: 'On plan: Diagnosis',    items: onPlanBuckets.dx },
    { id: 'on:order',      title: 'On plan: Order',        items: onPlanBuckets.order },
    { id: 'on:other',      title: 'On plan: Other',        items: onPlanBuckets.other },
  ];

  const hasOnPlan = (audit.onPlan || []).length > 0;

  return (
    <aside className="cpas-list">
      <div className="cpas-list__header">
        <div className="cpas-list__header-title">ADD</div>
        <div className="cpas-list__header-count">
          {liveAddCount} of {totalAdds}
        </div>
      </div>
      <ol className="cpas-list__items">
        {addSectionDefs.map((s) => (
          <SectionGroup
            key={s.id}
            title={s.title}
            items={s.items}
            collapsed={collapsedSections.has(s.id)}
            onToggle={() => toggle(s.id)}
            renderRow={renderAddRow}
          />
        ))}
        {/* Remove rows live in the same Add column — they're focuses being
            actively cleaned from the plan. Render after all Add sections. */}
        {liveRemoves.map(renderRemoveRow)}
      </ol>

      {hasOnPlan && (
        <ol className="cpas-list__items cpas-list__items--onplan">
          {onPlanSectionDefs.map((s) => (
            <SectionGroup
              key={s.id}
              title={s.title}
              items={s.items}
              collapsed={collapsedSections.has(s.id)}
              onToggle={() => toggle(s.id)}
              renderRow={renderOnPlanRow}
            />
          ))}
        </ol>
      )}

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

// ---------- Local components ----------

const SectionGroup = ({ title, items, collapsed, onToggle, renderRow }) => {
  if (!items || items.length === 0) return null;
  return (
    <>
      <li className="cpas-list__section-head" onClick={onToggle}>
        <span className="cpas-list__section-caret">{collapsed ? '▸' : '▾'}</span>
        <span className="cpas-list__section-title">{title}</span>
        <span className="cpas-list__section-count">{items.length}</span>
      </li>
      {!collapsed && items.map(renderRow)}
    </>
  );
};

// ---------- Helpers ----------

function partition(items) {
  const buckets = { universal: [], dx: [], order: [], other: [] };
  (items || []).forEach((it) => {
    const rid = it.ruleId || '';
    const k = rid.startsWith('universal.') ? 'universal'
            : rid.startsWith('dx.') ? 'dx'
            : rid.startsWith('order.') ? 'order'
            : 'other';
    buckets[k].push(it);
  });
  return buckets;
}

function _shortTitle(item) {
  const src = item?.focus?.description || item?.ruleId || '';
  const head = src.split(/[,:]/)[0].trim();
  return head.length > 60 ? head.slice(0, 57) + '…' : head;
}

function _onPlanTitle(item) {
  const src = item?.focusText || item?.description || item?.focus?.description || item?.ruleId || '';
  const head = src.split(/[,:]/)[0].trim();
  return head.length > 60 ? head.slice(0, 57) + '…' : head;
}
