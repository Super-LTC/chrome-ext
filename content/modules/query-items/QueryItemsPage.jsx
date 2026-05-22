import { useState, useCallback, useEffect, useMemo } from 'preact/hooks';
import { useQueryItems } from './hooks/useQueryItems.js';
import { useBatchSelection } from './hooks/useBatchSelection.js';
import { useBatchQuery } from './hooks/useBatchQuery.js';
import { QueryItemsHeader } from './components/QueryItemsHeader.jsx';
import { ItemSidebar } from './components/ItemSidebar.jsx';
import { EvidenceDetailPanel } from './components/EvidenceDetailPanel.jsx';
import { BatchActionBar } from './components/BatchActionBar.jsx';
import { BatchReviewPage } from './components/BatchReviewModal.jsx';
import { track } from '../../utils/analytics.js';

/**
 * Root component for the Query Items page — split layout.
 *
 * Left:  Compact item sidebar (grouped by status, checkboxes)
 * Right: Evidence detail panel for the selected item
 * Bottom: Batch action bar
 */
export const QueryItemsPage = ({
  patientId,
  patientName,
  facilityName,
  orgSlug,
  assessmentId,
  onBack,
  onClose
}) => {
  const [dismissedItems, setDismissedItems] = useState(new Set());
  const [activeItem, setActiveItem] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  // Fire page-open event once on mount
  useEffect(() => {
    track('query_items_opened', { source: 'fab' });
  }, []);

  // Data fetching
  const {
    items,
    setItems,
    assessment,
    summary,
    pdpmData,
    loading,
    error,
    retry
  } = useQueryItems({ patientId, facilityName, orgSlug, assessmentId });

  // Batch selection
  const {
    selectedCount,
    selectedItems,
    selectableCount,
    toggle,
    selectAllQueryable,
    deselectAll,
    isSelected
  } = useBatchSelection(items, dismissedItems);

  // Batch query workflow
  const batch = useBatchQuery({
    patientId,
    facilityName,
    orgSlug,
    assessmentId,
    onComplete: (sentQueries, practitionerName) => {
      const sentMdsItems = new Set(sentQueries.map(q => q.mdsItem));
      setItems(prev => prev.map(item => {
        if (sentMdsItems.has(item.mdsItem)) {
          return {
            ...item,
            existingQuery: { status: 'sent', sentAt: new Date().toISOString() }
          };
        }
        return item;
      }));
      deselectAll();
      setSuccessInfo({ count: sentQueries.length, practitionerName });
      setTimeout(() => setSuccessInfo(null), 3000);
    }
  });

  // Auto-select first item when data loads
  useEffect(() => {
    if (!loading && items.length > 0 && !activeItem) {
      // Select the first query-recommended item, or first item
      const firstQuery = items.find(i => i.solverStatus === 'needs_physician_query');
      setActiveItem(firstQuery ? firstQuery.mdsItem : items[0].mdsItem);
    }
  }, [loading, items]);

  // Get the active item object
  const activeItemData = useMemo(() => {
    if (!activeItem) return null;
    return items.find(i => i.mdsItem === activeItem) || null;
  }, [activeItem, items]);

  const handleGenerate = useCallback(() => {
    batch.generate(selectedItems);
  }, [batch, selectedItems]);

  // Loading state
  if (loading) {
    return (
      <div className="query-items">
        <div className="query-items__skeleton">
          <div className="query-items__skeleton-header" />
          <div className="query-items__skeleton-card" />
          <div className="query-items__skeleton-card" />
          <div className="query-items__skeleton-card" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="query-items">
        <div className="query-items__error">
          <div className="query-items__error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="query-items__error-text">{error}</p>
          {/* NO_TRACK */}
          <button className="query-items__error-retry" onClick={retry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="query-items">
        <div className="query-items__empty">
          <div className="query-items__empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="2" />
              <path d="M9 14l2 2 4-4" />
            </svg>
          </div>
          <div className="query-items__empty-title">No Queryable Items</div>
          <p className="query-items__empty-text">
            All MDS items are either properly coded or don't require physician queries at this time.
          </p>
        </div>
      </div>
    );
  }

  const isReviewing = batch.state === 'reviewing' || batch.state === 'sending';

  return (
    <div className="query-items" style={{ position: 'relative' }}>
      {isReviewing ? (
        /* ── Review & Send page ── */
        <BatchReviewPage
          generatedQueries={batch.generatedQueries}
          practitioners={batch.practitioners}
          selectedPractitionerId={batch.selectedPractitionerId}
          onSelectPractitioner={batch.setSelectedPractitionerId}
          onUpdateNote={batch.updateNote}
          onUpdateIcd10={batch.updateIcd10}
          onSend={batch.sendAll}
          onPrint={batch.printAll}
          onBack={batch.backToSelection}
          isSending={batch.state === 'sending'}
          progress={batch.progress}
        />
      ) : (
        /* ── Selection page (split layout) ── */
        <>
          <QueryItemsHeader
            assessment={assessment}
            summary={summary}
            pdpmData={pdpmData}
          />

          <div className="query-items__split">
            <ItemSidebar
              items={items}
              activeItem={activeItem}
              onSelect={setActiveItem}
              isChecked={isSelected}
              onToggleCheck={toggle}
              dismissedItems={dismissedItems}
            />
            <EvidenceDetailPanel item={activeItemData} />
          </div>

          {/* Batch error banner */}
          {batch.error && (
            <div className="query-items__batch-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{batch.error}</span>
              {/* NO_TRACK */}
              <button onClick={batch.reset} className="query-items__batch-error-dismiss">&times;</button>
            </div>
          )}

          <BatchActionBar
            selectedCount={selectedCount}
            selectableCount={selectableCount}
            batchState={batch.state}
            progress={batch.progress}
            onSelectAll={selectAllQueryable}
            onDeselectAll={deselectAll}
            onGenerate={handleGenerate}
          />

          {/* Generating overlay */}
          {batch.state === 'generating' && (
            <div className="query-items__generating-overlay">
              <div className="query-items__generating-spinner" />
              <div className="query-items__generating-title">Generating Queries...</div>
              <div className="query-items__generating-progress-text">
                {batch.progress.current + 1} of {batch.progress.total}
              </div>
              <div className="query-items__generating-bar">
                <div
                  className="query-items__generating-bar-fill"
                  style={{ width: `${((batch.progress.current + 1) / batch.progress.total) * 100}%` }}
                />
              </div>
              {batch.progress.currentItemName && (
                <div className="query-items__generating-item-name">
                  {batch.progress.currentItemName}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Success overlay */}
      {successInfo && (
        <div className="query-items__success-overlay">
          <div className="query-items__success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="query-items__success-text">
            {successInfo.count} {successInfo.count === 1 ? 'Query' : 'Queries'} Sent
          </div>
          <div className="query-items__success-subtitle">
            to {successInfo.practitionerName}
          </div>
        </div>
      )}
    </div>
  );
};
