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
    // Inject columns + skeleton cells immediately so the user sees the
    // augmented layout instantly; replace skeletons once the fetch lands.
    this._injectColumns();
    if (!this._data) this._renderRowsLoading();

    try {
      const data = await this._fetchStatusOverview();
      if (!data) {
        // Fetch failed silently — clear skeletons so cells aren't stuck.
        this._renderRowsEmpty();
        return;
      }
      this._data = data;
      this._byCode = new Map();
      for (const dx of data.diagnoses || []) {
        const k = dx?.code || dx?.icd10Code;
        if (k) this._byCode.set(k, dx);
      }
      this._renderRows();
    } catch (err) {
      console.warn('[MedDiagAugment] fetch/render failed:', err);
      this._renderRowsEmpty();
    }
  },

  /**
   * Render small skeleton spinners in every CP/Query cell while we wait
   * for the status-overview fetch — the table feels alive instead of
   * showing 4-12 empty cells for 200-500ms.
   */
  _renderRowsLoading() {
    const rows = document.querySelectorAll('#meddiaglisting tbody tr');
    rows.forEach(row => {
      const { cpCell, qCell } = this._ensureCells(row);
      cpCell.innerHTML = `<span class="super-meddiag-skel" aria-label="Loading"></span>`;
      qCell.innerHTML = `<span class="super-meddiag-skel" aria-label="Loading"></span>`;
    });
  },

  _renderRowsEmpty() {
    const rows = document.querySelectorAll('#meddiaglisting tbody tr');
    rows.forEach(row => {
      const { cpCell, qCell } = this._ensureCells(row);
      cpCell.innerHTML = '';
      qCell.innerHTML = '';
    });
  },

  _ensureCells(row) {
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
    return { cpCell, qCell };
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
    // Only log when we extracted a code but couldn't find a matching dx
    // (this is the failure mode that hides CP/Query chips). Successful
    // renders and rows that legitimately don't match a code are quiet.
    if (code && !dx) {
      console.warn('[MedDiagAugment] no diagnosis for code:', code, 'known codes:', Array.from(this._byCode?.keys() || []));
    }
    const { cpCell, qCell } = this._ensureCells(row);
    cpCell.innerHTML = '';
    qCell.innerHTML = '';
    if (!dx) return;
    cpCell.appendChild(this._buildCarePlanChip(dx));
    qCell.appendChild(this._buildQueryChip(dx));
  },

  _extractCodeFromRow(row) {
    // The code lives in a <td> whose text is a 3-7 char ICD-10 pattern.
    // Most reliable: scan tds and match the regex.
    const tds = row.querySelectorAll('td');
    for (const td of tds) {
      const txt = (td.textContent || '').trim();
      if (/^[A-Z]\d{2}(\.[A-Z0-9]+)?$/i.test(txt)) {
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
    // A code is queryable if the backend flags it OR hands us an MDS handle.
    // Non-PDPM "direct-form" codes (e.g. dysphagia R13.10) come back with
    // queryable:false but a populated mdsItemCode ("I8000:R13.10") — those are
    // fully queryable; _launchQueryFor passes the mdsItemCode straight through.
    const queryable = dx.queryable === true || !!dx.mdsItemCode;
    const wrap = document.createElement('span');
    wrap.className = 'super-meddiag-chip super-meddiag-chip--q';

    if (!queryable && !qh) {
      wrap.classList.add('super-meddiag-chip--q-none');
      wrap.title = 'Not queryable for this code';
      wrap.textContent = '—';
      return wrap;
    }

    // Icon-only chip variants. Color carries the state signal; an optional
    // numeric badge surfaces pending count.
    wrap.classList.add('super-meddiag-chip--q-icon');

    if (qh?.hasOutstanding) {
      const out = (qh.pendingCount || 0) + (qh.sentCount || 0);
      wrap.classList.add('super-meddiag-chip--q-pending');
      wrap.title = out === 1
        ? 'Query awaiting physician sign-off. Click for history.'
        : `${out} queries awaiting physician sign-off. Click for history.`;
      const badge = out > 1
        ? `<span class="super-meddiag-chip__badge super-meddiag-chip__badge--count">${out}</span>`
        : `<span class="super-meddiag-chip__badge super-meddiag-chip__badge--clock">${this._clockSvg('#fff')}</span>`;
      wrap.innerHTML = this._stethoscopeSvg('#b45309') + badge;
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showQueryTimeline(dx, wrap);
      });
      return wrap;
    }

    if (qh?.lastSignedAt) {
      const days = typeof qh.daysSinceLastSigned === 'number'
        ? Math.floor(qh.daysSinceLastSigned) : 0;
      const overdue = days >= 60;
      wrap.classList.add(overdue ? 'super-meddiag-chip--q-overdue' : 'super-meddiag-chip--q-signed');
      wrap.title = overdue
        ? `Last signed ${days} days ago — re-query recommended (>60d). Click for history.`
        : `Last signed ${days} day${days === 1 ? '' : 's'} ago. Click for history.`;
      const iconColor = overdue ? '#dc2626' : '#16a34a';
      const badge = overdue
        ? `<span class="super-meddiag-chip__badge super-meddiag-chip__badge--alert">${this._alertSvg('#fff')}</span>`
        : `<span class="super-meddiag-chip__badge super-meddiag-chip__badge--check">${this._checkSvg('#fff')}</span>`;
      wrap.innerHTML = this._stethoscopeSvg(iconColor) + badge;
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showQueryTimeline(dx, wrap);
      });
      return wrap;
    }

    // Queryable but no history yet — one-click launcher.
    wrap.classList.add('super-meddiag-chip--q-ready');
    wrap.title = 'Ask the physician about this code';
    wrap.innerHTML = this._stethoscopeSvg('#64748b');
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
   * Anchored care-plan panel — distinct cards for Focus / Intervention /
   * AI explanation so it's clear what came from the chart vs what the
   * model inferred.
   */
  _showCarePlanDetails(dx, anchorEl) {
    this._closeCarePlanPanel();
    const cp = dx.carePlanStatus || {};
    const status = cp.status || 'missing';
    const statusMeta = {
      covered: { label: 'Care Planned', color: '#16a34a', bg: '#f0fdf4', icon: this._checkBadgeSvg('#16a34a') },
      partial: { label: 'Partially Care Planned', color: '#d97706', bg: '#fffbeb', icon: this._partialBadgeSvg('#d97706') },
      missing: { label: 'Not Care Planned', color: '#dc2626', bg: '#fef2f2', icon: this._alertBadgeSvg('#dc2626') },
    };
    const meta = statusMeta[status] || statusMeta.missing;

    // PCC focus text often arrives with a "DX: " or similar prefix and an
    // "AEB ..." suffix — strip both so the focus reads cleanly.
    const focusText = cp.matchedFocus?.focusText
      ? cp.matchedFocus.focusText
          .replace(/^DX:\s*/i, '')
          .replace(/\s+AEB[\s\S]*$/i, '')
          .trim()
      : '';
    const focusResolved = !!cp.matchedFocus?.isResolved;
    const hasIntervention = !!cp.matchedInterventionId;

    const panel = document.createElement('div');
    panel.className = 'super-meddiag-cp-panel super-meddiag-cp-panel--cards';
    panel.innerHTML = `
      <div class="super-meddiag-cp-panel__head" style="background:${meta.bg};border-color:${meta.color};">
        <div class="super-meddiag-cp-panel__head-icon" style="color:${meta.color};">${meta.icon}</div>
        <div class="super-meddiag-cp-panel__head-text">
          <div class="super-meddiag-cp-panel__status" style="color:${meta.color};">${this._esc(meta.label)}</div>
          <div class="super-meddiag-cp-panel__code">${this._esc(dx.code || '')} · ${this._esc(dx.description || '')}</div>
        </div>
      </div>
      <div class="super-meddiag-cp-panel__body">
        ${focusText ? `
          <div class="super-meddiag-cp-card">
            <div class="super-meddiag-cp-card__label">
              ${this._targetSvg('#0f172a')} Focus
              ${focusResolved ? `<span class="super-meddiag-cp-card__tag super-meddiag-cp-card__tag--resolved">Resolved</span>` : ''}
            </div>
            <div class="super-meddiag-cp-card__body">${this._esc(focusText)}</div>
          </div>
        ` : ''}
        ${hasIntervention ? `
          <div class="super-meddiag-cp-card">
            <div class="super-meddiag-cp-card__label">
              ${this._wrenchSvg('#0f172a')} Intervention
              <span class="super-meddiag-cp-card__tag super-meddiag-cp-card__tag--ok">Matched</span>
            </div>
            <div class="super-meddiag-cp-card__body super-meddiag-cp-card__body--muted">
              An intervention is linked under this focus. Open in PCC's Care Plan tab to view full text.
            </div>
          </div>
        ` : ''}
        ${cp.reason ? `
          <div class="super-meddiag-cp-card super-meddiag-cp-card--ai">
            <div class="super-meddiag-cp-card__label">
              ${this._sparkleSvg('#6366f1')} Why this matches
            </div>
            <div class="super-meddiag-cp-card__body super-meddiag-cp-card__body--ai">${this._esc(cp.reason)}</div>
          </div>
        ` : ''}
        ${status === 'missing' && !focusText ? `
          <div class="super-meddiag-cp-card super-meddiag-cp-card--missing">
            <div class="super-meddiag-cp-card__body">
              No matching care plan focus. Add one in PCC's Care Plan tab to address this diagnosis.
            </div>
          </div>
        ` : ''}
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

  /**
   * Anchored query-history timeline. Same visual frame as the CP panel.
   * Renders up to 10 most-recent queries (recentQueries[]), each clickable
   * to open its full detail in QueryDetailModal. Highlights entries where
   * the doctor signed with a different code than the query subject — that
   * mismatch is real coding intel ("doc preferred E44.1 over E44.0").
   * Bottom CTA launches a new query when re-querying is appropriate.
   */
  _showQueryTimeline(dx, anchorEl) {
    this._closeAnchoredPanels();
    const qh = dx.queryHistory || {};
    const recent = Array.isArray(qh.recentQueries) ? qh.recentQueries : [];
    const total = qh.totalCount ?? recent.length;
    const days = typeof qh.daysSinceLastSigned === 'number'
      ? Math.floor(qh.daysSinceLastSigned) : null;
    const overdue = days != null && days >= 60;
    const codeOnRow = dx.code || dx.icd10Code || '';

    const panel = document.createElement('div');
    panel.className = 'super-meddiag-cp-panel super-meddiag-q-panel';

    const head = `
      <div class="super-meddiag-q-panel__head">
        <div class="super-meddiag-q-panel__title">
          <strong>${this._esc(codeOnRow)}</strong>
          ${dx.description ? ` — ${this._esc(dx.description)}` : ''}
        </div>
        <div class="super-meddiag-q-panel__sub">Query history${total > recent.length ? ` (showing ${recent.length} of ${total})` : ''}</div>
      </div>
    `;

    const entriesHtml = recent.length === 0
      ? `<div class="super-meddiag-q-panel__empty">No prior queries.</div>`
      : recent.map((q, i) => this._renderTimelineEntry(q, codeOnRow, i)).join('');

    const footerLines = [];
    if (qh.lastSignedAt) {
      footerLines.push(overdue
        ? `<span class="super-meddiag-q-panel__overdue">Last signed ${days} days ago — past 60d, re-query OK.</span>`
        : `<span class="super-meddiag-q-panel__recent">Last signed ${days} day${days === 1 ? '' : 's'} ago.</span>`);
    }
    const reQueryBtn = `
      <!-- NO_TRACK: launches Icd10QueryFlow which emits dx_query_created on submit -->
      <button type="button" class="super-meddiag-q-panel__cta" data-action="re-query">
        ${this._chatSvg('#fff')}
        ${qh.hasOutstanding ? 'Send another query' : (qh.lastSignedAt ? 'Re-query' : 'Send a query')}
      </button>
    `;

    panel.innerHTML = `
      ${head}
      <div class="super-meddiag-q-panel__list">${entriesHtml}</div>
      <div class="super-meddiag-q-panel__footer">
        ${footerLines.join('')}
        ${reQueryBtn}
      </div>
    `;

    const backdrop = document.createElement('div');
    backdrop.className = 'super-meddiag-cp-backdrop';
    backdrop.addEventListener('click', () => this._closeAnchoredPanels());

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    this._activeCpPanel = panel;
    this._activeCpBackdrop = backdrop;
    this._positionPanel(panel, anchorEl);

    // Wire entry clicks. Don't close the timeline until the detail fetch
    // resolves — replace the entry's content with a spinner during the
    // fetch so the user gets immediate visual feedback.
    panel.querySelectorAll('[data-query-id]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.queryId;
        if (!id || this._entryFetching) return;
        this._entryFetching = true;
        const restore = this._setEntryLoading(el);
        try {
          if (typeof window.QueryAPI?.getQuery !== 'function') return;
          if (typeof window.QueryDetailModal?.show !== 'function') return;
          const query = await window.QueryAPI.getQuery(id);
          if (!query) return;
          this._closeAnchoredPanels();
          window.QueryDetailModal.show(query, null, { showCodingStatus: false });
        } catch (err) {
          console.warn('[MedDiagAugment] failed to open query detail:', err);
          window.SuperToast?.show?.({ message: 'Could not load query. Try again.', type: 'error' });
        } finally {
          this._entryFetching = false;
          if (restore) restore();
        }
      });
    });
    // Wire CTA
    const cta = panel.querySelector('[data-action="re-query"]');
    if (cta) {
      cta.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeAnchoredPanels();
        this._launchQueryFor(dx, anchorEl);
      });
    }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        this._closeAnchoredPanels();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
    panel._onKey = onKey;
  },

  _renderTimelineEntry(q, rowCode, index) {
    const status = q.status || 'pending';
    const date = q.signedAt || q.rejectedAt || q.sentAt || q.createdAt;
    const dateLabel = date ? this._formatShortDate(date) : '—';
    const statusColor = {
      pending: '#475569',
      sent: '#92400e',
      signed: '#16a34a',
      rejected: '#dc2626',
    }[status] || '#64748b';

    let detailLine = '';
    if (status === 'signed') {
      const sel = q.selectedIcd10Code;
      const mismatch = sel && rowCode && sel !== rowCode;
      detailLine = sel
        ? `Signed → <strong>${this._esc(sel)}</strong>${mismatch ? ` <span class="super-meddiag-q-mismatch" title="Doctor signed with a different specificity than the query subject (${this._esc(rowCode)}).">⚠ different code</span>` : ''}`
        : 'Signed';
    } else if (status === 'rejected') {
      detailLine = q.rejectionReason
        ? `Rejected — <em>${this._esc(q.rejectionReason)}</em>`
        : 'Rejected';
    } else if (status === 'sent') {
      detailLine = 'Sent — awaiting physician sign-off';
    } else {
      detailLine = 'Pending';
    }

    return `
      <div class="super-meddiag-q-entry super-meddiag-q-entry--${status}"
           data-query-id="${this._esc(q.id || '')}"
           role="button" tabindex="0">
        <span class="super-meddiag-q-entry__dot" style="background:${statusColor};"></span>
        <span class="super-meddiag-q-entry__date">${this._esc(dateLabel)}</span>
        <span class="super-meddiag-q-entry__detail">${detailLine}</span>
      </div>
    `;
  },

  _formatShortDate(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const yr = d.getFullYear();
      const now = new Date();
      const sameYear = yr === now.getFullYear();
      return `${months[d.getMonth()]} ${d.getDate()}${sameYear ? '' : ', ' + yr}`;
    } catch { return ''; }
  },

  _closeAnchoredPanels() {
    this._closeCarePlanPanel();
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

  /**
   * Show a loading state on a timeline entry during its detail fetch.
   * Mutes the row + replaces the dot with a spinner; preserves date/text
   * so the user keeps context. Returns a restore function.
   */
  _setEntryLoading(entryEl) {
    if (!entryEl) return null;
    entryEl.classList.add('super-meddiag-q-entry--loading');
    const dot = entryEl.querySelector('.super-meddiag-q-entry__dot');
    let originalDot = null;
    if (dot) {
      originalDot = dot.cloneNode(true);
      dot.outerHTML = `<span class="super-meddiag-q-entry__spinner"></span>`;
    }
    // Block other entry clicks while one is loading
    entryEl.parentElement?.classList.add('super-meddiag-q-panel__list--locked');
    return () => {
      entryEl.classList.remove('super-meddiag-q-entry--loading');
      const spinner = entryEl.querySelector('.super-meddiag-q-entry__spinner');
      if (spinner && originalDot) spinner.replaceWith(originalDot);
      entryEl.parentElement?.classList.remove('super-meddiag-q-panel__list--locked');
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
  _stethoscopeSvg(color) {
    // Person + clipboard — same icon used on Query badges elsewhere in the
    // app (see query-badges.js). Reads as "physician with chart."
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="3"/><path d="M3 21v-2a6 6 0 0 1 6-6 6 6 0 0 1 3 .8"/><rect x="15" y="11" width="7" height="10" rx="1.5"/><path d="M17.5 11V9.5a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1V11"/><line x1="17" y1="14.5" x2="20" y2="14.5"/><line x1="17" y1="16.5" x2="20" y2="16.5"/><line x1="17" y1="18.5" x2="19" y2="18.5"/></svg>`;
  },
  _clockSvg(color) {
    return `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
  },
  _checkSvg(color) {
    return `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  },
  _alertSvg(color) {
    return `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="14"></line><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;
  },
  _checkBadgeSvg(color) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  },
  _partialBadgeSvg(color) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2 a10 10 0 0 1 0 20 z" fill="${color}"></path></svg>`;
  },
  _alertBadgeSvg(color) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  },
  _targetSvg(color) {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`;
  },
  _wrenchSvg(color) {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;
  },
  _sparkleSvg(color) {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 14 9 20 11 14 13 12 19 10 13 4 11 10 9 z"></path></svg>`;
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
