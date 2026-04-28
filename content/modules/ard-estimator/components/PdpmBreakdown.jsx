/**
 * PdpmBreakdown — PDPM component cards with clickable item rows.
 *
 * - "possible" label for needs_review items
 * - Dismissed items shown with strikethrough + "dismissed" badge
 * - NTA progress bar with potential ghost fill
 * - "Add Query" button on queryable items
 */
import { NtaProgressBar } from './NtaProgressBar.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function fetchItemDetail(itemCode, assessmentId, facilityName, orgSlug, categoryKey) {
  const params = new URLSearchParams({ facilityName, orgSlug });
  if (assessmentId) params.set('externalAssessmentId', assessmentId);
  // I8000 (and similar bucket items) require categoryKey to disambiguate
  // multiple sub-items that share the same MDS code (e.g. NTA:18 vs NTA:26).
  if (categoryKey) params.set('categoryKey', categoryKey);

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: `/api/extension/mds/items/${encodeURIComponent(itemCode)}?${params}`
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to fetch item details');
  }
  return response.data;
}

// ─── Item Row ────────────────────────────────────────────────────────────────

function formatMdsCode(item) {
  const col = item.mdsColumn;
  if (!col) return item.mdsItem;
  // Simple 1-2 char column (e.g. "3", "A", "B2") concatenates naturally.
  if (/^[A-Za-z0-9]{1,2}$/.test(col)) return `${item.mdsItem}${col}`;
  // Anything more complex (e.g. "NTA:26") gets bracketed for readability.
  return `${item.mdsItem}[${col}]`;
}

function displayDescription(item) {
  const desc = item.description || '';
  // Backend sometimes sends `"I8000[NTA:26]"` as the description (a code repeat,
  // not a real label). Fall back to a human-readable name when we can.
  const looksLikeCodeRepeat =
    desc === item.mdsItem ||
    desc === `${item.mdsItem}[${item.mdsColumn || ''}]` ||
    desc === `${item.mdsItem}${item.mdsColumn || ''}`;
  if (looksLikeCodeRepeat) {
    return item.ntaCategoryName || item.nursingInfo?.label || desc || '';
  }
  return desc;
}

function ItemRow({ item, componentLabel, isActive, onSelect, onAddQuery, isQueued }) {
  const isDismissed = item.userDecision?.decision === 'disagree';
  const isReview = item.solverAnswer === 'needs_review' || item.classification === 'needs_review';
  const isQuery = item.classification === 'item_to_query' && !item.queryStatus;
  const hasQuery = !!item.queryStatus;
  const isCoded = !isReview && !isQuery && !hasQuery;

  return (
    <div
      className={`ard-est__item-row${isActive ? ' ard-est__item-row--active' : ''}${isDismissed ? ' ard-est__item-row--dismissed' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={e => e.key === 'Enter' && onSelect(item)}
    >
      {/* MDS code */}
      <span className="ard-est__item-code">{formatMdsCode(item)}</span>

      {/* Description */}
      <span className="ard-est__item-desc">{displayDescription(item)}</span>

      {/* NTA points */}
      {item.ntaPoints > 0 && componentLabel === 'NTA' && (
        <span className="ard-est__item-pts">+{item.ntaPoints}</span>
      )}

      {/* Status / Action */}
      {isDismissed && (
        <span className="ard-est__status ard-est__status--dismissed">dismissed</span>
      )}
      {!isDismissed && hasQuery && (
        <span className={`ard-est__status ard-est__status--${item.queryStatus}`}>
          {item.queryStatus}
        </span>
      )}
      {!isDismissed && !hasQuery && isQuery && !isQueued && (
        <button
          className="ard-est__add-query-btn"
          onClick={e => { e.stopPropagation(); onAddQuery(item.mdsItem); }}
        >+ Add Query</button>
      )}
      {!isDismissed && !hasQuery && isQuery && isQueued && (
        <span className="ard-est__status ard-est__status--queued">queued</span>
      )}
      {!isDismissed && !hasQuery && isReview && (
        <span className="ard-est__status ard-est__status--review">possible</span>
      )}
      {!isDismissed && isCoded && (
        <span className="ard-est__status ard-est__status--coded">coded</span>
      )}

      {/* Arrow indicator */}
      <svg className="ard-est__item-arrow" width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

// ─── Component Card ──────────────────────────────────────────────────────────

const COLOR_MAP = { emerald: 'positive', blue: 'info', amber: 'warning', slate: 'neutral' };

function getComponentColor(label, score) {
  if (label === 'Nursing') {
    const cat = score.nursingMainCategory;
    return cat === 'ES' ? 'emerald' : cat === 'SCH' ? 'blue' : 'amber';
  }
  if (label === 'NTA') {
    return score.ntaPoints >= 12 ? 'emerald' : score.ntaPoints >= 6 ? 'blue' : 'amber';
  }
  return 'slate';
}

function ComponentCard({ label, value, sub, items, color, activeItem, onSelect, onAddQuery, selectedIds, ntaBar }) {
  const variant = COLOR_MAP[color] || 'neutral';

  return (
    <div className={`ard-est__comp-card ard-est__comp-card--${variant}`}>
      <div className="ard-est__comp-header">
        <div className="ard-est__comp-header-left">
          <span className="ard-est__comp-value">{value}</span>
          <span className="ard-est__comp-label">{label}</span>
          <span className="ard-est__comp-sub">({sub})</span>
        </div>
        {items.length > 0 && (
          <span className="ard-est__comp-count">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {/* NTA progress bar — between header and items */}
      {ntaBar}
      {items.length > 0 && (
        <div className="ard-est__comp-items">
          {items.map((item, idx) => (
            <ItemRow
              key={`${label}-${item.mdsItem}-${idx}`}
              item={item}
              componentLabel={label}
              isActive={activeItem === item.mdsItem + (item.mdsColumn || '')}
              onSelect={onSelect}
              onAddQuery={onAddQuery}
              isQueued={selectedIds?.has(item.mdsItem)}
            />
          ))}
        </div>
      )}
      {items.length === 0 && (
        <div className="ard-est__comp-empty">No detected items</div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function PdpmBreakdown({ score, allItems, activeItem, onSelectItem, onAddQuery, selectedIds, potentialNtaPoints, potentialPpd }) {
  if (!score) return null;

  const nursingItems = allItems.filter(i => i.pdpmComponents?.includes('nursing') || i.nursingInfo);
  const ntaItems = allItems.filter(i => i.pdpmComponents?.includes('nta') || (i.ntaPoints && i.ntaPoints > 0));
  const slpItems = allItems.filter(i => i.pdpmComponents?.includes('slp'));
  const ptotItems = allItems.filter(i => i.pdpmComponents?.includes('ptot'));

  // Potential ceiling display
  const hasPotential = potentialPpd != null && Math.abs(potentialPpd - (score.estimatedPpd || 0)) > 0.5;
  const ppdDelta = hasPotential ? potentialPpd - (score.estimatedPpd || 0) : 0;

  const components = [
    { label: 'Nursing', value: score.nursingMainCategory, sub: score.nursingPaymentGroup, items: nursingItems },
    {
      label: 'NTA', value: score.ntaLevel, sub: `${score.ntaPoints} pts`, items: ntaItems,
      ntaBar: <NtaProgressBar currentPoints={score.ntaPoints} potentialPoints={potentialNtaPoints} />
    },
    { label: 'SLP', value: score.slpGroup, sub: 'Speech', items: slpItems },
    { label: 'PT/OT', value: score.ptotGroup, sub: 'Therapy', items: ptotItems },
  ];

  return (
    <div className="ard-est__breakdown">
      <div className="ard-est__breakdown-header">
        <h3 className="ard-est__section-label">PDPM Breakdown</h3>
        <div className="ard-est__breakdown-ppd">
          <span className="ard-est__breakdown-ppd-label">Est.</span>
          <span className="ard-est__breakdown-ppd-value">
            {score.estimatedPpd ? `$${score.estimatedPpd.toFixed(0)}` : '\u2014'}
          </span>
          <span className="ard-est__breakdown-ppd-unit">/day</span>
          {hasPotential && (
            <span className="ard-est__breakdown-potential">
              {'\u2192'} ${potentialPpd.toFixed(0)} (+${ppdDelta.toFixed(0)})
            </span>
          )}
        </div>
      </div>

      <div className="ard-est__breakdown-cards">
        {components.map(comp => (
          <ComponentCard
            key={comp.label}
            {...comp}
            color={getComponentColor(comp.label, score)}
            activeItem={activeItem}
            onSelect={onSelectItem}
            onAddQuery={onAddQuery}
            selectedIds={selectedIds}
          />
        ))}
      </div>
    </div>
  );
}
