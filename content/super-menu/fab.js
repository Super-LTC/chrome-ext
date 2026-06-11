// Super Menu Speed Dial FAB

function createBubbles() {
  if (document.getElementById('super-bubbles-container')) return;

  const container = document.createElement('div');
  container.id = 'super-bubbles-container';
  container.innerHTML = `
    <button id="super-feedback-action" class="super-dial__action super-dial__action--feedback" aria-label="Send Feedback" data-track="fab_clicked" data-track-prop-fab="feedback">?</button>
    <button id="super-chat-action" class="super-dial__action super-dial__action--chat" aria-label="Open Chat" data-track="fab_clicked" data-track-prop-fab="chat">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    <!-- F-Tag Prevention (Survey Readiness) — facility-scoped. Hidden until
         module-status reports the module is enabled for the current facility. -->
    <button id="super-ftag-action" class="super-dial__action super-dial__action--ftag" aria-label="F-Tag Prevention" style="display:none;" data-track="fab_clicked" data-track-prop-fab="ftag_prevention">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    </button>
    <!-- Managed Care (recert generation + run tracking) — facility-scoped.
         Hidden until module-status reports the module is enabled. -->
    <button id="super-mc-action" class="super-dial__action super-dial__action--mc" aria-label="Managed Care" style="display:none;" data-track="fab_clicked" data-track-prop-fab="managed_care">
      MC
      <span class="super-dial__action-badge" id="super-mc-badge" style="display:none;"></span>
    </button>
    <button id="super-qm-action" class="super-dial__action super-dial__action--qm" aria-label="QM Board" data-track="fab_clicked" data-track-prop-fab="qm_board">QM</button>
    <button id="super-24hr-action" class="super-dial__action super-dial__action--24hr" aria-label="24-Hour Report" data-track="fab_clicked" data-track-prop-fab="24hr">24H<span class="super-dial__action-dot" id="super-24hr-dot" style="display:none;"></span></button>
    <!-- Care Plan Coverage FAB (patient shield) — temporarily hidden (kept for easy re-enable).
    <button id="super-coverage-action" class="super-dial__action super-dial__action--coverage" aria-label="Care Plan Coverage" style="display:none;" data-track="fab_clicked" data-track-prop-fab="coverage">CP</button>
    -->
    <button id="super-mds-action" class="super-dial__action super-dial__action--mds" aria-label="MDS" data-track="fab_clicked" data-track-prop-fab="mds">
      MDS
      <span class="super-dial__action-badge" id="super-mds-badge" style="display:none;"></span>
    </button>
    <button id="super-bubble-main" class="super-bubble__main" aria-label="Super" data-track="fab_clicked" data-track-prop-fab="main">S<span class="super-bubble__badge" id="super-bubble-badge" style="display:none;"></span></button>
  `;

  document.body.appendChild(container);

  // Load saved position
  loadBubblesPosition(container);

  // Setup draggable on the container
  setupBubblesDraggable(container);

  // Wire up click handlers
  const mainBtn = document.getElementById('super-bubble-main');
  const mdsAction = document.getElementById('super-mds-action');
  const chatAction = document.getElementById('super-chat-action');
  const ftagAction = document.getElementById('super-ftag-action');
  const qmAction = document.getElementById('super-qm-action');

  mainBtn.addEventListener('click', () => {
    if (hasDragged) {
      hasDragged = false;
      return;
    }
    const isOpen = container.classList.toggle('super-dial--open');
    if (isOpen) {
      // Close on outside click (one-time)
      const onOutside = (e) => {
        if (!container.contains(e.target)) {
          container.classList.remove('super-dial--open');
          document.removeEventListener('click', onOutside, true);
        }
      };
      document.addEventListener('click', onOutside, true);
    }
  });

  // F-Tag Prevention button → toggles the Survey Readiness overlay
  ftagAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    if (FTagPreventionLauncher.isOpen()) {
      FTagPreventionLauncher.close();
    } else {
      FTagPreventionLauncher.open();
    }
  });

  // Coverage button → toggles Care Plan Coverage panel
  // TEMPORARILY DISABLED — care plan FAB hidden (see commented button above).
  // const coverageAction = document.getElementById('super-coverage-action');
  // coverageAction.addEventListener('click', (e) => {
  //   e.stopPropagation();
  //   container.classList.remove('super-dial--open');
  //   if (CoveragePanelLauncher.isOpen()) {
  //     CoveragePanelLauncher.close();
  //   } else {
  //     CoveragePanelLauncher.open();
  //   }
  // });

  // Managed Care button → toggles the Managed Care panel (unscoped)
  const mcAction = document.getElementById('super-mc-action');
  mcAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    if (ManagedCareLauncher.isOpen()) {
      ManagedCareLauncher.close();
    } else {
      ManagedCareLauncher.open({ source: 'fab' });
    }
  });

  // QM Board button → toggles QM Board modal
  qmAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    if (QMBoardLauncher.isOpen()) {
      QMBoardLauncher.close();
    } else {
      QMBoardLauncher.open();
    }
  });

  // 24-Hour Report button → toggles report panel
  const twentyFourHrAction = document.getElementById('super-24hr-action');
  twentyFourHrAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    if (TwentyFourHourReportLauncher.isOpen()) {
      TwentyFourHourReportLauncher.close();
    } else {
      TwentyFourHourReportLauncher.open();
    }
  });

  // Feedback button → opens feedback modal
  const feedbackAction = document.getElementById('super-feedback-action');
  feedbackAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    if (FeedbackLauncher.isOpen()) {
      FeedbackLauncher.close();
    } else {
      FeedbackLauncher.open();
    }
  });

  // Dashboard button → always opens MDS Command Center
  mdsAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    MDSCommandCenterLauncher.open();
  });

  chatAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    openChatOverlay();
  });

  // Show/hide patient button based on context
  updateBubblesContext();

  // PCC chrome (#pccFacLink) may not be present the instant the FAB mounts on a
  // fresh page load, so the F-Tag module-status check can't resolve a facility
  // yet. Retry a few times until facility context appears (then the cache keeps
  // it to one request per facility).
  retryFtagModuleStatus();
  retryMcModuleStatus();

  // Managed Care run tracker → MC action badge + completion toasts.
  // Badge counts across ALL the user's locations regardless of any panel
  // toggle — a run finishing at her other building still ticks the badge.
  initMcRunTracking();

  // Load badge count
  updateMDSBadge();

  // If we just came back from a "open in PCC" click inside the 24-hour panel,
  // re-open the panel at the same date scrolled to the same finding.
  hydrateTwentyFourHourRestore();
}

async function hydrateTwentyFourHourRestore() {
  try {
    const raw = sessionStorage.getItem('super:24hr:restore');
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (!payload || payload.version !== 1) {
      sessionStorage.removeItem('super:24hr:restore');
      return;
    }
    if (!Number.isFinite(payload.expiresAt) || Date.now() > payload.expiresAt) {
      sessionStorage.removeItem('super:24hr:restore');
      return;
    }
    // Verify facility match — if the user landed on a different org / facility
    // than where the handoff happened, silently drop the payload.
    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (_) {
      /* fall through */
    }
    if (!facilityName || !orgSlug ||
        facilityName !== payload.facilityName ||
        orgSlug !== payload.orgSlug) {
      sessionStorage.removeItem('super:24hr:restore');
      return;
    }
    // Clear before opening so a failure in open() can't retry-loop.
    sessionStorage.removeItem('super:24hr:restore');
    TwentyFourHourReportLauncher.open({ restore: payload });
  } catch (err) {
    console.warn('[24HR] hydrate failed', err);
    try { sessionStorage.removeItem('super:24hr:restore'); } catch (_) {}
  }
}

// Show or hide patient-scoped action buttons based on whether we're on a patient page
function updateBubblesContext() {
  const context = getMDSContext();
  const isPatientPage = context.scope === 'patient' || context.scope === 'mds';

  const coverageAction = document.getElementById('super-coverage-action');
  if (coverageAction) coverageAction.style.display = isPatientPage ? '' : 'none';

  // F-Tag Prevention FAB is gated per-facility by the module-status endpoint.
  updateFtagModuleStatus();

  // Managed Care FAB has the same per-facility gate.
  updateMcModuleStatus();
}

// Per-facility cache of the F-Tag module flag so navigation within the same
// facility doesn't re-hit the endpoint. Key = `${orgSlug}::${facilityName}`.
const _ftagModuleStatusCache = new Map();

// Resolve facility/org, ask the backend whether F-Tag Prevention is enabled for
// this facility, and show/hide the FAB accordingly. The button stays hidden
// unless the endpoint explicitly reports `enabled: true`.
async function updateFtagModuleStatus() {
  const btn = document.getElementById('super-ftag-action');
  if (!btn) return;

  let facilityName, orgSlug;
  try {
    facilityName = getChatFacilityInfo();
    orgSlug = getOrg()?.org;
  } catch (_) { /* fall through */ }

  // No facility context yet (org-level page, or PCC chrome not loaded) → keep hidden.
  if (!facilityName || !orgSlug) {
    btn.style.display = 'none';
    return;
  }

  const key = `${orgSlug}::${facilityName}`;
  if (_ftagModuleStatusCache.has(key)) {
    btn.style.display = _ftagModuleStatusCache.get(key) ? '' : 'none';
    return;
  }

  try {
    const params = new URLSearchParams({ facilityName, orgSlug });
    const res = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/ftag-prevention/module-status?${params}`,
      options: { method: 'GET' },
    });
    // Background wraps as { success, data: <server envelope> }.
    const enabled = res?.success === true && res?.data?.enabled === true;
    _ftagModuleStatusCache.set(key, enabled);
    btn.style.display = enabled ? '' : 'none';
  } catch (err) {
    console.warn('[FTagPrevention] module-status check failed:', err);
    btn.style.display = 'none';
  }
}

// Poll for facility context a few times after mount, then run the status check
// once it's available. Stops as soon as a facility resolves (or after ~5s).
function retryFtagModuleStatus(attempt = 0) {
  let hasFacility = false;
  try { hasFacility = !!(getChatFacilityInfo() && getOrg()?.org); } catch (_) {}
  if (hasFacility) {
    updateFtagModuleStatus();
    return;
  }
  if (attempt >= 10) return; // ~5s of retries at 500ms
  setTimeout(() => retryFtagModuleStatus(attempt + 1), 500);
}

// ---- Managed Care FAB gating (same model as F-Tag above) ----
const _mcModuleStatusCache = new Map();

async function updateMcModuleStatus() {
  const btn = document.getElementById('super-mc-action');
  if (!btn) return;

  let facilityName, orgSlug;
  try {
    facilityName = getChatFacilityInfo();
    orgSlug = getOrg()?.org;
  } catch (_) { /* fall through */ }

  if (!facilityName || !orgSlug) {
    btn.style.display = 'none';
    return;
  }

  const key = `${orgSlug}::${facilityName}`;
  if (_mcModuleStatusCache.has(key)) {
    btn.style.display = _mcModuleStatusCache.get(key) ? '' : 'none';
    return;
  }

  try {
    const enabled = await window.RecertAPI.moduleStatus({ facilityName, orgSlug });
    _mcModuleStatusCache.set(key, enabled);
    btn.style.display = enabled ? '' : 'none';
  } catch (err) {
    console.warn('[ManagedCare] module-status check failed:', err);
    btn.style.display = 'none';
  }
}

function retryMcModuleStatus(attempt = 0) {
  let hasFacility = false;
  try { hasFacility = !!(getChatFacilityInfo() && getOrg()?.org); } catch (_) {}
  if (hasFacility) {
    updateMcModuleStatus();
    return;
  }
  if (attempt >= 10) return; // ~5s of retries at 500ms
  setTimeout(() => retryMcModuleStatus(attempt + 1), 500);
}

// ---- Managed Care run tracking → badge + toasts ----
let _mcTrackingInitialized = false;

function initMcRunTracking(attempt = 0) {
  if (_mcTrackingInitialized) return;
  let orgSlug = null;
  try { orgSlug = getOrg()?.org; } catch (_) {}
  if (!orgSlug) {
    if (attempt < 10) setTimeout(() => initMcRunTracking(attempt + 1), 500);
    return;
  }
  if (!window.McRunTracker) return;
  _mcTrackingInitialized = true;

  window.McRunTracker.init(orgSlug);
  window.McRunTracker.subscribe(({ inFlight, unseenDone, transitions }) => {
    const badge = document.getElementById('super-mc-badge');
    if (badge) {
      const n = inFlight + unseenDone;
      badge.style.display = n ? '' : 'none';
      badge.textContent = String(n);
      badge.classList.toggle('super-dial__action-badge--running', inFlight > 0);
    }
    for (const t of transitions) {
      // Tray is the durable answer; the toast is a bonus. No patient name in
      // the toast — the list row carries it; keeping it PHI-free by design.
      if (t.status === 'completed') {
        window.SuperToast?.success('A clinical update is ready — open Managed Care to view it');
      } else {
        window.SuperToast?.error('A clinical update failed — open Managed Care to retry');
      }
      window.SuperAnalytics?.track('mc_run_completed_toast', { status: t.status });
    }
  });
}

// Module-level hasDragged so the main button click handler can read it
// (set by setupBubblesDraggable via closure; exposed here for mainBtn access)
let hasDragged = false;

// AI Chat Overlay Launcher — dynamic import pattern (same as MDSCommandCenterLauncher)
const ChatOverlayLauncher = {
  _overlayEl: null,
  _preactUnmount: null,

  async open() {
    if (this._overlayEl) return; // Already open

    // Create overlay mount point
    const overlayEl = document.createElement('div');
    overlayEl.id = 'ai-chat-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    try {
      const [{ render, h }, { AIChatOverlay }] = await Promise.all([
        import('preact'),
        import('../modules/ai-chat/AIChatOverlay.jsx')
      ]);

      render(
        h(AIChatOverlay, {
          onClose: () => this.close()
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[AI Chat] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  close() {
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  isOpen() {
    return !!this._overlayEl;
  }
};

// Care Plan Coverage Launcher — dynamic import pattern (same as ChatOverlayLauncher)
const CoveragePanelLauncher = {
  _overlayEl: null,
  _preactUnmount: null,

  async open() {
    if (this._overlayEl) return;

    // Resolve patient ID and context
    const context = getMDSContext();
    const patientId = window.SuperOverlay?.patientId || context.patientId;
    if (!patientId) {
      console.warn('[CoveragePanel] No patient ID available');
      return;
    }

    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (e) {
      console.error('[CoveragePanel] Could not get org/facility:', e);
    }

    const overlayEl = document.createElement('div');
    overlayEl.id = 'care-plan-coverage-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    // Escape key to close
    this._escapeHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escapeHandler);

    try {
      const [{ render, h }, { CoveragePanel }] = await Promise.all([
        import('preact'),
        import('../modules/care-plan-coverage/CoveragePanel.jsx')
      ]);

      render(
        h(CoveragePanel, {
          patientId,
          patientName: context.patientName || '',
          facilityName: facilityName || '',
          orgSlug: orgSlug || '',
          onClose: () => this.close()
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[CoveragePanel] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  close() {
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  /** Open for a specific patient (called from compliance view) */
  async openForPatient(patientId, patientName) {
    if (this._overlayEl) this.close();

    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (e) {
      console.error('[CoveragePanel] Could not get org/facility:', e);
    }

    const overlayEl = document.createElement('div');
    overlayEl.id = 'care-plan-coverage-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    this._escapeHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escapeHandler);

    try {
      const [{ render, h }, { CoveragePanel }] = await Promise.all([
        import('preact'),
        import('../modules/care-plan-coverage/CoveragePanel.jsx')
      ]);

      render(
        h(CoveragePanel, {
          patientId,
          patientName: patientName || '',
          facilityName: facilityName || '',
          orgSlug: orgSlug || '',
          onClose: () => this.close()
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[CoveragePanel] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  isOpen() {
    return !!this._overlayEl;
  }
};

// QM Board Launcher — dynamic import pattern (same as ChatOverlayLauncher)
const QMBoardLauncher = {
  _overlayEl: null,
  _preactUnmount: null,

  async open() {
    if (this._overlayEl) return;

    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (e) {
      console.error('[QMBoard] Could not get org/facility:', e);
    }

    const overlayEl = document.createElement('div');
    overlayEl.id = 'qm-board-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    this._escapeHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escapeHandler);

    try {
      const [{ render, h }, { QMBoard }] = await Promise.all([
        import('preact'),
        import('../modules/qm-board/QMBoard.jsx')
      ]);

      render(
        h(QMBoard, {
          facilityName: facilityName || '',
          orgSlug: orgSlug || '',
          onClose: () => this.close()
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[QMBoard] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  close() {
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  isOpen() { return !!this._overlayEl; }
};

// Managed Care Launcher — dynamic import pattern (same as QMBoardLauncher).
// Two doors, one panel: the FAB opens it unscoped, the resident-header button
// passes { patientId, patientName } to scope it to one patient.
const ManagedCareLauncher = {
  _overlayEl: null,
  _preactUnmount: null,

  async open(opts = {}) {
    if (this._overlayEl) return;

    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (e) {
      console.error('[ManagedCare] Could not get org/facility:', e);
    }

    const overlayEl = document.createElement('div');
    overlayEl.id = 'mc-panel-overlay-root';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    this._escapeHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escapeHandler);

    try {
      const [{ render, h }, { ManagedCarePanel }] = await Promise.all([
        import('preact'),
        import('../modules/managed-care/ManagedCarePanel.jsx')
      ]);

      render(
        h(ManagedCarePanel, {
          orgSlug: orgSlug || '',
          facilityName: facilityName || '',
          patientId: opts.patientId || null,
          patientName: opts.patientName || null,
          source: opts.source || 'fab',
          onClose: () => this.close()
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[ManagedCare] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  close() {
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  isOpen() { return !!this._overlayEl; }
};

// F-Tag Prevention Launcher — dynamic import pattern (same as QMBoardLauncher).
// Facility-scoped: shows the building the nurse is currently in (read from PCC).
// Cross-building / regional view lives in the web dashboard, not here.
const FTagPreventionLauncher = {
  _overlayEl: null,
  _preactUnmount: null,

  async open() {
    if (this._overlayEl) return;

    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (e) {
      console.error('[FTagPrevention] Could not get org/facility:', e);
    }

    if (!facilityName || !orgSlug) {
      if (typeof SuperToast?.show === 'function') {
        SuperToast.show({
          message: 'Could not detect facility — open a PointClickCare facility page first.',
          type: 'error'
        });
      }
      return;
    }

    const overlayEl = document.createElement('div');
    overlayEl.id = 'ftag-prevention-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    this._escapeHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escapeHandler);

    try {
      const [{ render, h }, { FtagBoard }] = await Promise.all([
        import('preact'),
        import('../modules/ftag-prevention/FtagBoard.jsx')
      ]);

      render(
        h(FtagBoard, {
          facilityName: facilityName || '',
          orgSlug: orgSlug || '',
          onClose: () => this.close()
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[FTagPrevention] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  close() {
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  isOpen() { return !!this._overlayEl; }
};

// 24-Hour Report Launcher — dynamic import pattern (same as QMBoardLauncher)
const TwentyFourHourReportLauncher = {
  _overlayEl: null,
  _preactUnmount: null,

  async open({ restore } = {}) {
    if (this._overlayEl) return;

    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (e) {
      console.error('[24HR] Could not get org/facility:', e);
    }

    if (!facilityName || !orgSlug) {
      if (typeof SuperToast?.show === 'function') {
        SuperToast.show({
          message: 'Could not detect facility — open a PointClickCare facility page first.',
          type: 'error'
        });
      }
      return;
    }

    const overlayEl = document.createElement('div');
    overlayEl.id = 'twenty-four-hour-report-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    this._escapeHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escapeHandler);

    try {
      const [{ render, h }, { TwentyFourHourReport }] = await Promise.all([
        import('preact'),
        import('../modules/twenty-four-hour-report/TwentyFourHourReport.jsx')
      ]);

      render(
        h(TwentyFourHourReport, {
          facilityName: facilityName || '',
          orgSlug: orgSlug || '',
          restore: restore || null,
          onClose: () => this.close()
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[24HR] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  close() {
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  isOpen() { return !!this._overlayEl; }
};

// Feedback Launcher — dynamic import pattern
const FeedbackLauncher = {
  _overlayEl: null,
  _preactUnmount: null,

  async open() {
    if (this._overlayEl) return;

    // Capture the page BEFORE we render the modal so the screenshot doesn't
    // include our own UI. Failures here are non-fatal — the modal still opens.
    let initialScreenshot = null;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_VIEWPORT' });
      if (res?.success) initialScreenshot = res.dataUrl;
    } catch (e) {
      console.warn('[Feedback] initial capture failed:', e);
    }

    const overlayEl = document.createElement('div');
    overlayEl.id = 'feedback-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    try {
      const [{ render, h }, { FeedbackModal }] = await Promise.all([
        import('preact'),
        import('../modules/feedback/FeedbackModal.jsx')
      ]);

      render(
        h(FeedbackModal, { onClose: () => this.close(), initialScreenshot }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[Feedback] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  close() {
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  },

  isOpen() { return !!this._overlayEl; }
};

function openChatOverlay() {
  if (ChatOverlayLauncher.isOpen()) {
    ChatOverlayLauncher.close();
  } else {
    ChatOverlayLauncher.open();
  }
}

function resetBubblesPosition(container) {
  container.style.left = '';
  container.style.top = '';
  container.style.right = '24px';
  container.style.bottom = '24px';
}

function isBubbleVisible(container) {
  const rect = container.getBoundingClientRect();
  // Ensure the entire container (including the main button at the bottom) is on screen
  return rect.top >= 0 && rect.left >= 0 &&
         rect.bottom <= window.innerHeight &&
         rect.right <= window.innerWidth;
}

function loadBubblesPosition(container) {
  try {
    const saved = localStorage.getItem(FAB_POSITION_KEY);
    if (saved) {
      const pos = JSON.parse(saved);
      // Apply position first so we can measure actual container height
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      container.style.left = `${pos.x}px`;
      container.style.top = `${pos.y}px`;

      // Clamp after layout so we know the real container size
      requestAnimationFrame(() => {
        const h = container.offsetHeight || 160;
        const w = container.offsetWidth || 70;
        const maxX = window.innerWidth - w - 10;
        const maxY = window.innerHeight - h - 10;
        const x = Math.max(10, Math.min(pos.x, maxX));
        const y = Math.max(10, Math.min(pos.y, maxY));
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;

        if (!isBubbleVisible(container)) {
          console.warn('Super Menu: FAB was off-screen, resetting to default position');
          resetBubblesPosition(container);
          try { localStorage.removeItem(FAB_POSITION_KEY); } catch (_) {}
        }
      });
    }
  } catch (e) {
    console.warn('Super Menu: Failed to load bubble position, using default:', e);
    resetBubblesPosition(container);
  }
}

function saveBubblesPosition(x, y) {
  try {
    localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({ x, y }));
  } catch (e) {
    console.warn('Super Menu: Failed to save bubble position:', e);
  }
}

function setupBubblesDraggable(container) {
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  const onStart = (e) => {
    const rect = container.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    if (e.type === 'mousedown') {
      startX = e.clientX;
      startY = e.clientY;
    } else if (e.type === 'touchstart') {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }

    isDragging = true;
    hasDragged = false;
  };

  const onMove = (e) => {
    if (!isDragging) return;

    let clientX, clientY;
    if (e.type === 'mousemove') {
      clientX = e.clientX;
      clientY = e.clientY;
    } else if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    }

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasDragged = true;
    }

    let newX = startLeft + deltaX;
    let newY = startTop + deltaY;

    const h = container.offsetHeight || 160;
    const w = container.offsetWidth || 70;
    const maxX = window.innerWidth - w - 10;
    const maxY = window.innerHeight - h - 10;
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    container.style.left = `${newX}px`;
    container.style.top = `${newY}px`;
    container.style.bottom = 'auto';
    container.style.right = 'auto';
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;

    if (hasDragged) {
      const rect = container.getBoundingClientRect();
      saveBubblesPosition(rect.left, rect.top);
    }
  };

  container.addEventListener('mousedown', onStart);

  // Prevent drag from firing button clicks
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        hasDragged = false;
      }
    }, true);
  });

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);

  container.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);

  window.addEventListener('resize', () => {
    if (!isBubbleVisible(container)) {
      resetBubblesPosition(container);
      try { localStorage.removeItem(FAB_POSITION_KEY); } catch (_) {}
    }
  });
}

async function updateMDSBadge() {
  const badge = document.getElementById('super-mds-badge');
  const mainBadge = document.getElementById('super-bubble-badge');
  const report24hrDot = document.getElementById('super-24hr-dot');
  if (!badge && !mainBadge) return;

  let count = 0;
  let report24hUnseen = false;

  // Warm the dashboard cache ONLY to resolve facilityName/orgSlug — the badge
  // count itself is driven entirely by the notification summary below, NOT by
  // assessment compliance counts.
  if (window.FacilityDashboardState) {
    if (!FacilityDashboardState.data && !FacilityDashboardState.loading) {
      try {
        await FacilityDashboardState.loadDashboard();
      } catch (err) {
        console.warn('Super Menu: Failed to resolve facility for badge:', err);
      }
    }
  }

  // The notification summary — one facility-scoped request covering action items
  // (certs overdue/due + queries needing signature) and FYI items (recently-
  // signed certs/queries unseen + today's 24h report unseen). This IS the badge.
  try {
    if (window.NotificationsAPI && window.FacilityDashboardState) {
      const facilityName = FacilityDashboardState.facilityName;
      const orgSlug = FacilityDashboardState.orgSlug;
      if (facilityName && orgSlug) {
        const summary = await NotificationsAPI.fetchSummary(facilityName, orgSlug);
        if (summary) {
          count = summary.actionCount + summary.fyiUnseenCount;
          report24hUnseen = summary.report24hUnseen;
        }
      }
    }
  } catch (err) {
    console.warn('Super Menu: Failed to load notification badge count:', err);
  }

  // The aggregate count shows on BOTH the collapsed main "S" bubble (so it's
  // visible without expanding the dial) and the MDS sub-action button.
  const label = count > 99 ? '99+' : String(count);
  [badge, mainBadge].forEach((el) => {
    if (!el) return;
    if (count > 0) {
      el.textContent = label;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });

  // Standalone red dot on the 24H button when today's report is unseen.
  if (report24hrDot) {
    report24hrDot.style.display = report24hUnseen ? '' : 'none';
  }
}

// Backward-compat alias — navigation.js calls updateMenuBadge()
function updateMenuBadge() {
  updateMDSBadge();
}

// Keep createChatButton as alias so init.js can still call it safely during transition
function createChatButton() {
  createBubbles();
}

// Make available globally
window.createBubbles = createBubbles;
window.createChatButton = createChatButton;
window.updateMDSBadge = updateMDSBadge;
window.updateMenuBadge = updateMenuBadge;
window.updateBubblesContext = updateBubblesContext;
window.ChatOverlayLauncher = ChatOverlayLauncher;
window.CoveragePanelLauncher = CoveragePanelLauncher;
window.QMBoardLauncher = QMBoardLauncher;
window.ManagedCareLauncher = ManagedCareLauncher;
window.FTagPreventionLauncher = FTagPreventionLauncher;
window.TwentyFourHourReportLauncher = TwentyFourHourReportLauncher;
window.FeedbackLauncher = FeedbackLauncher;
