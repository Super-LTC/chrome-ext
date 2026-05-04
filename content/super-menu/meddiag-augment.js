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
        if (dx?.icd10Code) this._byCode.set(dx.icd10Code, dx);
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

    if (cp.matchedFocus?.id || cp.matchedInterventionId || status === 'missing') {
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showCarePlanDetails(dx);
      });
    }
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
        this._showQueryDetails(qh.outstandingQueryId);
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
      // Re-query overdue: launch new query flow via the icd10-viewer.
      // Otherwise still clickable to re-query, just with a different cue.
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        this._launchQueryFor(dx);
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
      this._launchQueryFor(dx);
    });
    return wrap;
  },

  // ---- click handlers ---------------------------------------------------

  async _showQueryDetails(queryId) {
    if (!queryId) return;
    if (typeof window.QueryAPI?.getQuery !== 'function') return;
    if (typeof window.QueryDetailModal?.show !== 'function') return;
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
    }
  },

  _showCarePlanDetails(dx) {
    // Reuse a SuperModal — the MDS overlay's inline panel is too tightly
    // coupled to its DOM context to drop in here. Show the focus + reason
    // + status; offer an "Add focus" link when missing.
    if (typeof window.SuperModal?.show !== 'function') return;
    const cp = dx.carePlanStatus || {};
    const status = cp.status || 'missing';
    const color = status === 'covered' ? '#16a34a'
      : status === 'partial' ? '#f59e0b'
      : '#ef4444';
    const lines = [
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        ${this._shieldSvg(color)}
        <strong style="text-transform:capitalize;">${this._esc(status)}</strong>
      </div>`,
    ];
    if (cp.matchedFocus?.focusText) {
      lines.push(`<div style="margin-bottom:8px;"><strong>Focus:</strong> ${this._esc(cp.matchedFocus.focusText)}</div>`);
    }
    if (cp.reason) {
      lines.push(`<div style="margin-bottom:8px;"><strong>Reason:</strong> ${this._esc(cp.reason)}</div>`);
    }
    if (cp.stale) {
      lines.push(`<div style="color:#737373;font-size:12px;font-style:italic;">Updating…</div>`);
    }
    if (status === 'missing') {
      lines.push(`<div style="margin-top:12px;color:#92400e;background:#fef3c7;border:1px solid #f59e0b;padding:8px 10px;border-radius:6px;font-size:13px;">
        No matching care plan focus. Add one in PCC's Care Plan tab.
      </div>`);
    }
    window.SuperModal.show({
      title: `Care Plan — ${this._esc(dx.icd10Code || '')}`,
      content: lines.join(''),
      size: 'small',
      actions: [
        { label: 'Close', variant: 'secondary', onClick: () => window.SuperModal.close() },
      ],
    });
  },

  _launchQueryFor(dx) {
    // Shortest path to query: open the icd10-viewer modal — its sidebar
    // will land on the right base, and its panel's Query button will
    // start the existing flow. The user lands one click away from sending.
    if (window.ICD10Viewer?.open) {
      window.ICD10Viewer.open();
    }
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
