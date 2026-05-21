/**
 * ItemDetailView — detail sub-view in PDPM Analyzer.
 * Delegates body content to shared <ItemDetail variant="full" />.
 *
 * Split-view mode: clicking "View PDF" or "View Administrations" on an
 * evidence card transitions to a sources sidebar + inline viewer,
 * mirroring ItemPopover behavior.
 */
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useItemDetail } from '../hooks/useItemDetail.js';
import { ItemDetail } from '../../../components/ItemDetail.jsx';
import { PDFViewer } from '../../../components/PDFViewer.jsx';
import { parseViewer, inferSourceType, SOURCE_LABELS } from '../../../utils/evidence-helpers.js';
import { fetchDocument } from '../../../evidence-viewers.js';

/** Check if evidence is an order/admin type */
function isOrderEvidence(ev) {
  return ev.sourceType === 'order' || ev.type === 'order' || (ev.evidenceId || '').startsWith('order-');
}

/** Get the order ID from evidence */
function getOrderId(ev) {
  const id = ev.sourceId || ev.evidenceId || '';
  return id.replace(/^order-/, '');
}

/** Check if evidence is an inline-only medication/admin record (no detail endpoint) */
function isMedicationEvidence(ev) {
  return ev.type === 'medication' || (ev.sourceId || '').startsWith('admin-');
}

/** Evidence is viewable inline if it has a recognized viewer type or is an order */
function isViewableEvidence(ev) {
  if (isMedicationEvidence(ev)) return true; // Show in sidebar with inline text
  const vt = parseViewer(ev).viewerType;
  return vt === 'document' || vt === 'clinical-note' || vt === 'therapy-document' || vt === 'order' || isOrderEvidence(ev);
}

export function ItemDetailView({ item, context, onBack, onSplitChange, onDismiss: onDismissComplete }) {
  const mdsItem = item?.mdsItem;
  const categoryKey = item?.categoryKey;
  const { data, loading, error } = useItemDetail(mdsItem, categoryKey, context);
  const displayCode = mdsItem?.startsWith('I8000:') ? 'I8000' : mdsItem;

  const apiItem = data?.item;
  const needsQuery = apiItem?.status === 'needs_physician_query';

  // Dismiss state
  const [dismissing, setDismissing] = useState(false);

  const userDecision = apiItem?.userDecision?.decision;
  const canDismiss = userDecision !== 'disagree' && userDecision !== 'agree';

  const handleDismiss = useCallback(async (reason) => {
    setDismissing(true);
    try {
      const orgResponse = getOrg();
      const orgSlug = orgResponse?.org;
      const facilityName = window.getChatFacilityInfo?.() || '';

      const apiCode = mdsItem?.includes(':') ? mdsItem.split(':')[0] : mdsItem;
      const mdsColumn = item?.column || '';

      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/mds/items/${encodeURIComponent(apiCode)}/decision`,
        options: {
          method: 'POST',
          body: JSON.stringify({
            externalAssessmentId: context?.assessmentId,
            facilityName,
            orgSlug,
            decision: 'disagree',
            note: reason || '',
            mdsColumn,
            ...(window.getMDSContextBodyFields?.() || {}),
          }),
        },
      });

      if (!response?.success) throw new Error(response?.error || 'Failed to save decision');

      // Update overlay dismissed state
      const key = `${apiCode}-${mdsColumn}`;
      if (window.SuperOverlay?.dismissedItems) {
        window.SuperOverlay.dismissedItems.add(key);
        chrome.storage.local.set({ superDismissedItems: Array.from(window.SuperOverlay.dismissedItems) });
      }

      // Notify all views to re-fetch
      window.dispatchEvent(new CustomEvent('super:item-decision', {
        detail: { mdsItem: apiCode, column: mdsColumn, decision: 'disagree' },
      }));

      window.SuperAnalytics?.track?.('mds_item_decision', {
        item_code: String(apiCode || ''),
        column: String(mdsColumn || ''),
        decision: 'disagree',
        has_reason: !!(reason && reason.length > 0),
        surface: 'pdpm_sidebar',
      });

      window.SuperToast?.success?.('Item dismissed');
      onDismissComplete?.();
    } catch (err) {
      console.error('[ItemDetailView] Dismiss failed:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'pdpm_item_dismiss',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      window.SuperToast?.error?.(err.message || 'Failed to dismiss');
      setDismissing(false);
    }
  }, [mdsItem, item, context, onDismissComplete]);

  // Split-view state
  const [viewingSource, setViewingSource] = useState(null);
  const docCacheRef = useRef(new Map());
  const [currentDoc, setCurrentDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const adminContainerRef = useRef(null);

  // Collect all evidence — include both documents and orders in sidebar
  const allEvidence = getEvidence(data);
  const viewableEvidence = allEvidence.filter(isViewableEvidence);

  const isSplit = viewingSource !== null;
  const viewingMedication = viewingSource && isMedicationEvidence(viewingSource.ev);
  const viewingOrder = viewingSource && !viewingMedication && isOrderEvidence(viewingSource.ev);
  const viewingViewerType = viewingSource ? parseViewer(viewingSource.ev).viewerType : null;
  const viewingNote = !viewingMedication && viewingViewerType === 'clinical-note';
  const viewingTherapy = !viewingMedication && viewingViewerType === 'therapy-document';
  const viewingDoc = viewingSource && !viewingOrder && !viewingNote && !viewingTherapy && !viewingMedication;
  const noteContainerRef = useRef(null);

  // Notify parent when split mode changes so it can expand
  useEffect(() => {
    onSplitChange?.(isSplit);
  }, [isSplit]);

  // Prefetch all PDF documents when evidence loads (skip notes, therapy, orders)
  const docEvidence = viewableEvidence.filter(ev => {
    if (isOrderEvidence(ev)) return false;
    const vt = parseViewer(ev).viewerType;
    return vt === 'document';
  });
  useEffect(() => {
    if (!data || docEvidence.length === 0) return;

    const prefetch = async () => {
      let params;
      try { params = await window.getCurrentParams(); } catch { return; }

      for (const ev of docEvidence) {
        const viewer = parseViewer(ev);
        if (!viewer.id || docCacheRef.current.has(viewer.id)) continue;

        const promise = fetchDocument(viewer.id, params)
          .then(result => {
            const entry = docCacheRef.current.get(viewer.id);
            if (entry) entry.document = result.document;
            return result.document;
          })
          .catch(err => {
            console.warn('[ItemDetailView] Prefetch failed for', viewer.id, err);
            return null;
          });

        docCacheRef.current.set(viewer.id, { document: null, promise });
      }
    };

    prefetch();
  }, [data]);

  // Load document when viewing a PDF source (skip notes, therapy, orders)
  useEffect(() => {
    if (!viewingSource || viewingOrder || viewingNote || viewingTherapy) {
      setCurrentDoc(null);
      setDocLoading(false);
      return;
    }

    const viewer = parseViewer(viewingSource.ev);
    if (!viewer.id) return;

    const cached = docCacheRef.current.get(viewer.id);
    if (cached?.document) {
      setCurrentDoc(cached.document);
      setDocLoading(false);
      return;
    }

    setDocLoading(true);
    const loadDoc = async () => {
      try {
        let doc;
        if (cached?.promise) {
          doc = await cached.promise;
        } else {
          const params = await window.getCurrentParams();
          const result = await fetchDocument(viewer.id, params);
          doc = result.document;
          docCacheRef.current.set(viewer.id, { document: doc, promise: Promise.resolve(doc) });
        }
        setCurrentDoc(doc);
      } catch (err) {
        console.error('[ItemDetailView] Failed to load document:', err);
        setCurrentDoc(null);
      } finally {
        setDocLoading(false);
      }
    };

    loadDoc();
  }, [viewingSource, viewingOrder]);

  // Render admin (MAR/TAR) grid when viewing an order source
  useEffect(() => {
    if (!viewingOrder || !adminContainerRef.current) return;

    const el = adminContainerRef.current;
    const orderId = getOrderId(viewingSource.ev);

    // Show loading state
    el.innerHTML = '<div class="idv__viewer-loading" style="position:static;padding:40px 0"><div class="pdpm-an__spinner"></div><span>Loading administrations...</span></div>';

    if (window.renderSplitAdministrations) {
      // Build params from context so we don't rely on URL params (may not be on MDS page)
      const resolveAndRender = async () => {
        const orgResponse = getOrg();
        const orgSlug = orgResponse?.org;
        const facilityName = window.getChatFacilityInfo?.() || '';
        const params = { assessmentId: context?.assessmentId, orgSlug, facilityName };
        await window.renderSplitAdministrations(el, orderId, undefined, params);
      };
      resolveAndRender().catch(err => {
        console.error('[ItemDetailView] Failed to load administrations:', err);
        el.innerHTML = '<div class="idv__viewer-loading" style="position:static;padding:40px 0"><span>Failed to load administrations</span></div>';
      });
    } else {
      el.innerHTML = '<div class="idv__viewer-loading" style="position:static;padding:40px 0"><span>Administration viewer not available</span></div>';
    }
  }, [viewingSource, viewingOrder]);

  // Render clinical note or therapy document via overlay renderers
  useEffect(() => {
    if ((!viewingNote && !viewingTherapy) || !noteContainerRef.current) return;

    const el = noteContainerRef.current;
    const viewer = parseViewer(viewingSource.ev);
    const quote = viewingSource.ev.quoteText || viewingSource.ev.quote || viewingSource.ev.snippet || '';

    el.innerHTML = '<div class="idv__viewer-loading" style="position:static;padding:40px 0"><div class="pdpm-an__spinner"></div><span>Loading...</span></div>';

    const resolveAndRender = async () => {
      const orgResponse = getOrg();
      const orgSlug = orgResponse?.org;
      const facilityName = window.getChatFacilityInfo?.() || '';
      const params = { assessmentId: context?.assessmentId, orgSlug, facilityName };

      if (viewingNote && window.renderSplitNote) {
        await window.renderSplitNote(el, viewer.id, params, quote || null);
      } else if (viewingTherapy && window.renderSplitTherapy) {
        await window.renderSplitTherapy(el, viewer.id, quote, params);
      } else {
        el.innerHTML = '<div class="idv__viewer-loading" style="position:static;padding:40px 0"><span>Viewer not available</span></div>';
      }
    };

    resolveAndRender().catch(err => {
      console.error('[ItemDetailView] Failed to load source:', err);
      el.innerHTML = '<div class="idv__viewer-loading" style="position:static;padding:40px 0"><span>Failed to load</span></div>';
    });
  }, [viewingSource, viewingNote, viewingTherapy]);

  const handleViewSource = useCallback((ev, index) => {
    setViewingSource({ ev, index });
  }, []);

  const handleBackFromSplit = useCallback(() => {
    setViewingSource(null);
  }, []);

  return (
    <div class={`idv${isSplit ? ' idv--split' : ''}`}>
      {/* Header with back button */}
      <div class="idv__head">
        {/* NO_TRACK: back nav inside ItemDetailView (parent already fires pdpm_item_drilled_in) */}
        <button class="idv__back" onClick={isSplit ? handleBackFromSplit : onBack} type="button">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back
        </button>
        <span class="idv__code">{displayCode}</span>
        <h2 class="idv__name">{apiItem?.description || apiItem?.kbCategory?.categoryName || item?.itemName || 'Item Detail'}</h2>
        {needsQuery && <span class="idv__badge idv__badge--amber">Needs Query</span>}
      </div>

      {loading && <div class="pdpm-an__state"><div class="pdpm-an__spinner" /><p>Loading...</p></div>}
      {error && <div class="pdpm-an__state"><p>{error}</p></div>}

      {!loading && !error && data && !isSplit && (
        <div class="idv__body">
          <ItemDetail
            variant="full"
            data={data}
            detectionItem={item}
            mdsItem={mdsItem}
            onViewSource={handleViewSource}
            onDismiss={canDismiss ? handleDismiss : undefined}
            dismissing={dismissing}
            assessmentId={context?.assessmentId}
          />
        </div>
      )}

      {!loading && !error && data && isSplit && (
        <div class="idv__split-body">
          {/* Left pane: condensed source list */}
          <div class="idv__sources">
            <div class="idv__sources-label">Sources ({viewableEvidence.length})</div>
            {viewableEvidence.map((ev, i) => {
              const isOrder = isOrderEvidence(ev);
              const sourceType = ev.sourceType || inferSourceType(ev.displayName, ev.evidenceId);
              const typeLabel = ev.displayName || SOURCE_LABELS[sourceType] || (isOrder ? 'Orders' : 'Document');
              const snippet = ev.quoteText || ev.orderDescription || ev.quote || ev.snippet || ev.text || '';
              const page = ev.wordBlocks?.[0]?.p;
              const isActive = viewingSource.ev === ev;

              return (
                <div
                  key={i}
                  class={`idv__source-card${isActive ? ' idv__source-card--active' : ''}`}
                  onClick={() => setViewingSource({ ev, index: i })}
                  role="button"
                >
                  <div class={`idv__source-badge${isOrder ? ' idv__source-badge--order' : ''}`}>{typeLabel}</div>
                  {snippet && <div class="idv__source-snippet">{snippet}</div>}
                  {!isOrder && page && <div class="idv__source-page">Page {page}</div>}
                </div>
              );
            })}
          </div>

          {/* Right pane: viewer */}
          <div class="idv__viewer">
            {/* PDF document viewer */}
            {viewingDoc && docLoading && (
              <div class="idv__viewer-loading">
                <div class="pdpm-an__spinner" />
                <span>Loading document...</span>
              </div>
            )}
            {viewingDoc && !docLoading && currentDoc && (
              <PDFViewer
                url={currentDoc.signedUrl || null}
                wordBlocks={viewingSource.ev.wordBlocks || []}
                targetPage={viewingSource.ev.wordBlocks?.[0]?.p || 1}
                title={currentDoc.title || 'Document'}
                documentType={currentDoc.documentType}
                effectiveDate={currentDoc.effectiveDate}
                fileSize={currentDoc.fileSize}
                expiresAt={true}
                openInNewTabUrl={currentDoc.signedUrl || null}
              />
            )}
            {viewingDoc && !docLoading && !currentDoc && (
              <div class="idv__viewer-loading">
                <span>Failed to load document</span>
              </div>
            )}

            {/* Order/admin viewer — rendered by vanilla renderSplitAdministrations */}
            {viewingOrder && (
              <div ref={adminContainerRef} class="idv__admin-viewer" />
            )}

            {/* Clinical note / therapy doc viewer — rendered by vanilla renderers */}
            {(viewingNote || viewingTherapy) && (
              <div ref={noteContainerRef} class="idv__note-viewer" />
            )}

            {/* Medication/admin — inline text display, no detail endpoint */}
            {viewingMedication && (
              <div class="idv__note-viewer">
                <div class="super-split__content">
                  <div class="super-split__content-header">
                    <h3 class="super-split__content-title">Administration Record</h3>
                    <span class="super-split__content-badge">Medication</span>
                  </div>
                  {viewingSource.ev.date && (
                    <div class="super-split__content-meta">{viewingSource.ev.date}</div>
                  )}
                  <div class="super-split__content-body">
                    <pre class="super-split__note-text">{viewingSource.ev.text || viewingSource.ev.quote || viewingSource.ev.quoteText || 'No details available.'}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Extract all evidence items from data */
function getEvidence(data) {
  const apiItem = data?.item;
  if (!apiItem) return [];

  const isColumnBased = !!apiItem.columns;
  if (!isColumnBased) {
    // Merge both evidence and queryEvidence — queryEvidence is used for needs_physician_query items
    return [...(apiItem.evidence || []), ...(apiItem.queryEvidence || [])];
  }

  const colEvidence = [];
  const seen = new Set();
  for (const col of Object.values(apiItem.columns || {})) {
    for (const ev of [...(col?.evidence || []), ...(col?.queryEvidence || [])]) {
      const k = ev.sourceId || ev.quote || JSON.stringify(ev);
      if (!seen.has(k)) { seen.add(k); colEvidence.push(ev); }
    }
  }
  return colEvidence;
}
