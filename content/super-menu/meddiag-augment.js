/**
 * Med-Diag list page augmentation.
 *
 * Adds two columns to PCC's #meddiaglisting table on medDiagChart.xhtml:
 *   - Care Plan: green/amber/red shield based on carePlanStatus
 *   - Query: paper-airplane chip (pending) / check (signed) / red (re-query
 *     overdue, ≥60d since last sign)
 *
 * Click a Care Plan cell → existing CarePlan inline-detail (shared with
 * MDS overlay). Click a Query cell → existing QueryDetailModal.
 *
 * Data: GET /api/extension/patients/[id]/diagnoses/status-overview
 *   one network call per render. Refetch on icd10-viewer modal close
 *   (user may have submitted a query) and on a 60s interval as a backstop.
 */

const MedDiagAugment = {
  _patientId: null,
  _facilityName: null,
  _orgSlug: null,
  _data: null,           // status-overview response
  _byCode: null,         // Map<icd10Code, diagnosis row>
  _refreshTimer: null,
  _attempts: 0,

  /**
   * Entry point — called from init.js when the URL matches medDiagChart.
   * Bails silently if we're on the wrong page or the table never loads.
   */
  async init(context) {
    if (!this._isOnMedDiagPage()) return;
    if (!context?.patientId) return;
    this._patientId = context.patientId;
    this._facilityName = context.facilityName || '';
    this._orgSlug = context.orgSlug || '';

    // Wait for the table — PCC server-renders so it's usually present
    // immediately, but on slow loads we poll briefly.
    const table = await this._waitForTable();
    if (!table) return;

    await this._fetchAndRender();

    // Poll every 60s as a backstop — picks up queries signed by physicians,
    // care plan changes from other surfaces, etc.
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => {
      if (!this._isOnMedDiagPage()) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
        return;
      }
      this._fetchAndRender();
    }, 60000);
  },

  /** Hook for the icd10-viewer to call after a query is submitted. */
  refreshNow() {
    return this._fetchAndRender();
  },

  _isOnMedDiagPage() {
    const u = window.location.href;
    return u.includes('medDiagChart') || u.includes('meddiag');
  },

  async _waitForTable() {
    for (let i = 0; i < 20; i++) {
      const t = document.querySelector('#meddiaglisting');
      if (t) return t;
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  },

  async _fetchAndRender() {
    try {
      const data = await this._fetchStatusOverview();
      if (!data) return;
      this._data = data;
      this._byCode = new Map();
      for (const dx of data.diagnoses || []) {
        // Endpoint returns the code as `code` (not `icd10Code` like the
        // /diagnoses endpoint); accept either to stay forgiving.
        const k = dx?.code || dx?.icd10Code;
        if (k) this._byCode.set(k, dx);
      }
      this._injectColumns();
      this._renderRows();
    } catch (err) {
      console.warn('[MedDiagAugment] fetch/render failed:', err);
    }
  },

  async _fetchStatusOverview() {
    const params = new URLSearchParams({
      facilityName: this._facilityName,
      orgSlug: this._orgSlug,
    });
    const endpoint = `/api/extension/patients/${encodeURIComponent(this._patientId)}/diagnoses/status-overview?${params}`;
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
    });
    if (!response.success) {
      console.warn('[MedDiagAugment] status-overview fetch failed:', response.error);
      return null;
    }
    return response.data || response;
  },

  _injectColumns() {
    const headerRow = document.querySelector('#meddiaglisting thead tr');
    if (!headerRow) return;
    if (headerRow.querySelector('.super-meddiag-th')) return; // already injected

    const cpTh = document.createElement('th');
    cpTh.className = 'super-meddiag-th super-meddiag-th--cp';
    cpTh.innerHTML = '<span title="Care Plan coverage from MDS focus areas">CP</span>';
    cpTh.style.width = '4%';

    const qTh = document.createElement('th');
    qTh.className = 'super-meddiag-th super-meddiag-th--q';
    qTh.innerHTML = '<span title="Physician query status">Query</span>';
    qTh.style.width = '7%';

    // Insert before the last two columns (Created Date, Created By) so
    // they sit alongside the existing diagnostic metadata.
    const ths = headerRow.querySelectorAll('th');
    const insertBefore = ths[Math.max(0, ths.length - 2)] || null;
    if (insertBefore) {
      headerRow.insertBefore(cpTh, insertBefore);
      headerRow.insertBefore(qTh, insertBefore);
    } else {
      headerRow.appendChild(cpTh);
      headerRow.appendChild(qTh);
    }
  },

  _renderRows() {
    const rows = document.querySelectorAll('#meddiaglisting tbody tr');
    rows.forEach(row => this._renderRow(row));
  },

  _renderRow(row) {
    const code = this._extractCodeFromRow(row);
    const dx = code ? this._byCode.get(code) : null;

    // Find or create our two cells. We always add cells (even when there's
    // no data) so the table stays a clean rectangle.
    let cpCell = row.querySelector('.super-meddiag-cell--cp');
    let qCell = row.querySelector('.super-meddiag-cell--q');
    if (!cpCell) {
      cpCell = document.createElement('td');
      cpCell.className = 'super-meddiag-cell super-meddiag-cell--cp';
      qCell = document.createElement('td');
      qCell.className = 'super-meddiag-cell super-meddiag-cell--q';
      const tds = row.querySelectorAll('td');
      const insertBefore = tds[Math.max(0, tds.length - 2)] || null;
      if (insertBefore) {
        row.insertBefore(cpCell, insertBefore);
        row.insertBefore(qCell, insertBefore);
      } else {
        row.appendChild(cpCell);
        row.appendChild(qCell);
      }
    }

    cpCell.innerHTML = '';
    qCell.innerHTML = '';

    if (!dx) {
      // No data for this code — leave empty.
      return;
    }

    cpCell.appendChild(this._buildCarePlanChip(dx));
    qCell.appendChild(this._buildQueryChip(dx));
  },

  _extractCodeFromRow(row) {
    // The code lives in a <td> whose text is a 3-7 char ICD-10 pattern.
    // Most reliable: scan tds and match the regex.
    const tds = row.querySelectorAll('td');
    for (const td of tds) {
      const txt = (td.textContent || '').trim();
      if (/^[A-Z]\d{2}(\.\d+)?[A-Z]?$/.test(txt)) {
        return txt;
      }
    }
    return null;
  },

  _buildCarePlanChip(dx) {
    const cp = dx.carePlanStatus;
    const wrap = document.createElement('span');
    wrap.className = 'super-meddiag-chip super-meddiag-chip--cp';

    if (!cp) {
      // No care-plan evaluation yet (older patients or codes outside MDS).
      wrap.classList.add('super-meddiag-chip--cp-none');
      wrap.title = 'No care plan evaluation';
      wrap.innerHTML = this._shieldSvg('#94a3b8');
      return wrap;
    }

    const status = cp.status || 'missing';
    wrap.classList.add(`super-meddiag-chip--cp-${status}`);
    const color = status === 'covered' ? '#16a34a'
      : status === 'partial' ? '#f59e0b'
      : '#ef4444';

    const focusName = cp.matchedFocus?.focusText || '';
    const reason = cp.reason || '';
    wrap.title = [
      status === 'covered' ? 'Covered' : status === 'partial' ? 'Partially covered' : 'Not covered',
      focusName,
      reason,
    ].filter(Boolean).join(' — ');
    wrap.innerHTML = this._shieldSvg(color);

    // Always clickable — show details panel on every status (including
    // missing, where we surface the "add focus" hint).
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showCarePlanDetails(dx, wrap);
    });
    return wrap;
  },

  _buildQueryChip(dx) {
    const qh = dx.queryHistory;
    const queryable = dx.queryable === true;
    const wrap = document.createElement('span');
    wrap.className = 'super-meddiag-chip super-meddiag-chip--q';

    if (!queryable && !qh) {
      wrap.classList.add('super-meddiag-chip--q-none');
      wrap.title = 'Not queryable for this code';
      wrap.textContent = '—';
      return wrap;
    }

    if (qh?.hasOutstanding) {
      const out = (qh.pendingCount || 0) + (qh.sentCount || 0);
      wrap.classList.add('super-meddiag-chip--q-pending');
      wrap.title = out === 1
        ? 'Query awaiting physician sign-off. Click to view.'
        : `${out} queries awaiting physician sign-off. Click to view.`;
      wrap.innerHTML = this._paperPlaneSvg('#92400e') +
        `<span class="super-meddiag-chip__label">Pending${out > 1 ? ` (${out})` : ''}</span>`;
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showQueryDetails(qh.outstandingQueryId, wrap);
      });
      return wrap;
    }

    if (qh?.lastSignedAt) {
      const days = typeof qh.daysSinceLastSigned === 'number'
        ? Math.floor(qh.daysSinceLastSigned) : 0;
      const overdue = days >= 60;
      wrap.classList.add(overdue ? 'super-meddiag-chip--q-overdue' : 'super-meddiag-chip--q-signed');
      wrap.title = overdue
        ? `Last signed ${days} days ago — re-query recommended (>60d).`
        : `Last signed ${days} day${days === 1 ? '' : 's'} ago.`;
      const color = overdue ? '#ef4444' : '#475569';
      wrap.innerHTML = this._checkCircleSvg(color) +
        `<span class="super-meddiag-chip__label">${overdue ? `Re-query (${days}d)` : `Signed ${days}d`}</span>`;
      // Re-query overdue or recently signed: launch new query flow inline.
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        this._launchQueryFor(dx, wrap);
      });
      return wrap;
    }

    // Queryable but no history yet — offer a one-click "Query" launcher.
    wrap.classList.add('super-meddiag-chip--q-ready');
    wrap.title = 'Queryable — click to launch a physician query.';
    wrap.innerHTML = this._chatSvg('#4338ca') +
      `<span class="super-meddiag-chip__label">Query</span>`;
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this._launchQueryFor(dx, wrap);
    });
    return wrap;
  },

  // ---- click handlers ---------------------------------------------------

  /**
   * Open the QueryDetailModal for an existing query. Adds an in-chip
   * spinner so the click feels instant; the modal pops once the fetch
   * resolves (~200-500ms). chipEl is the clicked chip element so we can
   * restore its content on completion.
   */
  async _showQueryDetails(queryId, chipEl) {
    if (!queryId) return;
    if (typeof window.QueryAPI?.getQuery !== 'function') return;
    if (typeof window.QueryDetailModal?.show !== 'function') return;

    // Visual feedback: replace chip content with a spinner so the user
    // knows the click registered (the underlying fetch is the slow part).
    const restore = chipEl ? this._setChipLoading(chipEl) : null;

    try {
      const query = await window.QueryAPI.getQuery(queryId);
      if (!query) return;
      window.QueryDetailModal.show(query, null, { showCodingStatus: false });
    } catch (err) {
      console.warn('[MedDiagAugment] failed to open query detail:', err);
      window.SuperToast?.show?.({
        message: 'Could not load query. Try again.',
        type: 'error',
      });
    } finally {
      if (restore) restore();
    }
  },

  /**
   * Anchored care-plan panel rendered next to the chip — same visual
   * language as the MDS overlay's toggleCarePlanInline. Click backdrop
   * or another chip to dismiss.
   */
  _showCarePlanDetails(dx, anchorEl) {
    this._closeCarePlanPanel();
    const cp = dx.carePlanStatus || {};
    const status = cp.status || 'missing';
    const statusLabels = {
      covered: 'Care Planned',
      partial: 'Partially Care Planned',
      missing: 'Not Care Planned',
    };
    const statusColors = {
      covered: '#16a34a',
      partial: '#d97706',
      missing: '#dc2626',
    };
    const label = statusLabels[status] || status;
    const color = statusColors[status] || '#64748b';

    const focusName = cp.matchedFocus?.focusText
      ? cp.matchedFocus.focusText.split('\n')[0].split('--')[0].trim().replace(/\s+AEB\s*$/i, '')
      : '';

    const panel = document.createElement('div');
    panel.className = 'super-meddiag-cp-panel';
    panel.innerHTML = `
      <div class="super-meddiag-cp-panel__row" style="border-left-color:${color};">
        <div class="super-meddiag-cp-panel__status" style="color:${color};">${this._esc(label)}</div>
        <div class="super-meddiag-cp-panel__code">${this._esc(dx.code || '')} — ${this._esc(dx.description || '')}</div>
        ${focusName ? `<div class="super-meddiag-cp-panel__focus">${this._esc(focusName)}</div>` : ''}
        ${cp.reason ? `<div class="super-meddiag-cp-panel__reason">${this._esc(cp.reason)}</div>` : ''}
        ${status === 'missing' ? `
          <div class="super-meddiag-cp-panel__hint">
            No matching care plan focus. Add one in PCC's Care Plan tab.
          </div>` : ''}
      </div>
    `;

    // Backdrop closes on click
    const backdrop = document.createElement('div');
    backdrop.className = 'super-meddiag-cp-backdrop';
    backdrop.addEventListener('click', () => this._closeCarePlanPanel());

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    this._activeCpPanel = panel;
    this._activeCpBackdrop = backdrop;

    // Position next to the anchor
    this._positionPanel(panel, anchorEl);

    // Close on Esc
    const onKey = (e) => {
      if (e.key === 'Escape') {
        this._closeCarePlanPanel();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
    panel._onKey = onKey;
  },

  _closeCarePlanPanel() {
    if (this._activeCpPanel) {
      if (this._activeCpPanel._onKey) {
        document.removeEventListener('keydown', this._activeCpPanel._onKey);
      }
      this._activeCpPanel.remove();
      this._activeCpPanel = null;
    }
    if (this._activeCpBackdrop) {
      this._activeCpBackdrop.remove();
      this._activeCpBackdrop = null;
    }
  },

  _positionPanel(panel, anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    const margin = 8;
    const panelW = 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    panel.style.position = 'fixed';
    panel.style.zIndex = '2147483640';
    panel.style.width = `${panelW}px`;
    panel.style.maxHeight = `${Math.min(420, vh - 24)}px`;
    panel.style.overflowY = 'auto';

    // Horizontal: right-align with chip when chip is past midpoint, else
    // left-align. Then clamp inside the viewport with a 12px gutter.
    const pastMidpoint = r.left > vw / 2;
    let left = pastMidpoint
      ? r.right - panelW
      : r.left;
    left = Math.max(12, Math.min(left, vw - panelW - 12));
    panel.style.left = `${left}px`;

    // Vertical: prefer below; flip above if it would clip. Measure after
    // setting width so wrap-induced height is real.
    panel.style.top = '0px';
    panel.style.visibility = 'hidden';
    document.body.appendChild(panel.parentNode === document.body ? panel : panel);
    const ph = panel.offsetHeight || 200;
    panel.style.visibility = '';
    let top;
    if (r.bottom + margin + ph <= vh - 12) {
      top = r.bottom + margin;
    } else if (r.top - margin - ph >= 12) {
      top = r.top - margin - ph;
    } else {
      // Neither fits cleanly — center vertically with margins.
      top = Math.max(12, Math.min(r.bottom + margin, vh - ph - 12));
    }
    panel.style.top = `${top}px`;
  },

  /**
   * Launch a query flow modal directly (no icd10-viewer chrome). Fetches
   * annotations for the base code so the flow has evidence to attach.
   *
   * Visual feedback: chip shows spinner during the annotation fetch (the
   * slow part) so the click feels responsive.
   */
  async _launchQueryFor(dx, chipEl) {
    if (!dx?.code || !this._patientId) return;
    const baseCode = dx.code.length >= 3 ? dx.code.substring(0, 3) : dx.code;

    const restore = chipEl ? this._setChipLoading(chipEl) : null;

    try {
      // Fetch annotations for the base code (existing API client + cache)
      let annotations = [];
      if (typeof window.ICD10API?.getAnnotationsByBaseCode === 'function') {
        try {
          annotations = await window.ICD10API.getAnnotationsByBaseCode(
            this._patientId, baseCode, this._facilityName, this._orgSlug, null
          );
        } catch (e) {
          console.warn('[MedDiagAugment] failed to fetch annotations:', e);
        }
      }

      const groupContext = {
        groupCode: baseCode,
        groupKey: baseCode,
        groupName: dx.description || null,
        pdpmCategory: dx.pdpmCategory || null,
        pdpmCategoryName: dx.pdpmCategoryName || null,
        pdpmCategoryNumber: dx.pdpmCategoryNumber ?? null,
        pdpmPoints: dx.pdpmPoints,
        mdsItemCode: dx.mdsItemCode || null,
        queryable: dx.queryable === true,
      };

      await this._mountQueryFlow({
        baseCode: dx.code,
        description: dx.description || '',
        groupContext,
        items: annotations || [],
      });
    } finally {
      if (restore) restore();
    }
  },

  /**
   * Mount the Icd10QueryFlow Preact component into a fresh container.
   * Same pattern the icd10-viewer uses internally.
   */
  async _mountQueryFlow({ baseCode, description, groupContext, items }) {
    if (this._queryFlowUnmount) {
      try { this._queryFlowUnmount(); } catch (_) {}
      this._queryFlowUnmount = null;
    }

    const mountEl = document.createElement('div');
    mountEl.className = 'super-meddiag-query-flow-mount';
    document.body.appendChild(mountEl);

    let render, h, Icd10QueryFlow;
    try {
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
    } catch (err) {
      console.error('[MedDiagAugment] failed to load query flow:', err);
      mountEl.remove();
      window.SuperToast?.show?.({ message: 'Could not load query flow.', type: 'error' });
      return;
    }

    const cleanup = () => {
      try { render(null, mountEl); } catch (_) {}
      mountEl.remove();
      this._queryFlowUnmount = null;
    };
    this._queryFlowUnmount = cleanup;

    render(
      h(Icd10QueryFlow, {
        baseCode,
        description,
        groupContext,
        items,
        patientId: this._patientId,
        facilityName: this._facilityName,
        orgSlug: this._orgSlug,
        assessmentId: null,
        onClose: () => cleanup(),
        onComplete: (sentQueries, practitionerName) => {
          const n = (sentQueries || []).length;
          if (n > 0) {
            window.SuperToast?.show?.({
              message: n === 1
                ? `Query for ${baseCode} sent to ${practitionerName || 'practitioner'}.`
                : `${n} queries sent to ${practitionerName || 'practitioner'}.`,
              type: 'success',
            });
            // Refresh page chips so "Query" → "Pending" without reload.
            this._fetchAndRender();
          }
        },
      }),
      mountEl
    );
  },

  /**
   * Replace a chip's content with a spinner during async work.
   * Returns a restore() function the caller calls when done.
   */
  _setChipLoading(chipEl) {
    if (!chipEl) return null;
    const original = chipEl.innerHTML;
    chipEl.innerHTML = `<span class="super-meddiag-chip__spinner"></span>`;
    chipEl.style.pointerEvents = 'none';
    return () => {
      chipEl.innerHTML = original;
      chipEl.style.pointerEvents = '';
    };
  },

  // ---- svg helpers ------------------------------------------------------

  _shieldSvg(color) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  },
  _paperPlaneSvg(color) {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
  },
  _checkCircleSvg(color) {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  },
  _chatSvg(color) {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
  },

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

window.MedDiagAugment = MedDiagAugment;
