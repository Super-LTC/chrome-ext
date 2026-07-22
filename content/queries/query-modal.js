// Query Detail Modal for Super LTC Chrome Extension
// Shows query details and actions (resend, view PDF)

import { track, toErrorCode } from '../utils/analytics.js';
import {
  formatArdBadge,
  resolveEffectiveDate,
  isDateInWindow,
  windowGuidanceText,
  outsideWindowWarning,
  formatIsoShort,
} from './lib/query-timing.js';
import { currentIcd10, toRecommendedIcd10 } from './lib/icd10-picker-util.js';

// A query is editable (note + effective date) until the physician signs it.
// Backend enforces the same rule (400 on signed); this just gates the UI.
const EDITABLE_STATUSES = new Set(['pending', 'sent', 'rejected', 'revoked']);

const QueryDetailModal = {
  /**
   * Show the query detail modal
   * @param {Object} query - Query object
   * @param {Object} result - MDS result object (optional, for context)
   * @param {Object} options - Additional options (showPdfButton, pdfUrl, showCodingStatus, mdsItemCoded)
   */
  show(query, result = null, options = {}) {
    // Keep a mutable working copy so an in-place edit (PATCH) can refresh the
    // view without reopening the modal.
    this._query = query;
    this._result = result;
    this._options = options;
    this._editing = false;

    // Track open + dismiss-via-X/ESC/backdrop. Other close paths fire their own
    // close events with appropriate reasons.
    track('query_modal_opened');
    this._closeFired = false;

    const statusDisplay = QueryState.getStatusDisplay(query.status);

    SuperModal.show({
      title: 'Diagnosis Query',
      icon: statusDisplay.icon,
      badge: query.mdsItem,
      content: this._buildContent(query, options),
      actions: this._buildActions(query, result, options),
      size: 'medium',
      className: 'super-query-detail-modal',
      onClose: () => {
        // Closing mid-edit still needs the picker torn down.
        this._editing = false;
        this._destroyPicker();
        if (!this._closeFired) {
          this._closeFired = true;
          track('query_modal_closed', { reason: 'dismiss' });
        }
      }
    });
  },

  /**
   * Re-render the modal body + actions from current state (used when toggling
   * in/out of edit mode or after a successful save). Re-wires edit listeners.
   */
  _rerender() {
    SuperModal.updateContent(this._buildContent(this._query, this._options));
    SuperModal.updateActions(this._buildActions(this._query, this._result, this._options));
    if (this._editing) setTimeout(() => this._wireEditListeners(), 50);
  },

  /**
   * Whether the note + effective date can be edited (until signed).
   */
  _isEditable(query) {
    return EDITABLE_STATUSES.has(query?.status);
  },

  /**
   * Enter edit mode — snapshot the current note, effective date, and ICD-10
   * code into a draft.
   */
  _enterEdit() {
    const q = this._query;
    this._editing = true;
    this._draftNote = q.nurseEditedNote || q.aiGeneratedNote || '';
    this._draftDate = resolveEffectiveDate(q);
    this._initialDate = this._draftDate;
    this._draftIcd10 = currentIcd10(q);
    this._initialIcd10 = this._draftIcd10;
    track('query_edit_started', { item_code: String(q.mdsItem || '') });
    this._rerender();
  },

  /**
   * Cancel edit mode — discard the draft and return to the read view.
   */
  _cancelEdit() {
    this._editing = false;
    this._destroyPicker();
    this._rerender();
  },

  /**
   * Tear down the ICD-10 picker instance. The modal body is rebuilt from HTML on
   * every rerender, so a stale picker would keep listeners on detached nodes.
   */
  _destroyPicker() {
    this._picker?.destroy?.();
    this._picker = null;
  },

  /**
   * Wire the edit-mode inputs (note textarea + date input) to the draft, and
   * toggle the outside-window soft warning live as the date changes.
   */
  _wireEditListeners() {
    const noteEl = document.querySelector('#super-query-edit-note');
    if (noteEl) {
      noteEl.addEventListener('input', (e) => { this._draftNote = e.target.value; });
    }
    const dateEl = document.querySelector('#super-query-edit-date');
    if (dateEl) {
      dateEl.addEventListener('change', (e) => {
        this._draftDate = e.target.value || '';
        this._updateEditWarning();
      });
      this._updateEditWarning();
    }

    // Mount the ICD-10 picker seeded with the diagnosis name, prefilled with the
    // code currently attached. Changing it changes what the doctor is offered at
    // signing (they can still search and pick any code themselves).
    const pickerContainer = document.querySelector('#super-query-edit-icd10');
    if (pickerContainer && window.Icd10CodePicker) {
      this._destroyPicker();
      const q = this._query;
      this._picker = window.Icd10CodePicker.create(pickerContainer, {
        seedQuery: q.mdsItemName || q.mdsItem || '',
        initialSelected: this._draftIcd10,
        onChange: (selected) => {
          this._draftIcd10 = selected;
          this._updateIcd10Hint();
        }
      });
      this._updateIcd10Hint();
    }
  },

  /**
   * Toggle the "can't remove an attached code" hint. The backend rejects an
   * empty `recommendedIcd10`, so once a code is attached the nurse can swap it
   * but not go back to codeless — say so rather than failing on save.
   */
  _updateIcd10Hint() {
    const hintEl = document.querySelector('#super-query-edit-icd10-hint');
    if (!hintEl) return;
    hintEl.hidden = !(this._initialIcd10?.code && !this._draftIcd10?.code);
  },

  /**
   * Recompute + toggle the outside-window warning in edit mode against the
   * query's backend timing window. Advisory only.
   */
  _updateEditWarning() {
    const warnEl = document.querySelector('#super-query-edit-warning');
    if (!warnEl) return;
    const lookbackWindow = this._query.timing?.lookbackWindow;
    if (isDateInWindow(this._draftDate, lookbackWindow) === false) {
      warnEl.textContent = outsideWindowWarning(this._query.timing?.lookbackDays, lookbackWindow);
      warnEl.hidden = false;
    } else {
      warnEl.hidden = true;
    }
  },

  /**
   * Save the edited note + effective date via PATCH. Only sends fields that
   * actually changed. Handles the signed-guard 400 defensively.
   */
  async _saveEdit(btn) {
    const q = this._query;
    const changes = {};
    const newNote = this._draftNote ?? '';
    const origNote = q.nurseEditedNote || q.aiGeneratedNote || '';
    if (newNote !== origNote) changes.nurseEditedNote = newNote;
    // Effective date: '' back to default clears (null); a set value sends it.
    if (this._draftDate !== this._initialDate) {
      changes.effectiveDate = this._draftDate || null;
    }
    // ICD-10: only a real, non-empty new selection is sent. Clearing an attached
    // code is not expressible (backend requires a non-empty array), so we leave
    // the codes untouched and tell the nurse rather than 400.
    const newCode = this._draftIcd10?.code || null;
    const origCode = this._initialIcd10?.code || null;
    const icd10Cleared = !!origCode && !newCode;
    if (newCode && newCode !== origCode) {
      changes.recommendedIcd10 = toRecommendedIcd10(this._draftIcd10);
    }

    if (Object.keys(changes).length === 0) {
      // Nothing changed — just leave edit mode.
      this._editing = false;
      this._destroyPicker();
      if (icd10Cleared) {
        SuperToast.show?.({
          type: 'info',
          message: "Suggested code kept — it can't be removed once sent. The doctor can still pick a different code."
        });
      }
      this._rerender();
      return;
    }

    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      const updated = await QueryAPI.patchQuery(q.id, changes);
      // Merge the server's fresh copy (includes recomputed timing, and on I8000
      // queries a `mdsItem` resynced to the new code) into state.
      this._query = { ...q, ...updated };
      if (window.QueryState) QueryState.updateQuery(q.id, this._query);
      this._editing = false;
      this._destroyPicker();
      track('query_edit_saved', {
        item_code: String(q.mdsItem || ''),
        icd10_changed: changes.recommendedIcd10 !== undefined
      });
      this._rerender();
      if (icd10Cleared) {
        SuperToast.show?.({
          type: 'info',
          message: "Suggested code kept — it can't be removed once sent. The doctor can still pick a different code."
        });
      }
      // Keep the panel/badges in sync with the edited copy.
      window.QueryPanel?.updatePanel?.();
      window.QueryBadges?.updateAllBadges?.();
      SuperToast.success('Query updated');
    } catch (error) {
      console.error('Super LTC: Failed to save query edit', error);
      track('query_edit_failed', { error_code: toErrorCode(error) });
      // If the backend now considers it signed (raced a signature), the query is
      // read-only. Flip our local status to 'signed' so the read view stops
      // offering Edit, and keep the panel/badges in sync.
      const msg = error?.message || '';
      if (/signed/i.test(msg)) {
        this._query = { ...q, status: 'signed' };
        if (window.QueryState) QueryState.updateQuery(q.id, this._query);
        this._editing = false;
        this._destroyPicker();
        this._rerender();
        window.QueryPanel?.updatePanel?.();
        window.QueryBadges?.updateAllBadges?.();
      } else {
        btn.textContent = originalText;
        btn.disabled = false;
      }
      SuperToast.error(`Couldn't save: ${error.message}`);
    }
  },

  /**
   * Build modal content HTML
   * @param {Object} query - Query object
   * @param {Object} options - Additional options
   * @returns {string}
   */
  _buildContent(query, options = {}) {
    const statusDisplay = QueryState.getStatusDisplay(query.status);

    // Format dates
    const sentAt = query.sentAt ? this._formatDate(query.sentAt) : null;
    const signedAt = query.signedAt ? this._formatDate(query.signedAt) : null;

    // Build ICD-10 display. Before signing this is the nurse's suggested code
    // (labelled as such); after signing it's the physician's authoritative pick.
    const icd10 = currentIcd10(query);
    const icd10Display = icd10
      ? `${icd10.code}${icd10.description ? ` - ${icd10.description}` : ''}`
      : null;
    const icd10IsSuggestion = !!icd10 && !query.selectedIcd10Code;

    // Check coding status from options or query
    const showCodingStatus = options.showCodingStatus || query.mdsItemCoded !== undefined;
    const mdsItemCoded = options.mdsItemCoded !== undefined ? options.mdsItemCoded : query.mdsItemCoded;

    return `
      <div class="super-query-detail">
        <!-- Status Header -->
        <div class="super-query-detail__status ${statusDisplay.className}">
          <span class="super-query-detail__status-icon">${statusDisplay.icon}</span>
          <span class="super-query-detail__status-label">${statusDisplay.label}</span>
          ${query.status === 'signed' && signedAt ? `<span class="super-query-detail__status-date">${signedAt}</span>` : ''}
          ${query.status === 'sent' && sentAt ? `<span class="super-query-detail__status-date">${sentAt}</span>` : ''}
        </div>

        <!-- Patient Info (only if available) -->
        ${query.patientName ? `
        <div class="super-query-detail__patient">
          <div class="super-query-detail__patient-name">${this._escapeHTML(query.patientName)}</div>
          ${query.locationName ? `<div class="super-query-detail__patient-meta"><span>${this._escapeHTML(query.locationName)}</span></div>` : ''}
        </div>
        ` : ''}

        <!-- Diagnosis & ICD-10 Combined -->
        <div class="super-query-detail__diagnosis-card">
          <div class="super-query-detail__diagnosis-name">
            ${this._escapeHTML(query.mdsItemName || query.mdsItem)}
          </div>
          ${icd10Display ? `
            <div class="super-query-detail__diagnosis-code">
              ${this._escapeHTML(icd10Display)}${icd10IsSuggestion ? ' <span class="super-query-detail__code-qualifier">suggested</span>' : ''}
            </div>
          ` : ''}
        </div>

        <!-- Note for physician (view / edit) -->
        ${this._buildNoteSectionHTML(query)}

        <!-- Suggested ICD-10 code (edit mode only) -->
        ${this._buildIcd10SectionHTML(query)}

        <!-- Effective (onset) date + ARD timing -->
        ${this._buildEffectiveDateSectionHTML(query)}

        <!-- Signed Info -->
        ${query.status === 'signed' && query.signedByName ? `
          <div class="super-query-detail__signed-card">
            <span class="super-query-detail__signed-icon">&#10003;</span>
            <div class="super-query-detail__signed-info">
              <div class="super-query-detail__signed-label">Signed by</div>
              <div class="super-query-detail__signed-name">
                ${this._escapeHTML(query.signedByName)}${query.signedByTitle ? `, ${this._escapeHTML(query.signedByTitle)}` : ''}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Coding Status (for signed queries) -->
        ${query.status === 'signed' && showCodingStatus ? `
          <div class="super-query-detail__coding-card ${mdsItemCoded ? 'super-query-detail__coding-card--coded' : 'super-query-detail__coding-card--needs-coding'}">
            <span class="super-query-detail__coding-icon">${mdsItemCoded ? '&#10003;' : '&#9998;'}</span>
            <div class="super-query-detail__coding-info">
              <div class="super-query-detail__coding-label">${mdsItemCoded ? 'Added to MDS' : 'Needs to be added to MDS'}</div>
              <div class="super-query-detail__coding-text">${mdsItemCoded ? 'This diagnosis has been coded on the assessment' : 'Click "Go to Section" to add this diagnosis to the MDS'}</div>
            </div>
          </div>
        ` : ''}

        <!-- Sent Info (for pending queries) -->
        ${query.status === 'sent' ? `
          <div class="super-query-detail__sent-card">
            <span class="super-query-detail__sent-icon">&#8987;</span>
            <div class="super-query-detail__sent-info">
              <div class="super-query-detail__sent-label">Awaiting signature</div>
              <div class="super-query-detail__sent-text">SMS was sent to the physician</div>
            </div>
          </div>
        ` : ''}

        <!-- Rejected Info -->
        ${query.status === 'rejected' ? `
          <div class="super-query-detail__rejected-card">
            <span class="super-query-detail__rejected-icon">&#10007;</span>
            <div class="super-query-detail__rejected-info">
              <div class="super-query-detail__rejected-label">Rejected</div>
              <div class="super-query-detail__rejected-text">The physician did not sign this query</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  /**
   * Build the "Note for Physician" section — read text, or a textarea in edit
   * mode. Shows the nurse's edited note, falling back to the AI-generated one.
   * @param {Object} query
   * @returns {string}
   */
  _buildNoteSectionHTML(query) {
    if (this._editing) {
      return `
        <div class="super-query-detail__section">
          <div class="super-query-detail__label">Note for Physician</div>
          <textarea
            class="super-query-detail__note-edit"
            id="super-query-edit-note"
            rows="4"
            placeholder="Note for physician..."
          >${this._escapeHTML(this._draftNote || '')}</textarea>
        </div>
      `;
    }

    const note = query.nurseEditedNote || query.aiGeneratedNote || '';
    return `
      <div class="super-query-detail__section">
        <div class="super-query-detail__label">Note for Physician</div>
        ${note
          ? `<div class="super-query-detail__note">${this._escapeHTML(note)}</div>`
          : `<div class="super-query-detail__note super-query-detail__note--empty">No note written yet.</div>`}
      </div>
    `;
  },

  /**
   * Build the ICD-10 section. Edit mode only — the read view already shows the
   * code on the diagnosis card. The picker itself is mounted by
   * `_wireEditListeners` into the container rendered here.
   * @param {Object} query
   * @returns {string}
   */
  _buildIcd10SectionHTML(query) {
    if (!this._editing) return '';
    // I8000 direct-code queries take their identity from the first code, so a
    // swap here renames the query itself. Warn before, not after.
    const isDirectCode = String(query.mdsItem || '').startsWith('I8000');
    return `
      <div class="super-query-detail__section">
        <div id="super-query-edit-icd10"></div>
        ${isDirectCode ? `
          <div class="super-query-detail__hint">Changing the code renames this query to the new diagnosis.</div>
        ` : ''}
        <div class="super-query-detail__date-warning" id="super-query-edit-icd10-hint" hidden>
          A suggested code can't be removed once sent — the doctor can still pick a different one.
        </div>
      </div>
    `;
  },

  /**
   * Build the effective-date + ARD-timing section. Read mode shows the resolved
   * onset date, the ARD status badge, and window guidance; edit mode swaps in a
   * date input + live outside-window warning. Backwards compatible: with no
   * `timing` (old queries), the badge/guidance simply don't render.
   * @param {Object} query
   * @returns {string}
   */
  _buildEffectiveDateSectionHTML(query) {
    const badge = formatArdBadge(query.timing);
    const badgeHTML = badge
      ? `<span class="super-ard-badge super-ard-badge--${badge.tone}">${this._escapeHTML(badge.text)}</span>`
      : '';
    const guidance = windowGuidanceText(query.timing?.lookbackWindow);
    const guidanceHTML = guidance
      ? `<div class="super-query-detail__hint">${this._escapeHTML(guidance)}</div>`
      : '';

    const labelRow = `
      <div class="super-query-detail__label-row">
        <span class="super-query-detail__label">Effective date</span>
        ${badgeHTML}
      </div>
    `;

    if (this._editing) {
      return `
        <div class="super-query-detail__section">
          ${labelRow}
          <input
            type="date"
            class="super-query-detail__date-input"
            id="super-query-edit-date"
            value="${this._escapeHTML(this._draftDate || '')}"
          />
          ${guidanceHTML}
          <div class="super-query-detail__date-warning" id="super-query-edit-warning" hidden></div>
        </div>
      `;
    }

    const resolved = resolveEffectiveDate(query);
    const display = resolved ? this._formatIso(resolved) : '—';
    return `
      <div class="super-query-detail__section">
        ${labelRow}
        <div class="super-query-detail__value">${this._escapeHTML(display)}</div>
        ${guidanceHTML}
      </div>
    `;
  },

  /**
   * TZ-safe display of a YYYY-MM-DD string as "Mon D, YYYY". Avoids new Date()
   * so an ISO date never shifts a day in a negative-offset timezone.
   * @param {string} iso
   * @returns {string}
   */
  _formatIso(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    return `${formatIsoShort(iso)}, ${iso.slice(0, 4)}`;
  },

  /**
   * Build action buttons based on query status
   * @param {Object} query - Query object
   * @param {Object} result - MDS result (optional)
   * @param {Object} options - Additional options
   * @returns {Array}
   */
  _buildActions(query, result, options = {}) {
    // Edit mode: only Cancel + Save.
    if (this._editing) {
      return [
        {
          label: 'Cancel',
          variant: 'secondary',
          action: () => this._cancelEdit()
        },
        {
          label: 'Save',
          variant: 'primary',
          action: (btn) => this._saveEdit(btn)
        }
      ];
    }

    const actions = [];

    switch (query.status) {
      case 'pending':
        // Draft - can send
        actions.push({
          label: 'Send Query',
          variant: 'primary',
          action: () => {
            this._closeFired = true;
            track('query_modal_closed', { reason: 'submit' });
            SuperModal.close();
            QuerySendModal.show(result, query);
          }
        });
        actions.push({
          label: 'Print Preview',
          variant: 'secondary',
          action: (btn) => this._handlePrintPreview(query, btn)
        });
        break;

      case 'sent':
        // Awaiting signature - can resend
        actions.push({
          label: 'Resend SMS',
          variant: 'primary',
          action: (btn) => this._handleResend(query, btn)
        });
        actions.push({
          label: 'Print Preview',
          variant: 'secondary',
          action: (btn) => this._handlePrintPreview(query, btn)
        });
        break;

      case 'signed':
        // Signed - can view PDF and go to section
        actions.push({
          label: 'View Signed PDF',
          variant: 'primary',
          action: (btn) => this._handleViewPdf(query, btn)
        });

        // If needs coding, add "Go to Section" button
        const mdsItemCoded = options.mdsItemCoded !== undefined ? options.mdsItemCoded : query.mdsItemCoded;
        // Get external assessment ID from query (API returns mdsExternalAssessmentId)
        const externalAssessmentId = query.mdsExternalAssessmentId || query.externalAssessmentId || query.assessmentId;
        if (mdsItemCoded === false && query.mdsItem && externalAssessmentId) {
          const sectionCode = query.mdsItem.charAt(0).toUpperCase();
          actions.push({
            label: `Go to Section ${sectionCode}`,
            variant: 'secondary',
            action: () => {
              this._closeFired = true;
              track('query_modal_closed', { reason: 'cancel' });
              SuperModal.close();
              this._navigateToSection(externalAssessmentId, sectionCode);
            }
          });
        }
        break;

      case 'rejected':
        // Rejected - could create new query
        if (result) {
          actions.push({
            label: 'Create New Query',
            variant: 'primary',
            action: () => {
              this._closeFired = true;
              track('query_modal_closed', { reason: 'submit' });
              SuperModal.close();
              QuerySendModal.show(result);
            }
          });
        }
        actions.push({
          label: 'Print Preview',
          variant: 'secondary',
          action: (btn) => this._handlePrintPreview(query, btn)
        });
        break;
    }

    // Edit note + effective date — available until the query is signed.
    if (this._isEditable(query)) {
      actions.push({
        label: 'Edit',
        variant: 'secondary',
        action: () => this._enterEdit()
      });
    }

    // Always have a close button
    actions.unshift({
      label: 'Close',
      variant: 'secondary',
      action: () => {
        this._closeFired = true;
        track('query_modal_closed', { reason: 'cancel' });
        SuperModal.close();
      }
    });

    return actions;
  },

  /**
   * Handle resend SMS action
   * @param {Object} query - Query object
   * @param {HTMLElement} btn - Button element
   */
  async _handleResend(query, btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    try {
      const result = await QueryAPI.resendQuery(query.id);
      this._closeFired = true;
      track('query_modal_closed', { reason: 'submit' });
      SuperModal.close();

      // Show success toast
      const names = result.results?.map(r => r.practitionerName).join(', ') || 'practitioners';
      SuperToast.success(`SMS resent to ${names}`);

    } catch (error) {
      console.error('Super LTC: Failed to resend query', error);
      track('error_shown', { surface: 'query_resend', error_code: toErrorCode(error), error_type: 'api_error' });
      SuperToast.error(`Failed to resend: ${error.message}`);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  /**
   * Handle print-preview action — downloads the unsigned print PDF
   * for the current query. Mirrors the printQueryPdf flow from QuerySendModal,
   * but pulls code/description from the persisted query rather than the form.
   * @param {Object} query - Query object
   * @param {HTMLElement} btn - Button element
   */
  async _handlePrintPreview(query, btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Preparing...';
    btn.disabled = true;

    const printStart = Date.now();
    track('query_print_started', {
      item_code: String(query.mdsItem || '')
    });

    try {
      const code = query.selectedIcd10Code || '';
      const description = query.selectedIcd10Description || '';

      // Stable filename: topic-id8.pdf
      const topic = String(query.mdsItem || 'query')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const filename = `query-${topic}-${String(query.id).slice(0, 8)}.pdf`;

      await QueryAPI.printQueryPdf(query.id, { code, description, filename });

      track('query_print_succeeded', { duration_ms: Date.now() - printStart });
      SuperToast.success('Print preview downloaded');
    } catch (error) {
      console.error('Super LTC: Failed to print query', error);
      track('query_print_failed', { error_code: toErrorCode(error) });
      SuperToast.error(`Failed to print: ${error.message}`);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  /**
   * Handle view PDF action
   * @param {Object} query - Query object
   * @param {HTMLElement} btn - Button element
   */
  async _handleViewPdf(query, btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Loading...';
    btn.disabled = true;

    try {
      const { pdfUrl } = await QueryAPI.getQueryPdf(query.id);

      if (pdfUrl) {
        window.open(pdfUrl, '_blank');
        this._closeFired = true;
        track('query_modal_closed', { reason: 'submit' });
        SuperModal.close();
      } else {
        throw new Error('No PDF URL returned');
      }

    } catch (error) {
      console.error('Super LTC: Failed to get PDF', error);
      track('error_shown', { surface: 'query_pdf_load', error_code: toErrorCode(error), error_type: 'api_error' });
      SuperToast.error(`Failed to load PDF: ${error.message}`);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  /**
   * Format a date string for display
   * @param {string} dateStr - ISO date string
   * @returns {string}
   */
  _formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  },

  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string}
   */
  _escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Navigate to MDS section in PCC
   * @param {string} assessmentId - External PCC assessment ID
   * @param {string} sectionCode - MDS section code (e.g., "I")
   */
  _navigateToSection(assessmentId, sectionCode) {
    if (!assessmentId) {
      console.error('QueryDetailModal: No assessment ID for navigation');
      if (window.SuperToast) {
        SuperToast.error('Unable to navigate: missing assessment ID');
      }
      return;
    }

    const currentUrl = new URL(window.location.href);
    const origin = currentUrl.origin;
    const sectionUrl = `${origin}/clinical/mds3/section.xhtml?ESOLassessid=${assessmentId}&sectioncode=${sectionCode}`;

    console.log('QueryDetailModal: Navigating to MDS section:', sectionUrl);
    window.location.href = sectionUrl;
  },

  /**
   * Navigate to patient page in PCC
   * @param {string} patientId - External PCC patient ID
   */
  _navigateToPatient(patientId) {
    if (!patientId) {
      console.error('QueryDetailModal: No patient ID for navigation');
      if (window.SuperToast) {
        SuperToast.error('Unable to navigate: missing patient ID');
      }
      return;
    }

    const currentUrl = new URL(window.location.href);
    const origin = currentUrl.origin;
    const patientUrl = `${origin}/admin/client/cp_residentdashboard.jsp?ESOLrow=1&ESOLclientid=${patientId}`;

    console.log('QueryDetailModal: Navigating to patient:', patientUrl);
    window.location.href = patientUrl;
  }
};

// Make available globally
window.QueryDetailModal = QueryDetailModal;

// ============================================================================
// EVIDENCE MODAL
// Shows AI recommendation, evidence, and actions for MDS items
// ============================================================================

const EvidenceModal = {
  /**
   * Show the evidence modal for an MDS item
   * @param {Object} itemData - Data from /api/extension/mds/items/{itemCode}
   * @param {Object} assessmentContext - Context for the assessment
   */
  show(itemData, assessmentContext = {}) {
    const { itemCode, section, item, assessment } = itemData;
    // Get item name from multiple possible sources
    const itemName = item?.name || item?.kbCategory?.categoryName || itemData.itemName || '';

    // For display, use clean code (I8000 items have composite keys like "I8000:NTA:18")
    const displayCode = itemCode?.startsWith('I8000:') ? 'I8000' : itemCode;

    // Build HIPPS impact string
    const hippsImpact = this._buildHippsImpact(itemData);

    const content = this._buildContent(itemData);
    const actions = this._buildActions(itemData, assessmentContext);

    SuperModal.show({
      title: `${displayCode}${itemName ? ` - ${itemName}` : ''}`,
      icon: '&#9889;',
      badge: hippsImpact || `Section ${section || itemCode?.charAt(0) || '?'}`,
      content,
      actions,
      size: 'large',
      className: 'super-evidence-modal'
    });

    // Set up click handlers for evidence cards after modal is shown
    setTimeout(() => {
      this._setupEvidenceCardHandlers();
    }, 50);
  },

  /**
   * Set up click handlers for clickable evidence cards
   */
  _setupEvidenceCardHandlers() {
    const modal = SuperModal.activeModal;
    if (!modal) return;

    modal.querySelectorAll('.super-evidence-card--clickable').forEach(card => {
      card.addEventListener('click', async (e) => {
        e.stopPropagation();

        const orderId = card.dataset.orderId;
        const viewerType = card.dataset.viewerType;
        const viewerId = card.dataset.viewerId;
        const quote = card.dataset.quote;
        const wordBlocksStr = card.dataset.wordBlocks;

        if (orderId) {
          // Show order administrations modal
          if (typeof showAdministrationModal === 'function') {
            await showAdministrationModal(orderId);
          } else {
            console.error('EvidenceModal: showAdministrationModal function not available');
          }
        } else if (viewerType === 'therapy-document' && viewerId) {
          if (typeof showTherapyDocModal === 'function') {
            await showTherapyDocModal(viewerId, quote);
          }
        } else if (viewerType === 'clinical-note' && viewerId) {
          if (typeof showClinicalNoteModal === 'function') {
            await showClinicalNoteModal(viewerId);
          }
        } else if (viewerType === 'document' && viewerId) {
          if (typeof showDocumentModal === 'function') {
            const wordBlocks = wordBlocksStr ? JSON.parse(wordBlocksStr) : null;
            await showDocumentModal(viewerId, wordBlocks);
          }
        } else if (viewerType === 'uda' && viewerId) {
          if (typeof window.showUdaModal === 'function') {
            await window.showUdaModal(viewerId, quote || null);
          }
        } else {
          console.error('EvidenceModal: No valid viewer type found on card');
        }
      });
    });
  },

  /**
   * Build HIPPS impact string from item data
   * @param {Object} itemData
   * @returns {string}
   */
  _buildHippsImpact(itemData) {
    const impact = itemData.impact || itemData.item?.impact || {};
    const parts = [];

    if (impact.nta?.wouldChangeLevel) {
      parts.push(`NTA: ${impact.nta.currentLevel} → ${impact.nta.newLevel}`);
    }
    if (impact.slp?.wouldChangeGroup) {
      parts.push(`SLP: ${impact.slp.currentGroup} → ${impact.slp.newGroup}`);
    }
    if (impact.nursing?.wouldChangeGroup) {
      parts.push(`Nursing: ${impact.nursing.currentPaymentGroup} → ${impact.nursing.newPaymentGroup}`);
    }
    if (impact.ptot?.wouldChangeGroup) {
      parts.push(`PT/OT: ${impact.ptot.currentGroup} → ${impact.ptot.newGroup}`);
    }

    return parts.length > 0 ? parts[0] : '';
  },

  /**
   * Build modal content HTML
   * @param {Object} itemData
   * @returns {string}
   */
  _buildContent(itemData) {
    const { itemCode, section, item, assessment } = itemData;
    const itemName = item?.name || item?.kbCategory?.categoryName || itemData.itemName || '';

    // AI recommendation section
    const aiSection = this._buildAISection(item);

    // Evidence section — read correct field based on status
    const evidence = this._getEvidence(item) || itemData.evidence || [];
    const evidenceSection = this._buildEvidenceSection(evidence);

    // HIPPS impact details
    const impactSection = this._buildImpactSection(itemData);

    // Step summary section (Dx/Tx)
    const stepSummarySection = this._buildStepSummarySection(item);

    return `
      <div class="super-evidence">
        ${impactSection}
        ${stepSummarySection}
        ${aiSection}
        ${evidenceSection}
      </div>
    `;
  },

  /**
   * Build AI recommendation section
   * @param {Object} item
   * @returns {string}
   */
  _buildAISection(item) {
    if (!item) {
      return `
        <div class="super-evidence__section">
          <div class="super-evidence__section-title">AI Recommendation</div>
          <div class="super-evidence__empty">No AI recommendation available</div>
        </div>
      `;
    }

    const answer = item.answer || item.recommendedValue || '—';
    const confidence = item.confidence || 'medium';
    const rationale = item.rationale || item.reason || '';

    // Confidence dots
    const confidenceDots = this._buildConfidenceDots(confidence);

    return `
      <div class="super-evidence__section">
        <div class="super-evidence__section-title">AI Recommendation</div>
        <div class="super-evidence__recommendation">
          <div class="super-evidence__answer-row">
            <span class="super-evidence__answer-label">Recommended Value:</span>
            <span class="super-evidence__answer-value">${this._escapeHTML(String(answer))}</span>
            ${confidenceDots}
          </div>
          ${rationale ? `
            <div class="super-evidence__rationale">
              ${this._escapeHTML(rationale)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  /**
   * Build confidence dots indicator
   * @param {string} confidence - 'high', 'medium', or 'low'
   * @returns {string}
   */
  _buildConfidenceDots(confidence) {
    const level = confidence?.toLowerCase() || 'medium';
    const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;

    const dots = [1, 2, 3].map(i =>
      `<span class="super-evidence__dot ${i <= filled ? 'super-evidence__dot--filled' : ''}"></span>`
    ).join('');

    return `
      <span class="super-evidence__confidence" title="${level} confidence">
        ${dots}
      </span>
    `;
  },

  /**
   * Build evidence cards section using existing evidence card pattern
   * @param {Array} evidence
   * @returns {string}
   */
  _buildEvidenceSection(evidence) {
    if (!evidence || evidence.length === 0) {
      return `
        <div class="super-evidence-section">
          <div class="super-evidence-section__label">Supporting Evidence</div>
          <div class="super-evidence__empty">No evidence available</div>
        </div>
      `;
    }

    const cards = evidence.map(ev => {
      // Handle multiple evidence formats - same as content.js renderEvidence()
      const quote = ev.quoteText || ev.orderDescription || ev.quote || ev.findingText || ev.text || '';
      const sourceType = ev.sourceType || ev.type || this._inferSourceType(ev.displayName, ev.evidenceId);
      const typeClass = `super-evidence-card__type--${sourceType}`;
      const typeLabel = ev.displayName || this._formatSourceType(sourceType);

      // Skip if no quote text at all
      if (!quote) return '';

      // Check if this is an order evidence that can show administrations
      const isOrder = sourceType === 'order';
      const orderId = ev.sourceId || ev.evidenceId || '';

      // Check if this evidence has a viewable type (clinical note, therapy doc, PDF)
      const { viewerType, id: viewerId, chunk: viewerChunk } = typeof parseEvidenceForViewer === 'function'
        ? parseEvidenceForViewer(ev)
        : { viewerType: null, id: null };

      const isViewable = isOrder || viewerType;
      const clickableClass = isViewable ? 'super-evidence-card--clickable' : '';

      // Data attributes for click handling
      let dataAttrs = '';
      if (isOrder) {
        dataAttrs = `data-order-id="${orderId}"`;
      } else if (viewerType) {
        dataAttrs = `data-viewer-type="${viewerType}" data-viewer-id="${viewerId}"`;
        // Add quote text for highlighting in therapy documents
        if (quote) {
          const escapedQuote = quote.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          dataAttrs += ` data-quote="${escapedQuote}"`;
        }
        // Add wordBlocks data if available (for PDF documents)
        if (ev.wordBlocks && Array.isArray(ev.wordBlocks) && ev.wordBlocks.length > 0) {
          const wordBlocksJson = JSON.stringify(ev.wordBlocks).replace(/"/g, '&quot;');
          dataAttrs += ` data-word-blocks="${wordBlocksJson}"`;
        }
      }

      // Action text based on type
      let actionText = '';
      if (isOrder) actionText = 'View Administrations';
      else if (viewerType === 'therapy-document') actionText = 'View Document';
      else if (viewerType === 'clinical-note') actionText = 'View Note';
      else if (viewerType === 'document') actionText = 'View PDF';
      else if (viewerType === 'uda') actionText = 'View Assessment';

      const actionHTML = isViewable ? `
        <div class="super-evidence-card__action">
          <span>${actionText}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      ` : '';

      return `
        <div class="super-evidence-card ${clickableClass}" ${dataAttrs}>
          <div class="super-evidence-card__header">
            <span class="super-evidence-card__type ${typeClass}">${typeLabel}</span>
          </div>
          <div class="super-evidence-card__quote">${this._escapeHTML(quote)}</div>
          ${ev.rationale ? `<div class="super-evidence-card__rationale">${this._escapeHTML(ev.rationale)}</div>` : ''}
          ${actionHTML}
        </div>
      `;
    }).filter(card => card).join('');

    if (!cards) {
      return `
        <div class="super-evidence-section">
          <div class="super-evidence-section__label">Supporting Evidence</div>
          <div class="super-evidence__empty">No evidence available</div>
        </div>
      `;
    }

    return `
      <div class="super-evidence-section">
        <div class="super-evidence-section__label">Evidence (${evidence.length})</div>
        <div class="super-evidence-list">${cards}</div>
      </div>
    `;
  },

  /**
   * Infer source type from filename/evidenceId
   * @param {string} displayName
   * @param {string} evidenceId
   * @returns {string}
   */
  _inferSourceType(displayName, evidenceId) {
    // Check evidenceId first
    if (evidenceId) {
      if (evidenceId.startsWith('order-')) return 'order';
      if (evidenceId.startsWith('mar-')) return 'mar';
      if (evidenceId.startsWith('lab-')) return 'lab-result';
      if (evidenceId.startsWith('therapy-doc-')) return 'therapy-doc';
      if (evidenceId.startsWith('pcc-prognote-')) return 'progress-note';
      if (evidenceId.startsWith('pcc-practnote-') || evidenceId.startsWith('patient-practnote-')) return 'progress-note';
    }

    if (!displayName) return 'document';
    const lower = displayName.toLowerCase();
    if (lower.includes('dc_summary') || lower.includes('discharge')) return 'progress-note';
    if (lower.includes('lab')) return 'lab-result';
    if (lower.includes('order')) return 'order';
    if (lower.includes('mar')) return 'mar';
    if (lower.includes('vital')) return 'vital-signs';
    if (lower.includes('nursing')) return 'nursing-note';
    if (lower.includes('history') || lower.includes('h&p') || lower.includes('physical')) return 'progress-note';
    if (lower.includes('eval') || lower.includes('st ') || lower.includes('slp')) return 'progress-note';
    return 'document';
  },

  /**
   * Build HIPPS impact details section
   * @param {Object} itemData
   * @returns {string}
   */
  _buildImpactSection(itemData) {
    const impact = itemData.impact || itemData.item?.impact || {};
    const parts = [];

    if (impact.nta?.wouldChangeLevel) {
      parts.push({
        label: 'NTA',
        from: impact.nta.currentLevel,
        to: impact.nta.newLevel
      });
    }
    if (impact.slp?.wouldChangeGroup) {
      parts.push({
        label: 'SLP',
        from: impact.slp.currentGroup,
        to: impact.slp.newGroup
      });
    }
    if (impact.nursing?.wouldChangeGroup) {
      parts.push({
        label: 'Nursing',
        from: impact.nursing.currentPaymentGroup,
        to: impact.nursing.newPaymentGroup
      });
    }
    if (impact.ptot?.wouldChangeGroup) {
      parts.push({
        label: 'PT/OT',
        from: impact.ptot.currentGroup,
        to: impact.ptot.newGroup
      });
    }

    if (parts.length === 0) {
      return '';
    }

    const badges = parts.map(p => `
      <div class="super-evidence__impact-badge">
        <span class="super-evidence__impact-label">${p.label}</span>
        <span class="super-evidence__impact-change">${p.from} → ${p.to}</span>
      </div>
    `).join('');

    return `
      <div class="super-evidence__impact-row">
        ${badges}
      </div>
    `;
  },

  /**
   * Build step summary section (Dx/Tx one-liners)
   * @param {Object} item
   * @returns {string}
   */
  _buildStepSummarySection(item) {
    if (!item) return '';
    const dxSummary = item.diagnosisSummary;
    const txSummary = item.treatmentSummary;

    // If we have Dx/Tx summaries, show step cards
    if (dxSummary || txSummary) {
      // diagnosisPassed / activeStatusPassed can be top-level or nested under validation
      const dxPassed = item.diagnosisPassed ?? item.validation?.diagnosisPassed ?? false;
      const txPassed = item.activeStatusPassed ?? item.validation?.activeStatusPassed ?? false;

      const dxCard = dxSummary ? `
        <div class="super-evidence__step-card super-evidence__step-card--${dxPassed ? 'pass' : 'fail'}">
          <span class="super-evidence__step-icon">${dxPassed ? '&#10003;' : '&#10007;'}</span>
          <div class="super-evidence__step-content">
            <div class="super-evidence__step-title">Step 1: Diagnosis</div>
            <div class="super-evidence__step-text">${this._escapeHTML(dxSummary)}</div>
          </div>
        </div>
      ` : '';

      const txCard = txSummary ? `
        <div class="super-evidence__step-card super-evidence__step-card--${txPassed ? 'pass' : 'fail'}">
          <span class="super-evidence__step-icon">${txPassed ? '&#10003;' : '&#10007;'}</span>
          <div class="super-evidence__step-content">
            <div class="super-evidence__step-title">Step 2: Active Treatment</div>
            <div class="super-evidence__step-text">${this._escapeHTML(txSummary)}</div>
          </div>
        </div>
      ` : '';

      return `
        <div class="super-evidence__step-section">
          ${dxCard}
          ${txCard}
        </div>
      `;
    }

    // Fallback: show keyFindings for query items
    if (item.keyFindings && item.keyFindings.length > 0) {
      const findings = item.keyFindings.map(f =>
        `<li>${this._escapeHTML(f)}</li>`
      ).join('');

      return `
        <div class="super-evidence__step-section">
          <div class="super-evidence__step-card">
            <div class="super-evidence__step-content">
              <div class="super-evidence__step-title">Key Findings</div>
              <ul class="super-evidence__findings-list">${findings}</ul>
            </div>
          </div>
        </div>
      `;
    }

    return '';
  },

  /**
   * Get the correct evidence array based on item status
   * @param {Object} item
   * @returns {Array}
   */
  _getEvidence(item) {
    if (!item) return [];
    const status = item.status || item.solverStatus || '';
    switch (status) {
      case 'needs_physician_query':
      case 'query_recommended':
        return item.queryEvidence || item.evidence || [];
      case 'needs_review':
        return item.treatmentEvidence || item.evidence || [];
      default:
        return item.evidence || [];
    }
  },

  /**
   * Build action buttons
   * @param {Object} itemData
   * @param {Object} assessmentContext
   * @returns {Array}
   */
  _buildActions(itemData, assessmentContext) {
    const { itemCode, section, item } = itemData;
    const actions = [];

    // Secondary: Go to Section
    actions.push({
      label: `Go to Section ${section || itemCode?.charAt(0) || '?'}`,
      variant: 'secondary',
      action: () => {
        SuperModal.close();
        if (typeof navigateToMDSItem === 'function') {
          navigateToMDSItem(itemCode);
        }
      }
    });

    // Primary: Send Query
    actions.push({
      label: 'Send Query',
      variant: 'primary',
      action: () => {
        // Build result object for QuerySendModal
        const diagnosisName = item?.kbCategory?.categoryName || item?.name || itemData.itemName || '';
        const result = {
          mdsItem: itemCode,
          description: diagnosisName,
          aiAnswer: {
            mdsItem: itemCode,
            mdsItemName: diagnosisName,
            answer: item?.answer,
            status: item?.status,
            confidence: item?.confidence,
            rationale: item?.rationale || '',
            evidence: item?.evidence || [],
            kbCategory: item?.kbCategory
          }
        };
        // Close without animation to avoid race condition, then open new modal
        SuperModal.close(false);
        if (window.QuerySendModal) {
          window.QuerySendModal.show(result);
        }
      }
    });

    return actions;
  },

  /**
   * Format source type for display
   * @param {string} type
   * @returns {string}
   */
  _formatSourceType(type) {
    const labels = {
      'order': 'Order',
      'mar': 'MAR',
      'lab-result': 'Lab',
      'progress-note': 'Progress Note',
      'clinical_note': 'Clinical Note',
      'clinical-note': 'Clinical Note',
      'nursing-note': 'Nursing Note',
      'vital-signs': 'Vital Signs',
      'therapy-doc': 'Therapy Doc',
      'therapy_document': 'Therapy Doc',
      'document': 'Document'
    };
    return labels[type] || 'Document';
  },

  /**
   * Format date for display
   * @param {string} dateStr
   * @returns {string}
   */
  _formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  },

  /**
   * Escape HTML
   * @param {string} str
   * @returns {string}
   */
  _escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Make available globally
window.EvidenceModal = EvidenceModal;
