/**
 * ArdEstimator — PDPM Estimate & ARD Recommendation page.
 *
 * Shows ARD date recommendation, Gantt timeline, PDPM breakdown,
 * and lets coordinators select items to query in batch — all in one view.
 *
 * Mounted inside the ICD-10 viewer body or as a standalone overlay.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'preact/hooks';
import { useArdEstimator } from './hooks/useArdEstimator.js';
import { DayPicker } from './components/DayPicker.jsx';
import { RecommendationText } from './components/RecommendationText.jsx';
import { PdpmBreakdown, fetchItemDetail } from './components/PdpmBreakdown.jsx';
import { CollapsibleSection } from './components/CollapsibleSection.jsx';
import { useBatchQuery } from '../query-items/hooks/useBatchQuery.js';
import { BatchReviewPage } from '../query-items/components/BatchReviewModal.jsx';
import { ItemDetailView } from '../pdpm-analyzer/components/ItemDetailView.jsx';
import { track } from '../../utils/analytics.js';

// ─── Icons (inline SVGs to avoid lucide dependency) ──────────────────────────

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const WarningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

// ─── Compact item row for "Already Captured" section ─────────────────────────

function CapturedItemRow({ item }) {
  return (
    <div className="ard-est__item-row ard-est__item-row--compact">
      <span className="ard-est__item-code">{item.mdsItem}{item.mdsColumn || ''}</span>
      <span className="ard-est__item-desc">{item.description}</span>
      {item.ntaPoints > 0 && (
        <span className="ard-est__item-pts">+{item.ntaPoints} NTA</span>
      )}
      {item.nursingInfo && (
        <span className="ard-est__item-pts">{item.nursingInfo.mainCategory}</span>
      )}
    </div>
  );
}

// ─── Batch Action Bar ────────────────────────────────────────────────────────

function QueryQueue({ queueCount, batchState, progress, onClear, onGenerate }) {
  const isIdle = batchState === 'idle';
  const isGenerating = batchState === 'generating';
  const isSending = batchState === 'sending';
  const isWorking = isGenerating || isSending;

  if (queueCount === 0 && isIdle) return null;

  return (
    <div className="ard-est__query-queue">
      {isIdle && (
        <>
          <div className="ard-est__queue-left">
            <span className="ard-est__queue-badge">{queueCount}</span>
            <span className="ard-est__queue-text">
              {queueCount === 1 ? 'query' : 'queries'} ready
            </span>
            {/* NO_TRACK: clears local queue state inside ard_estimator workflow */}
            <button className="ard-est__queue-clear" onClick={onClear}>clear</button>
          </div>
          {/* NO_TRACK: enters batch review sub-flow inside ard_estimator; query_send_started fires per-item later */}
          <button className="ard-est__queue-send-btn" onClick={onGenerate}>
            <SendIcon />
            Send Queries
          </button>
        </>
      )}
      {isWorking && (
        <div className="ard-est__batch-progress">
          <div className="ard-est__batch-progress-bar">
            <div
              className="ard-est__batch-progress-fill"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="ard-est__batch-progress-text">
            {isGenerating ? 'Generating' : 'Sending'} {progress.current}/{progress.total}...
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ArdEstimator({
  patientId,
  patientName,
  facilityName,
  orgSlug,
  assessmentId,
  onBack,
  onClose
}) {
  const {
    result,
    loading,
    error,
    selectedDay,
    setSelectedDay,
    selectedScore,
    timeSensitiveItems,
    needsReviewItems,
    queryItems,
    alwaysCapturedItems,
    refetch
  } = useArdEstimator({ patientId, facilityName, orgSlug, assessmentId });

  const [showDebug, setShowDebug] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [successInfo, setSuccessInfo] = useState(null);
  const [viewingItem, setViewingItem] = useState(null); // { item } — ItemDetailView fetches its own data
  const [activeItemKey, setActiveItemKey] = useState(null);

  // Mount-only: fire ard_estimator_opened exactly once.
  useEffect(() => {
    track('ard_estimator_opened', { source: 'fab' });
  }, []);

  // Estimation timing: capture mount time, fire ard_estimator_estimated when
  // the result lands (loading false → result populated, or error). The page
  // auto-fetches on mount, so "estimate complete" = first loading→done transition.
  const estimateStartRef = useRef(Date.now());
  const estimateFiredRef = useRef(false);
  useEffect(() => {
    if (estimateFiredRef.current) return;
    if (loading) return;
    if (!result && !error) return;
    estimateFiredRef.current = true;
    track('ard_estimator_estimated', {
      duration_ms: Date.now() - estimateStartRef.current,
      has_recommendation: !!result?.recommendedDayNumber,
    });
  }, [loading, result, error]);

  // Resolved assessment ID (prop or from API response)
  const resolvedAssessmentId = assessmentId || result?.externalAssessmentId;

  // Queryable items = item_to_query without existing query
  const selectableItems = useMemo(() => {
    return (result?.classifiedItems || []).filter(
      i => i.classification === 'item_to_query' && !i.queryStatus
    );
  }, [result?.classifiedItems]);

  // Query queue helpers
  const addQuery = useCallback((mdsItem) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(mdsItem);
      return next;
    });
  }, []);

  const removeQuery = useCallback((mdsItem) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(mdsItem);
      return next;
    });
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Item selection — shows ItemDetailView which fetches its own data
  const handleSelectItem = useCallback((item) => {
    const key = item.mdsItem + (item.mdsColumn || '');
    if (activeItemKey === key) {
      setActiveItemKey(null);
      setViewingItem(null);
      return;
    }
    setActiveItemKey(key);
    setViewingItem({ item });
  }, [activeItemKey]);

  const selectedItems = useMemo(() => {
    return (result?.classifiedItems || []).filter(i => selectedIds.has(i.mdsItem));
  }, [result?.classifiedItems, selectedIds]);

  // Batch query hook
  const batch = useBatchQuery({
    patientId,
    facilityName,
    orgSlug,
    assessmentId: resolvedAssessmentId,
    onComplete: (sentQueries, practitionerName) => {
      deselectAll();
      setSuccessInfo({ count: sentQueries.length, practitionerName });
      setTimeout(() => setSuccessInfo(null), 4000);
      // Refetch to update queryStatus badges
      refetch();
    }
  });

  /**
   * Generate queries: fetch full item details for each selected item,
   * then pass to the batch query generator.
   */
  const handleGenerate = useCallback(async () => {
    // The batch hook's generate() expects items with solver data
    // (mdsItem, mdsItemName, rationale, keyFindings, evidence, etc.)
    // ARD classifiedItems don't have that — we need to fetch details first.
    const enrichedItems = [];
    for (const item of selectedItems) {
      try {
        const itemCode = item.mdsItem;
        const categoryKey = item.mdsColumn || item.categoryKey || null;
        const detail = await fetchItemDetail(itemCode, resolvedAssessmentId, facilityName, orgSlug, categoryKey);
        // API returns { item: { answer, status, evidence, ... }, diagnosisSummary, ... }
        const itemData = detail?.item || detail;
        enrichedItems.push({
          mdsItem: item.mdsItem,
          mdsItemName: item.description,
          pdpmCategoryName: item.description,
          rationale: itemData?.rationale || itemData?.queryReason || detail?.diagnosisSummary || '',
          keyFindings: itemData?.keyFindings || [],
          evidence: itemData?.evidence || [],
          queryEvidence: itemData?.queryEvidence || itemData?.evidence || [],
          recommendedIcd10: itemData?.recommendedIcd10 || [],
          ...itemData
        });
      } catch (err) {
        console.error(`[ArdEstimator] Failed to fetch detail for ${item.mdsItem}:`, err);
        // Still include with minimal data so batch can try to generate a note
        enrichedItems.push({
          mdsItem: item.mdsItem,
          mdsItemName: item.description,
          pdpmCategoryName: item.description,
          rationale: item.queryPdpmImpact || '',
          keyFindings: [],
          evidence: [],
          queryEvidence: []
        });
      }
    }
    batch.generate(enrichedItems);
  }, [selectedItems, resolvedAssessmentId, facilityName, orgSlug, batch]);

  // Gantt items = time-sensitive + needs_review
  const ganttItems = [...timeSensitiveItems, ...needsReviewItems];

  // ── Header (shared across all states) ──
  const header = (
    <div className="ard-est__header">
      <div className="ard-est__header-left">
        {onBack && batch.state === 'idle' && (
          /* NO_TRACK: back nav out of ard_estimator */
          <button className="ard-est__back-btn" onClick={onBack} title="Back">
            <BackIcon />
          </button>
        )}
        {batch.state === 'reviewing' && (
          /* NO_TRACK: back nav inside ard_estimator batch-review sub-flow */
          <button className="ard-est__back-btn" onClick={batch.backToSelection} title="Back to estimate">
            <BackIcon />
          </button>
        )}
        <div>
          <h2 className="ard-est__title">
            <CalendarIcon />
            {batch.state === 'reviewing' ? 'Review & Send Queries' : 'PDPM Estimate & ARD Recommendation'}
          </h2>
          <p className="ard-est__subtitle">
            {batch.state === 'reviewing'
              ? `${batch.generatedQueries.length} queries ready to send`
              : loading ? 'Loading...' : `5-Day PPS · Admitted ${result?.admissionDate || '\u2014'}`
            }
          </p>
        </div>
      </div>

      {selectedScore && batch.state === 'idle' && (
        <div className="ard-est__header-right">
          <div className="ard-est__header-stat">
            <span className="ard-est__header-stat-label">HIPPS</span>
            <span className="ard-est__header-stat-value ard-est__header-stat-value--hipps">
              {selectedScore.hippsCode}
            </span>
          </div>
          <div className="ard-est__header-stat">
            <span className="ard-est__header-stat-label">Est.</span>
            <span className="ard-est__header-stat-value">
              ${selectedScore.estimatedPpd?.toFixed(0) || '\u2014'}
              <span className="ard-est__header-stat-unit">/day</span>
            </span>
            {result?.potentialPpd != null && Math.abs(result.potentialPpd - (selectedScore.estimatedPpd || 0)) > 0.5 && (
              <span className="ard-est__header-potential">
                potential ${result.potentialPpd.toFixed(0)}/day
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ── Loading ──
  if (loading) {
    return (
      <div className="ard-est">
        {header}
        <div className="ard-est__loading">
          <div className="ard-est__spinner" />
          <p className="ard-est__loading-text">Calculating optimal ARD...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="ard-est">
        {header}
        <div className="ard-est__error">
          <WarningIcon />
          <p className="ard-est__error-text">{error}</p>
          {/* NO_TRACK: error-state retry inside ard_estimator */}
          <button className="ard-est__error-retry" onClick={refetch}>Retry</button>
        </div>
      </div>
    );
  }

  // ── Batch Review Phase ──
  if (batch.state === 'reviewing' || batch.state === 'sending') {
    return (
      <div className="ard-est">
        {header}
        <div className="ard-est__body">
          <BatchReviewPage
            generatedQueries={batch.generatedQueries}
            practitioners={batch.practitioners}
            selectedPractitionerId={batch.selectedPractitionerId}
            onSelectPractitioner={batch.setSelectedPractitionerId}
            onUpdateNote={batch.updateNote}
            onUpdateIcd10={batch.updateIcd10}
            onSend={batch.sendAll}
            onBack={batch.backToSelection}
            isSending={batch.state === 'sending'}
            progress={batch.progress}
          />
        </div>
      </div>
    );
  }

  // ── Evidence Detail View (full-screen segue using ItemDetailView) ──
  if (viewingItem) {
    // Build context for ItemDetailView (same shape as PDPM Analyzer context)
    const detailContext = {
      assessmentId: resolvedAssessmentId,
      scope: 'mds'
    };

    return (
      <div className="ard-est ard-est--detail-view">
        <ItemDetailView
          item={{
            mdsItem: viewingItem.item.mdsItem,
            itemName: viewingItem.item.description,
            column: viewingItem.item.mdsColumn || '',
            categoryKey: viewingItem.item.mdsColumn || viewingItem.item.categoryKey || null,
          }}
          context={detailContext}
          onBack={() => { setViewingItem(null); setActiveItemKey(null); }}
          onDismiss={() => { setViewingItem(null); setActiveItemKey(null); }}
        />
      </div>
    );
  }

  // ── Main PDPM Estimate View ──
  return (
    <div className="ard-est">
      {header}

      {/* Success toast */}
      {successInfo && (
        <div className="ard-est__success-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {successInfo.count} quer{successInfo.count === 1 ? 'y' : 'ies'} sent to {successInfo.practitionerName}
        </div>
      )}

      {/* Body */}
      <div className="ard-est__body">
        {/* Day Picker + Gantt */}
        <DayPicker
          scores={result?.scores || []}
          selectedDay={selectedDay}
          recommendedDay={result?.recommendedDayNumber}
          onSelectDay={setSelectedDay}
          ganttItems={ganttItems}
        />

        {/* Recommendation text */}
        <RecommendationText
          result={result}
          selectedDay={selectedDay}
          timeSensitiveItems={timeSensitiveItems}
          needsReviewItems={needsReviewItems}
        />

        {/* No solver data — show scores + info message */}
        {(result?.classifiedItems || []).length === 0 && result?.sectionsMissing?.length > 0 && (
          <div className="ard-est__no-data">
            <div className="ard-est__no-data-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h4 className="ard-est__no-data-title">AI Analysis Not Run Yet</h4>
            <p className="ard-est__no-data-text">
              The PDPM score above is based on the current MDS coding.
              Run the AI solver on Sections {result.sectionsMissing.join(', ')} to get
              item-level recommendations, ARD optimization, and query suggestions.
            </p>
          </div>
        )}

        {/* PDPM Breakdown */}
        {(result?.classifiedItems || []).length > 0 && (
          <PdpmBreakdown
            score={selectedScore}
            allItems={result?.classifiedItems || []}
            activeItem={activeItemKey}
            onSelectItem={handleSelectItem}
            onAddQuery={addQuery}
            selectedIds={selectedIds}
            potentialNtaPoints={result?.potentialNtaPoints}
            potentialPpd={result?.potentialPpd}
          />
        )}

        {/* Already Captured */}
        {alwaysCapturedItems.length > 0 && (
          <CollapsibleSection
            title="Already Captured (PDPM items)"
            count={alwaysCapturedItems.length}
            defaultOpen={false}
          >
            {alwaysCapturedItems.map((item, idx) => (
              <CapturedItemRow key={`cap-${item.mdsItem}-${idx}`} item={item} />
            ))}
          </CollapsibleSection>
        )}

        {/* Missing sections warning */}
        {(result?.classifiedItems || []).length > 0 && result?.sectionsMissing?.length > 0 && (
          <div className="ard-est__warning">
            <WarningIcon />
            <span>
              Missing solver data for Section{result.sectionsMissing.length > 1 ? 's' : ''}{' '}
              {result.sectionsMissing.join(', ')}. Run those solvers for a more complete recommendation.
            </span>
          </div>
        )}
      </div>

      {/* Query queue bar */}
      <QueryQueue
        queueCount={selectedIds.size}
        batchState={batch.state}
        progress={batch.progress}
        onClear={deselectAll}
        onGenerate={handleGenerate}
      />
    </div>
  );
}
