/**
 * ICD-10 Evidence Panel Component
 * Middle panel showing document-grouped evidence for selected diagnoses
 */

// Tracking helper — uses window.SuperAnalytics.track when available so this
// file works both bundled (extension) and as a classic <script> (demo HTMLs).
function _track(event, props) {
  try {
    window.SuperAnalytics?.track?.(event, props || {});
  } catch (e) { /* swallow */ }
}

/**
 * Build the human-readable PDPM label for a code-shaped object that has
 * pdpmCategory + optional pdpmPoints + optional pdpmCategoryName. Examples:
 *   { pdpmCategory: 'NTA', pdpmPoints: 1, pdpmCategoryName: 'Cirrhosis of Liver' }
 *     → "NTA · 1pt · Cirrhosis of Liver"
 *   { pdpmCategory: 'SLP', pdpmCategoryName: 'Acute Neurologic' }
 *     → "SLP · Acute Neurologic"
 *   { pdpmCategory: 'NURSING' }
 *     → "NURSING"
 * Returns '' if no category is set.
 */
function _formatPdpmLabel(o) {
  if (!o || !o.pdpmCategory) return '';
  return [
    o.pdpmCategory,
    o.pdpmPoints != null ? `${o.pdpmPoints}pt` : null,
    o.pdpmCategoryName,
  ].filter(Boolean).join(' · ');
}

/**
 * Evidence list render mode. Flip this to A/B between the two layouts:
 *   'chips' — wrap-flow rounded chips, one row of pages per document (dense)
 *   'full'  — stacked rows with the source excerpt under each page (verbose)
 * No runtime UI for switching; change here and rebuild.
 */
const EVIDENCE_VIEW_MODE = 'full';

const ICD10EvidencePanel = {
  // State
  selectedItemId: null,
  items: [],
  groupContext: null,
  expandedDocuments: new Set(),
  expandedDocItems: new Set(),
  approveLoading: false,
  isApproved: false,
  // Mirror of viewer.stagedCodes by leaf icd10 code. Lets the panel render
  // Add vs ✓ Added per the focused leaf even after the user navigates away
  // and back. Updated by setStagedLeafCodes (called from the viewer).
  stagedLeafCodes: null,
  // Set of leaf icd10 codes already on PCC (from approvedDiagnoses). When
  // the focused leaf is in here, the panel shows a disabled "On PCC" pill
  // instead of an Add button — the code is already billed.
  approvedLeafCodes: null,
  selectedCode: null,
  selectedDescription: null,
  codeDropdownOpen: false,
  codeSearchQuery: '',
  // Whether the "alternate readings" section in the dropdown is expanded.
  // Persists across renders within a group; resets on group switch.
  alternatesExpanded: false,
  itemsLoading: false,
  itemsError: null,
  itemsRetry: null,
  summaryText: null,
  summaryLoading: false,
  summaryError: false,

  /**
   * Initialize the evidence panel
   * @param {HTMLElement} container - The panel container element
   * @param {Function} onCardSelect - Callback when an evidence item is selected
   * @param {Function} onApprove - Callback when approve is clicked
   */
  init(container, onCardSelect, onApprove, onQuery, onUnapprove, onDismiss, onUndismiss) {
    this.container = container;
    this.onCardSelect = onCardSelect;
    this.onApprove = onApprove;
    this.onQuery = onQuery;
    this.onUnapprove = onUnapprove;
    this.onDismiss = onDismiss || null;
    this.onUndismiss = onUndismiss || null;
    this.dismissBusy = false;
    this.isDismissed = false;
    // Reset all state from any previous opening
    this.selectedItemId = null;
    this.items = [];
    this.groupContext = null;
    this.expandedDocuments.clear();
    this.approveLoading = false;
    this.isApproved = false;
    this.stagedLeafCodes = new Set();
    this.selectedCode = null;
    this.selectedDescription = null;
    this.codeDropdownOpen = false;
    this.codeSearchQuery = '';
    this.alternatesExpanded = false;
    this.render();
  },

  /**
   * Update items to display
   * @param {Array} items - Array of annotation items to display
   * @param {boolean} autoSelect - Whether to auto-select the first item
   * @param {Object} groupContext - Diagnosis-level info (groupCode, groupName, evidenceStrength, rationale)
   */
  updateItems(items, autoSelect = true, groupContext = null) {
    console.log('[ICD10EvidencePanel] updateItems called with', items?.length, 'items, autoSelect:', autoSelect);
    // Normalize items to have consistent field names, then deduplicate
    const normalized = this._sortItems(items).map(item => this._normalizeItem(item));
    this.items = this._deduplicateItems(normalized);
    this.groupContext = groupContext;
    this.expandedDocuments.clear();
    this.expandedDocItems.clear();
    this.approveLoading = false;
    this.isApproved = false;
    // Preserve stagedLeafCodes across group switches — the staged set is a
    // session-wide concept owned by the viewer, not a per-group thing.
    if (!(this.stagedLeafCodes instanceof Set)) this.stagedLeafCodes = new Set();
    this.isDismissed = !!groupContext?.dismissed;
    this.dismissBusy = false;
    this.codeDropdownOpen = false;
    this.codeSearchQuery = '';
    this.alternatesExpanded = false;
    this.itemsLoading = false;
    this.itemsError = null;
    this.itemsRetry = null;
    // Don't clear the summary section here — it's fetched in parallel and may
    // already be in flight or rendered. Loading/error state for summary is
    // managed by showSummaryLoading / showSummary / clearSummary independently.

    // Set initial selected code from groupContext or first item
    if (groupContext && groupContext.groupCode) {
      this.selectedCode = groupContext.groupCode;
      this.selectedDescription = groupContext.groupName || this._getDescriptionForCode(groupContext.groupCode);
    } else if (this.items.length > 0) {
      this.selectedCode = this.items[0].icd10Code;
      this.selectedDescription = this.items[0].description;
    } else {
      this.selectedCode = null;
      this.selectedDescription = null;
    }

    // Auto-expand all document groups
    const docGroups = this._groupByDocument(this.items);
    docGroups.forEach(dg => this.expandedDocuments.add(dg.documentId));

    this.render();

    // Track evidence-opened for the selected diagnosis code (reference data, safe).
    if (this.selectedCode && this.items.length > 0) {
      _track('icd10_evidence_opened', { code: this.selectedCode });
    }

    // Auto-select first item if requested and items exist
    if (autoSelect && this.items.length > 0) {
      console.log('[ICD10EvidencePanel] Auto-selecting first item:', this.items[0].id);
      this._selectItem(this.items[0].id);
    }
  },

  /**
   * Normalize item fields to consistent names
   * @param {Object} item - Raw annotation item
   * @returns {Object} - Normalized item
   */
  _normalizeItem(item) {
    const normalized = {
      ...item,
      // Normalize document ID
      documentId: item.documentId || item.docId || item.sourceDocumentId || item.document?.id || null,
      // Normalize quote text (includes evidenceExcerpt from new API)
      quoteText: item.quoteText || item.evidenceExcerpt || item.quote || item.text || item.evidenceText ||
                 item.snippet || item.excerpt || '',
      // Normalize document name
      documentName: item.documentName || item.docName || item.documentTitle ||
                    item.sourceName || item.document?.name || item.document?.title ||
                    item.document?.documentTitle || 'Document',
      // Normalize page number
      pageNumber: item.pageNumber || item.page || item.pageNum ||
                  item.document?.page || item.location?.page || 1,
      // Keep wordBlockIndices for API-based resolution (array of integers)
      wordBlockIndices: item.wordBlockIndices || item.wordBlockIds || item.highlightIndices || [],
      // Also keep direct wordBlocks for mock data compatibility
      wordBlocks: item.wordBlocks || item.highlights || item.boundingBoxes ||
                  item.location?.wordBlocks || item.positions || [],
      // Preserve options array as-is
      options: item.options || [],
      // Preserve evidenceStrength as-is
      evidenceStrength: item.evidenceStrength || null,
      // Normalize document date
      documentDate: item.documentDate || item.documentEffectiveDate || item.effectiveDate ||
                    item.document?.effectiveDate || item.document?.documentEffectiveDate ||
                    item.date || item.createdAt || ''
    };
    console.log('[ICD10EvidencePanel] Normalized item:', normalized.id, 'wordBlockIndices:', normalized.wordBlockIndices?.length, 'wordBlocks:', normalized.wordBlocks?.length);
    return normalized;
  },

  /**
   * Remove duplicate evidence items (same code, document, page, and quote).
   * Keeps the first occurrence (highest confidence since items are pre-sorted).
   * @param {Array} items - Normalized items
   * @returns {Array} - Deduplicated items
   */
  _deduplicateItems(items) {
    const seen = new Set();
    const deduped = items.filter(item => {
      const key = `${item.icd10Code}|${item.documentId}|${item.pageNumber}|${item.quoteText}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (deduped.length < items.length) {
      console.log('[ICD10EvidencePanel] Deduplicated:', items.length, '->', deduped.length);
    }
    return deduped;
  },

  /**
   * Sort items by rank (ascending) then confidence (descending)
   * @param {Array} items - Items to sort
   * @returns {Array} - Sorted items
   */
  _sortItems(items) {
    return [...items].sort((a, b) => {
      // First sort by rank (lower is better)
      if (a.rank !== b.rank) {
        return (a.rank || 999) - (b.rank || 999);
      }
      // Then by confidence (higher is better)
      return (b.confidence || 0) - (a.confidence || 0);
    });
  },

  /**
   * Group items by document
   * @param {Array} items - Normalized items
   * @returns {Array} - Array of { documentId, documentName, documentDate, items }
   */
  _groupByDocument(items) {
    const docMap = new Map();

    items.forEach(item => {
      const docId = item.documentId || 'unknown';
      if (!docMap.has(docId)) {
        docMap.set(docId, {
          documentId: docId,
          documentName: this._formatDocumentName(item.documentName),
          documentDate: item.documentDate || '',
          items: []
        });
      }
      docMap.get(docId).items.push(item);
    });

    // Sort groups by number of items (most evidence first)
    return Array.from(docMap.values()).sort((a, b) => b.items.length - a.items.length);
  },

  /**
   * Get all unique codes from items' options arrays
   * @returns {Array} - Array of { code, description }
   */
  _getAvailableCodes() {
    const codeMap = new Map();

    // Add the primary code first
    if (this.groupContext?.groupCode) {
      codeMap.set(this.groupContext.groupCode, {
        code: this.groupContext.groupCode,
        description: this.groupContext.groupName || this._getDescriptionForCode(this.groupContext.groupCode),
        pdpmCategory: null,
        pdpmPoints: null,
        pdpmCategoryName: null,
        evidenceKind: 'primary',
      });
    }

    // Collect unique codes from all items' options.
    // Primary precedence: if a code appears as some annotation's icd10Code, it's
    // primary even if it also shows up in another annotation's options[]. The
    // backend's evidenceKind on the option entry encodes this; we still cross-
    // check against icd10Code so back-compat with older annotations (no
    // evidenceKind field) lands on the safe answer.
    const primaryFromIcd10 = new Set(
      (this.items || []).map(i => i.icd10Code).filter(Boolean)
    );

    this.items.forEach(item => {
      if (item.options && item.options.length > 0) {
        item.options.forEach(opt => {
          if (!codeMap.has(opt.code)) {
            // Trust evidenceKind when present; otherwise infer from whether
            // the code shows up as a primary icd10Code anywhere.
            const evidenceKind = opt.evidenceKind
              || (primaryFromIcd10.has(opt.code) ? 'primary' : 'alternate');
            codeMap.set(opt.code, {
              code: opt.code,
              description: opt.description || '',
              pdpmCategory: opt.pdpmCategory ?? null,
              pdpmPoints: opt.pdpmPoints,
              pdpmCategoryName: opt.pdpmCategoryName ?? null,
              evidenceKind,
            });
          } else {
            // Already in map; if this entry says primary and what we have is
            // alternate, upgrade. Never downgrade primary → alternate.
            const existing = codeMap.get(opt.code);
            if (opt.evidenceKind === 'primary' && existing.evidenceKind !== 'primary') {
              existing.evidenceKind = 'primary';
            }
          }
        });
      }
      // Also add the item's own code (always primary).
      if (item.icd10Code && !codeMap.has(item.icd10Code)) {
        codeMap.set(item.icd10Code, {
          code: item.icd10Code,
          description: item.description || '',
          pdpmCategory: item.pdpmCategory ?? null,
          pdpmPoints: item.pdpmPoints,
          pdpmCategoryName: item.pdpmCategoryName ?? null,
          evidenceKind: 'primary',
        });
      } else if (item.icd10Code && codeMap.has(item.icd10Code)) {
        // Upgrade to primary if it was first seen as an option somewhere.
        const existing = codeMap.get(item.icd10Code);
        if (existing.evidenceKind !== 'primary') existing.evidenceKind = 'primary';
        // Prefer parent annotation's pdpmCategoryName if missing.
        if (!existing.pdpmCategoryName && item.pdpmCategoryName) {
          existing.pdpmCategoryName = item.pdpmCategoryName;
        }
      }
    });

    return Array.from(codeMap.values());
  },

  /**
   * Get description for a code from items
   * @param {string} code - ICD-10 code
   * @returns {string}
   */
  _getDescriptionForCode(code) {
    for (const item of this.items) {
      if (item.icd10Code === code) return item.description || '';
      if (item.options) {
        const opt = item.options.find(o => o.code === code);
        if (opt) return opt.description || '';
      }
    }
    return '';
  },

  /**
   * Render the evidence panel
   */
  render() {
    if (!this.container) return;

    // v2: detail-fetch in flight. Show diagnosis header + skeleton rows.
    if (this.itemsLoading) {
      const summaryHtml = this._buildSummaryHtml() || '';
      this.container.innerHTML = `
        ${this._renderDiagnosisHeader()}
        ${summaryHtml}
        <div class="icd10-evidence-panel__items-loading">
          <div class="icd10-evidence-panel__skeleton-row"></div>
          <div class="icd10-evidence-panel__skeleton-row"></div>
          <div class="icd10-evidence-panel__skeleton-row"></div>
          <div class="icd10-evidence-panel__skeleton-hint">Loading mentions…</div>
        </div>
      `;
      this._attachEventListeners();
      return;
    }

    // v2: detail-fetch failed. Show retry inline rather than blanking the panel.
    if (this.itemsError) {
      const summaryHtml = this._buildSummaryHtml() || '';
      this.container.innerHTML = `
        ${this._renderDiagnosisHeader()}
        ${summaryHtml}
        <div class="icd10-evidence-panel__items-error">
          <p class="icd10-evidence-panel__items-error-text">Couldn't load mentions for ${this._escapeHtml(this.selectedCode || '')}.</p>
          <!-- NO_TRACK: error-recovery retry, fires the same selection flow which already tracks -->
          <button class="icd10-evidence-panel__items-error-retry" data-action="retry-items">Retry</button>
        </div>
      `;
      const retry = this.container.querySelector('[data-action="retry-items"]');
      if (retry && this.itemsRetry) retry.addEventListener('click', () => this.itemsRetry());
      return;
    }

    if (this.items.length === 0) {
      this.container.innerHTML = `
        <div class="icd10-evidence-panel__empty">
          <div class="icd10-evidence-panel__empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <p class="icd10-evidence-panel__empty-text">Select a diagnosis code from the sidebar to view evidence</p>
        </div>
      `;
      return;
    }

    const summaryHtml = this._buildSummaryHtml() || '';

    // Filter to mentions for the focused leaf. When the focused leaf has
    // zero direct mentions but a sibling under the same base does, auto-
    // swap the evidence list to that sibling — surfaced via a banner so
    // the user knows the evidence shown is for a similar code, not the
    // one they clicked.
    const focused = this.selectedCode || '';
    let effectiveCode = focused;
    let autoSwap = null;
    let focusedItems = focused
      ? this.items.filter(it => it.icd10Code === focused)
      : this.items;

    if (focused && focusedItems.length === 0 && this.items.length > 0) {
      const sibling = this._suggestDocumentedSibling(focused);
      if (sibling) {
        effectiveCode = sibling.code;
        autoSwap = { from: focused, to: sibling.code, toDescription: sibling.description };
        focusedItems = this.items.filter(it => it.icd10Code === sibling.code);
      }
    }

    const docGroups = this._groupByDocument(focusedItems);
    const uniqueDocCount = docGroups.length;
    const mentionCount = focusedItems.length;

    let bannerHtml = '';
    if (autoSwap) {
      bannerHtml = `
        <div class="icd10-evidence-panel__similar-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span class="icd10-evidence-panel__similar-banner-text">
            Showing similar code <strong>${this._escapeHtml(autoSwap.to)}</strong> — no direct mentions of <strong>${this._escapeHtml(autoSwap.from)}</strong>.
          </span>
        </div>
      `;
    }

    let countHtml = '';
    if (mentionCount === 0 && this.items.length > 0 && !autoSwap) {
      // Rare: focused has 0 mentions AND no sibling to auto-swap to.
      // Show the honest "no evidence found" state with no suggestion.
      countHtml = `
        <div class="icd10-evidence-panel__doc-count icd10-evidence-panel__doc-count--empty">
          No evidence found for <strong>${this._escapeHtml(focused)}</strong>.
        </div>
      `;
    } else if (mentionCount > 0) {
      countHtml = `
        <div class="icd10-evidence-panel__doc-count">
          ${mentionCount} mention${mentionCount !== 1 ? 's' : ''} across ${uniqueDocCount} document${uniqueDocCount !== 1 ? 's' : ''}
        </div>
      `;
    }

    const html = `
      ${this._renderDiagnosisHeader()}
      ${summaryHtml}
      ${bannerHtml}
      ${countHtml}
      <div class="icd10-evidence-panel__list">
        ${docGroups.map(docGroup => this._renderDocumentGroup(docGroup)).join('')}
      </div>
    `;

    this.container.innerHTML = html;
    this._attachEventListeners();
  },

  /**
   * Pick the highest-confidence primary leaf under the focused leaf's base
   * code, used as a one-click "Did you mean…?" suggestion when a focused
   * leaf has zero direct mentions. Returns null if nothing better exists.
   */
  _suggestDocumentedSibling(focusedCode) {
    if (!focusedCode || focusedCode.length < 3) return null;
    const base = focusedCode.substring(0, 3);
    const seen = new Map(); // code → {code, description, confidence}
    for (const it of this.items || []) {
      const c = it.icd10Code;
      if (!c || c === focusedCode) continue;
      if (c.substring(0, 3) !== base) continue;
      const conf = typeof it.confidence === 'number' ? it.confidence : 0;
      const existing = seen.get(c);
      if (!existing || conf > existing.confidence) {
        seen.set(c, { code: c, description: it.description || '', confidence: conf });
      }
    }
    if (seen.size === 0) return null;
    return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence)[0];
  },

  /**
   * Render the diagnosis header with code selector and approve button
   * @returns {string} - HTML string
   */
  _renderDiagnosisHeader() {
    const code = this.selectedCode || '';
    const description = this.selectedDescription || '';
    const availableCodes = this._getAvailableCodes();
    const hasMultipleCodes = availableCodes.length > 1;

    // Resolve focused leaf metadata up front — used for the header badge,
    // the alternate-detection, and the staged/alternate Add button choice.
    const focusedMeta =
      (this.items || []).find(it => it.icd10Code === code)
      || availableCodes.find(c => c.code === code)
      || null;

    // Reflect "added" state from the session-wide staged set, so navigating
    // away and back to a leaf still shows ✓ Added correctly.
    const isFocusedStaged = this._isFocusedLeafStaged() || this.isApproved;
    const isFocusedAlternate = this._isFocusedCodeAlternate(focusedMeta);
    const isFocusedOnPcc = this._isFocusedLeafOnPcc();

    let approveHtml = '';
    if (isFocusedOnPcc) {
      // Code is already on PCC — render a disabled "On PCC" pill so the
      // user can't accidentally double-bill. Takes precedence over staged
      // (staged should never coexist with on-PCC, but if it does the
      // on-PCC truth wins).
      approveHtml = `
        <!-- NO_TRACK: read-only PCC indicator, no click handler -->
        <span class="icd10-evidence-panel__approve icd10-evidence-panel__approve--on-pcc"
              title="This code is already on PCC for this patient. To remove, edit the diagnosis list in PCC directly.">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          On PCC
        </span>
      `;
    } else if (isFocusedStaged) {
      approveHtml = `
        <!-- NO_TRACK: undo button — local state flip, no API call -->
        <button class="icd10-evidence-panel__approve icd10-evidence-panel__approve--approved" data-action="unapprove" title="Click to remove (undo)">
          <span class="icd10-evidence-panel__approve-default">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Added
          </span>
          <span class="icd10-evidence-panel__approve-hover">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            Remove
          </span>
        </button>
      `;
    } else if (this.approveLoading) {
      approveHtml = `
        <!-- NO_TRACK: disabled loading state — no click handler -->
        <button class="icd10-evidence-panel__approve icd10-evidence-panel__approve--loading" disabled>
          <span class="icd10-evidence-panel__approve-spinner"></span>
          Adding...
        </button>
      `;
    } else if (isFocusedAlternate) {
      // Alternate codes (Comprehend's lower-confidence readings) shouldn't be
      // staged without acknowledgment. Render an amber "Add anyway" instead
      // of the default green Add — single click stages with a confirm prompt.
      approveHtml = `
        <!-- NO_TRACK: confirms first via window.confirm before firing onApprove -->
        <button class="icd10-evidence-panel__approve icd10-evidence-panel__approve--alternate" data-action="approve-alternate"
                title="This code isn't directly documented in any chart mention. Click to add anyway.">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          Add anyway
        </button>
      `;
    } else {
      approveHtml = `
        <!-- NO_TRACK: dx_confirmed event fires from the confirmation flow on commit -->
        <button class="icd10-evidence-panel__approve" data-action="approve">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Add
        </button>
      `;
    }

    // Query button: only shown when we have items (i.e. detail has loaded) and
    // a query handle (onQuery) is wired in.
    const canDismiss = !!this.groupContext?.groupKey && !isFocusedStaged && !isFocusedOnPcc;
    const dismissBusy = this.dismissBusy;
    const dismissed = this.isDismissed;
    let dismissHtml = '';
    if (canDismiss) {
      const eyeOff = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      const eyeOn = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      const spinner = `<span class="icd10-evidence-panel__dismiss-spinner"></span>`;
      if (dismissBusy && dismissed) {
        // Just clicked Unhide — transitioning back.
        dismissHtml = `
          <!-- NO_TRACK: disabled loading state — no click handler -->
          <button class="icd10-evidence-panel__dismiss icd10-evidence-panel__dismiss--loading" disabled>
            ${spinner}Unhiding…
          </button>
        `;
      } else if (dismissBusy && !dismissed) {
        // Just clicked Hide — transitioning to hidden.
        dismissHtml = `
          <!-- NO_TRACK: disabled loading state — no click handler -->
          <button class="icd10-evidence-panel__dismiss icd10-evidence-panel__dismiss--loading" disabled>
            ${spinner}Hiding…
          </button>
        `;
      } else if (dismissed) {
        dismissHtml = `
          <!-- NO_TRACK: undismiss tracks icd10_code_undismissed via viewer handler -->
          <button class="icd10-evidence-panel__dismiss icd10-evidence-panel__dismiss--hidden" data-action="undismiss"
                  title="Bring this code back to the list">
            ${eyeOn}
            Unhide
          </button>
        `;
      } else {
        dismissHtml = `
          <!-- NO_TRACK: dismiss tracks icd10_code_dismissed via viewer handler -->
          <button class="icd10-evidence-panel__dismiss" data-action="dismiss"
                  title="Hide for this stay. Will return on readmission.">
            ${eyeOff}
            Hide
          </button>
        `;
      }
    }

    // Query is always available when the handler's wired. Coders may want
    // to write a clarifying query even on codes with no Comprehend evidence
    // (the most common reason: doc says "diabetes" but the chart didn't
    // specify with/without complications — query the provider to clarify).
    const canQuery = !!this.onQuery;
    const queryHtml = canQuery ? `
      <!-- NO_TRACK: query create flow tracks dx_query_created at submit time -->
      <button class="icd10-evidence-panel__query" data-action="query" title="Generate a physician query for this code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        Query
      </button>
    ` : '';

    // Render the focused code's pdpm badge inline with the code pill —
    // focusedMeta was already resolved above for the alternate check.
    let headerBadgeHtml = '';
    if (focusedMeta && focusedMeta.pdpmCategory) {
      const cat = focusedMeta.pdpmCategory;
      const lower = String(cat).toLowerCase().replace(/[^a-z]/g, '');
      // Full label (e.g. "NTA · 1pt · Cirrhosis of Liver"). The header has
      // room for the long form; coders shouldn't have to know what NTA-1
      // category covers.
      const label = _formatPdpmLabel(focusedMeta);
      const tooltip = focusedMeta.pdpmCategoryName || cat;
      headerBadgeHtml = `<span class="icd10-evidence-panel__diagnosis-badge icd10-evidence-panel__diagnosis-badge--${lower}" title="${this._escapeHtml(tooltip)}">${this._escapeHtml(label)}</span>`;
    }

    return `
      <div class="icd10-evidence-panel__header">
        <div class="icd10-evidence-panel__diagnosis-header">
          <div class="icd10-evidence-panel__diagnosis-top">
            <div class="icd10-evidence-panel__code-selector ${hasMultipleCodes ? 'icd10-evidence-panel__code-selector--has-options' : ''}" data-action="toggle-codes">
              <span class="icd10-evidence-panel__diagnosis-code">${this._escapeHtml(code)}</span>
              ${hasMultipleCodes ? `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icd10-evidence-panel__code-chevron ${this.codeDropdownOpen ? 'icd10-evidence-panel__code-chevron--open' : ''}">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              ` : ''}
            </div>
            ${headerBadgeHtml}
            <span class="icd10-evidence-panel__diagnosis-desc">${this._escapeHtml(description)}</span>
          </div>
          ${this.codeDropdownOpen ? (() => {
            const q = this.codeSearchQuery;
            const primaryAll = availableCodes.filter(c => c.evidenceKind !== 'alternate');
            const alternateAll = availableCodes.filter(c => c.evidenceKind === 'alternate');
            const primary = this._filterCodes(primaryAll, q);
            const alternates = this._filterCodes(alternateAll, q);
            // Auto-expand alternates when the user is searching and there are
            // hits there — otherwise the search would feel broken.
            const altsAutoExpand = q && alternates.length > 0;
            const altsOpen = this.alternatesExpanded || altsAutoExpand;
            const primaryShown = primary.slice(0, 10);
            const altsShown = altsOpen ? alternates.slice(0, 10) : [];
            return `
            <div class="icd10-evidence-panel__code-dropdown">
              <input type="text" class="icd10-evidence-panel__code-search"
                     data-action="code-search"
                     placeholder="Search by code or name..."
                     value="${this._escapeHtml(q)}"
                     autocomplete="off" />
              ${primary.length === 0 && (alternates.length === 0 || !altsOpen) ? `
                <div class="icd10-evidence-panel__code-option icd10-evidence-panel__code-option--empty">
                  <span class="icd10-evidence-panel__code-option-desc">No matches</span>
                </div>
              ` : ''}
              ${primaryShown.map(opt => this._renderCodeOption(opt)).join('')}
              ${primary.length > 10 ? `
                <div class="icd10-evidence-panel__code-option-hint">
                  Showing 10 of ${primary.length} — refine search to narrow
                </div>
              ` : ''}
              ${alternateAll.length > 0 ? `
                <!-- NO_TRACK: pure UI disclosure toggle, no API call -->
                <button type="button" class="icd10-evidence-panel__alts-toggle ${altsOpen ? 'icd10-evidence-panel__alts-toggle--open' : ''}"
                        data-action="toggle-alternates"
                        aria-expanded="${altsOpen}">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  ${altsOpen ? 'Hide' : 'Show'} ${alternateAll.length} alternate reading${alternateAll.length === 1 ? '' : 's'}
                </button>
              ` : ''}
              ${altsOpen && alternateAll.length > 0 ? `
                <div class="icd10-evidence-panel__alts-hint">
                  Comprehend's lower-confidence readings of the same text. Primary code is documented elsewhere.
                </div>
                ${altsShown.map(opt => this._renderCodeOption(opt)).join('')}
                ${alternates.length > 10 ? `
                  <div class="icd10-evidence-panel__code-option-hint">
                    Showing 10 of ${alternates.length} — refine search to narrow
                  </div>
                ` : ''}
              ` : ''}
            </div>
            `;
          })() : ''}
          <div class="icd10-evidence-panel__diagnosis-actions">
            ${approveHtml}
            ${queryHtml}
            ${dismissHtml}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render a document group section
   * @param {Object} docGroup - { documentId, documentName, documentDate, items }
   * @returns {string} - HTML string
   */
  _renderDocumentGroup(docGroup) {
    const isExpanded = this.expandedDocuments.has(docGroup.documentId);
    const formattedDate = docGroup.documentDate ? this._formatDate(docGroup.documentDate) : '';
    const headerParts = [this._escapeHtml(docGroup.documentName)];
    if (formattedDate) headerParts.push(formattedDate);

    return `
      <div class="icd10-evidence-panel__doc-group ${isExpanded ? 'icd10-evidence-panel__doc-group--expanded' : ''}"
           data-doc-id="${docGroup.documentId}">
        <div class="icd10-evidence-panel__doc-header" data-doc-toggle="${docGroup.documentId}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icd10-evidence-panel__doc-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span class="icd10-evidence-panel__doc-name">${headerParts.join(' - ')}</span>
          <span class="icd10-evidence-panel__doc-item-count">${docGroup.items.length}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               class="icd10-evidence-panel__doc-chevron ${isExpanded ? 'icd10-evidence-panel__doc-chevron--expanded' : ''}">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        ${isExpanded ? (() => {
          const maxItems = 8;
          const showAll = this.expandedDocItems.has(docGroup.documentId);
          const visibleItems = showAll ? docGroup.items : docGroup.items.slice(0, maxItems);
          const hiddenCount = docGroup.items.length - maxItems;
          return `
            <div class="icd10-evidence-panel__doc-items icd10-evidence-panel__doc-items--${EVIDENCE_VIEW_MODE}">
              ${visibleItems.map((item, index) => this._renderEvidenceItem(item, index + 1)).join('')}
              ${!showAll && hiddenCount > 0 ? `
                <!-- NO_TRACK: pure UI expand/collapse, no engagement event needed -->
                <button class="icd10-evidence-panel__show-more-items" data-action="show-more-items" data-doc-id="${docGroup.documentId}">
                  +${hiddenCount} more
                </button>
              ` : ''}
              ${showAll && hiddenCount > 0 ? `
                <!-- NO_TRACK: pure UI expand/collapse, no engagement event needed -->
                <button class="icd10-evidence-panel__show-more-items" data-action="show-fewer-items" data-doc-id="${docGroup.documentId}">
                  Show less
                </button>
              ` : ''}
            </div>
          `;
        })() : ''}
      </div>
    `;
  },

  /**
   * Render a single evidence item within a document group
   * @param {Object} item - Normalized annotation item
   * @param {number} index - 1-based index within the document
   * @returns {string} - HTML string
   */
  _renderEvidenceItem(item, index) {
    return EVIDENCE_VIEW_MODE === 'full'
      ? this._renderEvidenceItemFull(item, index)
      : this._renderEvidenceItemChip(item, index);
  },

  _renderEvidenceItemChip(item, index) {
    const isSelected = this.selectedItemId === item.id;
    const code = item.icd10Code || '';
    const matchesSelected = this.selectedCode && code === this.selectedCode;

    return `
      <!-- NO_TRACK: navigates the PDF viewer to the selected mention; engagement is captured by icd10_code_clicked / icd10_evidence_opened -->
      <button type="button"
              class="icd10-evidence-panel__chip ${isSelected ? 'icd10-evidence-panel__chip--selected' : ''}"
              data-item-id="${item.id}"
              title="${this._escapeHtml(code)} · Page ${item.pageNumber}">
        ${code ? `<span class="icd10-evidence-panel__chip-code ${matchesSelected ? 'icd10-evidence-panel__chip-code--match' : ''}">${this._escapeHtml(code)}</span>` : ''}
        <span class="icd10-evidence-panel__chip-page">Page ${item.pageNumber}</span>
      </button>
    `;
  },

  _renderEvidenceItemFull(item, index) {
    const isSelected = this.selectedItemId === item.id;
    const quote = item.quoteText || '';
    const maxQuoteLength = 160;
    const truncatedQuote = quote.length > maxQuoteLength
      ? quote.substring(0, maxQuoteLength) + '…'
      : quote;
    const showCodeInline = this.selectedCode && item.icd10Code !== this.selectedCode;

    return `
      <div class="icd10-evidence-panel__evidence-item ${isSelected ? 'icd10-evidence-panel__evidence-item--selected' : ''}"
           data-item-id="${item.id}">
        <span class="icd10-evidence-panel__evidence-num">${index}</span>
        <div class="icd10-evidence-panel__evidence-content">
          <div class="icd10-evidence-panel__evidence-line">
            ${showCodeInline ? `<span class="icd10-evidence-panel__evidence-inline-code">${this._escapeHtml(item.icd10Code)}</span>` : ''}
            <span class="icd10-evidence-panel__evidence-page">Page ${item.pageNumber}</span>
          </div>
          ${truncatedQuote
            ? `<div class="icd10-evidence-panel__evidence-quote">"${this._escapeHtml(truncatedQuote)}"</div>`
            : ''}
        </div>
      </div>
    `;
  },

  /**
   * Format document name for display
   * @param {string} name - Raw document name
   * @returns {string} - Formatted name
   */
  _formatDocumentName(name) {
    if (!name) return 'Document';
    // Replace underscores with spaces and clean up
    return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  },

  /**
   * Format a date string for display (e.g. "Feb 06, 2026")
   * @param {string} dateStr - ISO date string or date-like string
   * @returns {string}
   */
  _formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
    } catch { return ''; }
  },

  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string} - Escaped string
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Attach event listeners
   */
  _attachEventListeners() {
    // Evidence item click -> select and navigate PDF
    this.container.querySelectorAll('.icd10-evidence-panel__chip, .icd10-evidence-panel__evidence-item').forEach(el => {
      el.addEventListener('click', () => {
        const itemId = el.dataset.itemId;
        this._selectItem(itemId);
      });
    });

    // Document header click -> toggle expand/collapse
    this.container.querySelectorAll('[data-doc-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const docId = el.dataset.docToggle;
        this._toggleDocument(docId);
      });
    });

    // Code selector click -> toggle dropdown
    const codeSelector = this.container.querySelector('[data-action="toggle-codes"]');
    if (codeSelector) {
      codeSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleCodeDropdown();
      });
    }

    // Code option selection
    this.container.querySelectorAll('[data-select-code]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = el.dataset.selectCode;
        const desc = el.dataset.selectDesc;
        this._selectCode(code, desc);
      });
    });

    // "Did you mean {sibling}?" click — focuses the suggested documented leaf.
    const siblingBtn = this.container.querySelector('[data-suggest-code]');
    if (siblingBtn) {
      // NO_TRACK: navigation only; _selectCode emits its own icd10_code_clicked
      siblingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = siblingBtn.dataset.suggestCode;
        const desc = siblingBtn.dataset.suggestDesc || '';
        this._selectCode(code, desc);
      });
    }

    // Alternates section disclosure toggle
    const altsToggle = this.container.querySelector('[data-action="toggle-alternates"]');
    if (altsToggle) {
      altsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.alternatesExpanded = !this.alternatesExpanded;
        this.render();
        // Re-focus the search input so keyboard flow stays intact.
        const input = this.container.querySelector('[data-action="code-search"]');
        if (input) input.focus();
      });
    }

    // Approve button click
    const approveBtn = this.container.querySelector('[data-action="approve"]');
    if (approveBtn) {
      approveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleApprove();
      });
    }

    // Alternate-add button click ("Add anyway") — same code path as normal
    // Add. The amber styling + the "Add anyway" wording on the button is
    // the warning; we trust the user to read what they clicked.
    const approveAltBtn = this.container.querySelector('[data-action="approve-alternate"]');
    if (approveAltBtn) {
      approveAltBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleApprove();
      });
    }

    // Unapprove (undo) click on the "Added" pill
    const unapproveBtn = this.container.querySelector('[data-action="unapprove"]');
    if (unapproveBtn) {
      unapproveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleUnapprove();
      });
    }

    // Query button click — hands off to the viewer's onQuery callback
    // with everything needed to build a single-item solverResult.
    const queryBtn = this.container.querySelector('[data-action="query"]');
    if (queryBtn) {
      queryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Resolve focused leaf metadata so the Query payload carries the
        // LEAF's pdpm signal (one base can split across categories — E11.40
        // vs E11.621 — and the group-level pdpmCategory is often null for
        // approved/PCC rows where we only had partial data at sidebar build
        // time). Header badge already proves the leaf has these fields.
        const code = this.selectedCode;
        const focusedMeta =
          (this.items || []).find(it => it.icd10Code === code)
          || (this._getAvailableCodes ? this._getAvailableCodes().find(c => c.code === code) : null)
          || null;
        const ctx = this.groupContext || {};
        const payload = {
          baseCode: code,
          description: this.selectedDescription,
          groupContext: {
            ...ctx,
            pdpmCategory: focusedMeta?.pdpmCategory || ctx.pdpmCategory || null,
            pdpmCategoryName: focusedMeta?.pdpmCategoryName || ctx.pdpmCategoryName || null,
            pdpmPoints: focusedMeta?.pdpmPoints ?? ctx.pdpmPoints,
            mdsItemCode: focusedMeta?.mdsItemCode || ctx.mdsItemCode || null,
          },
          items: this.items,
        };
        console.log('[ICD10EvidencePanel] Query click → onQuery payload:', {
          hasHandler: typeof this.onQuery === 'function',
          baseCode: payload.baseCode,
          itemCount: payload.items?.length,
          focusedMetaPdpm: focusedMeta?.pdpmCategory,
          ctxPdpmFinal: payload.groupContext.pdpmCategory,
          ctxMdsItemFinal: payload.groupContext.mdsItemCode,
        });
        if (typeof this.onQuery === 'function') {
          this.onQuery(payload);
        }
      });
    }

    const dismissBtn = this.container.querySelector('[data-action="dismiss"]');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.dismissBusy) return;
        const groupKey = this.groupContext?.groupKey;
        if (!groupKey || typeof this.onDismiss !== 'function') return;
        this.dismissBusy = true;
        this.render();
        Promise.resolve(this.onDismiss(groupKey, {
          code: this.selectedCode,
          origin: 'evidence-panel',
        })).then(() => {
          this.isDismissed = true;
          if (this.groupContext) this.groupContext.dismissed = true;
        }).finally(() => {
          this.dismissBusy = false;
          this.render();
        });
      });
    }

    const undismissBtn = this.container.querySelector('[data-action="undismiss"]');
    if (undismissBtn) {
      undismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.dismissBusy) return;
        const groupKey = this.groupContext?.groupKey;
        if (!groupKey || typeof this.onUndismiss !== 'function') return;
        this.dismissBusy = true;
        this.render();
        Promise.resolve(this.onUndismiss(groupKey, {
          code: this.selectedCode,
          origin: 'evidence-panel',
        })).then(() => {
          this.isDismissed = false;
          if (this.groupContext) this.groupContext.dismissed = false;
        }).finally(() => {
          this.dismissBusy = false;
          this.render();
        });
      });
    }

    // Show more/fewer items within a document
    this.container.querySelectorAll('[data-action="show-more-items"]').forEach(el => {
      el.addEventListener('click', () => {
        this.expandedDocItems.add(el.dataset.docId);
        this.render();
      });
    });
    this.container.querySelectorAll('[data-action="show-fewer-items"]').forEach(el => {
      el.addEventListener('click', () => {
        this.expandedDocItems.delete(el.dataset.docId);
        this.render();
      });
    });

    // Code search input: filter without losing focus
    const searchInput = this.container.querySelector('[data-action="code-search"]');
    if (searchInput) {
      searchInput.addEventListener('click', (e) => e.stopPropagation());
      searchInput.addEventListener('input', (e) => {
        this.codeSearchQuery = e.target.value;
        this._renderCodeDropdownList();
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.codeDropdownOpen = false;
          this.codeSearchQuery = '';
          this.render();
        }
      });
    }

    // Close code dropdown when clicking outside
    this.container.addEventListener('click', (e) => {
      if (this.codeDropdownOpen && !e.target.closest('[data-action="toggle-codes"]') && !e.target.closest('.icd10-evidence-panel__code-dropdown')) {
        this.codeDropdownOpen = false;
        this.codeSearchQuery = '';
        this.render();
      }
    });
  },

  /**
   * Toggle document group expand/collapse
   * @param {string} docId - Document ID
   */
  _toggleDocument(docId) {
    if (this.expandedDocuments.has(docId)) {
      this.expandedDocuments.delete(docId);
    } else {
      this.expandedDocuments.add(docId);
    }
    this.render();
  },

  /**
   * Select an evidence item
   * @param {string} itemId - Item ID to select
   */
  _selectItem(itemId) {
    console.log('[ICD10EvidencePanel] _selectItem called:', itemId, 'current:', this.selectedItemId);
    if (this.selectedItemId === itemId) {
      console.log('[ICD10EvidencePanel] Item already selected, skipping');
      return;
    }

    this.selectedItemId = itemId;

    // Make sure the document containing this item is expanded
    const item = this.items.find(i => i.id === itemId);
    if (item && item.documentId) {
      this.expandedDocuments.add(item.documentId);
    }

    // Top code follows the selected annotation
    if (item && item.icd10Code) {
      this.selectedCode = item.icd10Code;
      this.selectedDescription = item.description || this._getDescriptionForCode(item.icd10Code);
    }

    this.render();

    // Notify to load PDF
    console.log('[ICD10EvidencePanel] Found item:', item?.id, 'has callback:', !!this.onCardSelect);
    if (item && this.onCardSelect) {
      console.log('[ICD10EvidencePanel] Calling onCardSelect for item:', item.id);
      this.onCardSelect(item);
    }
  },

  /**
   * Toggle the code selector dropdown
   */
  _toggleCodeDropdown() {
    const availableCodes = this._getAvailableCodes();
    if (availableCodes.length <= 1) return;
    this.codeDropdownOpen = !this.codeDropdownOpen;
    if (!this.codeDropdownOpen) this.codeSearchQuery = '';
    this.render();
    if (this.codeDropdownOpen) {
      const input = this.container.querySelector('[data-action="code-search"]');
      if (input) input.focus();
    }
  },

  /**
   * Fuzzy-ish filter: matches against code prefix or substrings of code/description.
   * Empty query returns the full list unchanged.
   */
  /**
   * Re-render only the dropdown's option rows (preserves search input focus).
   */
  _renderCodeDropdownList() {
    const dropdown = this.container.querySelector('.icd10-evidence-panel__code-dropdown');
    if (!dropdown) return;
    const input = dropdown.querySelector('[data-action="code-search"]');
    const availableCodes = this._getAvailableCodes();
    const matches = this._filterCodes(availableCodes, this.codeSearchQuery);
    const filtered = matches.slice(0, 10);

    // Remove all children except the search input
    Array.from(dropdown.children).forEach(child => {
      if (child !== input) child.remove();
    });

    const append = (html) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      while (tmp.firstChild) dropdown.appendChild(tmp.firstChild);
    };

    if (filtered.length === 0) {
      append(`<div class="icd10-evidence-panel__code-option icd10-evidence-panel__code-option--empty">
        <span class="icd10-evidence-panel__code-option-desc">No matches</span>
      </div>`);
    } else {
      filtered.forEach(opt => {
        append(`<div class="icd10-evidence-panel__code-option ${opt.code === this.selectedCode ? 'icd10-evidence-panel__code-option--selected' : ''}"
             data-select-code="${this._escapeHtml(opt.code)}" data-select-desc="${this._escapeHtml(opt.description)}">
          <span class="icd10-evidence-panel__code-option-value">${this._escapeHtml(opt.code)}</span>
          <span class="icd10-evidence-panel__code-option-desc">${this._escapeHtml(opt.description)}</span>
        </div>`);
      });
      if (matches.length > 10) {
        append(`<div class="icd10-evidence-panel__code-option-hint">
          Showing 10 of ${matches.length} — refine search to narrow
        </div>`);
      }
    }

    // Re-bind option click handlers
    dropdown.querySelectorAll('[data-select-code]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectCode(el.dataset.selectCode, el.dataset.selectDesc);
      });
    });
  },

  _filterCodes(codes, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return codes;
    return codes.filter(opt => {
      const code = (opt.code || '').toLowerCase();
      const desc = (opt.description || '').toLowerCase();
      return code.includes(q) || desc.includes(q);
    });
  },

  /**
   * Render a single dropdown row. Alternate rows live in the alternates
   * section of the dropdown — the section header + amber background +
   * full pdpm label tooltip carry the "lower-confidence" signal, so we
   * don't need a per-row "Alternate" chip too.
   *
   * The inline pdpm badge shows the abbreviated form (NTA · 2pt) — the
   * full category name lands in the title tooltip. This keeps the
   * rows from blowing up horizontally when every alternate carries the
   * same pdpmCategoryName (e.g. all 12 diabetes variants saying
   * "Diabetes Mellitus").
   */
  _renderCodeOption(opt) {
    const isAlternate = opt.evidenceKind === 'alternate';
    const cat = opt.pdpmCategory;
    let badgeHtml = '';
    if (cat) {
      const lower = String(cat).toLowerCase().replace(/[^a-z]/g, '');
      const shortLabel = [
        cat,
        opt.pdpmPoints != null ? `${opt.pdpmPoints}pt` : null,
      ].filter(Boolean).join(' · ');
      const fullLabel = _formatPdpmLabel(opt);
      const tooltip = fullLabel || cat;
      badgeHtml = `<span class="icd10-evidence-panel__code-option-badge icd10-evidence-panel__code-option-badge--${lower}" title="${this._escapeHtml(tooltip)}">${this._escapeHtml(shortLabel)}</span>`;
    }
    const cls = [
      'icd10-evidence-panel__code-option',
      opt.code === this.selectedCode ? 'icd10-evidence-panel__code-option--selected' : '',
      isAlternate ? 'icd10-evidence-panel__code-option--alternate' : '',
    ].filter(Boolean).join(' ');
    return `
      <div class="${cls}"
           data-select-code="${this._escapeHtml(opt.code)}" data-select-desc="${this._escapeHtml(opt.description)}">
        <span class="icd10-evidence-panel__code-option-value">${this._escapeHtml(opt.code)}</span>
        <span class="icd10-evidence-panel__code-option-desc">${this._escapeHtml(opt.description)}</span>
        ${badgeHtml}
      </div>
    `;
  },

  /**
   * Select a code from the dropdown (UI only, doesn't save)
   * @param {string} code - ICD-10 code
   * @param {string} description - Code description
   */
  _selectCode(code, description) {
    this.selectedCode = code;
    this.selectedDescription = description;
    this.codeDropdownOpen = false;
    // Code is ICD-10 reference data — safe categorical value.
    _track('icd10_code_clicked', { code, source: 'evidence' });
    this.render();
  },

  /**
   * Handle approve button click - approves whatever code is currently shown
   */
  async _handleApprove() {
    if (this.approveLoading || this._isFocusedLeafStaged() || this.isApproved) return;
    // Belt-and-suspenders: render path already hides the Add button when
    // on PCC, but a stale event listener shouldn't be able to double-bill.
    if (this._isFocusedLeafOnPcc()) return;

    this.approveLoading = true;
    this.render();

    try {
      // Construct an item with the selected code
      const baseItem = this.items[0] || {};
      const approveItem = {
        ...baseItem,
        icd10Code: this.selectedCode,
        description: this.selectedDescription
      };

      if (this.onApprove) {
        await this.onApprove(approveItem);
        this.isApproved = true;
      }
    } catch (error) {
      console.error('ICD10EvidencePanel: Approve failed:', error);
    } finally {
      this.approveLoading = false;
      this.render();
    }
  },

  /**
   * Mark an item as approved (external call). Now a thin wrapper —
   * authoritative source is stagedLeafCodes pushed via setStagedLeafCodes.
   * Kept so callers that don't know the leaf code (only the annotation id)
   * still trigger a render after the viewer's stagedCodes mutation.
   */
  markApproved(itemId) {
    this.isApproved = true;
    this.render();
  },

  markUnapproved(itemId) {
    this.isApproved = false;
    this.render();
  },

  /**
   * Push the viewer's session-staged leaf codes into the panel so the Add
   * button reflects the right state per focused leaf. Called from the viewer
   * on every stage/unstage and after every group load.
   *
   * @param {Iterable<string>} codes
   */
  setStagedLeafCodes(codes) {
    this.stagedLeafCodes = new Set(codes || []);
    this.render();
  },

  /**
   * Push the set of leaf codes already on PCC (from approvedDiagnoses). When
   * the focused leaf is in this set, the panel hides the Add button and
   * renders a disabled "On PCC" pill instead — the code is already billed,
   * staging it again would be a duplicate.
   *
   * @param {Iterable<string>} codes
   */
  setApprovedLeafCodes(codes) {
    this.approvedLeafCodes = new Set(codes || []);
    this.render();
  },

  /** True iff the focused leaf is already on PCC (in approvedDiagnoses). */
  _isFocusedLeafOnPcc() {
    if (!this.selectedCode) return false;
    if (!(this.approvedLeafCodes instanceof Set)) return false;
    return this.approvedLeafCodes.has(this.selectedCode);
  },

  /**
   * True iff the focused code is an alternate (Comprehend's lower-confidence
   * reading) — i.e. it appears only in some annotation's options[] array,
   * never as a primary icd10Code in this group's annotations. Caller passes
   * the resolved focusedMeta so we don't recompute.
   */
  _isFocusedCodeAlternate(focusedMeta) {
    return !!(focusedMeta && focusedMeta.evidenceKind === 'alternate');
  },

  /** True iff the currently focused leaf is in the session-staged set. */
  _isFocusedLeafStaged() {
    if (!this.selectedCode) return false;
    if (!(this.stagedLeafCodes instanceof Set)) return false;
    return this.stagedLeafCodes.has(this.selectedCode);
  },

  _handleUnapprove() {
    if (!this._isFocusedLeafStaged() && !this.isApproved) return;
    const baseItem = this.items[0] || {};
    const item = {
      ...baseItem,
      icd10Code: this.selectedCode,
      description: this.selectedDescription,
    };
    this.isApproved = false;
    this.render();
    if (this.onUnapprove) this.onUnapprove(item);
  },

  /**
   * Get currently selected item
   * @returns {Object|null}
   */
  getSelectedItem() {
    if (!this.selectedItemId) return null;
    return this.items.find(i => i.id === this.selectedItemId) || null;
  },

  /**
   * Show summary loading state
   */
  showSummaryLoading() {
    this.summaryText = null;
    this.summaryLoading = true;
    this.summaryError = false;
    this._renderSummarySection();
  },

  /**
   * Show summary text
   * @param {string} text - Summary text to display
   */
  showSummary(text) {
    this.summaryText = text;
    this.summaryLoading = false;
    this.summaryError = false;
    this._renderSummarySection();
  },

  /**
   * Clear summary state
   */
  clearSummary() {
    this.summaryText = null;
    this.summaryLoading = false;
    this.summaryError = false;
    this._renderSummarySection();
  },

  /**
   * Render just the summary section (avoids full re-render)
   */
  _renderSummarySection() {
    if (!this.container) return;
    const existing = this.container.querySelector('.icd10-evidence-panel__summary');
    const newHtml = this._buildSummaryHtml();

    if (existing) {
      if (!newHtml) {
        existing.remove();
      } else {
        existing.outerHTML = newHtml;
      }
    } else if (newHtml) {
      // Insert after header, before doc-count
      const header = this.container.querySelector('.icd10-evidence-panel__header');
      if (header) {
        header.insertAdjacentHTML('afterend', newHtml);
      }
    }
  },

  /**
   * Build summary section HTML
   * @returns {string|null} HTML string or null if nothing to show
   */
  _buildSummaryHtml() {
    if (this.summaryLoading) {
      return `
        <div class="icd10-evidence-panel__summary icd10-evidence-panel__summary--loading">
          <span class="icd10-evidence-panel__summary-spinner"></span>
          <span>Generating summary...</span>
        </div>
      `;
    }
    if (this.summaryText) {
      return `
        <div class="icd10-evidence-panel__summary">
          ${this._escapeHtml(this.summaryText)}
        </div>
      `;
    }
    return null;
  },

  /**
   * v2: show a skeleton in the evidence panel while detail is fetched.
   * @param {Object} groupContext - same shape updateItems takes
   */
  showItemsLoading(groupContext) {
    this.items = [];
    this.selectedItemId = null;
    this.groupContext = groupContext || null;
    if (groupContext?.groupCode) {
      this.selectedCode = groupContext.groupCode;
      this.selectedDescription = groupContext.groupName || '';
    }
    this.itemsLoading = true;
    this.itemsError = null;
    this.itemsRetry = null;
    this.render();
  },

  /**
   * v2: show an inline error with a retry hook in the evidence panel.
   * @param {Object} groupContext
   * @param {Function} retryFn - called when user clicks Retry
   */
  showItemsError(groupContext, retryFn) {
    this.items = [];
    this.selectedItemId = null;
    this.groupContext = groupContext || null;
    if (groupContext?.groupCode) {
      this.selectedCode = groupContext.groupCode;
      this.selectedDescription = groupContext.groupName || '';
    }
    this.itemsLoading = false;
    this.itemsError = true;
    this.itemsRetry = typeof retryFn === 'function' ? retryFn : null;
    this.render();
  },

  /**
   * Clear selection and items
   */
  clear() {
    this.selectedItemId = null;
    this.items = [];
    this.groupContext = null;
    this.expandedDocuments.clear();
    this.expandedDocItems.clear();
    this.approveLoading = false;
    this.isApproved = false;
    this.selectedCode = null;
    this.selectedDescription = null;
    this.codeDropdownOpen = false;
    this.clearSummary();
    this.render();
  }
};

// Expose globally
window.ICD10EvidencePanel = ICD10EvidencePanel;
