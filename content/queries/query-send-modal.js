// Two-Step Query Send Modal for Super LTC Chrome Extension
// Step 1: Review query details, Step 2: Select practitioner and send

import { track, toErrorCode } from '../utils/analytics.js';
import { toRecommendedIcd10 } from './lib/icd10-picker-util.js';
import {
  formatArdBadge,
  resolveEffectiveDate,
  isDateInWindow,
  windowGuidanceText,
  outsideWindowWarning,
} from './lib/query-timing.js';

// Map a free-text practitioner title/specialty to a categorical role.
// Keep the bucket list small so PostHog values stay clean.
function deriveRecipientRole(practitioner) {
  if (!practitioner) return 'unknown';
  const raw = `${practitioner.title || ''} ${practitioner.specialty || ''}`.toLowerCase();
  if (!raw.trim()) return 'unknown';
  if (/\bnp\b|nurse practitioner/.test(raw)) return 'np';
  if (/\bpa\b|physician assistant/.test(raw)) return 'pa';
  if (/\brn\b|registered nurse/.test(raw)) return 'rn';
  if (/\blpn\b|licensed practical/.test(raw)) return 'lpn';
  if (/\bmd\b|\bdo\b|physician|doctor/.test(raw)) return 'physician';
  return 'other';
}

const QuerySendModal = {
  // Current state
  _state: {
    step: 1,
    result: null,
    existingQuery: null,
    context: null,
    noteData: null,
    practitioners: [],
    selectedPractitionerId: null,
    noteText: '',
    urgent: false,
    selectedIcd10: null,
    // Effective (onset) date the diagnosis is posted to PCC with. '' = leave the
    // backend default (createdAt). `_timing` is the backend preview used only to
    // nudge the nurse toward an in-window date; it never gates anything.
    effectiveDate: '',
    initialEffectiveDate: '',
    timing: null
  },

  /**
   * Show the send modal
   * @param {Object} result - MDS result object
   * @param {Object} existingQuery - Existing query to send (optional, for drafts)
   */
  async show(result, existingQuery = null) {
    // Normalize: if result is a flat API item (no aiAnswer), wrap it
    if (result && !result.aiAnswer && (result.keyFindings || result.evidence || result.rationale || result.status)) {
      result = {
        mdsItem: result.mdsItem,
        description: result.description,
        aiAnswer: result
      };
    }

    // Reset state
    this._state = {
      step: 1,
      result,
      existingQuery,
      context: null,
      noteData: null,
      practitioners: [],
      selectedPractitionerId: null,
      noteText: '',
      urgent: false,
      selectedIcd10: null,
      effectiveDate: '',
      initialEffectiveDate: '',
      timing: null
    };

    // Track open + track dismissed-via-X/ESC/backdrop close path. _suppressClose
    // flips to true when an explicit close path (Cancel / submit) already fired.
    track('query_modal_opened');
    this._closeFired = false;
    const fireDismiss = () => {
      if (!this._closeFired) {
        this._closeFired = true;
        track('query_modal_closed', { reason: 'dismiss' });
      }
    };

    // Show modal with loading state
    SuperModal.show({
      title: 'Send Diagnosis Query',
      icon: '?',
      badge: result?.mdsItem || existingQuery?.mdsItem,
      content: this._buildLoadingContent(),
      actions: [],
      size: 'large',
      className: 'super-query-send-modal',
      onClose: fireDismiss
    });

    // Load data
    await this._loadData();
  },

  /**
   * Load required data (context, practitioners, AI note)
   */
  async _loadData() {
    try {
      // Get context from page
      this._state.context = await this._getQueryContext();

      // Fetch practitioners
      this._state.practitioners = await QueryAPI.fetchPractitioners(
        this._state.context.facilityName,
        this._state.context.orgSlug
      );

      // If we have a result (not existing query), generate AI note
      if (this._state.result && !this._state.existingQuery) {
        try {
          // Safety net: if the caller passed a result whose aiAnswer has
          // evidenceCount > 0 but no evidence array (caller didn't lazy-load
          // before opening the modal), fetch and backfill before generate-note
          // — otherwise the AI has nothing to cite and picks codes blindly.
          await this._ensureEvidenceLoaded(this._state.result);
          this._state.noteData = await QueryAPI.generateNote(
            this._state.result.mdsItem,
            this._state.result.aiAnswer
          );
          this._state.noteText = this._state.noteData.note;
        } catch (error) {
          console.error('Super LTC: Failed to generate note', error);
          this._state.noteText = this._generateFallbackNote();
        }
      } else if (this._state.existingQuery) {
        // Use existing query's note
        this._state.noteText = this._state.existingQuery.nurseEditedNote ||
                               this._state.existingQuery.aiGeneratedNote || '';
      }

      // Seed selected ICD-10 from noteData (or existing query's recommended set)
      this._state.selectedIcd10 = this._resolveInitialIcd10();

      // Seed the effective-date picker + fetch the ARD/lookback window so we can
      // nudge the nurse toward an in-window onset date. Best-effort: if there's
      // no ARD (unlinked query) or preview fails, the field still works and we
      // just show no window guidance.
      await this._loadTiming();

      // Render step 1
      this._renderStep1();

    } catch (error) {
      console.error('Super LTC: Failed to load send modal data', error);
      track('error_shown', { surface: 'query_send_modal_load', error_code: toErrorCode(error), error_type: 'api_error' });
      SuperModal.showError(`Failed to load: ${error.message}`);
      SuperModal.updateActions([{
        label: 'Close',
        variant: 'secondary',
        action: () => {
          this._closeFired = true;
          track('query_modal_closed', { reason: 'dismiss' });
          SuperModal.close();
        }
      }]);
    }
  },

  /**
   * Render Step 1: Review query details
   */
  _renderStep1() {
    this._state.step = 1;
    const content = this._buildStep1Content();
    SuperModal.updateContent(content);
    SuperModal.updateActions([
      {
        label: 'Cancel',
        variant: 'secondary',
        action: () => {
          this._closeFired = true;
          track('query_modal_closed', { reason: 'cancel' });
          SuperModal.close();
        }
      },
      {
        label: 'Next',
        variant: 'primary',
        action: () => this._goToStep2()
      }
    ]);

    // Setup note textarea listener + mount the ICD-10 code picker
    setTimeout(() => {
      const textarea = document.querySelector('#super-query-note-input');
      if (textarea) {
        textarea.addEventListener('input', (e) => {
          this._state.noteText = e.target.value;
        });
      }

      // Effective-date input: track value + toggle the outside-window warning.
      const dateInput = document.querySelector('#super-query-effective-date');
      if (dateInput) {
        dateInput.addEventListener('change', (e) => {
          this._state.effectiveDate = e.target.value || '';
          this._updateDateWarning();
        });
        // Reflect any prefilled out-of-window date immediately.
        this._updateDateWarning();
      }

      // Mount the deliberate-attach code picker. Nothing is pre-selected; the
      // picker auto-searches the library seeded with the diagnosis name so the
      // top relevant codes are one click away, and "no code" stays the default.
      const pickerContainer = document.querySelector('#super-query-icd10-picker');
      if (pickerContainer && window.Icd10CodePicker) {
        this._picker?.destroy?.();
        const result = this._state.result;
        const ai = result?.aiAnswer || {};
        const seedQuery = this._state.existingQuery?.mdsItemName || ai.mdsItemName || result?.description || '';
        this._picker = window.Icd10CodePicker.create(pickerContainer, {
          seedQuery,
          preferred: this._state.noteData?.preferredIcd10 || null,
          options: this._state.noteData?.icd10Options || [],
          initialSelected: this._state.selectedIcd10,
          onChange: (selected) => { this._state.selectedIcd10 = selected; }
        });
      }
    }, 50);
  },

  /**
   * Go to Step 2: Select practitioner
   */
  _goToStep2() {
    this._state.step = 2;
    const content = this._buildStep2Content();
    SuperModal.updateContent(content);
    SuperModal.updateActions([
      {
        label: 'Back',
        variant: 'secondary',
        action: () => this._renderStep1()
      },
      {
        label: 'Print',
        variant: 'secondary',
        action: (btn) => this._handlePrint(btn)
      },
      {
        label: 'Send Query',
        variant: 'primary',
        disabled: true,
        action: (btn) => this._handleSend(btn)
      }
    ]);

    // Setup practitioner dropdown
    setTimeout(() => {
      const dropdownContainer = document.querySelector('#super-practitioner-dropdown');
      if (dropdownContainer) {
        const items = this._state.practitioners.map(p => ({
          id: p.id,
          label: this._formatPractitionerName(p),
          subtitle: p.title || p.specialty || ''
        }));

        SuperDropdown.create(dropdownContainer, {
          items,
          placeholder: 'Select a practitioner...',
          searchPlaceholder: 'Search practitioners...',
          onSelect: (item) => {
            this._state.selectedPractitionerId = item.id;
            // Enable send button (use current label since urgent toggle may have renamed it)
            const label = this._state.urgent ? 'Send Urgently' : 'Send Query';
            const sendBtn = SuperModal.getButton(label);
            if (sendBtn) sendBtn.disabled = false;
          }
        });
      }

      // Wire urgent toggle
      const urgentInput = document.querySelector('#super-query-urgent-toggle');
      const hintEl = document.querySelector('#super-query-send-hint');
      if (urgentInput) {
        urgentInput.addEventListener('change', (e) => {
          const on = !!e.target.checked;
          this._state.urgent = on;

          // Update hint copy
          if (hintEl) {
            hintEl.textContent = on
              ? 'Doctor will be texted right now'
              : 'Doctor will see this in their daily text';
          }

          // Find current send button (label may already have switched) and morph it
          const oldLabel = on ? 'Send Query' : 'Send Urgently';
          const newLabel = on ? 'Send Urgently' : 'Send Query';
          const btn = SuperModal.getButton(oldLabel) || SuperModal.getButton(newLabel);
          if (btn) {
            btn.textContent = newLabel;
            btn.classList.toggle('super-modal__btn--danger', on);
            btn.classList.toggle('super-modal__btn--primary', !on);
          }
        });
      }
    }, 50);
  },

  /**
   * Handle send button click
   * @param {HTMLElement} btn - Button element
   */
  async _handleSend(btn) {
    if (!this._state.selectedPractitionerId) {
      track('error_shown', { surface: 'query_send', error_code: 'no_practitioner', error_type: 'validation' });
      SuperToast.warning('Please select a practitioner');
      return;
    }

    const originalText = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const sendStart = Date.now();
    const selectedPractitioner = this._state.practitioners.find(
      p => p.id === this._state.selectedPractitionerId
    );
    const urgent = !!this._state.urgent;
    track('query_send_started', {
      item_code: this._state.result?.mdsItem || this._state.existingQuery?.mdsItem || '',
      recipient_role: deriveRecipientRole(selectedPractitioner),
      urgent,
    });

    try {
      let queryId = this._state.existingQuery?.id;

      // If no existing query, create one first
      if (!queryId) {
        const ai = this._state.result.aiAnswer;

        const createData = {
          patientId: this._state.context.patientId,
          facilityName: this._state.context.facilityName,
          orgSlug: this._state.context.orgSlug,
          mdsAssessmentId: this._state.context.assessmentId,
          mdsItem: this._state.result.mdsItem,
          mdsItemName: ai.mdsItemName || this._state.result.description,
          queryReason: ai.rationale || ai.queryReason || '',
          keyFindings: ai.keyFindings || [],
          queryEvidence: ai.evidence || ai.queryEvidence || [],
          // Only the code the nurse deliberately attached (empty = doctor picks).
          recommendedIcd10: toRecommendedIcd10(this._state.selectedIcd10),
          aiGeneratedNote: this._state.noteText,
          // Onset date the diagnosis posts to PCC with. Only send when the nurse
          // moved it off the default — omitted keeps the backend createdAt
          // default (byte-identical behavior for every existing caller).
          ...this._effectiveDateCreatePayload()
        };

        const { query } = await QueryAPI.createQuery(createData);
        queryId = query.id;

        // Add to local state
        QueryState.addQuery(query);
      } else {
        // Sending an existing draft: if the nurse changed the effective date in
        // this modal, persist it before send (the send endpoint doesn't carry
        // it). Non-fatal — the query is still sendable if this fails.
        await this._patchEffectiveDateIfChanged(queryId);
      }

      // Send the query (queues into physician's normal digest)
      await QueryAPI.sendQuery(
        queryId,
        [this._state.selectedPractitionerId],
        this._state.noteText
      );

      // If urgent, immediately fire resend so the physician is texted now
      // rather than waiting for their scheduled digest. We treat resend
      // failure as non-fatal for the create+send — the query exists and is
      // queued; we just couldn't trigger the immediate notification.
      let urgentNotifyFailed = false;
      if (urgent) {
        try {
          await QueryAPI.resendQuery(queryId, [this._state.selectedPractitionerId]);
        } catch (resendErr) {
          urgentNotifyFailed = true;
          track('query_urgent_notify_failed', { error_code: toErrorCode(resendErr) });
          console.error('Super LTC: Urgent resend failed', resendErr);
        }
      }

      track('query_send_succeeded', { duration_ms: Date.now() - sendStart, urgent });

      // Close modal and show success
      this._closeFired = true;
      track('query_modal_closed', { reason: 'submit' });
      SuperModal.close();
      this._showSuccessAnimation();

      if (urgentNotifyFailed) {
        SuperToast.warning('Query sent, but the urgent text could not be delivered. Try resending from the query list.');
      } else if (urgent) {
        SuperToast.success('Query sent — doctor texted now');
      }

      // Re-fetch queries from API to get full data (patientName, locationName, etc.)
      const ctx = this._state.context;
      await QueryState.loadQueries(ctx.assessmentId, ctx.facilityName, ctx.orgSlug);

      // Refresh badges and panel with fresh data
      QueryBadges.updateAllBadges();
      QueryPanel.updatePanel();

      // Notify listeners (e.g., ARD Estimator) that a query was sent
      window.dispatchEvent(new CustomEvent('super:query-sent', {
        detail: { mdsItem: this._state.result?.mdsItem }
      }));

    } catch (error) {
      track('query_send_failed', { error_code: toErrorCode(error) });
      track('error_shown', { surface: 'query_send', error_code: toErrorCode(error), error_type: 'api_error' });
      console.error('Super LTC: Failed to send query', error);
      SuperToast.error(`Failed to send: ${error.message}`);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  /**
   * Resolve the initial ICD-10 selection. We NEVER pre-select an AI-guessed
   * code (product decision): the only pre-fill is a code a human already
   * attached to an existing draft query. Fresh queries start with no code and
   * the nurse deliberately attaches one via the picker (or sends without).
   */
  _resolveInitialIcd10() {
    const existing = this._state.existingQuery?.recommendedIcd10?.[0];
    if (existing?.code) {
      return { code: existing.code, description: existing.description || '' };
    }
    return null;
  },

  /**
   * Resolve the ARD date for this query's assessment from the richest source
   * available. Returns null when there's no linked assessment (unlinked query),
   * in which case the picker still works with no window guidance.
   */
  _resolveArdDate() {
    const eq = this._state.existingQuery;
    // A draft/sent query carries its own ARD in `timing`; a fresh query gets it
    // from the assessment loaded into QueryState (by-assessment response). No
    // ARD → previewTiming returns `no_ard` and the picker shows no window nudge.
    return eq?.timing?.ardDate ||
           eq?.ardDate ||
           window.QueryState?.mdsAssessment?.ardDate ||
           null;
  },

  /**
   * Prefill the effective-date field and fetch the backend lookback window.
   * For an existing query we already have `timing`; for a fresh one we call
   * preview-timing with the assessment ARD. Never throws — the send flow must
   * not depend on timing.
   */
  async _loadTiming() {
    const mdsItem = this._state.result?.mdsItem || this._state.existingQuery?.mdsItem || '';
    const ardDate = this._resolveArdDate();

    // Resolve timing: prefer an existing query's own timing, else preview a
    // hypothetical pending query so we have a window + a default onset date.
    if (this._state.existingQuery?.timing) {
      this._state.timing = this._state.existingQuery.timing;
    } else if (mdsItem) {
      this._state.timing = await QueryAPI.previewTiming({ mdsItem, ardDate });
    }

    // Prefill from the resolved effective date (handoff: prefill from
    // timing.effectiveDate). Falls back to an existing query's stored date, then
    // blank. `initial` records the default so create/edit only sends the date
    // when the nurse actually changes it — keeping old behavior byte-identical.
    const prefill = this._state.timing?.effectiveDate ||
                    resolveEffectiveDate(this._state.existingQuery) ||
                    '';
    this._state.effectiveDate = prefill;
    this._state.initialEffectiveDate = prefill;
  },

  /**
   * Build the effective-date field HTML (label, native date input, window
   * guidance, and a hidden soft-warning slot filled in by _updateDateWarning).
   */
  _buildEffectiveDateHTML() {
    const guidance = windowGuidanceText(this._state.timing?.lookbackWindow);
    const badge = formatArdBadge(this._state.timing);
    const badgeHTML = badge
      ? `<span class="super-ard-badge super-ard-badge--${badge.tone}">${this._escapeHTML(badge.text)}</span>`
      : '';
    return `
      <div class="super-query-send__field">
        <div class="super-query-send__label-row">
          <label class="super-query-send__label" for="super-query-effective-date">Diagnosis effective date</label>
          ${badgeHTML}
        </div>
        <input
          type="date"
          class="super-query-send__date-input"
          id="super-query-effective-date"
          value="${this._escapeHTML(this._state.effectiveDate)}"
        />
        ${guidance ? `<div class="super-query-send__hint" id="super-query-date-guidance">${this._escapeHTML(guidance)}</div>` : ''}
        <div class="super-query-send__date-warning" id="super-query-date-warning" hidden></div>
      </div>
    `;
  },

  /**
   * Recompute + toggle the outside-window soft warning from the current date
   * value against the backend window. Advisory only — never disables anything.
   */
  _updateDateWarning() {
    const warnEl = document.querySelector('#super-query-date-warning');
    if (!warnEl) return;
    const lookbackWindow = this._state.timing?.lookbackWindow;
    const inWindow = isDateInWindow(this._state.effectiveDate, lookbackWindow);
    if (inWindow === false) {
      warnEl.textContent = outsideWindowWarning(this._state.timing?.lookbackDays, lookbackWindow);
      warnEl.hidden = false;
    } else {
      warnEl.hidden = true;
    }
  },

  /**
   * Ensure a persisted query exists so we have an ID to print against.
   * Mirrors the create branch of _handleSend, but never sends to a practitioner.
   * Returns the query ID.
   */
  async _ensureQueryCreated() {
    if (this._state.existingQuery?.id) return this._state.existingQuery.id;
    if (!this._state.result) throw new Error('Nothing to print');

    const ai = this._state.result.aiAnswer || {};
    const selected = this._state.selectedIcd10;

    const createData = {
      patientId: this._state.context.patientId,
      facilityName: this._state.context.facilityName,
      orgSlug: this._state.context.orgSlug,
      mdsAssessmentId: this._state.context.assessmentId,
      mdsItem: this._state.result.mdsItem,
      mdsItemName: ai.mdsItemName || this._state.result.description,
      queryReason: ai.rationale || ai.queryReason || '',
      keyFindings: ai.keyFindings || [],
      queryEvidence: ai.evidence || ai.queryEvidence || [],
      recommendedIcd10: toRecommendedIcd10(selected),
      aiGeneratedNote: this._state.noteText,
      ...this._effectiveDateCreatePayload()
    };

    const { query } = await QueryAPI.createQuery(createData);
    QueryState.addQuery(query);
    // Cache so a subsequent Send/Print in this same modal session reuses it.
    this._state.existingQuery = query;
    return query.id;
  },

  /**
   * The `{ effectiveDate }` slice for a create payload — present only when the
   * nurse moved the date off the resolved default. Omitting it means the backend
   * keeps its createdAt default, exactly as before this feature existed.
   */
  _effectiveDateCreatePayload() {
    const { effectiveDate, initialEffectiveDate } = this._state;
    if (effectiveDate && effectiveDate !== initialEffectiveDate) {
      return { effectiveDate };
    }
    return {};
  },

  /**
   * PATCH the effective date onto an existing (draft/sent) query when the nurse
   * changed it in this modal. Best-effort: a failure is surfaced as a warning
   * toast but does not abort the send — the query itself is unaffected.
   */
  async _patchEffectiveDateIfChanged(queryId) {
    if (!queryId) return;
    if (this._state.effectiveDate === this._state.initialEffectiveDate) return;
    try {
      // '' back to the default posts null (clear); a set date posts YYYY-MM-DD.
      const effectiveDate = this._state.effectiveDate || null;
      const updated = await QueryAPI.patchQuery(queryId, { effectiveDate });
      QueryState.updateQuery(queryId, updated);
      this._state.initialEffectiveDate = this._state.effectiveDate;
    } catch (err) {
      console.error('Super LTC: Failed to update effective date', err);
      SuperToast.warning("Couldn't update the effective date — sending with the existing onset date.");
    }
  },

  /**
   * Handle Print button click. Persists the query if not yet created, then
   * triggers a download of the unsigned print-preview PDF via the background
   * service worker.
   */
  async _handlePrint(btn) {
    // No code required — a codeless print leaves the ICD-10 line blank for the
    // physician to fill in on paper (matches the codeless-send path).
    const selected = this._state.selectedIcd10;

    const originalText = btn.textContent;
    btn.textContent = 'Preparing...';
    btn.disabled = true;

    const printStart = Date.now();
    track('query_print_started', {
      item_code: this._state.result?.mdsItem || this._state.existingQuery?.mdsItem || ''
    });

    try {
      const queryId = await this._ensureQueryCreated();

      // Build a stable filename: topic-id8.pdf
      const topic = (this._state.result?.mdsItem || this._state.existingQuery?.mdsItem || 'query')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const filename = `query-${topic}-${queryId.slice(0, 8)}.pdf`;

      await QueryAPI.printQueryPdf(queryId, {
        code: selected?.code || '',
        description: selected?.description || '',
        filename
      });

      track('query_print_succeeded', { duration_ms: Date.now() - printStart });
      SuperToast.success('Print preview downloaded');
    } catch (error) {
      track('query_print_failed', { error_code: toErrorCode(error) });
      console.error('Super LTC: Failed to print query', error);
      SuperToast.error(`Failed to print: ${error.message}`);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  },

  /**
   * Build loading content HTML
   * @returns {string}
   */
  _buildLoadingContent() {
    return `
      <div class="super-query-send__loading">
        <div class="super-modal__spinner"></div>
        <span>Loading query details...</span>
      </div>
    `;
  },

  /**
   * Build Step 1 content HTML
   * @returns {string}
   */
  _buildStep1Content() {
    const result = this._state.result;
    const existingQuery = this._state.existingQuery;
    const context = this._state.context;
    const ai = result?.aiAnswer || {};

    const diagnosisName = existingQuery?.mdsItemName || ai.mdsItemName || result?.description || 'Unknown';
    const mdsItem = existingQuery?.mdsItem || result?.mdsItem || '';

    // ICD-10 code picker — always shown, nothing pre-selected. The nurse
    // optionally attaches a code (mounted in _renderStep1 after render).
    const icd10HTML = `
      <div class="super-query-send__field">
        <div id="super-query-icd10-picker"></div>
      </div>
    `;

    return `
      <div class="super-query-send super-query-send--step1">
        <!-- Progress indicator -->
        <div class="super-query-send__progress">
          <div class="super-query-send__step super-query-send__step--active">
            <span class="super-query-send__step-num">1</span>
            <span class="super-query-send__step-label">Review</span>
          </div>
          <div class="super-query-send__step-line"></div>
          <div class="super-query-send__step">
            <span class="super-query-send__step-num">2</span>
            <span class="super-query-send__step-label">Send</span>
          </div>
        </div>

        <!-- Patient & Diagnosis combined -->
        <div class="super-query-send__header-card">
          <div class="super-query-send__patient-row">
            <span class="super-query-send__patient-name">${this._escapeHTML(context?.patientName || 'Patient')}</span>
            <span class="super-query-send__patient-facility">${this._escapeHTML(context?.facilityName || '')}</span>
          </div>
          <div class="super-query-send__diagnosis-row">
            <span class="super-query-send__diagnosis-code">${mdsItem}</span>
            <span class="super-query-send__diagnosis-name">${this._escapeHTML(diagnosisName)}</span>
          </div>
        </div>

        <!-- Note — the physician-facing deliverable, so it leads -->
        <div class="super-query-send__field">
          <label class="super-query-send__label">Note for Physician</label>
          <textarea
            class="super-query-send__textarea"
            id="super-query-note-input"
            rows="4"
            placeholder="Enter note for physician..."
          >${this._escapeHTML(this._state.noteText)}</textarea>
        </div>

        <!-- ICD-10 -->
        ${icd10HTML}

        <!-- Effective (onset) date + ARD lookback guidance -->
        ${this._buildEffectiveDateHTML()}
      </div>
    `;
  },

  /**
   * Build Step 2 content HTML
   * @returns {string}
   */
  _buildStep2Content() {
    const context = this._state.context;
    const diagnosisName = this._state.result?.aiAnswer?.mdsItemName || this._state.result?.description || '';
    const mdsItem = this._state.result?.mdsItem || '';

    return `
      <div class="super-query-send super-query-send--step2">
        <!-- Progress indicator -->
        <div class="super-query-send__progress">
          <div class="super-query-send__step super-query-send__step--completed">
            <span class="super-query-send__step-num">&#10003;</span>
            <span class="super-query-send__step-label">Review</span>
          </div>
          <div class="super-query-send__step-line super-query-send__step-line--active"></div>
          <div class="super-query-send__step super-query-send__step--active">
            <span class="super-query-send__step-num">2</span>
            <span class="super-query-send__step-label">Send</span>
          </div>
        </div>

        <!-- Header card showing what we're sending -->
        <div class="super-query-send__header-card">
          <div class="super-query-send__patient-row">
            <span class="super-query-send__patient-name">${this._escapeHTML(context?.patientName || 'Patient')}</span>
            <span class="super-query-send__patient-facility">${this._escapeHTML(context?.facilityName || '')}</span>
          </div>
          <div class="super-query-send__diagnosis-row">
            <span class="super-query-send__diagnosis-code">${mdsItem}</span>
            <span class="super-query-send__diagnosis-name">${this._escapeHTML(diagnosisName)}</span>
          </div>
        </div>

        <!-- Practitioner selection -->
        <div class="super-query-send__field">
          <label class="super-query-send__label">Send to Physician</label>
          <div id="super-practitioner-dropdown" class="super-query-send__dropdown-container"></div>
          <div class="super-query-send__hint" id="super-query-send-hint">Doctor will see this in their daily text</div>
        </div>

        <!-- Urgent toggle -->
        <label class="super-query-send__urgent" for="super-query-urgent-toggle">
          <input type="checkbox" id="super-query-urgent-toggle" class="super-query-send__urgent-input" />
          <span class="super-query-send__urgent-track"><span class="super-query-send__urgent-thumb"></span></span>
          <span class="super-query-send__urgent-text">
            <span class="super-query-send__urgent-title">Send urgently</span>
            <span class="super-query-send__urgent-sub">Don't wait for their daily text</span>
          </span>
        </label>
      </div>
    `;
  },

  /**
   * Show success animation after sending
   */
  _showSuccessAnimation() {
    const successEl = document.createElement('div');
    successEl.className = 'super-query-success';
    successEl.innerHTML = `
      <div class="super-query-success__content">
        <div class="super-query-success__icon">&#10003;</div>
        <div class="super-query-success__text">Query Sent!</div>
      </div>
    `;
    document.body.appendChild(successEl);

    requestAnimationFrame(() => {
      successEl.classList.add('super-query-success--visible');
    });

    setTimeout(() => {
      successEl.classList.remove('super-query-success--visible');
      setTimeout(() => successEl.remove(), 300);
    }, 1500);
  },

  /**
   * Backfill evidence onto result.aiAnswer if the caller didn't lazy-load it
   * before opening the modal. Common case: Section I popover renders with
   * only evidenceCount, then user clicks Query before the auto-load resolved.
   * Without this, generate-note runs with zero citations and the AI picks
   * codes blindly.
   */
  async _ensureEvidenceLoaded(result) {
    if (!result?.aiAnswer || !result.mdsItem) return;
    const ai = result.aiAnswer;
    const haveArr = (a) => Array.isArray(a) && a.length > 0;
    if (haveArr(ai.evidence) || haveArr(ai.queryEvidence)) return;
    const totalCount = (ai.evidenceCount || 0) + (ai.queryEvidenceCount || 0);
    if (totalCount === 0) return;

    const ctx = this._state.context || {};
    const section = (result.section || result.mdsItem?.charAt(0) || '').toUpperCase();
    if (!section || !ctx.facilityName || !ctx.orgSlug) {
      console.warn('[QuerySendModal] cannot fetch evidence — missing section/facility/org', { section, ctx });
      return;
    }

    const params = new URLSearchParams({
      facilityName: ctx.facilityName,
      orgSlug: ctx.orgSlug,
    });
    if (ctx.assessmentId) params.set('externalAssessmentId', ctx.assessmentId);
    window.appendMDSContextParams?.(params);
    const endpoint = `/api/extension/mds/sections/${section}/items/${encodeURIComponent(result.mdsItem)}/evidence?${params}`;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint,
      });
      if (!response?.success || !response.data) {
        console.warn('[QuerySendModal] evidence backfill failed', response?.error);
        return;
      }
      // Response shape: { success, itemCode, section, item: { evidence, queryEvidence, ... } }
      // Fall back to top-level for older shapes / different sections.
      const item = response.data.item || response.data;
      const columnEvidence = (result.column && item.evidenceByColumn?.[result.column]) || null;
      ai.evidence = columnEvidence || item.evidence || [];
      ai.queryEvidence = item.queryEvidence || [];
      if (item.validation) ai.validation = item.validation;
    } catch (err) {
      console.error('[QuerySendModal] evidence backfill threw:', err);
    }
  },

  /**
   * Get query context from page
   * @returns {Promise<Object>}
   */
  async _getQueryContext() {
    // Use the same approach as content.js getQueryContext() for consistency
    const url = new URL(window.location.href);
    const mdsState = window.MDSViewState || {};
    const assessmentId = url.searchParams.get('ESOLassessid') ||
                         mdsState.manualContext?.assessmentId || mdsState.context?.assessmentId ||
                         window.SuperOverlay?.assessmentId || '';

    // Use stored patientId from API response (preferred), fallback to the stable
    // numeric id from the page (handles EID_ tokens in the URL).
    const patientId = window.SuperOverlay?.patientId ||
                      mdsState.context?.patientId ||
                      window.resolveStableClientId?.() || '';

    // Get org from cookie via background script
    const orgResponse = getOrg();
    const orgSlug = orgResponse?.org || '';

    // Get facility from DOM — try multiple sources
    const facilityInfo = typeof getFacilityInfo === 'function' ? getFacilityInfo() : null;
    const chatFacility = typeof getChatFacilityInfo === 'function' ? getChatFacilityInfo() : null;
    const facilityName = facilityInfo?.facility || chatFacility || window.SuperOverlay?.facilityName || '';

    // Get patient name from DOM or MDS data
    const patientNameEl = document.querySelector('.patient-name, #patientName, .patientName, [class*="patient-name"]');
    const patientName = patientNameEl?.textContent?.trim() || mdsState.data?.patientName || 'Patient';

    const dobEl = document.querySelector('.patient-dob, #patientDOB, [class*="patient-dob"]');
    const patientDOB = dobEl?.textContent?.trim() || '';

    return {
      patientId,
      patientName,
      patientDOB,
      facilityName,
      orgSlug,
      assessmentId
    };
  },

  /**
   * Generate fallback note text
   * @returns {string}
   */
  _generateFallbackNote() {
    const ai = this._state.result?.aiAnswer;
    const diagnosisName = ai?.mdsItemName || this._state.result?.description || 'this diagnosis';
    return `Please review the clinical evidence for potential ${diagnosisName}. See supporting documentation below.`;
  },

  /**
   * Format practitioner name for display
   * @param {Object} p - Practitioner object
   * @returns {string}
   */
  _formatPractitionerName(p) {
    if (p.firstName && p.lastName) {
      return `${p.firstName} ${p.lastName}${p.title ? `, ${p.title}` : ''}`;
    }
    return p.name || 'Unknown';
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
window.QuerySendModal = QuerySendModal;
