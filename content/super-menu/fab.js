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
    <button id="super-qm-action" class="super-dial__action super-dial__action--qm" aria-label="QM Board" data-track="fab_clicked" data-track-prop-fab="qm_board">QM</button>
    <button id="super-24hr-action" class="super-dial__action super-dial__action--24hr" aria-label="24-Hour Report" data-track="fab_clicked" data-track-prop-fab="24hr">24H<span class="super-dial__action-dot" id="super-24hr-dot" style="display:none;"></span></button>
    <button id="super-coverage-action" class="super-dial__action super-dial__action--coverage" aria-label="Care Plan Coverage" style="display:none;" data-track="fab_clicked" data-track-prop-fab="coverage">CP</button>
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

  // Coverage button → toggles Care Plan Coverage panel
  const coverageAction = document.getElementById('super-coverage-action');
  coverageAction.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('super-dial--open');
    if (CoveragePanelLauncher.isOpen()) {
      CoveragePanelLauncher.close();
    } else {
      CoveragePanelLauncher.open();
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
window.TwentyFourHourReportLauncher = TwentyFourHourReportLauncher;
window.FeedbackLauncher = FeedbackLauncher;
