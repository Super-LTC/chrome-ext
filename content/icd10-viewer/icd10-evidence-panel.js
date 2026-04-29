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

const ICD10EvidencePanel = {
  // State
  selectedItemId: null,
  items: [],
  groupContext: null,
  expandedDocuments: new Set(),
  expandedDocItems: new Set(),
  approveLoading: false,
  isApproved: false,
  selectedCode: null,
  selectedDescription: null,
  codeDropdownOpen: false,
  codeSearchQuery: '',
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
  init(container, onCardSelect, onApprove, onQuery) {
    console.log('[ICD10EvidencePanel] init called, has callbacks:', !!onCardSelect, !!onApprove, !!onQuery);
    this.container = container;
    this.onCardSelect = onCardSelect;
    this.onApprove = onApprove;
    this.onQuery = onQuery;
    // Reset all state from any previous opening
    this.selectedItemId = null;
    this.items = [];
    this.groupContext = null;
    this.expandedDocuments.clear();
    this.approveLoading = false;
    this.isApproved = false;
    this.selectedCode = null;
    this.selectedDescription = null;
    this.codeDropdownOpen = false;
    this.codeSearchQuery = '';
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
    this.codeDropdownOpen = false;
    this.codeSearchQuery = '';
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
        description: this.groupContext.groupName || this._getDescriptionForCode(this.groupContext.groupCode)
      });
    }

    // Collect unique codes from all items' options
    this.items.forEach(item => {
      if (item.options && item.options.length > 0) {
        item.options.forEach(opt => {
          if (!codeMap.has(opt.code)) {
            codeMap.set(opt.code, {
              code: opt.code,
              description: opt.description || ''
            });
          }
        });
      }
      // Also add the item's own code
      if (item.icd10Code && !codeMap.has(item.icd10Code)) {
        codeMap.set(item.icd10Code, {
          code: item.icd10Code,
          description: item.description || ''
        });
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
    const docGroups = this._groupByDocument(this.items);
    const uniqueDocCount = docGroups.length;

    const html = `
      ${this._renderDiagnosisHeader()}
      ${summaryHtml}
      <div class="icd10-evidence-panel__doc-count">
        ${this.items.length} mention${this.items.length !== 1 ? 's' : ''} across ${uniqueDocCount} document${uniqueDocCount !== 1 ? 's' : ''}
      </div>
      <div class="icd10-evidence-panel__list">
        ${docGroups.map(docGroup => this._renderDocumentGroup(docGroup)).join('')}
      </div>
    `;

    this.container.innerHTML = html;
    this._attachEventListeners();
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

    let approveHtml = '';
    if (this.isApproved) {
      approveHtml = `
        <!-- NO_TRACK: disabled state — no click handler, post-add display only -->
        <button class="icd10-evidence-panel__approve icd10-evidence-panel__approve--approved" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Added
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
    const canQuery = !!this.onQuery && this.items && this.items.length > 0;
    const queryHtml = canQuery ? `
      <!-- NO_TRACK: query create flow tracks dx_query_created at submit time -->
      <button class="icd10-evidence-panel__query" data-action="query" title="Generate a physician query for this code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        Query
      </button>
    ` : '';

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
            <span class="icd10-evidence-panel__diagnosis-desc">${this._escapeHtml(description)}</span>
          </div>
          ${this.codeDropdownOpen ? (() => {
            const filtered = this._filterCodes(availableCodes, this.codeSearchQuery).slice(0, 10);
            const totalMatches = this._filterCodes(availableCodes, this.codeSearchQuery).length;
            return `
            <div class="icd10-evidence-panel__code-dropdown">
              <input type="text" class="icd10-evidence-panel__code-search"
                     data-action="code-search"
                     placeholder="Search by code or name..."
                     value="${this._escapeHtml(this.codeSearchQuery)}"
                     autocomplete="off" />
              ${filtered.length === 0 ? `
                <div class="icd10-evidence-panel__code-option icd10-evidence-panel__code-option--empty">
                  <span class="icd10-evidence-panel__code-option-desc">No matches</span>
                </div>
              ` : filtered.map(opt => `
                <div class="icd10-evidence-panel__code-option ${opt.code === this.selectedCode ? 'icd10-evidence-panel__code-option--selected' : ''}"
                     data-select-code="${this._escapeHtml(opt.code)}" data-select-desc="${this._escapeHtml(opt.description)}">
                  <span class="icd10-evidence-panel__code-option-value">${this._escapeHtml(opt.code)}</span>
                  <span class="icd10-evidence-panel__code-option-desc">${this._escapeHtml(opt.description)}</span>
                </div>
              `).join('')}
              ${totalMatches > 10 ? `
                <div class="icd10-evidence-panel__code-option-hint">
                  Showing 10 of ${totalMatches} — refine search to narrow
                </div>
              ` : ''}
            </div>
            `;
          })() : ''}
          <div class="icd10-evidence-panel__diagnosis-actions">
            ${approveHtml}
            ${queryHtml}
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
          const maxItems = 3;
          const showAll = this.expandedDocItems.has(docGroup.documentId);
          const visibleItems = showAll ? docGroup.items : docGroup.items.slice(0, maxItems);
          const hiddenCount = docGroup.items.length - maxItems;
          return `
            <div class="icd10-evidence-panel__doc-items">
              ${visibleItems.map((item, index) => this._renderEvidenceItem(item, index + 1)).join('')}
              ${!showAll && hiddenCount > 0 ? `
                <!-- NO_TRACK: pure UI expand/collapse, no engagement event needed -->
                <button class="icd10-evidence-panel__show-more-items" data-action="show-more-items" data-doc-id="${docGroup.documentId}">
                  + ${hiddenCount} more
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
    const isSelected = this.selectedItemId === item.id;
    const quote = item.quoteText || '';
    const maxQuoteLength = 120;
    const truncatedQuote = quote.length > maxQuoteLength
      ? quote.substring(0, maxQuoteLength) + '...'
      : quote;

    const showCodeInline = this.selectedCode && item.icd10Code !== this.selectedCode;

    return `
      <div class="icd10-evidence-panel__evidence-item ${isSelected ? 'icd10-evidence-panel__evidence-item--selected' : ''}"
           data-item-id="${item.id}">
        <span class="icd10-evidence-panel__evidence-num">${index}</span>
        <div class="icd10-evidence-panel__evidence-content">
          ${showCodeInline ? `<span class="icd10-evidence-panel__evidence-inline-code">${this._escapeHtml(item.icd10Code)}</span>` : ''}
          ${truncatedQuote
            ? `<div class="icd10-evidence-panel__evidence-quote">"${this._escapeHtml(truncatedQuote)}"</div>`
            : `<div class="icd10-evidence-panel__evidence-quote icd10-evidence-panel__evidence-quote--fallback">Evidence on page ${item.pageNumber}</div>`
          }
          <div class="icd10-evidence-panel__evidence-page">Page ${item.pageNumber}</div>
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
    this.container.querySelectorAll('.icd10-evidence-panel__evidence-item').forEach(el => {
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

    // Approve button click
    const approveBtn = this.container.querySelector('[data-action="approve"]');
    if (approveBtn) {
      approveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleApprove();
      });
    }

    // Query button click — hands off to the viewer's onQuery callback
    // with everything needed to build a single-item solverResult.
    const queryBtn = this.container.querySelector('[data-action="query"]');
    if (queryBtn) {
      queryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof this.onQuery === 'function') {
          this.onQuery({
            baseCode: this.selectedCode,
            description: this.selectedDescription,
            groupContext: this.groupContext,
            items: this.items,
          });
        }
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
    if (this.approveLoading || this.isApproved) return;

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
   * Mark an item as approved (external call)
   * @param {string} itemId - Item ID that was approved
   */
  markApproved(itemId) {
    this.isApproved = true;
    this.render();
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
