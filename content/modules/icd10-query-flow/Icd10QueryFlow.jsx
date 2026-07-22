/**
 * Icd10QueryFlow — single-item query create flow launched from the
 * ICD-10 evidence panel's "Query" button.
 *
 * Reuses the multi-item `useBatchQuery` hook + `BatchReviewPage` UI by
 * passing a one-element batch built from the v2 detail annotations the
 * evidence panel already loaded.
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useBatchQuery } from '../query-items/hooks/useBatchQuery.js';
import { BatchReviewPage } from '../query-items/components/BatchReviewModal.jsx';

/**
 * Build a solverResult-shaped item the backend understands.
 *
 * mdsItem precedence (matches backend's POST /diagnosis-queries logic):
 *   1. dx.mdsItemCode (real Section-I slot, e.g. "I2900"; backend now also
 *      supplies the direct "I8000:<code>" form here for any other code)
 *   2. `I8000:${pdpmCategory}:${pdpmCategoryNumber}` when both present
 *      (e.g. "I8000:NTA:6") — the canonical I8000 fallback shape
 *   3. legacy `I8000:${pdpmCategory}:${baseCode}` (e.g. "I8000:NTA:E11")
 *      kept only as a final back-compat fallback for older API responses
 *      that pre-date the pdpmCategoryNumber field. Backend may reject
 *      this shape; caller is expected to send anyway and let backend
 *      respond authoritatively (no FE pre-bail).
 */
function buildSolverItem({ baseCode, description, groupContext, items }) {
  const mdsItemCode = groupContext?.mdsItemCode || null;
  const pdpmCategory = groupContext?.pdpmCategory || null;
  const pdpmCategoryName = groupContext?.pdpmCategoryName || null;
  const pdpmCategoryNumber = groupContext?.pdpmCategoryNumber ?? null;
  const pdpmPoints = groupContext?.pdpmPoints;

  let mdsItem = mdsItemCode;
  if (!mdsItem) {
    if (pdpmCategory && pdpmCategoryNumber != null) {
      // Canonical I8000 fallback — matches backend convention exactly.
      mdsItem = `I8000:${pdpmCategory}:${pdpmCategoryNumber}`;
    } else if (pdpmCategory === 'NTA' || pdpmCategory === 'SLP') {
      // Legacy back-compat: older API responses without pdpmCategoryNumber.
      mdsItem = `I8000:${pdpmCategory}:${baseCode}`;
    } else {
      // No MDS handle, no PDPM signal — backend will likely 400, but FE
      // sends anyway. Surfaces backend's authoritative rejection in the UI.
      mdsItem = `I8000:${baseCode}`;
    }
  }

  // Sort by confidence desc so the prompt sees the strongest evidence first
  // (backend slices to top 8 in the prompt).
  const sortedItems = [...(items || [])].sort(
    (a, b) => (b.confidence || 0) - (a.confidence || 0)
  );

  const evidence = sortedItems.map(a => ({
    quoteText: a.evidenceExcerpt || a.quoteText || '',
    displayName: a.documentTitle || a.documentName || 'Document',
    date: a.documentEffectiveDate || a.documentDate || '',
    sourceId: a.documentId || null,
    pageNumber: a.pageNumber,
    confidence: a.confidence,
  }));

  // Recommended ICD-10 codes, deduped.
  const seenCodes = new Set();
  const recommendedIcd10 = [];
  for (const a of sortedItems) {
    const code = a.icd10Code;
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    recommendedIcd10.push({ code, description: a.description || '' });
    // Also pull from options[] so alt codes the model considered are visible.
    for (const opt of a.options || []) {
      if (opt.code && !seenCodes.has(opt.code)) {
        seenCodes.add(opt.code);
        recommendedIcd10.push({ code: opt.code, description: opt.description || '' });
      }
    }
  }

  return {
    mdsItem,
    // Source ICD-10 code from the diagnosis row the user clicked. Backend
    // uses this to default `preferredIcd10` to the user's actual chart code
    // instead of letting the model pick alphabetically when evidence is thin.
    icd10Code: baseCode,
    mdsItemName: pdpmCategoryName || description || baseCode,
    pdpmCategoryName,
    pdpmCategory,
    pdpmPoints,
    rationale: groupContext?.rationale || '',
    keyFindings: [],
    evidence,
    queryEvidence: evidence,
    recommendedIcd10,
  };
}

export function Icd10QueryFlow({
  baseCode,
  description,
  groupContext,
  items,
  patientId,
  facilityName,
  orgSlug,
  assessmentId,
  ardDate,
  onClose,
  onComplete,
}) {
  const solverItem = useMemo(
    () => buildSolverItem({ baseCode, description, groupContext, items }),
    [baseCode, description, groupContext, items]
  );

  const batch = useBatchQuery({
    patientId,
    facilityName,
    orgSlug,
    assessmentId,
    // Best-effort: the evidence panel may pass an ARD via groupContext. Absent →
    // no window nudge, picker still works.
    ardDate: ardDate || groupContext?.ardDate,
    onComplete: (sentQueries, practitionerName) => {
      if (onComplete) onComplete(sentQueries, practitionerName);
      // Auto-close shortly after success so the toast/banner is the
      // remaining surface — same pattern QueryItemsPage uses.
      setTimeout(() => onClose && onClose(), 1200);
    },
  });

  // Auto-fire generation once on mount.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    batch.generate([solverItem]);
  }, [batch, solverItem]);

  // Generating / loading shell
  if (batch.state === 'idle' || batch.state === 'generating') {
    const label = solverItem.pdpmCategoryName || solverItem.mdsItemName || baseCode;
    return (
      <div className="icd10-query-flow__overlay">
        <div className="icd10-query-flow__sheet icd10-query-flow__sheet--loading">
          <div className="icd10-query-flow__spinner" />
          <div className="icd10-query-flow__loading-title">Generating physician query…</div>
          <div className="icd10-query-flow__loading-sub">{label}</div>
          {batch.error && (
            <div className="icd10-query-flow__error">{batch.error}</div>
          )}
          {/* NO_TRACK: pre-creation cancel, nothing to track */}
          <button className="icd10-query-flow__cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    );
  }

  // Reviewing / sending — full BatchReviewPage in a sheet
  if (batch.state === 'reviewing' || batch.state === 'sending') {
    return (
      <div className="icd10-query-flow__overlay">
        <div className="icd10-query-flow__sheet">
          <div className="icd10-query-flow__sheet-header">
            <span className="icd10-query-flow__sheet-title">
              Send query for {baseCode}{description ? ` · ${description}` : ''}
            </span>
            {/* NO_TRACK: close-X */}
            <button className="icd10-query-flow__sheet-close" onClick={onClose} aria-label="Close">{'✕'}</button>
          </div>
          <div className="icd10-query-flow__sheet-body">
            <BatchReviewPage
              generatedQueries={batch.generatedQueries}
              practitioners={batch.practitioners}
              selectedPractitionerId={batch.selectedPractitionerId}
              onSelectPractitioner={batch.setSelectedPractitionerId}
              onUpdateNote={batch.updateNote}
              onUpdateIcd10={batch.updateIcd10}
              onUpdateEffectiveDate={batch.updateEffectiveDate}
              onSend={batch.sendAll}
              onPrint={batch.printAll}
              onBack={onClose}
              isSending={batch.state === 'sending'}
              progress={batch.progress}
            />
          </div>
        </div>
      </div>
    );
  }

  // 'complete' or anything else — let parent unmount via onComplete timeout.
  return null;
}
