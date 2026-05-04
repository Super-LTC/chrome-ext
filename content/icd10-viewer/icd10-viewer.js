/**
 * ICD-10 Viewer - Main Module
 * Full-screen modal with three-panel ICD-10 coding interface
 */

// Tracking helper — uses window.SuperAnalytics.track when available so this
// file works both bundled (extension) and as a classic <script> (demo HTMLs).
function _track(event, props) {
  try {
    window.SuperAnalytics?.track?.(event, props || {});
  } catch (e) { /* swallow */ }
}

const ICD10Viewer = {
  // State
  isOpen: false,
  patientId: null,
  patientName: null,
  facilityName: null,
  orgSlug: null,
  annotations: [],
  topRanked: [],
  approved: [],
  flatGroups: null,
  counts: {},
  approvedDiagnoses: [],
  _v2: false,
  stagedCodes: [],          // Codes staged for PCC submission
  admitDate: null,          // Patient admit date (from backend)
  _currentView: 'icd10', // 'icd10' or 'queryItems'
  _preactUnmount: null,  // cleanup function for Preact component
  _confirmationUnmount: null, // cleanup function for confirmation dialog
  _queryFlowUnmount: null, // cleanup function for the single-query Preact flow
  _assessmentId: null,   // external assessment ID for query items

  // DOM elements
  modal: null,
  sidebar: null,
  evidencePanel: null,
  pdfViewer: null,

  /**
   * Open the ICD-10 viewer modal
   */
  async open() {
    if (this.isOpen) return;

    // Gather context from current page
    const context = await this._gatherContext();
    if (!context.patientId) {
      console.error('ICD10Viewer: Could not determine patient ID');
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'icd10_viewer',
        error_code: 'no_patient_context',
        error_type: 'validation',
      });
      this._showError('Could not determine patient information');
      return;
    }

    this.patientId = context.patientId;
    this.patientName = context.patientName;
    this.facilityName = context.facilityName;
    this.orgSlug = context.orgSlug;
    this._assessmentId = context.assessmentId || null;
    this._currentView = 'icd10';

    // Create and show modal
    this._createModal();
    this.isOpen = true;

    // Fire mount-only opened event (once per open).
    _track('icd10_viewer_opened', { source: 'fab' });

    // Load data
    await this._loadData();
  },

  /**
   * Close the viewer modal
   */
  close() {
    if (!this.isOpen || !this.modal) return;

    // Clean up Preact if query items view is showing
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    // Clean up confirmation dialog if showing
    if (this._confirmationUnmount) {
      this._confirmationUnmount();
      this._confirmationUnmount = null;
    }
    // Clean up the single-query Preact sheet if showing
    if (this._queryFlowUnmount) {
      this._queryFlowUnmount();
      this._queryFlowUnmount = null;
    }
    this._currentView = 'icd10';
    this.stagedCodes = [];

    // Remove escape handler
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }

    // Animate out
    this.modal.classList.remove('icd10-viewer-modal--visible');
    this.modal.classList.add('icd10-viewer-modal--closing');

    setTimeout(() => {
      this.modal.remove();
      this.modal = null;
      this.isOpen = false;
      this._assessmentId = null;
      document.body.style.overflow = '';

      // Clear component state
      ICD10Sidebar.selectedCategory = 'topRanked';
      ICD10Sidebar.selectedBaseCode = null;
      ICD10Sidebar.selectedGroupId = null;
      ICD10EvidencePanel.clear();
      ICD10PDFViewer.clear();
      // Drop the v2 detail cache; word-blocks/URL caches are document-scoped
      // and stay warm across viewer opens, so we don't blanket-clear all caches.
      ICD10API.detailCache?.clear?.();
    }, 200);
  },

  /**
   * Gather context from the current page
   * @returns {Object}
   */
  async _gatherContext() {
    // Get patient ID from URL or page
    // PCC uses various parameter names: ESOLclientid, clientId, patientId, residentId
    const urlParams = new URLSearchParams(window.location.search);
    let patientId = urlParams.get('ESOLclientid') ||
                    urlParams.get('clientId') ||
                    urlParams.get('patientId') ||
                    urlParams.get('residentId');

    // Try to get from page elements if not in URL
    if (!patientId) {
      // Look for patient ID in common PCC locations
      const patientLink = document.querySelector('[id*="patientId"], [data-patient-id]');
      if (patientLink) {
        patientId = patientLink.getAttribute('data-patient-id') ||
                    patientLink.textContent?.match(/\d+/)?.[0];
      }

      // Try to get from SuperOverlay if available
      if (!patientId && window.SuperOverlay?.patientId) {
        patientId = window.SuperOverlay.patientId;
      }
    }

    // Get patient name from page - PCC uses various selectors
    let patientName = 'Unknown Patient';
    const patientNameSelectors = [
      '#patientNameDisplay',
      '.patientBanner .name',
      '#patientName',
      '.patient-name',
      '[class*="patientName"]',
      '[class*="patient-name"]',
      '.demographicBanner .name',
      '#pccPatientName',
      '.header-patient-name',
      // Try to find in header area
      '#headerPatientInfo',
      '.patientHeader .name'
    ];

    for (const selector of patientNameSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent?.trim()) {
        patientName = el.textContent.trim();
        break;
      }
    }

    // Also try to get from page title or URL if still unknown
    if (patientName === 'Unknown Patient') {
      // Some PCC pages have patient name in title
      const titleMatch = document.title?.match(/^([^-|]+)/);
      if (titleMatch && titleMatch[1].trim().length > 3) {
        patientName = titleMatch[1].trim();
      }
    }

    // Get facility name from PCC page
    const facLink = document.getElementById('pccFacLink');
    let facilityName = facLink?.title || facLink?.textContent?.trim() || null;

    // Get org slug from PCC cookie via background script (same pattern as mds-view, streaming, etc.)
    let orgSlug = null;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org || null;
    } catch (e) {
      console.warn('ICD10Viewer: Could not get org slug:', e);
    }

    // Get assessment ID from URL if available
    const assessmentId = urlParams.get('ESOLassessid') ||
                         window.SuperOverlay?.assessmentId || null;

    return {
      patientId,
      patientName,
      facilityName,
      orgSlug,
      assessmentId
    };
  },

  /**
   * Create the modal DOM structure
   */
  _createModal() {
    this.modal = document.createElement('div');
    this.modal.className = 'icd10-viewer-modal';
    this.modal.innerHTML = `
      <div class="icd10-viewer-modal__backdrop"></div>
      <div class="icd10-viewer-modal__container">
        <div class="icd10-viewer__header">
          <!-- NO_TRACK: pure UI back/close button -->
          <button class="icd10-viewer__back-btn" title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back
          </button>
          <div class="icd10-viewer__title">
            <span class="icd10-viewer__title-text">ICD-10 Viewer</span>
            <span class="icd10-viewer__patient-info">${this._escapeHtml(this.patientName)}</span>
          </div>
          <div class="icd10-viewer__header-actions">
            <!-- NO_TRACK: navigates to ARD Estimator which fires ard_estimator_opened on mount -->
            <button class="icd10-viewer__estimate-btn" title="PDPM Estimate & ARD Recommendation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              PDPM Estimate
            </button>
            <!-- NO_TRACK: pure UI close-X -->
            <button class="icd10-viewer__close-btn" title="Close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="icd10-viewer__body">
          <div class="icd10-viewer__sidebar"></div>
          <div class="icd10-viewer__evidence-panel"></div>
          <div class="icd10-viewer__pdf-viewer"></div>
        </div>
      </div>
    `;

    // Store panel references
    this.sidebar = this.modal.querySelector('.icd10-viewer__sidebar');
    this.evidencePanel = this.modal.querySelector('.icd10-viewer__evidence-panel');
    this.pdfViewer = this.modal.querySelector('.icd10-viewer__pdf-viewer');

    // Attach event listeners
    this._attachEventListeners();

    // Add to DOM
    document.body.appendChild(this.modal);
    document.body.style.overflow = 'hidden';

    // Trigger animation
    requestAnimationFrame(() => {
      this.modal.classList.add('icd10-viewer-modal--visible');
    });

    // Show loading state
    this._showLoading();
  },

  /**
   * Attach modal event listeners
   */
  _attachEventListeners() {
    // Close button
    this.modal.querySelector('.icd10-viewer__close-btn').addEventListener('click', () => {
      this._handleExitAttempt(() => this.close());
    });

    // Back button - context-aware
    this.modal.querySelector('.icd10-viewer__back-btn').addEventListener('click', () => {
      if (this._currentView === 'queryItems' || this._currentView === 'ardEstimator') {
        this.showICD10View();
      } else {
        this._handleExitAttempt(() => this.close());
      }
    });

    // PDPM Estimate button - go to ARD Estimator
    this.modal.querySelector('.icd10-viewer__estimate-btn').addEventListener('click', () => {
      this._handleExitAttempt(() => this.showArdEstimator());
    });

    // Backdrop click
    this.modal.querySelector('.icd10-viewer-modal__backdrop').addEventListener('click', () => {
      this._handleExitAttempt(() => this.close());
    });

    // Escape key - context-aware
    this._escapeHandler = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        // Don't handle Escape if a nested modal (e.g., BatchReviewModal or confirmation dialog) is open
        if (document.querySelector('.super-modal--visible') || document.querySelector('.dx-confirm__overlay')) return;

        if (this._currentView === 'queryItems') {
          this.showICD10View();
        } else {
          this._handleExitAttempt(() => this.close());
        }
      }
    };
    document.addEventListener('keydown', this._escapeHandler);
  },

  /**
   * Show loading state in all panels
   */
  _showLoading() {
    const loadingHTML = `
      <div class="icd10-viewer__loading">
        <div class="icd10-viewer__spinner"></div>
        <span>Loading...</span>
      </div>
    `;

    this.sidebar.innerHTML = loadingHTML;
    this.evidencePanel.innerHTML = loadingHTML;
    this.pdfViewer.innerHTML = loadingHTML;
  },

  /**
   * Load annotations and diagnoses data
   */
  async _loadData() {
    try {
      // Fetch data in parallel
      const [annotationData, approvedDiagnoses] = await Promise.all([
        ICD10API.getAnnotations(this.patientId, this.facilityName, this.orgSlug, this._assessmentId),
        ICD10API.getApprovedDiagnoses(this.patientId, this.facilityName, this.orgSlug)
      ]);

      this._v2 = annotationData._v2 === true;
      this.topRanked = annotationData.topRanked || [];
      this.approved = annotationData.approved || [];
      this.annotations = annotationData.flatAnnotations || [];
      this.flatGroups = annotationData.flatGroups || null;
      this.counts = annotationData.counts || {};
      this.admitDate = annotationData.admitDate || null;
      this.approvedDiagnoses = approvedDiagnoses || [];

      // Initialize components
      this._initializeComponents();

    } catch (error) {
      console.error('ICD10Viewer: Failed to load data:', error);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'icd10_viewer',
        error_code: (window.SuperAnalytics?.toErrorCode?.(error) ?? 'unknown'),
        error_type: 'api_error',
      });
      this._showError(`Failed to load ICD-10 data: ${error.message}`);
    }
  },

  /**
   * Initialize the three panel components
   */
  _initializeComponents() {
    console.log('[ICD10Viewer] _initializeComponents: topRanked=', this.topRanked?.length, 'approved=', this.approved?.length, 'annotations=', this.annotations?.length, 'approvedDiagnoses=', this.approvedDiagnoses?.length);

    // Initialize evidence panel FIRST so callback is ready when sidebar auto-selects
    console.log('[ICD10Viewer] Initializing evidence panel...');
    ICD10EvidencePanel.init(
      this.evidencePanel,
      (item) => this._handleEvidenceSelect(item),
      (item) => this._handleApprove(item),
      (payload) => this._handleQuerySingle(payload),
      (item) => this._handleUnstage(item),
      (groupKey, row) => this._handleDismiss(groupKey, row),
      (groupKey, row) => this._handleUndismiss(groupKey, row)
    );

    // Initialize PDF viewer
    console.log('[ICD10Viewer] Initializing PDF viewer...');
    ICD10PDFViewer.init(this.pdfViewer);

    // Initialize sidebar LAST - it will auto-select and trigger the chain
    console.log('[ICD10Viewer] Initializing sidebar...');
    ICD10Sidebar.init(
      this.sidebar,
      {
        topRanked: this.topRanked,
        approved: this.approved,
        annotations: this.annotations,
        flatGroups: this.flatGroups,
        approvedDiagnoses: this.approvedDiagnoses,
        counts: this.counts,
        stagedBaseCodes: this._computeStagedBaseCodes(),
        approvedBaseCodes: this._computeApprovedBaseCodes(),
      },
      (selection) => this._handleSidebarSelection(selection),
      {
        onDismiss: (groupKey, row) => this._handleDismiss(groupKey, row),
        onUndismiss: (groupKey, row) => this._handleUndismiss(groupKey, row),
        dismissDisabled: this._dismissDisabled === true,
      }
    );

    console.log('[ICD10Viewer] All components initialized');
  },

  /**
   * Handle sidebar selection change
   * @param {Object} selection - { category, baseCode, items }
   */
  async _handleSidebarSelection(selection) {
    console.log('[ICD10Viewer] _handleSidebarSelection:', selection.category, selection.baseCode || selection.groupId, 'items=', selection.items?.length, 'v2=', this._v2);

    const baseCode = selection.baseCode || selection.groupCode;
    const groupContext = {
      groupCode: baseCode,
      groupKey: selection.groupKey || baseCode || null,
      dismissed: !!selection.dismissed,
      groupName: selection.groupName || null,
      evidenceStrength: selection.evidenceStrength || null,
      rationale: selection.rationale || null,
      pdpmCategory: selection.pdpmCategory || null,
      pdpmCategoryName: selection.pdpmCategoryName || null,
      pdpmPoints: selection.pdpmPoints,
      mdsItemCode: selection.mdsItemCode || null,
    };

    // Sequence guard so a slow earlier fetch can't clobber the latest selection.
    this._selectionSeq = (this._selectionSeq || 0) + 1;
    const seq = this._selectionSeq;
    const isStale = () => seq !== this._selectionSeq;

    // Fire-and-forget summary fetch for the selected base code (independent
    // of the detail fetch — runs in parallel).
    if (baseCode) {
      ICD10EvidencePanel.showSummaryLoading();
      ICD10API.getEvidenceSummary(this.patientId, baseCode, this.facilityName, this.orgSlug, this._assessmentId)
        .then(data => { if (!isStale()) ICD10EvidencePanel.showSummary(data.summary); })
        .catch(() => { if (!isStale()) ICD10EvidencePanel.clearSummary(); });
    }

    // v1 path: items came pre-loaded with the list response.
    if (!this._v2 || (selection.items && selection.items.length > 0)) {
      ICD10EvidencePanel.updateItems(selection.items || [], true, groupContext);
      return;
    }

    // v2 path: fetch the per-base-code detail on demand.
    if (!baseCode) {
      ICD10EvidencePanel.updateItems([], true, groupContext);
      return;
    }

    ICD10EvidencePanel.showItemsLoading(groupContext);
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    try {
      const annotations = await ICD10API.getAnnotationsByBaseCode(
        this.patientId, baseCode, this.facilityName, this.orgSlug, this._assessmentId
      );
      if (isStale()) return;
      const dt = Math.round(((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0);
      console.log(`[ICD10Viewer] v2 detail fetched: code=${baseCode} count=${annotations.length} ${dt}ms`);
      ICD10EvidencePanel.updateItems(annotations, true, groupContext);
    } catch (err) {
      if (isStale()) return;
      console.error('[ICD10Viewer] Detail fetch failed:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'icd10_evidence_detail',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      ICD10EvidencePanel.showItemsError(groupContext, () => this._handleSidebarSelection(selection));
    }
  },

  /**
   * Handle evidence card selection
   * @param {Object} item - Selected annotation item (normalized by evidence panel)
   */
  async _handleEvidenceSelect(item) {
    console.log('[ICD10Viewer] _handleEvidenceSelect called with item:', item?.id, item?.documentId);

    // Guard against out-of-order async resolutions when the user clicks
    // multiple evidence items in quick succession. Only the latest selection
    // is allowed to update the PDF viewer.
    this._evidenceSelectSeq = (this._evidenceSelectSeq || 0) + 1;
    const seq = this._evidenceSelectSeq;
    const isStale = () => seq !== this._evidenceSelectSeq;

    // Note / order / UDA evidence has no documentId — dispatch to SuperDocViewer
    // so practitioner notes, orders, labs, etc. open in their native viewer
    // instead of the PDF panel's empty state.
    if (item && !item.documentId && item.evidenceId && window.SuperDocViewer) {
      const eid = String(item.evidenceId);
      const nonPdf = /^pcc-prognote-|^pcc-practnote-|^patient-practnote-|^uda-|^therapy-doc-|^order-|^lab-|^mar-/.test(eid);
      if (nonPdf) {
        window.SuperDocViewer.open({
          evidenceId: item.evidenceId,
          sourceId: item.evidenceId,
          sourceType: item.sourceType || null,
          quote: item.quoteText || item.evidenceExcerpt || '',
          patientId: item.patientId || null,
        });
        ICD10PDFViewer.render();
        return;
      }
    }

    if (!item || !item.documentId) {
      console.log('[ICD10Viewer] No item or documentId, showing empty state');
      ICD10PDFViewer.render(); // Show empty state
      return;
    }

    // Stash the ICD-10 code on the PDF viewer so its analytics events
    // (icd10_pdf_opened / icd10_pdf_page_changed) can carry the code context.
    ICD10PDFViewer.currentCode = item.icd10Code || null;

    // Show loading state
    ICD10PDFViewer._renderLoading();

    try {
      // Fetch document and word blocks in parallel
      console.log('[ICD10Viewer] Fetching document and word blocks for:', item.documentId);
      const [document, allWordBlocks] = await Promise.all([
        ICD10API.getDocument(item.documentId, this.facilityName, this.orgSlug),
        ICD10API.getWordBlocks(item.documentId, this.facilityName, this.orgSlug)
      ]);

      if (isStale()) {
        console.log('[ICD10Viewer] Stale evidence selection, skipping PDF update for:', item.id);
        return;
      }

      console.log('[ICD10Viewer] Document fetched:', document?.id);
      console.log('[ICD10Viewer] Word blocks fetched:', allWordBlocks?.length, 'blocks');
      console.log('[ICD10Viewer] Item wordBlockIndices:', item.wordBlockIndices);

      // Resolve wordBlockIndices to actual word block coordinates
      let wordBlocks = [];
      if (item.wordBlockIndices && Array.isArray(item.wordBlockIndices) && allWordBlocks.length > 0) {
        // Map indices to actual word block objects
        wordBlocks = item.wordBlockIndices
          .map(index => allWordBlocks.find(wb => wb.index === index))
          .filter(Boolean)
          .map(wb => ({
            // Normalize field names for PDF viewer: API uses width/height/page, viewer expects w/h/p
            x: wb.x,
            y: wb.y,
            w: wb.width,
            h: wb.height,
            p: wb.page,
            text: wb.text
          }));
        console.log('[ICD10Viewer] Resolved word blocks:', wordBlocks.length, 'highlights');
      } else if (item.wordBlocks && Array.isArray(item.wordBlocks)) {
        // Fallback: use wordBlocks directly if present (mock data format)
        wordBlocks = item.wordBlocks;
        console.log('[ICD10Viewer] Using direct wordBlocks:', wordBlocks.length);
      }

      // Determine target page
      const targetPage = item.pageNumber || (wordBlocks.length > 0 ? wordBlocks[0].p : 1) || 1;
      console.log('[ICD10Viewer] Target page:', targetPage);

      // Get search text for text-based highlighting (fallback when no word blocks)
      const searchText = item.quoteText || item.description || '';

      // Load document in PDF viewer
      await ICD10PDFViewer.loadDocument(document, wordBlocks, targetPage, searchText);
      if (isStale()) {
        console.log('[ICD10Viewer] Stale after loadDocument, skipping further updates for:', item.id);
        return;
      }
      console.log('[ICD10Viewer] PDF loaded successfully');

    } catch (error) {
      if (isStale()) return;
      console.error('[ICD10Viewer] Failed to load document:', error);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'icd10_pdf_viewer',
        error_code: (window.SuperAnalytics?.toErrorCode?.(error) ?? 'unknown'),
        error_type: 'api_error',
      });
      ICD10PDFViewer._renderError('Failed to load document: ' + error.message);
    }
  },

  /**
   * Handle add button click — stages the code locally (no API call yet)
   * @param {Object} item - Annotation item to stage
   */
  async _handleApprove(item) {
    try {
      // Dedup check
      if (this.stagedCodes.some(c => c.icd10Code === item.icd10Code)) {
        this._syncEvidencePanelStaged();
        this._updateStagedBadge();
        this._refreshSidebarStaged();
        return;
      }

      // Stage the code locally
      this.stagedCodes.push({
        icd10Code: item.icd10Code,
        description: item.description,
        annotationId: item.id,
        category: item.category,
        groupCode: item.groupCode || item.icd10Code
      });

      // Remove from flat annotations
      if (Array.isArray(this.annotations)) {
        const index = this.annotations.findIndex(a => a.id === item.id);
        if (index > -1) {
          this.annotations.splice(index, 1);
        }
      }

      // Also remove from topRanked groups
      if (Array.isArray(this.topRanked)) {
        for (const group of this.topRanked) {
          if (!Array.isArray(group?.annotations)) continue;
          const annIdx = group.annotations.findIndex(a => a.id === item.id);
          if (annIdx > -1) {
            group.annotations.splice(annIdx, 1);
            group.annotationCount = group.annotations.length;
            break;
          }
        }
      }

      // Update sidebar with new data
      ICD10Sidebar.updateData({
        topRanked: this.topRanked,
        approved: this.approved,
        annotations: this.annotations,
        approvedDiagnoses: this.approvedDiagnoses,
        stagedBaseCodes: this._computeStagedBaseCodes(),
        approvedBaseCodes: this._computeApprovedBaseCodes(),
      });

      // Sync per-leaf staged set into the evidence panel so the [+ Add] →
      // ✓ Added flip happens on the right row.
      this._syncEvidencePanelStaged();

      // Update staged count badge
      this._updateStagedBadge();
    } catch (error) {
      console.error('ICD10Viewer: Failed to stage:', error);
      throw error;
    }
  },

  /**
   * Undo a staged code — removes from local stagedCodes, refreshes sidebar +
   * push button, and flips the evidence panel's per-leaf state back to [+ Add].
   */
  _handleUnstage(item) {
    if (!item || !item.icd10Code) return;
    const before = this.stagedCodes.length;
    this.stagedCodes = this.stagedCodes.filter(c => c.icd10Code !== item.icd10Code);
    if (this.stagedCodes.length === before) return; // wasn't staged
    this._syncEvidencePanelStaged();
    this._updateStagedBadge();
    this._refreshSidebarStaged();
  },

  /**
   * Push the current set of staged leaf codes into the evidence panel so its
   * per-leaf [+ Add] / ✓ Added buttons reflect viewer state.
   */
  _syncEvidencePanelStaged() {
    if (typeof ICD10EvidencePanel?.setStagedLeafCodes !== 'function') return;
    const codes = (this.stagedCodes || []).map(c => c.icd10Code).filter(Boolean);
    ICD10EvidencePanel.setStagedLeafCodes(codes);
  },

  _computeStagedBaseCodes() {
    const set = new Set();
    for (const c of this.stagedCodes || []) {
      const code = c.icd10Code || '';
      if (code.length >= 3) set.add(code.substring(0, 3));
    }
    return set;
  },

  _computeApprovedBaseCodes() {
    const set = new Set();
    for (const d of this.approvedDiagnoses || []) {
      const code = d.icd10Code || '';
      if (code.length >= 3) set.add(code.substring(0, 3));
    }
    return set;
  },

  _refreshSidebarStaged() {
    ICD10Sidebar.updateData({
      stagedBaseCodes: this._computeStagedBaseCodes(),
      approvedBaseCodes: this._computeApprovedBaseCodes(),
    });
  },

  /**
   * Handle "Query" click from the evidence panel header. Mounts a Preact
   * sheet that wraps useBatchQuery + BatchReviewPage with a single-item
   * batch built from the v2 detail annotations the panel already loaded.
   * @param {Object} payload - { baseCode, description, groupContext, items }
   */
  async _handleQuerySingle(payload) {
    if (!payload || !payload.baseCode) return;
    if (!payload.items || payload.items.length === 0) {
      window.SuperToast?.show?.({ message: 'No evidence to attach yet — wait for mentions to load.', type: 'info' });
      return;
    }
    // Block when there's no PDPM signal at all — backend requires an mdsItem
    // and the I8000 fallback is only meaningful with an NTA/SLP category.
    const ctx = payload.groupContext || {};
    if (!ctx.mdsItemCode && !ctx.pdpmCategory) {
      window.SuperToast?.show?.({
        message: `No MDS item slot for ${payload.baseCode} — can't attach a query.`,
        type: 'warning',
      });
      return;
    }

    if (this._queryFlowUnmount) {
      this._queryFlowUnmount();
      this._queryFlowUnmount = null;
    }

    const mountEl = document.createElement('div');
    mountEl.className = 'icd10-query-flow-mount';
    this.modal.querySelector('.icd10-viewer-modal__container').appendChild(mountEl);

    try {
      let render, h, Icd10QueryFlow;
      if (window.__preact && window.__Icd10QueryFlow) {
        ({ render, h } = window.__preact);
        Icd10QueryFlow = window.__Icd10QueryFlow;
      } else {
        const [preactMod, flowMod] = await Promise.all([
          import('preact'),
          import('../modules/icd10-query-flow/Icd10QueryFlow.jsx'),
        ]);
        ({ render, h } = preactMod);
        ({ Icd10QueryFlow } = flowMod);
        if (!window.__preact) window.__preact = preactMod;
        if (!window.__Icd10QueryFlow) window.__Icd10QueryFlow = Icd10QueryFlow;
      }

      const cleanup = () => {
        try { render(null, mountEl); } catch (_) { /* noop */ }
        mountEl.remove();
        this._queryFlowUnmount = null;
      };
      this._queryFlowUnmount = cleanup;

      render(
        h(Icd10QueryFlow, {
          baseCode: payload.baseCode,
          description: payload.description,
          groupContext: payload.groupContext,
          items: payload.items,
          patientId: this.patientId,
          facilityName: this.facilityName,
          orgSlug: this.orgSlug,
          assessmentId: this._assessmentId,
          onClose: () => cleanup(),
          onComplete: (sentQueries, practitionerName) => {
            const n = (sentQueries || []).length;
            if (n > 0) {
              window.SuperToast?.show?.({
                message: `Query sent to ${practitionerName || 'practitioner'}.`,
                type: 'success',
              });
            }
          },
        }),
        mountEl
      );
    } catch (err) {
      console.error('[ICD10Viewer] Failed to load query flow:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'icd10_query_flow_load',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      mountEl.remove();
      window.SuperToast?.show?.({ message: `Failed to start query flow: ${err.message}`, type: 'error' });
    }
  },

  /**
   * Handle exit attempt — shows confirmation dialog if codes are staged
   * @param {Function} proceedCallback - Called after confirmation or if no staged codes
   */
  _handleExitAttempt(proceedCallback) {
    if (this.stagedCodes.length === 0) {
      proceedCallback();
      return;
    }
    this._showConfirmationDialog(proceedCallback);
  },

  /**
   * Show the diagnosis confirmation dialog (Preact component)
   * @param {Function} proceedCallback - Called after submission completes or user skips
   */
  async _showConfirmationDialog(proceedCallback) {
    const mountEl = document.createElement('div');
    mountEl.className = 'diagnosis-confirmation-mount';
    this.modal.querySelector('.icd10-viewer-modal__container').appendChild(mountEl);

    try {
      let render, h, DiagnosisConfirmationDialog;
      if (window.__preact && window.__DiagnosisConfirmationDialog) {
        ({ render, h } = window.__preact);
        DiagnosisConfirmationDialog = window.__DiagnosisConfirmationDialog;
      } else {
        const [preactMod, dcMod] = await Promise.all([
          import('preact'),
          import('../modules/diagnosis-confirmation/DiagnosisConfirmationDialog.jsx')
        ]);
        ({ render, h } = preactMod);
        ({ DiagnosisConfirmationDialog } = dcMod);
      }

      const cleanup = () => {
        render(null, mountEl);
        mountEl.remove();
        this._confirmationUnmount = null;
      };

      this._confirmationUnmount = cleanup;

      render(
        h(DiagnosisConfirmationDialog, {
          stagedCodes: [...this.stagedCodes],
          defaultDate: this.admitDate || '',
          patientId: this.patientId,
          onApply: async (results) => {
            // Report to backend (non-blocking)
            this._reportToBackend(results);

            // Update page table for successful submissions
            results.filter(r => r.success).forEach(r => {
              this._addToPageTable({
                icd10Code: r.icd10Code,
                description: r.description,
                onsetDate: this.admitDate || new Date().toISOString().split('T')[0],
                category: this.stagedCodes.find(c => c.icd10Code === r.icd10Code)?.category || 'other'
              });
            });

            // Keep failed codes staged for retry
            const failedCodes = results.filter(r => !r.success);
            this.stagedCodes = this.stagedCodes.filter(c =>
              failedCodes.some(f => f.icd10Code === c.icd10Code)
            );

            this._updateStagedBadge();
            cleanup();
            proceedCallback();
          },
          onCancel: () => {
            cleanup();
            // User stays in viewer, staged codes preserved
          },
          onDiscardAndExit: () => {
            this.stagedCodes = [];
            this._updateStagedBadge();
            cleanup();
            proceedCallback();
          }
        }),
        mountEl
      );
    } catch (err) {
      console.error('[ICD10Viewer] Failed to load confirmation dialog:', err);
      mountEl.remove();
      // Fallback: just proceed
      proceedCallback();
    }
  },

  /**
   * Report batch results to Super backend
   * @param {Array} results - Batch submission results
   */
  async _reportToBackend(results) {
    try {
      await ICD10API.reportBatchDiagnoses(
        this.patientId,
        results,
        this.admitDate || new Date().toISOString().split('T')[0],
        this.facilityName,
        this.orgSlug
      );
    } catch (e) {
      console.warn('ICD10Viewer: Backend report failed (non-blocking):', e);
    }
  },

  /**
   * Update the staged count badge in the header
   */
  _updateStagedBadge() {
    if (!this.modal) return;
    let badge = this.modal.querySelector('.icd10-viewer__staged-badge');
    let pushBtn = this.modal.querySelector('.icd10-viewer__push-btn');

    if (this.stagedCodes.length === 0) {
      if (badge) badge.remove();
      if (pushBtn) pushBtn.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'icd10-viewer__staged-badge';
      const titleEl = this.modal.querySelector('.icd10-viewer__title');
      if (titleEl) titleEl.appendChild(badge);
    }

    badge.textContent = `${this.stagedCodes.length} staged`;

    // Add or update push button
    if (!pushBtn) {
      pushBtn = document.createElement('button');
      pushBtn.className = 'icd10-viewer__push-btn';
      pushBtn.type = 'button';
      pushBtn.addEventListener('click', () => {
        this._showConfirmationDialog(() => {
          // After push completes, stay in the viewer
        });
      });
      const headerActions = this.modal.querySelector('.icd10-viewer__header-actions');
      if (headerActions) {
        headerActions.insertBefore(pushBtn, headerActions.firstChild);
      }
    }
    const codeWord = this.stagedCodes.length !== 1 ? 'Codes' : 'Code';
    pushBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Push ${this.stagedCodes.length} ${codeWord} to PCC
    `;
  },

  /**
   * Add approved diagnosis to the page table (for demo page)
   * @param {Object} diagnosis - Approved diagnosis object
   */
  _addToPageTable(diagnosis) {
    // Look for the medical diagnosis listing table
    const table = document.querySelector('#meddiaglisting tbody');
    if (!table) {
      console.log('ICD10Viewer: Medical diagnosis table not found, skipping page update');
      return;
    }

    // Format the date
    const date = new Date(diagnosis.onsetDate);
    const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    const currentDate = new Date();
    const createdDate = `${currentDate.getMonth() + 1}/${currentDate.getDate()}/${currentDate.getFullYear()}`;

    // Get category display name and NTA points if applicable
    let categoryDisplay = '';
    let ntaPoints = '';
    if (diagnosis.category === 'nta') {
      categoryDisplay = 'Pulmonary'; // Default, could be more sophisticated
      ntaPoints = 'NTA (2 pts)';
    } else if (diagnosis.category === 'slp') {
      categoryDisplay = 'Speech/Language';
    } else {
      categoryDisplay = 'Medical Management';
    }

    // Create the new row
    const newRow = document.createElement('tr');
    newRow.className = 'primaryDiagRank';
    newRow.style.backgroundColor = '#e8f5e9'; // Light green to highlight new addition
    newRow.setAttribute('valign', 'top');
    newRow.innerHTML = `
      <td>
        <a href="javascript:void(0)">view</a>
      </td>
      <td></td>
      <td></td>
      <td></td>
      <td>${this._escapeHtml(diagnosis.icd10Code)}</td>
      <td></td>
      <td>${this._escapeHtml(diagnosis.description)}</td>
      <td>${this._escapeHtml(ntaPoints)}</td>
      <td>${this._escapeHtml(categoryDisplay)}</td>
      <td>${formattedDate}</td>
      <td>Diagnosis A</td>
      <td>Admission</td>
      <td>${createdDate}</td>
      <td>super-ai</td>
    `;

    // Insert at the beginning of the table
    table.insertBefore(newRow, table.firstChild);

    // Fade out the highlight after a delay
    setTimeout(() => {
      newRow.style.transition = 'background-color 1s ease-in-out';
      newRow.style.backgroundColor = '';
    }, 2000);

    console.log('ICD10Viewer: Added diagnosis to page table:', diagnosis.icd10Code);
  },

  /**
   * Switch to Query Items view
   * Dynamically imports Preact + QueryItemsPage and replaces the body content
   */
  async showQueryItems() {
    if (this._currentView === 'queryItems') return;
    this._currentView = 'queryItems';

    // Update header
    const titleText = this.modal.querySelector('.icd10-viewer__title-text');
    if (titleText) titleText.textContent = 'Query Items';

    // Get the body element and switch to single-panel layout
    const body = this.modal.querySelector('.icd10-viewer__body');
    body.classList.add('icd10-viewer__body--single-panel');
    body.innerHTML = '<div class="query-items-mount"></div>';
    const mountEl = body.querySelector('.query-items-mount');

    // Try to get assessment ID from URL (PCC pattern)
    if (!this._assessmentId) {
      const urlParams = new URLSearchParams(window.location.search);
      this._assessmentId = urlParams.get('ESOLassessid') ||
                           window.SuperOverlay?.assessmentId || null;
    }

    try {
      // Use pre-bundled globals (demo) or dynamic imports (Vite/production)
      let render, h, QueryItemsPage;
      if (window.__preact && window.__QueryItemsPage) {
        ({ render, h } = window.__preact);
        QueryItemsPage = window.__QueryItemsPage;
      } else {
        const [preactMod, qipMod] = await Promise.all([
          import('preact'),
          import('../modules/query-items/QueryItemsPage.jsx')
        ]);
        ({ render, h } = preactMod);
        ({ QueryItemsPage } = qipMod);
      }

      // Render the Preact component
      render(
        h(QueryItemsPage, {
          patientId: this.patientId,
          patientName: this.patientName,
          facilityName: this.facilityName,
          orgSlug: this.orgSlug,
          assessmentId: this._assessmentId,
          onBack: () => this.showICD10View(),
          onClose: () => this.close()
        }),
        mountEl
      );

      // Store unmount function
      this._preactUnmount = () => {
        render(null, mountEl);
      };
    } catch (err) {
      console.error('[ICD10Viewer] Failed to load Query Items:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'query_items_load',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      mountEl.innerHTML = `
        <div class="icd10-viewer__error">
          <p class="icd10-viewer__error-text">Failed to load Query Items: ${this._escapeHtml(err.message)}</p>
          <!-- NO_TRACK: error-recovery navigation back to ICD-10 view -->
          <button class="icd10-viewer__error-retry" onclick="ICD10Viewer.showICD10View()">Go Back</button>
        </div>
      `;
    }
  },

  /**
   * Show the ARD Estimator (PDPM Estimate & ARD Recommendation).
   * Dynamically imports Preact + ArdEstimator and replaces the body content.
   */
  async showArdEstimator() {
    if (this._currentView === 'ardEstimator') return;
    this._currentView = 'ardEstimator';

    // Update header
    const titleText = this.modal.querySelector('.icd10-viewer__title-text');
    if (titleText) titleText.textContent = 'PDPM Estimate & ARD';

    // Hide Estimate button
    const estimateBtn = this.modal.querySelector('.icd10-viewer__estimate-btn');
    if (estimateBtn) estimateBtn.style.display = 'none';

    // Get the body element and switch to single-panel layout
    const body = this.modal.querySelector('.icd10-viewer__body');
    body.classList.add('icd10-viewer__body--single-panel');
    body.innerHTML = '<div class="ard-estimator-mount"></div>';
    const mountEl = body.querySelector('.ard-estimator-mount');

    // Try to get assessment ID from URL (PCC pattern)
    if (!this._assessmentId) {
      const urlParams = new URLSearchParams(window.location.search);
      this._assessmentId = urlParams.get('ESOLassessid') ||
                           window.SuperOverlay?.assessmentId || null;
    }

    try {
      let render, h, ArdEstimator;
      if (window.__preact && window.__ArdEstimator) {
        ({ render, h } = window.__preact);
        ArdEstimator = window.__ArdEstimator;
      } else {
        const [preactMod, ardMod] = await Promise.all([
          import('preact'),
          import('../modules/ard-estimator/ArdEstimator.jsx')
        ]);
        ({ render, h } = preactMod);
        ({ ArdEstimator } = ardMod);
      }

      render(
        h(ArdEstimator, {
          patientId: this.patientId,
          patientName: this.patientName,
          facilityName: this.facilityName,
          orgSlug: this.orgSlug,
          assessmentId: this._assessmentId,
          onBack: () => this.showICD10View(),
          onClose: () => this.close()
        }),
        mountEl
      );

      this._preactUnmount = () => {
        render(null, mountEl);
      };
    } catch (err) {
      console.error('[ICD10Viewer] Failed to load ARD Estimator:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'ard_estimator_load',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      mountEl.innerHTML = `
        <div class="icd10-viewer__error">
          <p class="icd10-viewer__error-text">Failed to load PDPM Estimator: ${this._escapeHtml(err.message)}</p>
          <!-- NO_TRACK: error-recovery navigation back to ICD-10 view -->
          <button class="icd10-viewer__error-retry" onclick="ICD10Viewer.showICD10View()">Go Back</button>
        </div>
      `;
    }
  },

  /**
   * Switch back to ICD-10 view from Query Items
   * Unmounts Preact and restores the 3-panel layout
   */
  showICD10View() {
    if (this._currentView === 'icd10') return;

    // Unmount Preact
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    this._currentView = 'icd10';

    // Restore header
    const titleText = this.modal.querySelector('.icd10-viewer__title-text');
    if (titleText) titleText.textContent = 'ICD-10 Viewer';

    // Show Estimate button again
    const estimateBtn = this.modal.querySelector('.icd10-viewer__estimate-btn');
    if (estimateBtn) estimateBtn.style.display = '';

    // Restore 3-panel body structure
    const body = this.modal.querySelector('.icd10-viewer__body');
    body.classList.remove('icd10-viewer__body--single-panel');
    body.innerHTML = `
      <div class="icd10-viewer__sidebar"></div>
      <div class="icd10-viewer__evidence-panel"></div>
      <div class="icd10-viewer__pdf-viewer"></div>
    `;

    // Re-store panel references
    this.sidebar = body.querySelector('.icd10-viewer__sidebar');
    this.evidencePanel = body.querySelector('.icd10-viewer__evidence-panel');
    this.pdfViewer = body.querySelector('.icd10-viewer__pdf-viewer');

    // Re-initialize components with cached data
    if (this.topRanked.length > 0 || this.annotations.length > 0) {
      this._initializeComponents();
    } else {
      this._showLoading();
      this._loadData();
    }
  },

  /**
   * Show error message in modal
   * @param {string} message - Error message
   */
  _showError(message) {
    if (!this.modal) {
      // Show toast if modal not open
      if (typeof window.showToast === 'function') {
        window.showToast(message, 'error');
      } else {
        alert(message);
      }
      return;
    }

    const errorHTML = `
      <div class="icd10-viewer__error">
        <div class="icd10-viewer__error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="icd10-viewer__error-text">${this._escapeHtml(message)}</p>
        <!-- NO_TRACK: error-recovery retry button -->
        <button class="icd10-viewer__error-retry" onclick="ICD10Viewer._loadData()">
          Retry
        </button>
      </div>
    `;

    const body = this.modal.querySelector('.icd10-viewer__body');
    if (body) {
      body.innerHTML = errorHTML;
    }
  },

  /**
   * Dismiss handler — called from sidebar × and the evidence panel button.
   * Sidebar already applied an optimistic override; we hit the API and refetch.
   */
  async _handleDismiss(groupKey, row) {
    if (!groupKey || this._dismissDisabled) return;
    try {
      window.SuperAnalytics?.track?.('icd10_code_dismissed', {
        code: row?.code || null,
        origin: row?.origin || null,
      });
    } catch (_) { /* never break on telemetry */ }
    try {
      await ICD10API.dismissGroup({
        patientId: this.patientId,
        facilityName: this.facilityName,
        orgSlug: this.orgSlug,
        groupKey,
      });
      // Refetch v2 summary so server-side `dismissed` flips and the sidebar's
      // optimistic override clears on reconciliation.
      this._refreshAnnotations();
    } catch (err) {
      const noAdmit = (err?.serverMessage || err?.message || '').includes('admissionDate');
      if (noAdmit) {
        this._dismissDisabled = true;
        try { ICD10Sidebar.setDismissDisabled(true); } catch (_) {}
        window.SuperToast?.show?.({
          message: "Can't hide — patient has no admission on file.",
          type: 'warning',
        });
      } else if (err?.status === 403) {
        window.SuperToast?.show?.({
          message: "You don't have access to hide codes for this patient.",
          type: 'error',
        });
      } else {
        window.SuperToast?.show?.({
          message: "Couldn't hide that code — try again.",
          type: 'error',
        });
      }
      // Re-throw so the sidebar rolls back its optimistic override.
      throw err;
    }
  },

  async _handleUndismiss(groupKey, row) {
    if (!groupKey) return;
    try {
      window.SuperAnalytics?.track?.('icd10_code_undismissed', {
        code: row?.code || null,
        origin: row?.origin || null,
      });
    } catch (_) {}
    try {
      await ICD10API.undismissGroup({
        patientId: this.patientId,
        facilityName: this.facilityName,
        orgSlug: this.orgSlug,
        groupKey,
      });
      this._refreshAnnotations();
    } catch (err) {
      window.SuperToast?.show?.({
        message: "Couldn't bring that code back — try again.",
        type: 'error',
      });
      throw err;
    }
  },

  /**
   * Background refetch after dismiss/undismiss. Updates sidebar in place;
   * does not touch the evidence panel or PDF viewer.
   */
  async _refreshAnnotations() {
    try {
      const data = await ICD10API.getAnnotations(
        this.patientId, this.facilityName, this.orgSlug, this._assessmentId
      );
      this.topRanked = data.topRanked || [];
      this.approved = data.approved || [];
      this.annotations = data.flatAnnotations || [];
      this.flatGroups = data.flatGroups || null;
      this.counts = data.counts || {};
      ICD10Sidebar.updateData({
        topRanked: this.topRanked,
        approved: this.approved,
        annotations: this.annotations,
        flatGroups: this.flatGroups,
        stagedBaseCodes: this._computeStagedBaseCodes(),
        approvedBaseCodes: this._computeApprovedBaseCodes(),
      });
    } catch (err) {
      // Silent: dismiss already succeeded; the next natural reload will
      // reconcile. Avoid yanking the user with an error toast.
      console.warn('[ICD10Viewer] refresh after dismiss failed:', err);
    }
  },

  /**
   * Escape HTML
   * @param {string} str - String to escape
   * @returns {string}
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Expose globally
window.ICD10Viewer = ICD10Viewer;
