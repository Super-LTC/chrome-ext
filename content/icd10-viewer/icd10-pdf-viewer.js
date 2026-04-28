/**
 * ICD-10 PDF Viewer Component
 * Right panel for viewing PDFs with highlight overlays
 * Single-page view with prev/next navigation
 * Auto-corrects sideways pages + manual rotate button
 */

// Tracking helper — uses window.SuperAnalytics.track when available so this
// file works both bundled (extension) and as a classic <script> (demo HTMLs).
function _track(event, props) {
  try {
    window.SuperAnalytics?.track?.(event, props || {});
  } catch (e) { /* swallow */ }
}

const ICD10PDFViewer = {
  // State
  pdfDoc: null,
  currentPage: 1,
  totalPages: 1,
  currentZoom: 150,
  currentDocumentId: null,
  highlights: [],
  searchTerms: [],
  zoomLevels: [75, 100, 125, 150, 200, 250],
  manualRotation: 0, // user-applied rotation (0, 90, 180, 270)
  pageRotations: {},  // cached per-page inherent rotations
  currentDocName: '', // display name of current document
  currentCode: null,  // ICD-10 code currently driving the viewer (analytics context)

  init(container) {
    this.container = container;
    this.render();
  },

  async loadDocument(document, wordBlocks = [], targetPage = 1, searchText = '') {
    const isDemo = window.location.hostname === 'localhost' || window.location.protocol === 'file:' || window.__DEMO_MODE === true;
    if (isDemo) {
      this._renderDemoPlaceholder(document, targetPage);
      return;
    }

    if (!document || !document.signedUrl) {
      this._renderError('No document URL available');
      return;
    }

    this.searchTerms = this._parseSearchTerms(searchText);

    // Same document — just update highlights and page
    if (this.currentDocumentId === document.id && this.pdfDoc) {
      this.highlights = wordBlocks;
      this.currentDocName = document.title || document.name || this.currentDocName;
      this.searchTerms = this._parseSearchTerms(searchText);
      if (!this.container.querySelector('.icd10-pdf-viewer__canvas-container')) {
        this._renderPDFContainer();
      }
      await this._renderPage(targetPage);
      return;
    }

    this.currentDocumentId = document.id;
    this.currentDocName = document.title || document.name || '';
    this.highlights = wordBlocks;
    this.manualRotation = 0;
    this.pageRotations = {};
    this._contentRotationCache = {};
    this._renderLoading();

    try {
      if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded');
      }
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
        }
      }

      const loadingTask = pdfjsLib.getDocument({
        url: document.signedUrl,
        disableAutoFetch: true,
        disableStream: false,
        rangeChunkSize: 65536,
      });
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      this.currentPage = Math.min(targetPage, this.totalPages);

      this._renderPDFContainer();
      await this._renderPage(this.currentPage);

      // Track PDF open (new document only). page_count is integer, code is reference data — safe.
      _track('icd10_pdf_opened', {
        code: this.currentCode || 'unknown',
        page_count: this.totalPages,
      });

    } catch (error) {
      console.error('ICD10PDFViewer: Failed to load PDF:', error);
      _track('error_shown', {
        surface: 'icd10_pdf_viewer',
        error_code: window.SuperAnalytics?.toErrorCode?.(error) || 'unknown',
        error_type: 'api_error',
      });
      this._renderError(`Failed to load PDF: ${error.message}`);
    }
  },

  async updateHighlights(wordBlocks, targetPage = null) {
    this.highlights = wordBlocks || [];
    if (this.pdfDoc) {
      const page = targetPage || (wordBlocks.length > 0 ? wordBlocks[0].p : this.currentPage);
      await this._renderPage(page);
    }
  },

  // ---- Rendering ----

  _renderPDFContainer() {
    if (!this.container) return;

    const docName = this._escapeHtml(this.currentDocName);
    this.container.innerHTML = `
      <div class="icd10-pdf-viewer__controls">
        <div class="icd10-pdf-viewer__page-nav">
          <!-- NO_TRACK: page nav fires icd10_pdf_page_changed explicitly from the click handler -->
          <button class="icd10-pdf-viewer__nav-btn" data-action="prev" title="Previous page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span class="icd10-pdf-viewer__page-info">
            <span class="icd10-pdf-viewer__page-current">${this.currentPage}</span>
            /
            <span class="icd10-pdf-viewer__page-total">${this.totalPages}</span>
          </span>
          <!-- NO_TRACK: page nav fires icd10_pdf_page_changed explicitly from the click handler -->
          <button class="icd10-pdf-viewer__nav-btn" data-action="next" title="Next page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        ${docName ? `<div class="icd10-pdf-viewer__doc-name" title="${docName}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink:0;opacity:0.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span>${docName}</span>
        </div>` : ''}
        <div class="icd10-pdf-viewer__zoom">
          <!-- NO_TRACK: pure UI rotate, no engagement event needed -->
          <button class="icd10-pdf-viewer__nav-btn" data-action="rotate" title="Rotate 90°">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </button>
          <!-- NO_TRACK: pure UI zoom-out -->
          <button class="icd10-pdf-viewer__zoom-btn" data-action="zoom-out" title="Zoom out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <span class="icd10-pdf-viewer__zoom-level">${this.currentZoom}%</span>
          <!-- NO_TRACK: pure UI zoom-in -->
          <button class="icd10-pdf-viewer__zoom-btn" data-action="zoom-in" title="Zoom in">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="icd10-pdf-viewer__canvas-container">
        <div class="icd10-pdf-viewer__canvas-wrapper">
          <canvas class="icd10-pdf-viewer__canvas"></canvas>
          <canvas class="icd10-pdf-viewer__highlight-canvas"></canvas>
        </div>
      </div>
    `;

    this._attachControlListeners();
  },

  /**
   * Detect page rotation using multiple strategies:
   * 1. Text transform analysis — detects sideways content on portrait pages
   * 2. Landscape raw dimensions — detects un-normalized landscape scans
   * 3. Manual rotate button for edge cases
   * Results cached per page.
   */
  async _getPageRotation(page, explicitPageNum = null) {
    const pageNum = explicitPageNum != null ? explicitPageNum : this.currentPage;
    if (this._contentRotationCache && this._contentRotationCache[pageNum] !== undefined) {
      return (this._contentRotationCache[pageNum] + this.manualRotation) % 360;
    }
    if (!this._contentRotationCache) this._contentRotationCache = {};

    const inherent = page.rotate || 0;
    const rawView = page.view;
    const rawW = rawView[2] - rawView[0];
    const rawH = rawView[3] - rawView[1];

    console.log(`[PDFViewer] Page ${pageNum}: rotate=${inherent}, raw=${rawW.toFixed(0)}x${rawH.toFixed(0)}`);

    let autoFix = 0;
    let textItemCount = 0;

    // Strategy 1: Analyze text transforms to detect sideways content
    try {
      const textContent = await page.getTextContent();
      const items = textContent.items.filter(i => i.str && i.str.trim().length > 0);
      textItemCount = items.length;
      console.log(`[PDFViewer] Page ${pageNum}: ${items.length} text items`);

      if (items.length >= 3) {
        const counts = { 0: 0, 90: 0, 180: 0, 270: 0 };

        // Log first 5 text items for debugging
        items.slice(0, 5).forEach((item, i) => {
          const [a, b, c, d, e, f] = item.transform;
          console.log(`[PDFViewer] Page ${pageNum} text[${i}]: "${item.str.substring(0, 20)}" transform=[${a.toFixed(1)},${b.toFixed(1)},${c.toFixed(1)},${d.toFixed(1)}]`);
        });

        for (const item of items) {
          const [a, b] = item.transform;
          const absA = Math.abs(a);
          const absB = Math.abs(b);

          if (absA < 0.01 && absB < 0.01) continue; // skip zero-size items

          if (absA > absB) {
            counts[a > 0 ? 0 : 180]++;
          } else {
            counts[b > 0 ? 90 : 270]++;
          }
        }

        // Find dominant orientation
        let maxCount = 0;
        let dominant = 0;
        for (const [angle, count] of Object.entries(counts)) {
          if (count > maxCount) {
            maxCount = count;
            dominant = parseInt(angle);
          }
        }

        console.log(`[PDFViewer] Page ${pageNum}: text orientations=${JSON.stringify(counts)}, dominant=${dominant}`);

        if (dominant !== 0) {
          autoFix = dominant;
        }
      }
    } catch (e) {
      console.warn('[PDFViewer] Text analysis failed:', e);
    }

    // Strategy 2: Image transform analysis (for scanned docs with no text layer)
    if (autoFix === 0 && textItemCount < 3) {
      try {
        const ops = await page.getOperatorList();
        // Look for image paint operations and preceding transforms
        // OPS: transform=12, paintImageXObject=85, paintJpegXObject=82
        let lastTransform = [1, 0, 0, 1, 0, 0]; // identity
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] === 12) { // transform
            lastTransform = ops.argsArray[i];
          }
          if (ops.fnArray[i] === 85 || ops.fnArray[i] === 82) { // paintImage
            const [a, b, c, d] = lastTransform;
            console.log(`[PDFViewer] Page ${pageNum}: image transform=[${a.toFixed(1)},${b.toFixed(1)},${c.toFixed(1)},${d.toFixed(1)}]`);
            // Check if the image is rotated:
            // Normal placement: a>0, d>0 (or d<0 for PDF y-flip), b≈0, c≈0
            // 90° CCW: a≈0, b>0, c>0, d≈0 (or similar with signs)
            // 90° CW:  a≈0, b<0, c<0, d≈0
            const absA = Math.abs(a), absB = Math.abs(b);
            const absC = Math.abs(c), absD = Math.abs(d);
            if (absB > absA * 5 && absC > absD * 5) {
              // Off-diagonal dominant = rotated image
              // Determine direction: b>0 means 90° CCW in PDF coords
              autoFix = b > 0 ? 270 : 90;
              console.log(`[PDFViewer] Page ${pageNum}: image rotation detected → autoFix=${autoFix}`);
            }
            break; // only check first major image
          }
        }
      } catch (e) {
        console.warn('[PDFViewer] Image analysis failed:', e);
      }
    }

    // Strategy 3: Landscape detection fallback
    if (autoFix === 0 && rawW > rawH * 1.05) {
      autoFix = 90;
      console.log(`[PDFViewer] Page ${pageNum}: landscape fallback → autoFix=90`);
    }

    this._contentRotationCache[pageNum] = autoFix;
    const total = (autoFix + this.manualRotation) % 360;
    console.log(`[PDFViewer] Page ${pageNum}: FINAL rotation=${total} (auto=${autoFix}, manual=${this.manualRotation})`);
    return total;
  },

  async _renderPage(pageNum) {
    if (!this.pdfDoc) return;

    const validPageNum = Math.max(1, Math.min(pageNum, this.totalPages));
    this.currentPage = validPageNum;

    // Sequence guard: when multiple _renderPage calls overlap (rapid clicks),
    // only the latest one is allowed to write to the canvas / scroll.
    this._renderSeq = (this._renderSeq || 0) + 1;
    const seq = this._renderSeq;
    const isStale = () => seq !== this._renderSeq;

    // Update page indicator
    const pageCurrentEl = this.container.querySelector('.icd10-pdf-viewer__page-current');
    if (pageCurrentEl) pageCurrentEl.textContent = this.currentPage;

    const prevBtn = this.container.querySelector('[data-action="prev"]');
    const nextBtn = this.container.querySelector('[data-action="next"]');
    if (prevBtn) prevBtn.disabled = this.currentPage === 1;
    if (nextBtn) nextBtn.disabled = this.currentPage === this.totalPages;

    try {
      const page = await this.pdfDoc.getPage(validPageNum);
      if (isStale()) return;
      const rotation = await this._getPageRotation(page, validPageNum);
      if (isStale()) return;

      const container = this.container.querySelector('.icd10-pdf-viewer__canvas-container');
      if (!container) return;
      const containerWidth = container.clientWidth - 40;

      // Get viewport with rotation applied so dimensions account for rotation
      const baseViewport = page.getViewport({ scale: 1, rotation });
      const baseScale = containerWidth / baseViewport.width;
      const scale = baseScale * (this.currentZoom / 100);
      const viewport = page.getViewport({ scale, rotation });

      const canvas = this.container.querySelector('.icd10-pdf-viewer__canvas');
      const highlightCanvas = this.container.querySelector('.icd10-pdf-viewer__highlight-canvas');
      if (!canvas || !highlightCanvas) return;

      const ctx = canvas.getContext('2d');
      const highlightCtx = highlightCanvas.getContext('2d');

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      highlightCanvas.width = viewport.width;
      highlightCanvas.height = viewport.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
      if (isStale()) return;

      // Draw highlights
      let highlightRects = [];
      const pageHighlights = this.highlights.filter(h => h.p === validPageNum);

      if (pageHighlights.length > 0) {
        highlightRects = this._drawHighlights(highlightCtx, pageHighlights, viewport, rotation, page);
      } else if (this.searchTerms && this.searchTerms.length > 0) {
        highlightRects = await this._highlightTextMatches(page, highlightCtx, viewport);
      }

      // Auto-scroll to first highlight (and auto-fit zoom if needed)
      if (highlightRects.length > 0) {
        this._scrollToHighlights(highlightRects, container, viewport);
      }

    } catch (error) {
      console.error('ICD10PDFViewer: Failed to render page:', error);
    }
  },

  /**
   * Draw highlight overlays, transforming coordinates for rotation.
   * The highlight coords (x, y, w, h) are normalized 0-1 relative to the
   * ORIGINAL unrotated page. We need to map them into the rotated viewport.
   */
  _drawHighlights(ctx, pageHighlights, viewport, rotation, page) {
    const rects = [];
    // Get the unrotated page dimensions to interpret highlight coords
    const unrotatedViewport = page.getViewport({ scale: 1, rotation: 0 });
    const origW = unrotatedViewport.width;
    const origH = unrotatedViewport.height;

    // Scale factor from original unrotated coords to our rendered viewport
    const vw = viewport.width;
    const vh = viewport.height;

    pageHighlights.forEach((highlight, index) => {
      const isActive = index === 0;

      if (isActive) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      } else {
        ctx.fillStyle = 'rgba(254, 240, 138, 0.4)';
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.6)';
      }
      ctx.lineWidth = 2;

      // Original coords in unrotated page space (0-1 normalized)
      const ox = highlight.x;
      const oy = highlight.y;
      const ow = highlight.w;
      const oh = highlight.h;

      // Transform to rotated viewport coordinates
      let x, y, w, h;
      const r = rotation % 360;

      if (r === 0) {
        x = ox * vw;
        y = oy * vh;
        w = ow * vw;
        h = oh * vh;
      } else if (r === 90) {
        x = (1 - oy - oh) * vw;
        y = ox * vh;
        w = oh * vw;
        h = ow * vh;
      } else if (r === 180) {
        x = (1 - ox - ow) * vw;
        y = (1 - oy - oh) * vh;
        w = ow * vw;
        h = oh * vh;
      } else if (r === 270) {
        x = oy * vw;
        y = (1 - ox - ow) * vh;
        w = oh * vw;
        h = ow * vh;
      }

      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      rects.push({ x, y, w, h, isActive });
    });

    return rects;
  },

  /**
   * Scroll to center the active highlight in the viewport.
   * Uses the canvas wrapper's actual DOM offset to compute correct
   * scroll positions — accounts for flex centering, padding, etc.
   */
  _scrollToHighlights(rects, container) {
    if (!rects.length || !container) return;

    const active = rects.find(r => r.isActive) || rects[0];
    const centerX = active.x + active.w / 2;
    const centerY = active.y + active.h / 2;

    const wrapper = container.querySelector('.icd10-pdf-viewer__canvas-wrapper');
    if (!wrapper) return;

    requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();

      // Wrapper's position in scroll-space (visual offset + current scroll)
      const wrapperScrollX = wrapperRect.left - containerRect.left + container.scrollLeft;
      const wrapperScrollY = wrapperRect.top - containerRect.top + container.scrollTop;

      const containerW = container.clientWidth;
      const containerH = container.clientHeight;

      const scrollLeft = wrapperScrollX + centerX - containerW / 2;
      const scrollTop = wrapperScrollY + centerY - containerH / 2;

      console.log('[PDFViewer] scrollToHighlights:', {
        activeRect: { x: active.x, y: active.y, w: active.w, h: active.h },
        center: { centerX, centerY },
        wrapperScroll: { wrapperScrollX, wrapperScrollY },
        containerSize: { containerW, containerH },
        canvasSize: { w: wrapper.offsetWidth, h: wrapper.offsetHeight },
        computed: { scrollLeft, scrollTop },
        clamped: { left: Math.max(0, scrollLeft), top: Math.max(0, scrollTop) },
        maxScroll: { left: container.scrollWidth - containerW, top: container.scrollHeight - containerH }
      });

      container.scrollTo({
        left: Math.max(0, scrollLeft),
        top: Math.max(0, scrollTop),
        behavior: 'smooth'
      });
    });
  },

  _attachControlListeners() {
    this.container.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        const from = this.currentPage;
        const to = from - 1;
        _track('icd10_pdf_page_changed', { code: this.currentCode || 'unknown', from_page: from, to_page: to });
        this._renderPage(to);
      }
    });
    this.container.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        const from = this.currentPage;
        const to = from + 1;
        _track('icd10_pdf_page_changed', { code: this.currentCode || 'unknown', from_page: from, to_page: to });
        this._renderPage(to);
      }
    });
    this.container.querySelector('[data-action="zoom-out"]')?.addEventListener('click', () => {
      this._changeZoom(-1);
    });
    this.container.querySelector('[data-action="zoom-in"]')?.addEventListener('click', () => {
      this._changeZoom(1);
    });
    this.container.querySelector('[data-action="rotate"]')?.addEventListener('click', () => {
      this.manualRotation = (this.manualRotation + 90) % 360;
      this._renderPage(this.currentPage);
    });
  },

  _changeZoom(direction) {
    const currentIndex = this.zoomLevels.indexOf(this.currentZoom);
    let newIndex = Math.max(0, Math.min(currentIndex + direction, this.zoomLevels.length - 1));
    if (newIndex === currentIndex) return;

    this.currentZoom = this.zoomLevels[newIndex];
    const zoomLevel = this.container.querySelector('.icd10-pdf-viewer__zoom-level');
    if (zoomLevel) zoomLevel.textContent = `${this.currentZoom}%`;

    this._renderPage(this.currentPage);
  },

  goToPage(pageNum) {
    if (this.pdfDoc && pageNum >= 1 && pageNum <= this.totalPages) {
      if (pageNum !== this.currentPage) {
        _track('icd10_pdf_page_changed', {
          code: this.currentCode || 'unknown',
          from_page: this.currentPage,
          to_page: pageNum,
        });
      }
      this._renderPage(pageNum);
    }
  },

  // ---- Text search highlighting ----

  _parseSearchTerms(searchText) {
    if (!searchText || typeof searchText !== 'string') return [];
    const cleaned = searchText.replace(/["\u201C\u201D]/g, '"').replace(/['\u2018\u2019]/g, "'").trim();
    if (cleaned.length < 3) return [];

    const terms = [];
    if (cleaned.length >= 5 && cleaned.length <= 100) {
      terms.push(cleaned.toLowerCase());
    }

    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'was', 'her', 'has', 'his', 'have', 'been', 'this', 'that', 'with', 'from', 'were', 'they', 'will', 'would', 'could', 'should', 'which', 'their', 'there', 'about']);
    cleaned.toLowerCase().split(/\s+/).forEach(word => {
      const cleanWord = word.replace(/[.,;:!?'"()[\]{}]/g, '');
      if (cleanWord.length >= 4 && !stopWords.has(cleanWord) && !terms.includes(cleanWord)) {
        terms.push(cleanWord);
      }
    });

    return terms;
  },

  async _highlightTextMatches(page, ctx, viewport) {
    if (!this.searchTerms || this.searchTerms.length === 0) return [];

    try {
      const textContent = await page.getTextContent();
      const textItems = textContent.items;
      if (!textItems || textItems.length === 0) return [];

      const rects = [];
      const pageText = textItems.map(item => item.str).join(' ').toLowerCase();
      const matchingTerms = this.searchTerms.filter(term => pageText.includes(term));
      if (matchingTerms.length === 0) return [];

      textItems.forEach(item => {
        const text = item.str.toLowerCase();
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
        const width = item.width || (text.length * fontSize * 0.5);
        const height = item.height || fontSize * 1.2;

        matchingTerms.forEach((term, termIndex) => {
          if (text.includes(term)) {
            const [canvasX, canvasY] = viewport.convertToViewportPoint(x, y);
            const rect = {
              x: canvasX,
              y: canvasY - (height * viewport.scale),
              w: width * viewport.scale,
              h: height * viewport.scale,
              isActive: termIndex === 0 && rects.length === 0
            };

            ctx.fillStyle = rect.isActive ? 'rgba(59, 130, 246, 0.35)' : 'rgba(254, 240, 138, 0.4)';
            ctx.strokeStyle = rect.isActive ? 'rgba(59, 130, 246, 0.8)' : 'rgba(234, 179, 8, 0.6)';
            ctx.lineWidth = 2;
            const p = 2;
            ctx.fillRect(rect.x - p, rect.y - p, rect.w + p * 2, rect.h + p * 2);
            ctx.strokeRect(rect.x - p, rect.y - p, rect.w + p * 2, rect.h + p * 2);
            rects.push(rect);
          }
        });
      });

      return rects;
    } catch (error) {
      console.error('[ICD10PDFViewer] Text highlight error:', error);
      return [];
    }
  },

  // ---- Loading / Error / Empty states ----

  _renderLoading() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="icd10-pdf-viewer__loading">
        <div class="icd10-pdf-viewer__loading-controls">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 32px; height: 32px; background: var(--super-gray-200); border-radius: 6px;"></div>
            <div style="width: 60px; height: 20px; background: var(--super-gray-200); border-radius: 4px;"></div>
            <div style="width: 32px; height: 32px; background: var(--super-gray-200); border-radius: 6px;"></div>
          </div>
        </div>
        <div class="icd10-pdf-viewer__loading-skeleton">
          <div class="icd10-pdf-viewer__skeleton-shimmer"></div>
          <div class="icd10-pdf-viewer__skeleton-lines">
            <div class="icd10-pdf-viewer__skeleton-line"></div>
            <div class="icd10-pdf-viewer__skeleton-line"></div>
            <div class="icd10-pdf-viewer__skeleton-line"></div>
            <div class="icd10-pdf-viewer__skeleton-line"></div>
          </div>
        </div>
      </div>
    `;
  },

  _renderError(message) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="icd10-pdf-viewer__error">
        <div class="icd10-pdf-viewer__error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="icd10-pdf-viewer__error-text">${this._escapeHtml(message)}</p>
      </div>
    `;
  },

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="icd10-pdf-viewer__empty">
        <div class="icd10-pdf-viewer__empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </div>
        <p class="icd10-pdf-viewer__empty-text">Select an evidence card to view the source document</p>
      </div>
    `;
  },

  // ---- Demo placeholder ----

  _renderDemoPlaceholder(document, page = 1) {
    if (!this.container) return;
    const docId = document?.id;
    const docContent = window.ICD10MockData?.documentContent?.[docId];
    const docName = docContent?.title || document?.title || document?.name || 'Clinical Document';
    const totalPages = docContent?.pages?.length || document?.pageCount || 1;
    const currentPage = Math.min(page, totalPages);
    const pageData = docContent?.pages?.find(p => p.pageNum === currentPage) || docContent?.pages?.[0];

    let contentHtml = '';
    if (pageData?.content) {
      contentHtml = pageData.content.map(line => {
        if (!line.text) return '<div class="icd10-pdf-viewer__doc-line icd10-pdf-viewer__doc-line--spacer">&nbsp;</div>';
        let className = 'icd10-pdf-viewer__doc-line';
        if (line.style === 'title') className += ' icd10-pdf-viewer__doc-line--title';
        if (line.style === 'section') className += ' icd10-pdf-viewer__doc-line--section';
        if (line.style === 'bold') className += ' icd10-pdf-viewer__doc-line--bold';
        if (line.highlight) className += ' icd10-pdf-viewer__doc-line--highlight';
        return `<div class="${className}">${this._escapeHtml(line.text)}</div>`;
      }).join('');
    } else {
      contentHtml = `
        <div class="icd10-pdf-viewer__demo-line icd10-pdf-viewer__demo-line--title"></div>
        <div class="icd10-pdf-viewer__demo-line"></div>
        <div class="icd10-pdf-viewer__demo-spacer"></div>
        <div class="icd10-pdf-viewer__demo-highlight"><span>Relevant text would be highlighted here</span></div>
        <div class="icd10-pdf-viewer__demo-spacer"></div>
        <div class="icd10-pdf-viewer__demo-line"></div>
      `;
    }

    this.container.innerHTML = `
      <div class="icd10-pdf-viewer__demo-document">
        <div class="icd10-pdf-viewer__demo-toolbar">
          <div class="icd10-pdf-viewer__demo-nav">
            <!-- NO_TRACK: demo-only placeholder UI, never reached in production -->
            <button class="icd10-pdf-viewer__demo-nav-btn" data-action="prev-page" ${currentPage <= 1 ? 'disabled' : ''}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span class="icd10-pdf-viewer__demo-page-info">Page ${currentPage} of ${totalPages}</span>
            <!-- NO_TRACK: demo-only placeholder UI, never reached in production -->
            <button class="icd10-pdf-viewer__demo-nav-btn" data-action="next-page" ${currentPage >= totalPages ? 'disabled' : ''}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>
        <div class="icd10-pdf-viewer__demo-paper-container">
          <div class="icd10-pdf-viewer__demo-paper">
            <div class="icd10-pdf-viewer__demo-paper-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span>${this._escapeHtml(docName)}</span>
            </div>
            <div class="icd10-pdf-viewer__demo-paper-content">${contentHtml}</div>
          </div>
        </div>
      </div>
    `;
    this._demoState = { document, currentPage, totalPages, docId };
    this._attachDemoNavListeners();
  },

  _attachDemoNavListeners() {
    if (!this.container) return;
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'prev-page' && this._demoState?.currentPage > 1) {
          this._renderDemoPlaceholder(this._demoState.document, this._demoState.currentPage - 1);
        } else if (action === 'next-page' && this._demoState?.currentPage < this._demoState?.totalPages) {
          this._renderDemoPlaceholder(this._demoState.document, this._demoState.currentPage + 1);
        }
      });
    });
  },

  // ---- Utilities ----

  _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },

  clear() {
    this.pdfDoc = null;
    this.currentDocumentId = null;
    this.highlights = [];
    this.searchTerms = [];
    this.currentPage = 1;
    this.totalPages = 1;
    this.manualRotation = 0;
    this.pageRotations = {};
    this._contentRotationCache = {};
    this.currentDocName = '';
    this.currentCode = null;
    this.render();
  }
};

// Expose globally
window.ICD10PDFViewer = ICD10PDFViewer;
