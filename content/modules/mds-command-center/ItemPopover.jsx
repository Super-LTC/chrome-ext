/**
 * ItemPopover — backdrop wrapper for item detail in MDS Command Center.
 * Delegates body content to shared <ItemDetail variant="compact" />.
 *
 * Split-view mode: when a coder clicks "View Source" on an evidence card,
 * the popover widens into a split layout — condensed source sidebar on the left,
 * inline viewer on the right (PDF, administrations, notes, therapy docs).
 * "Back" returns to the summary.
 */
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useItemDetail } from '../pdpm-analyzer/hooks/useItemDetail.js';
import { ItemDetail } from '../../components/ItemDetail.jsx';
import { PDFViewer } from '../../components/PDFViewer.jsx';
import { parseViewer, inferSourceType, SOURCE_LABELS } from '../../utils/evidence-helpers.js';
import { fetchDocument } from '../../evidence-viewers.js';

/** Check if evidence is an order/administration type */
function isOrderEvidence(ev) {
  return ev.sourceType === 'order' || (ev.evidenceId || '').startsWith('order-');
}

/** Extract order ID from evidence object */
function getOrderId(ev) {
  const id = ev.sourceId || ev.evidenceId || '';
  return id.replace(/^order-/, '');
}

/** Evidence is viewable inline if it has a recognized viewer type or is an order */
function isViewableEvidence(ev) {
  const vt = parseViewer(ev).viewerType;
  return vt === 'document' || vt === 'clinical-note' || vt === 'therapy-document' || isOrderEvidence(ev);
}

export function ItemPopover({ item, context, onClose, onAgree, onDismiss, dismissing }) {
  const mdsItem = item?.mdsItem;
  const categoryKey = item?.categoryKey;
  const { data, loading, error } = useItemDetail(mdsItem, categoryKey, context);
  const displayCode = mdsItem?.startsWith('I8000:') ? 'I8000' : mdsItem;

  // Split-view state: null = summary mode, { ev, index } = viewing a source
  const [viewingSource, setViewingSource] = useState(null);

  // Cache for prefetched documents: Map<documentId, { document, promise }>
  const docCacheRef = useRef(new Map());

  // Refs for vanilla-rendered viewers (orders, notes, therapy)
  const adminContainerRef = useRef(null);
  const noteContainerRef = useRef(null);

  // Collect all viewable evidence items (documents, orders, notes, therapy)
  const allEvidence = getEvidence(data);
  const viewableEvidence = allEvidence.filter(isViewableEvidence);

  // Determine what type of source we're viewing
  const viewingOrder = viewingSource && isOrderEvidence(viewingSource.ev);
  const viewingViewerType = viewingSource ? parseViewer(viewingSource.ev).viewerType : null;
  const viewingNote = viewingViewerType === 'clinical-note';
  const viewingTherapy = viewingViewerType === 'therapy-document';
  const viewingUda = viewingViewerType === 'uda';
  const viewingDoc = viewingSource && !viewingOrder && !viewingNote && !viewingTherapy && !viewingUda;

  // Prefetch PDF documents only (skip orders, notes, therapy)
  const docEvidence = viewableEvidence.filter(ev => {
    if (isOrderEvidence(ev)) return false;
    return parseViewer(ev).viewerType === 'document';
  });

  useEffect(() => {
    if (!data || docEvidence.length === 0) return;

    const prefetch = async () => {
      let params;
      try {
        params = await window.getCurrentParams();
      } catch { return; }

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
            console.warn('[ItemPopover] Prefetch failed for', viewer.id, err);
            return null;
          });

        docCacheRef.current.set(viewer.id, { document: null, promise });
      }
    };

    prefetch();
  }, [data]);

  // Get cached document data for current source (PDF only)
  const [currentDoc, setCurrentDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);

  useEffect(() => {
    if (!viewingSource || viewingOrder || viewingNote || viewingTherapy || viewingUda) {
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

    // Still loading from prefetch, or not fetched yet
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
        console.error('[ItemPopover] Failed to load document:', err);
        setCurrentDoc(null);
      } finally {
        setDocLoading(false);
      }
    };

    loadDoc();
  }, [viewingSource, viewingOrder, viewingNote, viewingTherapy, viewingUda]);

  // Render admin (MAR/TAR) grid when viewing an order source
  useEffect(() => {
    if (!viewingOrder || !adminContainerRef.current) return;

    const el = adminContainerRef.current;
    const orderId = getOrderId(viewingSource.ev);

    el.innerHTML = '<div class="cc-pop__viewer-loading"><div class="mds-cc__spinner mds-cc__spinner--sm"></div><span>Loading administrations...</span></div>';

    if (window.renderSplitAdministrations) {
      const resolveAndRender = async () => {
        const orgResponse = getOrg();
        const orgSlug = orgResponse?.org;
        const facilityName = window.getChatFacilityInfo?.() || '';
        const params = { assessmentId: context?.assessmentId, orgSlug, facilityName };
        await window.renderSplitAdministrations(el, orderId, undefined, params);
      };
      resolveAndRender().catch(err => {
        console.error('[ItemPopover] Failed to load administrations:', err);
        el.innerHTML = '<div class="cc-pop__viewer-loading"><span>Failed to load administrations</span></div>';
      });
    } else {
      el.innerHTML = '<div class="cc-pop__viewer-loading"><span>Administration viewer not available</span></div>';
    }
  }, [viewingSource, viewingOrder]);

  // Render clinical note or therapy document via vanilla renderers
  useEffect(() => {
    if ((!viewingNote && !viewingTherapy) || !noteContainerRef.current) return;

    const el = noteContainerRef.current;
    const viewer = parseViewer(viewingSource.ev);
    const quote = viewingSource.ev.quoteText || viewingSource.ev.quote || viewingSource.ev.snippet || '';
    console.log('[NoteHighlight/popover] viewingSource.ev keys:', Object.keys(viewingSource.ev), 'quote?', !!quote, 'first60:', (viewingSource.ev.quoteText || viewingSource.ev.quote || '').slice(0, 60));

    el.innerHTML = '<div class="cc-pop__viewer-loading"><div class="mds-cc__spinner mds-cc__spinner--sm"></div><span>Loading...</span></div>';

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
        el.innerHTML = '<div class="cc-pop__viewer-loading"><span>Viewer not available</span></div>';
      }
    };

    resolveAndRender().catch(err => {
      console.error('[ItemPopover] Failed to load source:', err);
      el.innerHTML = '<div class="cc-pop__viewer-loading"><span>Failed to load</span></div>';
    });
  }, [viewingSource, viewingNote, viewingTherapy]);

  // Render UDA structured assessment via vanilla renderer
  useEffect(() => {
    if (!viewingUda || !noteContainerRef.current) return;

    const el = noteContainerRef.current;
    const viewer = parseViewer(viewingSource.ev);
    const quote = viewingSource.ev.quoteText || viewingSource.ev.quote || viewingSource.ev.snippet || '';

    el.innerHTML = '<div class="cc-pop__viewer-loading"><div class="mds-cc__spinner mds-cc__spinner--sm"></div><span>Loading assessment...</span></div>';

    const run = async () => {
      if (window.renderSplitUda) {
        await window.renderSplitUda(el, viewer.id, quote);
      } else {
        el.innerHTML = '<div class="cc-pop__viewer-loading"><span>UDA viewer not available</span></div>';
      }
    };

    run().catch(err => {
      console.error('[ItemPopover] Failed to load UDA:', err);
      el.innerHTML = '<div class="cc-pop__viewer-loading"><span>Failed to load</span></div>';
    });
  }, [viewingSource, viewingUda]);

  const handleViewSource = useCallback((ev, index) => {
    setViewingSource({ ev, index });
  }, []);

  const handleBack = useCallback(() => {
    setViewingSource(null);
  }, []);

  const isSplit = viewingSource !== null;

  return (
    <div class="cc-pop__backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`cc-pop${isSplit ? ' cc-pop--split' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div class="cc-pop__header">
          <div class="cc-pop__header-top">
            <div class="cc-pop__header-left">
              {isSplit && (
                /* NO_TRACK: split-view back nav */
                <button class="cc-pop__back-btn" onClick={handleBack} type="button">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  Back
                </button>
              )}
              <span class="cc-pop__code">{displayCode}</span>
              <span class="cc-pop__name">{item?.itemName || data?.item?.description || 'Item Detail'}</span>
            </div>
            {/* NO_TRACK: close-X */}
            <button class="cc-pop__close" onClick={onClose} type="button">&times;</button>
          </div>
        </div>

        {/* Body — summary or split view */}
        {!isSplit ? (
          <div class="cc-pop__body">
            {loading && (
              <div class="cc-pop__loading">
                <div class="mds-cc__spinner mds-cc__spinner--sm" />
                <span>Loading...</span>
              </div>
            )}
            {error && <div class="cc-pop__error">{error}</div>}
            {!loading && !error && data && (
              <ItemDetail
                variant="compact"
                data={data}
                detectionItem={item}
                mdsItem={mdsItem}
                onViewSource={handleViewSource}
                onAgree={onAgree ? () => onAgree(data) : undefined}
                onDismiss={onDismiss ? (reason) => onDismiss(data, reason) : undefined}
                dismissing={dismissing}
              />
            )}
          </div>
        ) : (
          <div class="cc-pop__split-body">
            {/* Left pane: condensed source list */}
            <div class="cc-pop__sources">
              <div class="cc-pop__sources-label">Sources ({viewableEvidence.length})</div>
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
                    class={`cc-pop__source-card${isActive ? ' cc-pop__source-card--active' : ''}`}
                    onClick={() => setViewingSource({ ev, index: i })}
                    role="button"
                  >
                    <div class={`cc-pop__source-badge${isOrder ? ' cc-pop__source-badge--order' : ''}`}>{typeLabel}</div>
                    {snippet && <div class="cc-pop__source-snippet">{snippet}</div>}
                    {!isOrder && page && <div class="cc-pop__source-page">Page {page}</div>}
                  </div>
                );
              })}
            </div>

            {/* Right pane: viewer (PDF, orders, notes, therapy) */}
            <div class="cc-pop__viewer">
              {/* PDF document viewer */}
              {viewingDoc && docLoading && (
                <div class="cc-pop__viewer-loading">
                  <div class="mds-cc__spinner mds-cc__spinner--sm" />
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
                <div class="cc-pop__viewer-loading">
                  <span>Failed to load document</span>
                </div>
              )}

              {/* Order/administration viewer — rendered by vanilla renderSplitAdministrations */}
              {viewingOrder && (
                <div ref={adminContainerRef} class="cc-pop__admin-viewer" />
              )}

              {/* Clinical note / therapy doc / UDA viewer — rendered by vanilla renderers */}
              {(viewingNote || viewingTherapy || viewingUda) && (
                <div ref={noteContainerRef} class="cc-pop__note-viewer" />
              )}
            </div>
          </div>
        )}

        {/* Action buttons in split mode (summary mode gets them from ItemDetail) */}
        {isSplit && !loading && !error && data && (
          <div style={{ padding: '0 16px 12px', flexShrink: 0, borderTop: '1px solid #e5e7eb' }}>
            <div class="sid__actions">
              <button data-track="mds_cc_item_actioned" data-track-prop-item-code={displayCode || ''} data-track-prop-action="query_physician" class="sid__btn sid__btn--primary" onClick={() => window.QuerySendModal?.show(data.item || data)} type="button">
                Query Physician
              </button>
              {mdsItem && (
                <button data-track="mds_cc_item_actioned" data-track-prop-item-code={displayCode || ''} data-track-prop-action="go_to_mds_item" class="sid__btn sid__btn--secondary" onClick={() => window.navigateToMDSItem?.(mdsItem)} type="button">
                  Go to {displayCode} &#x2197;
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Extract all evidence items from data (handles both diagnosis and column-based items) */
function getEvidence(data) {
  const apiItem = data?.item;
  if (!apiItem) return [];

  const isColumnBased = !!apiItem.columns;
  if (!isColumnBased) return apiItem.evidence || apiItem.queryEvidence || [];

  const colEvidence = [];
  const seen = new Set();
  for (const col of Object.values(apiItem.columns || {})) {
    if (col?.evidence) col.evidence.forEach(ev => {
      const k = ev.sourceId || ev.quote || JSON.stringify(ev);
      if (!seen.has(k)) { seen.add(k); colEvidence.push(ev); }
    });
  }
  return colEvidence;
}
