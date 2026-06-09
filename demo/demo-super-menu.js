/**
 * Super Menu Demo Functionality
 * Creates and manages the Super Menu FAB and panel for demo pages
 */
(function() {
  'use strict';

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    console.log('[Demo] Initializing Super Menu...');

    // Set up patient context for ICD-10 viewer (needs to be done early)
    setupPatientContext();

    // Detect page type
    detectPageType();

    // Inject styles first
    injectStyles();

    // Create demo navigation bar
    createDemoNavigation();

    // Create the FAB and panel elements
    createSuperMenu();

    // Set up event listeners
    setupEventListeners();

    // Override pdpmAnalyzer() on the page to use our slide-out panel
    window.pdpmAnalyzer = function(category) {
      openPDPMAnalyzer(category);
    };

    // Wire up PDPM edge tab
    const edgeTab = document.getElementById('pdpm-analyzer-edge-tab');
    if (edgeTab) {
      edgeTab.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.pdpmAnalyzer('hipps');
      });
    }

    console.log('[Demo] Super Menu initialized');
  }

  // Detect what type of PCC page we're on
  function detectPageType() {
    const path = window.location.pathname;
    const title = document.title || '';

    if (path.includes('mds-section-i') || title.includes('Section I') || path.includes('sectioncode=I')) {
      window.SuperPageContext = { type: 'mds-section-i', section: 'I' };
    } else if (path.includes('mds-section-n') || title.includes('Section N') || path.includes('sectioncode=N')) {
      window.SuperPageContext = { type: 'mds-section-n', section: 'N' };
    } else if (path.includes('mds') || title.includes('MDS')) {
      window.SuperPageContext = { type: 'mds', section: null };
    } else if (path.includes('medical-diagnosis') || title.includes('Medical Diagnosis')) {
      window.SuperPageContext = { type: 'diagnosis' };
    } else if (path.includes('clinical-care-plan-detail') || title.includes('Care Plan Detail')) {
      window.SuperPageContext = { type: 'care-plan' };
    } else {
      window.SuperPageContext = { type: 'unknown' };
    }

    console.log('[Demo] Page context:', window.SuperPageContext);
  }

  function createDemoNavigation() {
    // Create demo nav bar
    const nav = document.createElement('div');
    nav.id = 'demo-nav-bar';
    nav.className = 'demo-nav-bar';

    const pages = [
      { url: 'medical-diagnosis.html', label: 'Medical Diagnosis', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' },
      { url: 'clinical-care-plan-detail.html', label: 'Care Plan', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>' },
      { url: 'mds-section-i.html', label: 'MDS Section I', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
      { url: 'mds-section-n.html', label: 'MDS Section N', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>' }
    ];

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    nav.innerHTML = `
      <div class="demo-nav-bar__inner">
        <div class="demo-nav-bar__brand">
          <span class="demo-nav-bar__logo">S</span>
          <span class="demo-nav-bar__title">Super LTC Demo</span>
        </div>
        <div class="demo-nav-bar__links">
          ${pages.map(p => `
            <a href="${p.url}" class="demo-nav-bar__link ${currentPage === p.url ? 'demo-nav-bar__link--active' : ''}">
              <span class="demo-nav-bar__link-icon">${p.icon}</span>
              <span class="demo-nav-bar__link-label">${p.label}</span>
            </a>
          `).join('')}
        </div>
        <div class="demo-nav-bar__actions"></div>
      </div>
    `;

    document.body.insertBefore(nav, document.body.firstChild);
  }

  function setupPatientContext() {
    // Set patient ID in URL for ICD10Viewer._gatherContext()
    const url = new URL(window.location.href);
    if (!url.searchParams.get('ESOLclientid')) {
      url.searchParams.set('ESOLclientid', '2657226');
      window.history.replaceState({}, '', url);
    }

    // Also set up SuperOverlay context as backup
    window.SuperOverlay = window.SuperOverlay || {};
    window.SuperOverlay.patientId = '2657226';

    // Set up mock getCurrentParams function that ICD10Viewer uses
    window.getCurrentParams = async function() {
      return {
        facilityName: 'Sunny Meadows Demo Facility',
        orgSlug: 'demo-org'
      };
    };

    console.log('[Demo] Patient context set up:', window.location.search);
  }

  function createSuperMenu() {
    // Remove any existing FABs (including extension FAB on left side)
    const existingFabs = document.querySelectorAll('.super-chat-fab, #super-chat-button, #super-menu-fab');
    existingFabs.forEach(fab => {
      console.log('[Demo] Removing existing FAB:', fab.id || fab.className);
      fab.remove();
    });

    // Create FAB button
    const fab = document.createElement('button');
    fab.id = 'super-chat-button';
    fab.className = 'super-chat-fab';
    fab.setAttribute('aria-label', 'Open Super Menu');
    fab.innerHTML = `
      <div class="super-menu-fab__logo super-chat-fab__icon--chat">S</div>
      <div class="super-menu-fab__badge" id="super-menu-badge">3</div>
      <svg class="super-chat-fab__icon super-chat-fab__icon--close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'super-chat-panel';
    panel.className = 'super-chat-panel';
    panel.innerHTML = `
      <div class="super-chat-header">
        <div class="super-menu-header__nav">
          <button class="super-menu-nav-btn super-menu-nav-btn--active" data-view="dashboard" title="Queries Dashboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button class="super-menu-nav-btn" data-view="mds" title="MDS Analysis">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
          <button class="super-menu-nav-btn" data-view="chat" title="AI Assistant">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        </div>
        <div class="super-chat-header__title">
          <div class="super-chat-header__logo">S</div>
          <span class="super-menu-header__title-text" id="super-menu-title">Queries</span>
        </div>
        <div class="super-chat-header__actions">
          <button class="super-chat-header__btn" id="super-menu-refresh" title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button class="super-chat-header__btn" id="super-chat-close" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="super-menu-content" id="super-menu-content">
        <!-- Dashboard or Chat content rendered here -->
      </div>
    `;

    // Add to document
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    // Watch for any new FABs being added (e.g., from Chrome extension) and remove them
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Check if it's a FAB button (but not our demo FAB)
            if ((node.classList && node.classList.contains('super-chat-fab') && node.id !== 'super-chat-button') ||
                (node.id === 'super-menu-fab' && node.id !== fab.id)) {
              console.log('[Demo] Removing duplicate FAB:', node.id || node.className);
              node.remove();
            }
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Set initial content
    const content = panel.querySelector('.super-menu-content');
    if (content) {
      content.innerHTML = getDashboardHTML();
    }
  }

  function setupEventListeners() {
    const fab = document.getElementById('super-chat-button');
    const panel = document.getElementById('super-chat-panel');

    if (!fab || !panel) {
      console.warn('[Demo] Super Menu elements not found after creation');
      return;
    }

    // Toggle panel on FAB click
    fab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = panel.classList.contains('super-chat-panel--open');
      if (isOpen) {
        closePanel();
      } else {
        openPanel();
      }
    });

    // Close button
    const closeBtn = document.getElementById('super-chat-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closePanel);
    }

    // Nav buttons
    const navBtns = panel.querySelectorAll('.super-menu-nav-btn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        const view = this.getAttribute('data-view');
        navBtns.forEach(b => b.classList.remove('super-menu-nav-btn--active'));
        this.classList.add('super-menu-nav-btn--active');
        switchView(view);
      });
    });

    // Attach content listeners
    attachContentListeners();
  }

  function openPanel() {
    const panel = document.getElementById('super-chat-panel');
    const fab = document.getElementById('super-chat-button');
    panel.classList.add('super-chat-panel--open');
    fab.classList.add('super-chat-fab--active');
  }

  function closePanel() {
    const panel = document.getElementById('super-chat-panel');
    const fab = document.getElementById('super-chat-button');
    panel.classList.remove('super-chat-panel--open');
    fab.classList.remove('super-chat-fab--active');
  }

  function switchView(view) {
    console.log('[Demo] Switching to view:', view);
    const content = document.getElementById('super-menu-content');
    const titleEl = document.getElementById('super-menu-title');
    if (!content) return;

    switch(view) {
      case 'dashboard':
        if (titleEl) titleEl.textContent = 'Queries';
        content.innerHTML = getDashboardHTML();
        break;
      case 'mds':
        if (titleEl) titleEl.textContent = 'MDS Analysis';
        content.innerHTML = getMDSAnalysisHTML();
        break;
      case 'chat':
        // Close vanilla panel and open Preact chat overlay
        closePanel();
        window.dispatchEvent(new CustomEvent('demo:open-chat'));
        return;
      default:
        content.innerHTML = getDashboardHTML();
    }

    attachContentListeners();
  }

  function attachContentListeners() {
    // Query items click
    document.querySelectorAll('.demo-query-item').forEach(item => {
      item.addEventListener('click', function() {
        const queryId = this.dataset.queryId;
        showQueryDetail(queryId);
      });
    });

    // ICD-10 viewer buttons (in Super Menu)
    document.querySelectorAll('.demo-icd10-btn').forEach(btn => {
      btn.addEventListener('click', openICD10Viewer);
    });

    // MAR/TAR viewer buttons
    document.querySelectorAll('.demo-mar-btn').forEach(btn => {
      btn.addEventListener('click', () => openMARViewer());
    });
    document.querySelectorAll('.demo-tar-btn').forEach(btn => {
      btn.addEventListener('click', () => openTARViewer());
    });
    document.querySelectorAll('.demo-therapy-btn').forEach(btn => {
      btn.addEventListener('click', () => openTherapyViewer());
    });

    // Also wire up "AI Code Patient" button on the PCC page itself
    const aiCodeBtn = document.querySelector('button[class*="AI Code Patient"], button');
    const pccButtons = document.querySelectorAll('button');
    pccButtons.forEach(btn => {
      if (btn.textContent && btn.textContent.includes('AI Code Patient')) {
        btn.addEventListener('click', openICD10Viewer);
      }
    });
  }

  function getDashboardHTML() {
    // Pull from DemoData if available
    const data = window.DemoData?.facilityDashboard || {};
    const queries = data.queriesToSend || [];
    const awaiting = data.awaitingSignatures || [];
    const recentlySigned = data.recentlySigned || [];
    const hipps = data.hippsOpportunities || [];
    const allAssessments = data.allAssessments || [];

    const totalQueries = queries.length + awaiting.length;
    const totalActionableItems = hipps.reduce((sum, h) => sum + h.hippsChangingCount, 0);

    // Build stats cards
    const statsHTML = `
      <div class="demo-stats-grid">
        <div class="demo-stat-card demo-stat-card--warning">
          <div class="demo-stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
          </div>
          <div class="demo-stat-content">
            <div class="demo-stat-value">${queries.length}</div>
            <div class="demo-stat-label">Draft Queries</div>
          </div>
        </div>

        <div class="demo-stat-card demo-stat-card--info">
          <div class="demo-stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="demo-stat-content">
            <div class="demo-stat-value">${awaiting.length}</div>
            <div class="demo-stat-label">Awaiting Signature</div>
          </div>
        </div>

        <div class="demo-stat-card demo-stat-card--success">
          <div class="demo-stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div class="demo-stat-content">
            <div class="demo-stat-value">${hipps.length}</div>
            <div class="demo-stat-label">HIPPS Opportunities</div>
          </div>
        </div>

        <div class="demo-stat-card demo-stat-card--primary">
          <div class="demo-stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div class="demo-stat-content">
            <div class="demo-stat-value">${totalActionableItems}</div>
            <div class="demo-stat-label">Action Items</div>
          </div>
        </div>
      </div>
    `;

    // Build outstanding queries section (all queries)
    let outstandingQueriesHTML = '';
    const allQueries = [...queries, ...awaiting];
    if (allQueries.length > 0) {
      allQueries.forEach((q, i) => {
        const isAwait = q.status === 'sent';
        const daysAgo = isAwait ? Math.floor((Date.now() - new Date(q.sentAt)) / (1000*60*60*24)) : null;
        outstandingQueriesHTML += `
          <div class="demo-query-row ${isAwait ? 'demo-query-row--sent' : 'demo-query-row--draft'}" data-query-id="${q.id}">
            <div class="demo-query-row__left">
              <div class="demo-query-row__code">${q.mdsItem}</div>
              <div class="demo-query-row__info">
                <div class="demo-query-row__desc">${q.mdsItemName}</div>
                <div class="demo-query-row__patient">${q.patientName}</div>
              </div>
            </div>
            <div class="demo-query-row__right">
              <div class="demo-query-row__status ${isAwait ? 'demo-query-row__status--sent' : 'demo-query-row__status--draft'}">
                ${isAwait ? `Sent ${daysAgo}d ago` : 'Draft'}
              </div>
            </div>
          </div>`;
      });
    } else {
      outstandingQueriesHTML = '<div class="demo-empty-state">No outstanding queries</div>';
    }

    // Build all HIPPS opportunities section
    let allHippsHTML = '';
    if (hipps.length > 0) {
      hipps.forEach(h => {
        const revenueIncrease = calculateRevenueIncrease(h.currentHipps, h.potentialHipps);
        allHippsHTML += `
          <div class="demo-hipps-card" data-assessment-id="${h.externalAssessmentId}">
            <div class="demo-hipps-card__header">
              <div class="demo-hipps-card__patient">
                <div class="demo-hipps-card__patient-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <div class="demo-hipps-card__patient-name">${h.patientName}</div>
                  <div class="demo-hipps-card__meta">${h.hippsChangingCount} actionable items</div>
                </div>
              </div>
            </div>
            <div class="demo-hipps-card__body">
              <div class="demo-hipps-comparison">
                <div class="demo-hipps-current">
                  <div class="demo-hipps-label">Current</div>
                  <div class="demo-hipps-code">${h.currentHipps}</div>
                </div>
                <div class="demo-hipps-arrow">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>
                <div class="demo-hipps-potential">
                  <div class="demo-hipps-label">Potential</div>
                  <div class="demo-hipps-code demo-hipps-code--highlight">${h.potentialHipps}</div>
                </div>
              </div>
              <div class="demo-hipps-revenue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <polyline points="19 12 12 5 5 12"/>
                </svg>
                <span>${revenueIncrease}/day potential increase</span>
              </div>
            </div>
            <div class="demo-hipps-card__footer">
              <button class="demo-hipps-action-btn demo-icd10-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                Open ICD-10 Viewer
              </button>
            </div>
          </div>`;
      });
    } else {
      allHippsHTML = '<div class="demo-empty-state">No HIPPS opportunities found</div>';
    }

    return `
      <div class="demo-dashboard">
        ${statsHTML}

        <div class="demo-section">
          <div class="demo-section-header">
            <div class="demo-section-title-group">
              <svg class="demo-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
              </svg>
              <span class="demo-section-title">Outstanding Queries</span>
            </div>
            <span class="demo-badge">${totalQueries}</span>
          </div>
          <div class="demo-query-list-new">
            ${outstandingQueriesHTML}
          </div>
        </div>

        <div class="demo-section">
          <div class="demo-section-header">
            <div class="demo-section-title-group">
              <svg class="demo-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span class="demo-section-title">HIPPS Opportunities</span>
            </div>
            <span class="demo-badge demo-badge--success">${hipps.length} MDS</span>
          </div>
          <div class="demo-hipps-grid">
            ${allHippsHTML}
          </div>
        </div>
      </div>
    `;
  }

  // Helper function to calculate revenue increase
  function calculateRevenueIncrease(currentHipps, potentialHipps) {
    // Simplified calculation - in reality this would lookup actual HIPPS rates
    const hippsRates = {
      'KAQD': 567.32,
      'KBQE': 609.18,
      'CBQJ': 625.45,
      'CBQL': 678.90
    };
    const current = hippsRates[currentHipps] || 567;
    const potential = hippsRates[potentialHipps] || 609;
    const diff = potential - current;
    return diff > 0 ? `+$${diff.toFixed(2)}` : '$0.00';
  }

  function getMDSAnalysisHTML() {
    // Pull from DemoData
    const pdpmData = window.DemoData?.mdsPdpmPotential?.['4860265'] || {};
    const calc = pdpmData.calculation || { hippsCode: 'KAQD', ptot: 'TK', slp: 'SA', nursing: 'CA1', nta: 'ND' };
    const summary = pdpmData.summary || { currentHipps: 'KAQD', potentialHippsIfCoded: 'KBQE' };
    const detections = pdpmData.enhancedDetections || [];
    const therapy = window.DemoData?.therapyMinutes?.['2657226'] || { pt: {total:450,goal:720}, ot: {total:380,goal:600}, slp: {total:180,goal:300} };

    // Build detections HTML
    let detectionsHTML = '';
    detections.forEach(d => {
      const isHippsChanging = d.wouldChangeHipps;
      detectionsHTML += `
        <div class="demo-nta-item ${isHippsChanging ? 'demo-nta-item--suggested' : ''}">
          <input type="checkbox" ${isHippsChanging ? '' : 'checked disabled'}>
          <span class="demo-nta-code">${d.mdsItem}</span>
          <span class="demo-nta-desc">${d.itemName}${isHippsChanging ? ' - Detected' : ''}</span>
        </div>`;
    });

    return `
      <div class="demo-mds-analysis">
        <div class="demo-mds-summary">
          <div class="demo-mds-hipps">
            <div class="demo-hipps-current">
              <div class="demo-hipps-label">Current HIPPS</div>
              <div class="demo-hipps-code">${summary.currentHipps}</div>
              <div class="demo-hipps-rate">$567.32/day</div>
            </div>
            <div class="demo-hipps-arrow">&rarr;</div>
            <div class="demo-hipps-potential">
              <div class="demo-hipps-label">Potential HIPPS</div>
              <div class="demo-hipps-code demo-hipps-code--highlight">${summary.potentialHippsIfCoded}</div>
              <div class="demo-hipps-rate">$609.18/day</div>
            </div>
          </div>
          <div class="demo-hipps-diff">+$41.86/day potential</div>
        </div>

        <div class="demo-mds-components">
          <div class="demo-component">
            <div class="demo-component-label">PT/OT</div>
            <div class="demo-component-value">${calc.ptot}</div>
            <div class="demo-component-desc">${therapy.pt.total + therapy.ot.total} mins</div>
          </div>
          <div class="demo-component">
            <div class="demo-component-label">SLP</div>
            <div class="demo-component-value">${calc.slp}</div>
            <div class="demo-component-desc">${therapy.slp.total} mins</div>
          </div>
          <div class="demo-component">
            <div class="demo-component-label">Nursing</div>
            <div class="demo-component-value">${calc.nursing}</div>
            <div class="demo-component-desc">ADL: 12</div>
          </div>
          <div class="demo-component demo-component--opportunity">
            <div class="demo-component-label">NTA</div>
            <div class="demo-component-value">${calc.nta} &rarr; NE</div>
            <div class="demo-component-desc">+2 pts available</div>
          </div>
        </div>

        <div class="demo-section">
          <div class="demo-section-header">
            <span class="demo-section-title">Therapy Progress</span>
          </div>
          <div class="demo-therapy-grid">
            <div class="demo-therapy-item">
              <div class="demo-therapy-label">PT</div>
              <div class="demo-therapy-bar"><div class="demo-therapy-fill" style="width:${(therapy.pt.total/therapy.pt.goal*100).toFixed(0)}%"></div></div>
              <div class="demo-therapy-mins">${therapy.pt.total}/${therapy.pt.goal}</div>
            </div>
            <div class="demo-therapy-item">
              <div class="demo-therapy-label">OT</div>
              <div class="demo-therapy-bar"><div class="demo-therapy-fill" style="width:${(therapy.ot.total/therapy.ot.goal*100).toFixed(0)}%"></div></div>
              <div class="demo-therapy-mins">${therapy.ot.total}/${therapy.ot.goal}</div>
            </div>
            <div class="demo-therapy-item">
              <div class="demo-therapy-label">SLP</div>
              <div class="demo-therapy-bar"><div class="demo-therapy-fill" style="width:${(therapy.slp.total/therapy.slp.goal*100).toFixed(0)}%"></div></div>
              <div class="demo-therapy-mins">${therapy.slp.total}/${therapy.slp.goal}</div>
            </div>
          </div>
        </div>

        <div class="demo-section">
          <div class="demo-section-header">
            <span class="demo-section-title">PDPM Detections</span>
          </div>
          <div class="demo-nta-list">
            ${detectionsHTML || '<div class="demo-empty">No detections</div>'}
          </div>
        </div>
      </div>
    `;
  }

  function getChatHTML() {
    return `
      <div class="demo-chat">
        <div class="demo-chat-messages">
          <div class="demo-chat-message demo-chat-message--assistant">
            <div class="demo-chat-avatar">S</div>
            <div class="demo-chat-bubble">
              Hi! I'm your Super LTC assistant. I can help you with:
              <ul>
                <li>ICD-10 coding questions</li>
                <li>MDS documentation</li>
                <li>PDPM optimization</li>
                <li>Clinical documentation review</li>
              </ul>
              What can I help you with today?
            </div>
          </div>
        </div>
        <div class="demo-chat-input">
          <input type="text" placeholder="Ask me anything..." class="demo-chat-textbox">
          <button class="demo-chat-send">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  function showQueryDetail(queryId) {
    console.log('[Demo] Show query detail:', queryId);
    alert('Query detail modal would open here for query #' + queryId);
  }

  function openICD10Viewer() {
    console.log('[Demo] Opening ICD-10 Viewer...');

    // Wait up to ~2s for the real viewer to register itself on window before
    // giving up. The classic-script ordering in the demo HTML runs
    // icd10-viewer.js before demo-super-menu.js, but on some deploys the
    // viewer file lands on a cold cache and assigns window.ICD10Viewer a
    // tick after this module evaluates.
    let waited = 0;
    const tryOpen = () => {
      if (window.ICD10Viewer && typeof window.ICD10Viewer.open === 'function') {
        window.ICD10Viewer.open();
        return;
      }
      waited += 50;
      if (waited > 2000) {
        console.error('[Demo] window.ICD10Viewer unavailable — cannot open ICD-10 viewer.');
        return;
      }
      setTimeout(tryOpen, 50);
    };
    tryOpen();
  }

  // ============================================
  // MAR VIEWER
  // ============================================
  function openMARViewer() {
    console.log('[Demo] Opening MAR Viewer...');
    const patientId = '2657226';
    const patient = window.DemoData?.getPatient(patientId) || { name: 'Doe, Jane' };
    const marData = window.DemoData?.marData?.[patientId] || { medications: [] };

    let modal = document.getElementById('demo-mar-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'demo-mar-modal';
      modal.className = 'super-therapy-modal';
      document.body.appendChild(modal);
    }

    const medsHTML = marData.medications.map(med => `
      <tr>
        <td style="font-weight: 600;">${med.name}</td>
        <td>${med.schedule}</td>
        <td><span class="demo-mar-route demo-mar-route--${med.route.toLowerCase()}">${med.route}</span></td>
        <td><span class="demo-mar-status demo-mar-status--${med.status}">${med.status === 'prn' ? 'PRN' : 'Active'}</span></td>
        <td>${med.lastAdmin}</td>
      </tr>
    `).join('');

    modal.innerHTML = `
      <div class="super-therapy-modal__backdrop"></div>
      <div class="super-therapy-modal__container" style="width: 1000px;">
        <div class="super-therapy-modal__toolbar">
          <div class="super-therapy-modal__toolbar-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
              <path d="M12 8v8m-4-4h8"/>
            </svg>
            <span>Medication Administration Record (MAR)</span>
          </div>
          <div class="super-therapy-modal__toolbar-controls">
            <span style="opacity: 0.7; font-size: 12px;">${patient.name}</span>
            <button class="super-therapy-modal__close" id="mar-modal-close">&times;</button>
          </div>
        </div>
        <div class="super-therapy-modal__body">
          <div class="super-therapy-doc" style="max-width: 100%;">
            <div class="super-therapy-doc__header">
              <div class="super-therapy-doc__discipline">MEDICATION ADMINISTRATION RECORD</div>
              <div class="super-therapy-doc__title">${patient.name} - Room ${window.DemoData?.getPatient(patientId)?.room || '308-B'}</div>
            </div>
            <div class="super-therapy-doc__info-row">
              <div class="super-therapy-doc__provider">
                <span class="super-therapy-doc__provider-label">Physician:</span> ${patient.physician || 'Dr. Demo Provider'}
              </div>
              <div class="super-therapy-doc__patient">
                <strong>Date Range:</strong> 01/21/2026 - 01/27/2026
              </div>
            </div>

            <div class="super-therapy-section">
              <div class="super-therapy-section-header">Current Medications</div>
              <div class="super-therapy-section__body" style="padding: 0;">
                <table class="demo-mar-table">
                  <thead>
                    <tr>
                      <th>Medication</th>
                      <th>Schedule</th>
                      <th>Route</th>
                      <th>Status</th>
                      <th>Last Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${medsHTML}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="super-therapy-section">
              <div class="super-therapy-section-header">Administration Schedule - Today (01/27/2026)</div>
              <div class="super-therapy-section__body">
                <div class="demo-mar-timeline">
                  <div class="demo-mar-time-slot">
                    <div class="demo-mar-time">06:00</div>
                    <div class="demo-mar-admin demo-mar-admin--given">
                      <span class="demo-mar-checkmark">✓</span>
                      Albuterol Nebulizer - Given at 06:30 by CNA Johnson
                    </div>
                  </div>
                  <div class="demo-mar-time-slot">
                    <div class="demo-mar-time">08:00</div>
                    <div class="demo-mar-admin demo-mar-admin--given">
                      <span class="demo-mar-checkmark">✓</span>
                      Lisinopril 10mg, Metformin 500mg, Omeprazole 20mg - Given at 08:05 by RN Demo
                    </div>
                  </div>
                  <div class="demo-mar-time-slot">
                    <div class="demo-mar-time">12:00</div>
                    <div class="demo-mar-admin demo-mar-admin--upcoming">
                      <span class="demo-mar-pending">○</span>
                      No scheduled medications
                    </div>
                  </div>
                  <div class="demo-mar-time-slot">
                    <div class="demo-mar-time">18:00</div>
                    <div class="demo-mar-admin demo-mar-admin--upcoming">
                      <span class="demo-mar-pending">○</span>
                      Metformin 500mg - Due
                    </div>
                  </div>
                  <div class="demo-mar-time-slot">
                    <div class="demo-mar-time">21:00</div>
                    <div class="demo-mar-admin demo-mar-admin--upcoming">
                      <span class="demo-mar-pending">○</span>
                      Atorvastatin 40mg - Due
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="super-therapy-signatures">
              <div class="super-therapy-signature">
                <div class="super-therapy-signature__line">
                  <div class="super-therapy-signature__name-area">
                    <div class="super-therapy-signature__name">RN Demo Nurse</div>
                    <div class="super-therapy-signature__label">Reviewing Nurse</div>
                  </div>
                  <div class="super-therapy-signature__date-area">
                    <div class="super-therapy-signature__date">01/27/2026</div>
                    <div class="super-therapy-signature__date-label">Date</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="super-therapy-modal__footer">
          <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary" id="mar-modal-print">Print</button>
          <button class="super-therapy-modal__btn super-therapy-modal__btn--primary" id="mar-modal-done">Done</button>
        </div>
      </div>
    `;

    // Attach listeners
    modal.querySelector('.super-therapy-modal__backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#mar-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('#mar-modal-done').addEventListener('click', () => modal.remove());
    modal.querySelector('#mar-modal-print').addEventListener('click', () => window.print());
  }

  // ============================================
  // TAR VIEWER
  // ============================================
  function openTARViewer() {
    console.log('[Demo] Opening TAR Viewer...');
    const patientId = '2657226';
    const patient = window.DemoData?.getPatient(patientId) || { name: 'Doe, Jane' };
    const tarData = window.DemoData?.tarData?.[patientId] || { treatments: [] };

    let modal = document.getElementById('demo-tar-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'demo-tar-modal';
      modal.className = 'super-therapy-modal';
      document.body.appendChild(modal);
    }

    const treatmentsHTML = tarData.treatments.map(t => `
      <tr>
        <td style="font-weight: 600;">${t.name}</td>
        <td>${t.schedule}</td>
        <td><span class="demo-tar-status demo-tar-status--${t.status}">${t.status === 'active' ? 'Active' : t.status}</span></td>
        <td>${t.lastPerformed}</td>
      </tr>
    `).join('');

    modal.innerHTML = `
      <div class="super-therapy-modal__backdrop"></div>
      <div class="super-therapy-modal__container" style="width: 1000px;">
        <div class="super-therapy-modal__toolbar">
          <div class="super-therapy-modal__toolbar-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6m-6 4h6"/>
            </svg>
            <span>Treatment Administration Record (TAR)</span>
          </div>
          <div class="super-therapy-modal__toolbar-controls">
            <span style="opacity: 0.7; font-size: 12px;">${patient.name}</span>
            <button class="super-therapy-modal__close" id="tar-modal-close">&times;</button>
          </div>
        </div>
        <div class="super-therapy-modal__body">
          <div class="super-therapy-doc" style="max-width: 100%;">
            <div class="super-therapy-doc__header">
              <div class="super-therapy-doc__discipline">TREATMENT ADMINISTRATION RECORD</div>
              <div class="super-therapy-doc__title">${patient.name} - Room ${window.DemoData?.getPatient(patientId)?.room || '308-B'}</div>
            </div>
            <div class="super-therapy-doc__info-row">
              <div class="super-therapy-doc__provider">
                <span class="super-therapy-doc__provider-label">Physician:</span> ${patient.physician || 'Dr. Demo Provider'}
              </div>
              <div class="super-therapy-doc__patient">
                <strong>Date Range:</strong> 01/21/2026 - 01/27/2026
              </div>
            </div>

            <div class="super-therapy-section">
              <div class="super-therapy-section-header">Active Treatments & Nursing Interventions</div>
              <div class="super-therapy-section__body" style="padding: 0;">
                <table class="demo-mar-table">
                  <thead>
                    <tr>
                      <th>Treatment</th>
                      <th>Schedule</th>
                      <th>Status</th>
                      <th>Last Performed</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${treatmentsHTML}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="super-therapy-section">
              <div class="super-therapy-section-header">Weekly Treatment Calendar</div>
              <div class="super-therapy-section__body">
                <table class="super-therapy-matrix">
                  <thead>
                    <tr>
                      <th class="super-therapy-matrix__service-col">Treatment</th>
                      <th>Mon</th>
                      <th>Tue</th>
                      <th>Wed</th>
                      <th>Thu</th>
                      <th>Fri</th>
                      <th>Sat</th>
                      <th>Sun</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="super-therapy-matrix__service-col">BP Check (TID)</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓○</td>
                    </tr>
                    <tr>
                      <td class="super-therapy-matrix__service-col">BG Check (AC & HS)</td>
                      <td>✓✓✓✓</td>
                      <td>✓✓✓✓</td>
                      <td>✓✓✓✓</td>
                      <td>✓✓✓✓</td>
                      <td>✓✓✓✓</td>
                      <td>✓✓✓✓</td>
                      <td>✓✓○○</td>
                    </tr>
                    <tr>
                      <td class="super-therapy-matrix__service-col">O2 Sat Check</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓✓</td>
                      <td>✓✓○</td>
                    </tr>
                    <tr>
                      <td class="super-therapy-matrix__service-col">CPAP (Nightly)</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>○</td>
                    </tr>
                    <tr>
                      <td class="super-therapy-matrix__service-col">Daily Weight</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>✓</td>
                      <td>○</td>
                    </tr>
                  </tbody>
                </table>
                <div style="margin-top: 12px; font-size: 12px; color: #6b7280;">
                  ✓ = Completed &nbsp;&nbsp; ○ = Pending/Due
                </div>
              </div>
            </div>

            <div class="super-therapy-signatures">
              <div class="super-therapy-signature">
                <div class="super-therapy-signature__line">
                  <div class="super-therapy-signature__name-area">
                    <div class="super-therapy-signature__name">LPN Michelle Davis</div>
                    <div class="super-therapy-signature__label">Licensed Practical Nurse</div>
                  </div>
                  <div class="super-therapy-signature__date-area">
                    <div class="super-therapy-signature__date">01/27/2026</div>
                    <div class="super-therapy-signature__date-label">Date</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="super-therapy-modal__footer">
          <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary" id="tar-modal-print">Print</button>
          <button class="super-therapy-modal__btn super-therapy-modal__btn--primary" id="tar-modal-done">Done</button>
        </div>
      </div>
    `;

    // Attach listeners
    modal.querySelector('.super-therapy-modal__backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#tar-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('#tar-modal-done').addEventListener('click', () => modal.remove());
    modal.querySelector('#tar-modal-print').addEventListener('click', () => window.print());
  }

  // ============================================
  // THERAPY DOCUMENTATION VIEWER
  // ============================================
  function openTherapyViewer() {
    console.log('[Demo] Opening Therapy Viewer...');
    const patientId = '2657226';
    const patient = window.DemoData?.getPatient(patientId) || { name: 'Doe, Jane' };
    const therapy = window.DemoData?.therapyMinutes?.[patientId] || { pt: {total:450,goal:720}, ot: {total:380,goal:600}, slp: {total:180,goal:300} };

    let modal = document.getElementById('demo-therapy-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'demo-therapy-modal';
      modal.className = 'super-therapy-modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="super-therapy-modal__backdrop"></div>
      <div class="super-therapy-modal__container" style="width: 1000px;">
        <div class="super-therapy-modal__toolbar">
          <div class="super-therapy-modal__toolbar-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span>Therapy Documentation</span>
          </div>
          <div class="super-therapy-modal__toolbar-controls">
            <span style="opacity: 0.7; font-size: 12px;">${patient.name}</span>
            <button class="super-therapy-modal__close" id="therapy-modal-close">&times;</button>
          </div>
        </div>
        <div class="super-therapy-modal__body">
          <div class="super-therapy-doc" style="max-width: 100%;">
            <div class="super-therapy-doc__header">
              <div class="super-therapy-doc__discipline">PHYSICAL THERAPY</div>
              <div class="super-therapy-doc__title">Plan of Care - Progress Note</div>
            </div>
            <div class="super-therapy-doc__info-row">
              <div class="super-therapy-doc__provider">
                <span class="super-therapy-doc__provider-label">Therapist:</span> Demo PT, PT, DPT
              </div>
              <div class="super-therapy-doc__patient">
                <strong>Patient:</strong> ${patient.name}<br>
                <strong>Room:</strong> 308-B
              </div>
            </div>

            <div class="super-therapy-dates-box">
              <div class="super-therapy-dates-box__item">
                <strong>Date of Service:</strong> 01/27/2026
              </div>
              <div class="super-therapy-dates-box__item">
                <strong>Session #:</strong> 8 of 15
              </div>
              <div class="super-therapy-dates-box__item">
                <strong>Duration:</strong> 45 minutes
              </div>
            </div>

            <div class="super-therapy-section">
              <div class="super-therapy-section-header">Therapy Minutes Summary (PDPM Assessment Period)</div>
              <div class="super-therapy-section__body">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
                  <div>
                    <div style="font-weight: 600; margin-bottom: 8px;">Physical Therapy</div>
                    <div class="demo-therapy-progress-ring" data-progress="${Math.round(therapy.pt.total/therapy.pt.goal*100)}">
                      <div class="demo-therapy-progress-value">${therapy.pt.total}/${therapy.pt.goal}</div>
                      <div class="demo-therapy-progress-label">minutes</div>
                    </div>
                    <div class="demo-therapy-bar-wrapper">
                      <div class="demo-therapy-bar-fill" style="width: ${Math.round(therapy.pt.total/therapy.pt.goal*100)}%; background: #3b82f6;"></div>
                    </div>
                    <div style="text-align: center; font-size: 12px; color: #666; margin-top: 4px;">${therapy.pt.sessions} sessions</div>
                  </div>
                  <div>
                    <div style="font-weight: 600; margin-bottom: 8px;">Occupational Therapy</div>
                    <div class="demo-therapy-progress-ring" data-progress="${Math.round(therapy.ot.total/therapy.ot.goal*100)}">
                      <div class="demo-therapy-progress-value">${therapy.ot.total}/${therapy.ot.goal}</div>
                      <div class="demo-therapy-progress-label">minutes</div>
                    </div>
                    <div class="demo-therapy-bar-wrapper">
                      <div class="demo-therapy-bar-fill" style="width: ${Math.round(therapy.ot.total/therapy.ot.goal*100)}%; background: #10b981;"></div>
                    </div>
                    <div style="text-align: center; font-size: 12px; color: #666; margin-top: 4px;">${therapy.ot.sessions} sessions</div>
                  </div>
                  <div>
                    <div style="font-weight: 600; margin-bottom: 8px;">Speech-Language Pathology</div>
                    <div class="demo-therapy-progress-ring" data-progress="${Math.round(therapy.slp.total/therapy.slp.goal*100)}">
                      <div class="demo-therapy-progress-value">${therapy.slp.total}/${therapy.slp.goal}</div>
                      <div class="demo-therapy-progress-label">minutes</div>
                    </div>
                    <div class="demo-therapy-bar-wrapper">
                      <div class="demo-therapy-bar-fill" style="width: ${Math.round(therapy.slp.total/therapy.slp.goal*100)}%; background: #8b5cf6;"></div>
                    </div>
                    <div style="text-align: center; font-size: 12px; color: #666; margin-top: 4px;">${therapy.slp.sessions} sessions</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="super-therapy-section">
              <div class="super-therapy-section-header">Diagnosis & Treatment</div>
              <div class="super-therapy-section__body">
                <table class="super-therapy-dx-table">
                  <thead>
                    <tr>
                      <th>ICD-10</th>
                      <th>Description</th>
                      <th>PDPM Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><span class="super-therapy-dx-table__code">J44.9</span></td>
                      <td>Chronic obstructive pulmonary disease</td>
                      <td>NTA (2 pts)</td>
                    </tr>
                    <tr>
                      <td><span class="super-therapy-dx-table__code">M62.81</span></td>
                      <td>Muscle weakness (generalized)</td>
                      <td>-</td>
                    </tr>
                    <tr>
                      <td><span class="super-therapy-dx-table__code">R26.89</span></td>
                      <td>Other abnormalities of gait and mobility</td>
                      <td>-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="super-therapy-section">
              <div class="super-therapy-section-header">Goals Progress</div>
              <div class="super-therapy-section__body" style="padding: 0;">
                <div class="super-therapy-goal">
                  <div class="super-therapy-goal__header">
                    <div class="super-therapy-goal__title">Goal 1: Ambulation</div>
                    <span class="super-therapy-goal__status super-therapy-goal__status--continue">Continue</span>
                  </div>
                  <div class="super-therapy-goal__body">
                    <div class="super-therapy-goal__text">Patient will ambulate 150 feet with rolling walker and supervision within 2 weeks.</div>
                    <div class="super-therapy-goal__target">Target Date: 02/10/2026</div>
                  </div>
                  <div class="super-therapy-goal__progress">
                    <div>
                      <div class="super-therapy-goal__progress-item">
                        <div class="super-therapy-goal__progress-label">Current Performance</div>
                        <div class="super-therapy-goal__progress-value">100 feet with RW, CGA</div>
                      </div>
                    </div>
                    <div>
                      <div class="super-therapy-goal__progress-item">
                        <div class="super-therapy-goal__progress-label">Progress</div>
                        <div class="super-therapy-goal__progress-value" style="color: #059669; font-weight: 600;">67% toward goal</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="super-therapy-goal">
                  <div class="super-therapy-goal__header">
                    <div class="super-therapy-goal__title">Goal 2: Bed Mobility</div>
                    <span class="super-therapy-goal__status super-therapy-goal__status--achieved">Achieved</span>
                  </div>
                  <div class="super-therapy-goal__body">
                    <div class="super-therapy-goal__text">Patient will perform bed mobility (supine to sit) independently within 1 week.</div>
                    <div class="super-therapy-goal__target">Achieved: 01/25/2026</div>
                  </div>
                  <div class="super-therapy-goal__progress">
                    <div>
                      <div class="super-therapy-goal__progress-item">
                        <div class="super-therapy-goal__progress-label">Current Performance</div>
                        <div class="super-therapy-goal__progress-value">Independent</div>
                      </div>
                    </div>
                    <div>
                      <div class="super-therapy-goal__progress-item">
                        <div class="super-therapy-goal__progress-label">Progress</div>
                        <div class="super-therapy-goal__progress-value" style="color: #059669; font-weight: 600;">100% - Goal Met</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="super-therapy-goal">
                  <div class="super-therapy-goal__header">
                    <div class="super-therapy-goal__title">Goal 3: Balance</div>
                    <span class="super-therapy-goal__status super-therapy-goal__status--continue">Continue</span>
                  </div>
                  <div class="super-therapy-goal__body">
                    <div class="super-therapy-goal__text">Patient will maintain standing balance for 60 seconds without UE support within 2 weeks.</div>
                    <div class="super-therapy-goal__target">Target Date: 02/10/2026</div>
                  </div>
                  <div class="super-therapy-goal__progress">
                    <div>
                      <div class="super-therapy-goal__progress-item">
                        <div class="super-therapy-goal__progress-label">Current Performance</div>
                        <div class="super-therapy-goal__progress-value">35 seconds with min UE support</div>
                      </div>
                    </div>
                    <div>
                      <div class="super-therapy-goal__progress-item">
                        <div class="super-therapy-goal__progress-label">Progress</div>
                        <div class="super-therapy-goal__progress-value" style="color: #f59e0b; font-weight: 600;">58% toward goal</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="super-therapy-signatures">
              <div class="super-therapy-signature">
                <div class="super-therapy-signature__line">
                  <div class="super-therapy-signature__name-area">
                    <div class="super-therapy-signature__name">Demo PT, PT, DPT</div>
                    <div class="super-therapy-signature__label">Physical Therapist - License #PT45892</div>
                  </div>
                  <div class="super-therapy-signature__date-area">
                    <div class="super-therapy-signature__date">01/27/2026</div>
                    <div class="super-therapy-signature__date-label">Date</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="super-therapy-modal__footer">
          <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary" id="therapy-modal-print">Print</button>
          <button class="super-therapy-modal__btn super-therapy-modal__btn--primary" id="therapy-modal-done">Done</button>
        </div>
      </div>
    `;

    // Attach listeners
    modal.querySelector('.super-therapy-modal__backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#therapy-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('#therapy-modal-done').addEventListener('click', () => modal.remove());
    modal.querySelector('#therapy-modal-print').addEventListener('click', () => window.print());
  }


  // ============================================
  // PDPM ANALYZER SLIDE-OUT
  // ============================================
  function openPDPMAnalyzer(category) {
    console.log('[Demo] Opening PDPM Analyzer for category:', category);

    const pdpmData = window.DemoData?.mdsPdpmPotential?.['4860265'] || {};
    const summary = pdpmData.summary || {};
    const calc = pdpmData.calculation || {};
    const detections = pdpmData.enhancedDetections || [];
    const queries = pdpmData.outstandingQueries || [];
    const signed = pdpmData.recentlySigned || [];
    const compliance = pdpmData.compliance || {};

    // Stubbed component data matching the real PDPMAnalyzer structure
    const components = [
      {
        key: 'ptot', label: 'PT/OT',
        currentCode: 'TK', name: 'Pulmonary',
        detail: 'Clinical Category: Pulmonary',
        captured: [
          { code: 'GG0170D', name: 'Sit to Stand', help: 'Functional score: 2' },
          { code: 'GG0170E', name: 'Transfer', help: 'Functional score: 3' },
        ],
        opportunities: []
      },
      {
        key: 'slp', label: 'SLP',
        currentCode: 'SA', name: 'SLP Group A',
        detail: 'No SLP comorbidities present',
        captured: [
          { code: 'B0700', name: 'Makes Self Understood', help: 'Tier 1: cognitive/communication' },
        ],
        opportunities: [],
        tiers: { tier1Met: 1, tier2Met: 0, tier2Needed: 2 }
      },
      {
        key: 'nursing', label: 'Nursing',
        currentCode: 'CA1', potentialCode: 'CB1',
        name: 'Clinically Complex',
        detail: 'ADL Score: 12, Depression (PHQ-9): No',
        captured: [
          { code: 'I0600', name: 'Heart Failure', help: 'Clinically Complex condition' },
          { code: 'I2900', name: 'Diabetes Mellitus', help: 'Clinically Complex condition' },
        ],
        opportunities: [
          { code: 'O0400A3', name: 'IV Medications', help: 'Would upgrade to CB1', points: null },
        ]
      },
      {
        key: 'nta', label: 'NTA',
        currentCode: 'ND', potentialCode: 'NE',
        name: 'NTA Level D',
        detail: 'NTA Points: 5',
        captured: [
          { code: 'I2900', name: 'Diabetes mellitus', help: '+2 pts (Endocrine)', points: 2 },
          { code: 'I0600', name: 'Heart Failure', help: '+2 pts (Cardiovascular)', points: 2 },
          { code: 'I6300', name: 'Hemiplegia/Hemiparesis', help: '+1 pt (Neurological)', points: 1 },
        ],
        opportunities: [
          { code: 'I5600', name: 'Malnutrition', help: '+3 pts (Nutritional)', points: 3 },
          { code: 'I4300', name: 'Diabetes w/ PVD', help: '+2 pts (Endocrine)', points: 2 },
        ],
        ntaProgress: { currentPoints: 5, pointsNeeded: 3, currentLevel: 'ND', nextLevel: 'NE' },
        ntaLevels: [
          { code: 'NA', min: 0 }, { code: 'NB', min: 1 }, { code: 'NC', min: 3 },
          { code: 'ND', min: 5 }, { code: 'NE', min: 8 }, { code: 'NF', min: 12 }
        ]
      }
    ];

    // Clinical scores stubbed data
    const scores = {
      bims: { value: 12, max: 15, severity: 'Moderately Impaired', impact: 'Affects SLP and Nursing classification' },
      phq9: { value: 4, max: 27, severity: 'None/Minimal', impact: 'No depression threshold met' },
      nursing: { value: 12, max: 28, severity: 'Medium ADL', impact: 'ADL score contributes to Nursing component' },
      ptot: { value: 8, max: 24, severity: 'Limited Assistance', impact: 'GG functional score determines PT/OT group' }
    };

    // Section progress stubbed data
    const sectionProgress = {
      sections: {
        A: 'Completed', B: 'Completed', C: 'Completed', D: 'Completed',
        E: 'Completed', F: 'Completed', G: 'Completed', GG: 'In Progress',
        H: 'Completed', I: 'In Progress', J: 'Completed', K: 'Completed',
        L: 'Not Started', M: 'Not Started', N: 'Completed', O: 'In Progress'
      }
    };
    const spEntries = Object.entries(sectionProgress.sections);
    const spDone = spEntries.filter(([,s]) => s === 'Completed').length;
    const spWip = spEntries.filter(([,s]) => s === 'In Progress').length;
    const spTodo = spEntries.filter(([,s]) => s === 'Not Started').length;
    const spPct = Math.round((spDone / spEntries.length) * 100);

    // Build opportunity rows
    const oppsHTML = detections.filter(d => d.wouldChangeHipps && d.solverStatus !== 'query_sent')
      .map(d => `
        <div class="pdpm-demo__opp-row">
          <span class="pdpm-demo__opp-icon">\u26A1</span>
          <span class="pdpm-demo__opp-code">${d.mdsItem}</span>
          <span class="pdpm-demo__opp-name">${d.itemName}</span>
          ${d.impact?.nta?.wouldChangeLevel ? `<span class="pdpm-demo__impact-chip"><span class="pdpm-demo__chip-k">NTA</span><span class="pdpm-demo__chip-v">${d.impact.nta.currentLevel} \u2192 ${d.impact.nta.newLevel}</span></span>` : ''}
          ${d.impact?.nursing?.wouldChangeGroup ? `<span class="pdpm-demo__impact-chip"><span class="pdpm-demo__chip-k">Nursing</span><span class="pdpm-demo__chip-v">${d.impact.nursing.currentPaymentGroup} \u2192 ${d.impact.nursing.newPaymentGroup}</span></span>` : ''}
          ${d.impact?.nta?.wouldChangeGroup ? `<span class="pdpm-demo__impact-chip"><span class="pdpm-demo__chip-k">NTA</span><span class="pdpm-demo__chip-v">${d.impact.nta.currentGroup} \u2192 ${d.impact.nta.newGroup}</span></span>` : ''}
          <svg class="pdpm-demo__opp-go" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      `).join('');

    // Build pending queries
    const pendingHTML = queries.filter(q => q.status === 'sent' || q.status === 'pending').map(q => {
      const days = Math.floor((Date.now() - new Date(q.sentAt)) / 86400000);
      return `
        <li class="pdpm-demo__query-item">
          <div class="pdpm-demo__query-main">
            <span class="pdpm-demo__query-code">${q.mdsItem}</span>
            <span class="pdpm-demo__query-text">${q.mdsItemName}</span>
          </div>
          <span class="pdpm-demo__query-pill">sent ${days}d ago</span>
        </li>`;
    }).join('');

    // Build recently signed
    const signedHTML = signed.map(q => {
      const days = Math.floor((Date.now() - new Date(q.signedAt)) / 86400000);
      return `
        <li class="pdpm-demo__signed-item ${q.mdsItemCoded === false ? 'pdpm-demo__signed-item--needs-coding' : ''}">
          <span class="pdpm-demo__query-code pdpm-demo__query-code--signed">${q.mdsItem}</span>
          <span class="pdpm-demo__query-text">${q.mdsItemName}</span>
          <div class="pdpm-demo__signed-badges">
            ${q.mdsItemCoded === false ? '<span class="pdpm-demo__signed-badge pdpm-demo__signed-badge--coding">Needs Coding</span>' : ''}
            <span class="pdpm-demo__query-date">${days === 0 ? 'today' : days === 1 ? 'yesterday' : days + 'd ago'}</span>
          </div>
        </li>`;
    }).join('');

    // Build compliance checks
    const checks = compliance.checks || {};
    const complianceHTML = Object.entries(checks).map(([key, check]) => {
      const passed = check.status === 'passed';
      const labels = { bims: 'BIMS', phq9: 'PHQ-9', gg: 'GG Functional', orders: 'Orders', therapyDocs: 'Therapy Docs' };
      return `
        <div class="pdpm-demo__compliance-row">
          <span class="pdpm-demo__compliance-icon ${passed ? 'pdpm-demo__compliance-icon--pass' : 'pdpm-demo__compliance-icon--fail'}">${passed ? '\u2713' : '\u2717'}</span>
          <span class="pdpm-demo__compliance-label">${labels[key] || key}</span>
          <span class="pdpm-demo__compliance-msg">${check.message}</span>
        </div>`;
    }).join('');

    // Build component breakdown
    const componentsHTML = components.map(comp => {
      const improved = comp.potentialCode && comp.potentialCode !== comp.currentCode;
      const isHighlighted = category === comp.key;

      // NTA level track
      let ntaTrackHTML = '';
      if (comp.ntaLevels) {
        const levels = comp.ntaLevels;
        const curIdx = levels.findIndex(l => l.code === comp.ntaProgress.currentLevel);
        const tgtIdx = levels.findIndex(l => l.code === comp.ntaProgress.nextLevel);
        const curPct = Math.max((curIdx / (levels.length - 1)) * 100, 4);
        const tgtPct = (tgtIdx / (levels.length - 1)) * 100;
        const gainPct = tgtPct - curPct;
        ntaTrackHTML = `
          <div class="pdpm-demo__nta-track">
            <div class="pdpm-demo__nta-bar">
              <div class="pdpm-demo__nta-bar-cur" style="width:${curPct}%"></div>
              <div class="pdpm-demo__nta-bar-gain" style="left:${curPct}%;width:${gainPct}%"></div>
            </div>
            <div class="pdpm-demo__nta-lvls">
              ${levels.map((l, i) => `<span class="pdpm-demo__nta-lvl${i === curIdx ? ' pdpm-demo__nta-lvl--cur' : ''}${i === tgtIdx ? ' pdpm-demo__nta-lvl--tgt' : ''}">${l.code}</span>`).join('')}
            </div>
            <span class="pdpm-demo__nta-away">${comp.ntaProgress.pointsNeeded} pts \u2192 ${comp.ntaProgress.nextLevel}</span>
          </div>`;
      }

      // SLP tier indicator
      let slpTierHTML = '';
      if (comp.tiers) {
        slpTierHTML = `
          <div class="pdpm-demo__tier-row">
            <span class="pdpm-demo__tier-segment">Tier 1: ${'●'.repeat(comp.tiers.tier1Met)} ${comp.tiers.tier1Met} met</span>
            <span class="pdpm-demo__tier-segment">· Tier 2: ${'●'.repeat(comp.tiers.tier2Met)}${'○'.repeat(comp.tiers.tier2Needed)} ${comp.tiers.tier2Met}/${comp.tiers.tier2Met + comp.tiers.tier2Needed}</span>
          </div>`;
      }

      // Captured items
      const capturedHTML = comp.captured.map(c => `
        <div class="pdpm-demo__ci-row pdpm-demo__ci-row--captured">
          <span class="pdpm-demo__ci-check">\u2713</span>
          <span class="pdpm-demo__ci-code">${c.code}</span>
          <div class="pdpm-demo__ci-body">
            <span class="pdpm-demo__ci-name">${c.name}</span>
            <span class="pdpm-demo__ci-help">${c.help}</span>
          </div>
          ${c.points != null ? `<span class="pdpm-demo__ci-pts">+${c.points} pts</span>` : ''}
        </div>
      `).join('');

      // Opportunity items within component
      const oppItemsHTML = comp.opportunities.map(c => `
        <div class="pdpm-demo__ci-row">
          <span class="pdpm-demo__ci-code">${c.code}</span>
          <div class="pdpm-demo__ci-body">
            <span class="pdpm-demo__ci-name">${c.name}</span>
            <span class="pdpm-demo__ci-help">${c.help}</span>
          </div>
          ${c.points != null ? `<span class="pdpm-demo__ci-pts">+${c.points} pts</span>` : ''}
        </div>
      `).join('');

      return `
        <div class="pdpm-demo__comp-row${improved ? ' pdpm-demo__comp-row--improved' : ''}${isHighlighted ? ' pdpm-demo__comp-row--expanded' : ''}" data-comp-key="${comp.key}">
          <div class="pdpm-demo__comp-header" data-comp-toggle="${comp.key}">
            <span class="pdpm-demo__comp-label">${comp.label}</span>
            <span class="pdpm-demo__comp-name">${comp.name || '\u2014'}</span>
            <span class="pdpm-demo__comp-code">${comp.currentCode}</span>
            ${improved ? `<span class="pdpm-demo__comp-change">\u2192 ${comp.potentialCode}</span>` : ''}
            <svg class="pdpm-demo__comp-chevron${isHighlighted ? ' pdpm-demo__comp-chevron--open' : ''}" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 5.5L7 8.5L10 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          ${ntaTrackHTML}
          ${slpTierHTML}
          <div class="pdpm-demo__comp-detail" style="display:${isHighlighted ? 'block' : 'none'}">
            <div class="pdpm-demo__comp-qualifier">${comp.detail}</div>
            ${oppItemsHTML ? `<div class="pdpm-demo__captured-label pdpm-demo__captured-label--opps">Opportunities</div><div class="pdpm-demo__ci-list">${oppItemsHTML}</div>` : ''}
            ${capturedHTML ? `<div class="pdpm-demo__captured-label">Currently captured</div><div class="pdpm-demo__ci-list">${capturedHTML}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    // Clinical scores
    function scoreRing(value, max, label, severity, color) {
      const pct = max > 0 ? Math.round((value / max) * 100) : 0;
      const r = 20, circ = 2 * Math.PI * r;
      const offset = circ - (pct / 100) * circ;
      return `
        <div class="pdpm-demo__sc">
          <div class="pdpm-demo__sc-ring">
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="4"/>
              <circle cx="26" cy="26" r="${r}" fill="none" stroke="${color}" stroke-width="4"
                stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                stroke-linecap="round" transform="rotate(-90 26 26)"/>
            </svg>
            <span class="pdpm-demo__sc-val">${value}</span>
          </div>
          <span class="pdpm-demo__sc-label">${label}</span>
          <span class="pdpm-demo__sc-severity" style="color:${color}">${severity}</span>
        </div>`;
    }

    const severityColors = {
      'Intact': '#059669', 'Moderately Impaired': '#d97706', 'Severely Impaired': '#dc2626',
      'None/Minimal': '#059669', 'Mild': '#84cc16',
      'Medium ADL': '#d97706', 'High ADL': '#dc2626', 'Low ADL': '#059669',
      'Limited Assistance': '#84cc16', 'Substantial Assistance': '#d97706', 'Dependent': '#dc2626'
    };

    const scoresHTML = [
      scoreRing(scores.bims.value, scores.bims.max, 'BIMS', scores.bims.severity, severityColors[scores.bims.severity] || '#9ca3af'),
      scoreRing(scores.phq9.value, scores.phq9.max, 'PHQ-9', scores.phq9.severity, severityColors[scores.phq9.severity] || '#9ca3af'),
      scoreRing(scores.nursing.value, scores.nursing.max, 'ADL', scores.nursing.severity, severityColors[scores.nursing.severity] || '#9ca3af'),
      scoreRing(scores.ptot.value, scores.ptot.max, 'GG Func', scores.ptot.severity, severityColors[scores.ptot.severity] || '#9ca3af'),
    ].join('');

    // Section progress tags
    const spTagsHTML = spEntries.map(([code, status]) => {
      const isDone = status === 'Completed';
      const isWip = status === 'In Progress';
      const cls = isDone ? 'pdpm-demo__sp-tag--done' : isWip ? 'pdpm-demo__sp-tag--wip' : 'pdpm-demo__sp-tag--todo';
      return `<span class="pdpm-demo__sp-tag ${cls}" title="${status}">${isDone ? '\u2713 ' : ''}${code}</span>`;
    }).join('');

    // Build the full panel
    let panel = document.getElementById('pdpm-demo-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'pdpm-demo-panel';
      panel.className = 'pdpm-demo__overlay';
      document.body.appendChild(panel);
    }

    const hasImprovement = summary.hasImprovements && summary.potentialHippsIfCoded !== summary.currentHipps;

    panel.innerHTML = `
      <div class="pdpm-demo__backdrop"></div>
      <div class="pdpm-demo__drawer">
        <div class="pdpm-demo__header">
          <div class="pdpm-demo__header-left">
            <span class="pdpm-demo__title">PDPM Analyzer</span>
            <span class="pdpm-demo__subtitle">${pdpmData.patientName || 'Doe, Jane'} \u00B7 ${pdpmData.assessment?.description || 'Quarterly'} \u00B7 ARD ${pdpmData.assessment?.ardDate || '2026-01-13'}</span>
          </div>
          <button class="pdpm-demo__close" id="pdpm-demo-close">&times;</button>
        </div>

        <div class="pdpm-demo__body">
          <div class="pdpm-demo__body-inner">
          <!-- HIPPS Display -->
          <div class="pdpm-demo__hipps">
            <div class="pdpm-demo__hipps-row">
              <div class="pdpm-demo__hipps-block">
                <div class="pdpm-demo__hipps-label">Current HIPPS</div>
                <div class="pdpm-demo__hipps-code">${summary.currentHipps || calc.hippsCode || '?????'}</div>
              </div>
              ${hasImprovement ? `
                <div class="pdpm-demo__hipps-arrow">\u2192</div>
                <div class="pdpm-demo__hipps-block pdpm-demo__hipps-block--potential">
                  <div class="pdpm-demo__hipps-label">Potential</div>
                  <div class="pdpm-demo__hipps-code pdpm-demo__hipps-code--potential">${summary.potentialHippsIfCoded}</div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Revenue Opportunity -->
          <div class="pdpm-demo__payment-card">
            <div class="pdpm-demo__payment-label">Revenue Opportunity</div>
            <div class="pdpm-demo__payment-row">
              <span class="pdpm-demo__payment-current">$567.32/day</span>
              <span class="pdpm-demo__payment-arrow">\u2192</span>
              <span class="pdpm-demo__payment-potential">$609.18/day</span>
              <span class="pdpm-demo__payment-delta">+$41.86/day</span>
            </div>
          </div>

          <!-- Opportunities -->
          ${oppsHTML ? `
            <div class="pdpm-demo__opps">
              ${oppsHTML}
            </div>
          ` : ''}

          <!-- PDPM Components -->
          <div class="pdpm-demo__card">
            <div class="pdpm-demo__card-header pdpm-demo__card-header--collapsible" data-section="components">
              <span class="pdpm-demo__card-icon">\u2630</span>
              <span class="pdpm-demo__card-title">PDPM Components</span>
              <svg class="pdpm-demo__card-chevron pdpm-demo__card-chevron--open" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="pdpm-demo__card-body" data-section-body="components">
              ${componentsHTML}
            </div>
          </div>

          <!-- Pending Queries -->
          ${pendingHTML ? `
            <div class="pdpm-demo__card pdpm-demo__card--queries">
              <div class="pdpm-demo__card-header pdpm-demo__card-header--collapsible" data-section="queries">
                <span class="pdpm-demo__card-icon">\u2709</span>
                <span class="pdpm-demo__card-title">Pending Queries</span>
                <span class="pdpm-demo__card-badge pdpm-demo__card-badge--pending">${queries.length}</span>
                <svg class="pdpm-demo__card-chevron pdpm-demo__card-chevron--open" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <ul class="pdpm-demo__query-list" data-section-body="queries">
                ${pendingHTML}
              </ul>
            </div>
          ` : ''}

          <!-- Recently Signed -->
          ${signedHTML ? `
            <div class="pdpm-demo__card pdpm-demo__card--signed">
              <div class="pdpm-demo__card-header pdpm-demo__card-header--collapsible" data-section="signed">
                <span class="pdpm-demo__card-icon">\u2713</span>
                <span class="pdpm-demo__card-title">Recently Signed</span>
                <span class="pdpm-demo__card-badge">${signed.length}</span>
                <svg class="pdpm-demo__card-chevron pdpm-demo__card-chevron--open" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <ul class="pdpm-demo__query-list" data-section-body="signed">
                ${signedHTML}
              </ul>
            </div>
          ` : ''}

          <!-- Clinical Scores -->
          <div class="pdpm-demo__card">
            <div class="pdpm-demo__card-header pdpm-demo__card-header--collapsible" data-section="scores">
              <span class="pdpm-demo__card-icon">\uD83E\uDDE0</span>
              <span class="pdpm-demo__card-title">Clinical Scores</span>
              <svg class="pdpm-demo__card-chevron pdpm-demo__card-chevron--open" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="pdpm-demo__scores" data-section-body="scores">
              ${scoresHTML}
            </div>
          </div>

          <!-- Compliance -->
          <div class="pdpm-demo__card">
            <div class="pdpm-demo__card-header pdpm-demo__card-header--collapsible" data-section="compliance">
              <span class="pdpm-demo__card-icon">\uD83D\uDEE1</span>
              <span class="pdpm-demo__card-title">Compliance</span>
              <span class="pdpm-demo__card-badge">${compliance.summary?.passed || 0}/${compliance.summary?.total || 0}</span>
              <svg class="pdpm-demo__card-chevron pdpm-demo__card-chevron--open" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="pdpm-demo__card-body" data-section-body="compliance">
              ${complianceHTML}
            </div>
          </div>

          <!-- Section Progress -->
          <div class="pdpm-demo__card">
            <div class="pdpm-demo__card-header pdpm-demo__card-header--collapsible" data-section="sections">
              <span class="pdpm-demo__card-icon">\uD83D\uDCCB</span>
              <span class="pdpm-demo__card-title">MDS Sections</span>
              <span class="pdpm-demo__card-badge">${spPct}%</span>
              <svg class="pdpm-demo__card-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="pdpm-demo__card-body" data-section-body="sections" style="display:none">
              <div class="pdpm-demo__sp-bar-row">
                <div class="pdpm-demo__sp-bar"><div class="pdpm-demo__sp-fill" style="width:${spPct}%"></div></div>
                <div class="pdpm-demo__sp-counts">
                  <span class="pdpm-demo__sp-count pdpm-demo__sp-count--done">${spDone} done</span>
                  <span class="pdpm-demo__sp-count pdpm-demo__sp-count--wip">${spWip} in progress</span>
                  <span class="pdpm-demo__sp-count pdpm-demo__sp-count--todo">${spTodo} not started</span>
                </div>
              </div>
              <div class="pdpm-demo__sp-tags">${spTagsHTML}</div>
            </div>
          </div>
          </div><!-- /body-inner -->
        </div>
      </div>
    `;

    // Show panel
    requestAnimationFrame(() => panel.classList.add('pdpm-demo__overlay--open'));

    // Event listeners
    const closePdpm = () => {
      panel.classList.remove('pdpm-demo__overlay--open');
      setTimeout(() => { panel.innerHTML = ''; }, 300);
    };
    panel.querySelector('.pdpm-demo__backdrop').addEventListener('click', closePdpm);
    panel.querySelector('#pdpm-demo-close').addEventListener('click', closePdpm);

    // Collapsible sections
    panel.querySelectorAll('.pdpm-demo__card-header--collapsible').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.dataset.section;
        const body = panel.querySelector(`[data-section-body="${section}"]`);
        const chevron = header.querySelector('.pdpm-demo__card-chevron');
        if (body) {
          const isHidden = body.style.display === 'none';
          body.style.display = isHidden ? '' : 'none';
          if (chevron) chevron.classList.toggle('pdpm-demo__card-chevron--open', isHidden);
        }
      });
    });

    // Component row expand/collapse
    panel.querySelectorAll('[data-comp-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const key = header.dataset.compToggle;
        const row = panel.querySelector(`[data-comp-key="${key}"]`);
        const detail = row?.querySelector('.pdpm-demo__comp-detail');
        const chevron = header.querySelector('.pdpm-demo__comp-chevron');
        if (detail) {
          const isHidden = detail.style.display === 'none';
          detail.style.display = isHidden ? 'block' : 'none';
          row.classList.toggle('pdpm-demo__comp-row--expanded', isHidden);
          if (chevron) chevron.classList.toggle('pdpm-demo__comp-chevron--open', isHidden);
        }
      });
    });

    // Scroll to highlighted component category
    if (category && category !== 'hipps') {
      setTimeout(() => {
        const target = panel.querySelector(`[data-comp-key="${category}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
    /* ===== Demo Navigation Bar ===== */
    .demo-nav-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 44px;
      background: #1a1a2e;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      z-index: 100000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .demo-nav-bar__inner {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 20px;
      gap: 32px;
      max-width: 100%;
    }

    .demo-nav-bar__brand {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .demo-nav-bar__logo {
      width: 26px;
      height: 26px;
      background: linear-gradient(135deg, #6366f1, #818cf8);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: white;
    }

    .demo-nav-bar__title {
      font-weight: 600;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.95);
      letter-spacing: -0.2px;
    }

    .demo-nav-bar__links {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: 1;
    }

    .demo-nav-bar__link {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 6px 14px;
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.65);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .demo-nav-bar__link:hover {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.95);
      text-decoration: none;
    }

    .demo-nav-bar__link--active {
      background: rgba(99, 102, 241, 0.35);
      color: white;
    }

    .demo-nav-bar__link-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
    }

    .demo-nav-bar__link--active .demo-nav-bar__link-icon {
      opacity: 1;
    }

    .demo-nav-bar__link-icon svg {
      width: 14px;
      height: 14px;
    }

    .demo-nav-bar__link-label {
      font-weight: 500;
    }

    .demo-nav-bar__actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Offset body for nav bar */
    body {
      padding-top: 44px !important;
    }

    /* ===== FAB Button Styles ===== */
    @keyframes fabPulse {
      0%, 100% { box-shadow: 0 4px 12px rgba(25, 118, 210, 0.4); }
      50% { box-shadow: 0 4px 24px rgba(25, 118, 210, 0.6), 0 0 0 8px rgba(25, 118, 210, 0.1); }
    }
    .super-chat-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(25, 118, 210, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99998;
      transition: all 0.3s ease;
      animation: fabPulse 2s ease-in-out infinite;
    }

    .super-chat-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(25, 118, 210, 0.5);
    }

    /* Tooltip for FAB button */
    .super-chat-fab::before {
      content: 'Open Super Menu';
      position: absolute;
      right: 68px;
      top: 50%;
      transform: translateY(-50%) scale(0.9);
      background: #1f2937;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .super-chat-fab::after {
      content: '';
      position: absolute;
      right: 62px;
      top: 50%;
      transform: translateY(-50%);
      border: 6px solid transparent;
      border-left-color: #1f2937;
      opacity: 0;
      transition: all 0.2s;
    }
    .super-chat-fab:hover::before,
    .super-chat-fab:hover::after {
      opacity: 1;
      transform: translateY(-50%) scale(1);
    }
    .super-chat-fab--active::before,
    .super-chat-fab--active::after {
      display: none;
    }

    .super-chat-fab--active {
      transform: rotate(45deg);
    }

    .super-menu-fab__logo {
      width: 32px;
      height: 32px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: #1976d2;
    }

    .super-chat-fab--active .super-menu-fab__logo {
      display: none;
    }

    .super-chat-fab__icon--close {
      display: none;
      width: 24px;
      height: 24px;
      color: white;
    }

    .super-chat-fab--active .super-chat-fab__icon--close {
      display: block;
    }

    .super-menu-fab__badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 20px;
      height: 20px;
      background: #f44336;
      color: white;
      font-size: 11px;
      font-weight: 600;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 6px;
    }

    /* ===== Panel Styles ===== */
    .super-chat-panel {
      position: fixed;
      bottom: 92px;
      right: 24px;
      width: 440px;
      height: 620px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      z-index: 99997;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: all 0.3s ease;
      overflow: hidden;
    }

    .super-chat-panel--open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Header */
    .super-chat-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
      color: white;
      gap: 12px;
    }

    .super-menu-header__nav {
      display: flex;
      gap: 4px;
    }

    .super-menu-nav-btn {
      width: 36px;
      height: 36px;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .super-menu-nav-btn svg {
      width: 18px;
      height: 18px;
      color: rgba(255, 255, 255, 0.8);
    }

    .super-menu-nav-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .super-menu-nav-btn--active {
      background: rgba(255, 255, 255, 0.25);
    }

    .super-menu-nav-btn--active svg {
      color: white;
    }

    .super-chat-header__title {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .super-chat-header__logo {
      width: 28px;
      height: 28px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: #1976d2;
    }

    .super-menu-header__title-text {
      font-weight: 600;
      font-size: 15px;
    }

    .super-chat-header__actions {
      display: flex;
      gap: 4px;
    }

    .super-chat-header__btn {
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .super-chat-header__btn svg {
      width: 16px;
      height: 16px;
      color: rgba(255, 255, 255, 0.8);
    }

    .super-chat-header__btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .super-chat-header__btn:hover svg {
      color: white;
    }

    /* Content */
    .super-menu-content {
      flex: 1;
      overflow-y: auto;
    }

    /* ===== Demo Dashboard Styles ===== */
    .demo-dashboard, .demo-mds-analysis, .demo-chat {
      padding: 14px;
      height: 100%;
      overflow-y: auto;
      background: #fafbfc;
    }

    /* Stats Grid */
    .demo-stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }

    .demo-stat-card {
      background: white;
      border-radius: 10px;
      padding: 12px;
      display: flex;
      gap: 10px;
      border: 1px solid #e8eaed;
      transition: all 0.15s;
    }

    .demo-stat-card:hover {
      border-color: #d0d3d9;
    }

    .demo-stat-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .demo-stat-card--warning .demo-stat-icon {
      background: #fef7ed;
      color: #ea8600;
    }

    .demo-stat-card--info .demo-stat-icon {
      background: #eff6ff;
      color: #4b91f1;
    }

    .demo-stat-card--success .demo-stat-icon {
      background: #f0fdf4;
      color: #16a34a;
    }

    .demo-stat-card--primary .demo-stat-icon {
      background: #f4f3ff;
      color: #6366f1;
    }

    .demo-stat-icon svg {
      width: 18px;
      height: 18px;
    }

    .demo-stat-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .demo-stat-value {
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
      line-height: 1;
      margin-bottom: 3px;
    }

    .demo-stat-label {
      font-size: 11px;
      color: #6b7280;
      font-weight: 500;
    }

    .demo-section {
      margin-bottom: 16px;
    }

    .demo-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e8eaed;
    }

    .demo-section-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .demo-section-icon {
      color: #9ca3af;
      width: 16px;
      height: 16px;
    }

    .demo-section-title {
      font-weight: 600;
      color: #374151;
      font-size: 13px;
    }

    .demo-badge {
      background: #f3f4f6;
      color: #4b5563;
      padding: 3px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }

    .demo-badge--success {
      background: #f0fdf4;
      color: #15803d;
    }

    /* Query List - New Design */
    .demo-query-list-new {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .demo-query-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px;
      background: white;
      border: 1px solid #e8eaed;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .demo-query-row:hover {
      border-color: #cbd5e1;
      background: #fafbfc;
    }

    .demo-query-row--draft {
      border-left: 2px solid #f59e0b;
    }

    .demo-query-row--sent {
      border-left: 2px solid #6b7280;
    }

    .demo-query-row__left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }

    .demo-query-row__code {
      font-family: 'SF Mono', 'Courier New', monospace;
      font-weight: 600;
      color: #4b5563;
      background: #f3f4f6;
      padding: 4px 8px;
      border-radius: 5px;
      font-size: 11px;
      flex-shrink: 0;
    }

    .demo-query-row__info {
      flex: 1;
      min-width: 0;
    }

    .demo-query-row__desc {
      font-weight: 500;
      color: #1f2937;
      font-size: 12px;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .demo-query-row__patient {
      font-size: 11px;
      color: #6b7280;
    }

    .demo-query-row__status {
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .demo-query-row__status--draft {
      background: #fef7ed;
      color: #ea8600;
    }

    .demo-query-row__status--sent {
      background: #f3f4f6;
      color: #4b5563;
    }

    /* HIPPS Cards Grid */
    .demo-hipps-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .demo-hipps-card {
      background: white;
      border: 1px solid #d1fae5;
      border-radius: 10px;
      overflow: hidden;
      transition: all 0.15s;
    }

    .demo-hipps-card:hover {
      border-color: #a7f3d0;
      background: #fafffe;
    }

    .demo-hipps-card__header {
      padding: 10px;
      border-bottom: 1px solid #e8f5f0;
      background: #f7fefa;
    }

    .demo-hipps-card__patient {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .demo-hipps-card__patient-icon {
      width: 28px;
      height: 28px;
      background: #d1fae5;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #16a34a;
    }

    .demo-hipps-card__patient-icon svg {
      width: 14px;
      height: 14px;
    }

    .demo-hipps-card__patient-name {
      font-weight: 600;
      color: #374151;
      font-size: 12px;
    }

    .demo-hipps-card__meta {
      font-size: 10px;
      color: #6b7280;
    }

    .demo-hipps-card__body {
      padding: 12px 10px;
    }

    .demo-hipps-comparison {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 10px;
    }

    .demo-hipps-current,
    .demo-hipps-potential {
      text-align: center;
    }

    .demo-hipps-label {
      font-size: 9px;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .demo-hipps-code {
      font-family: 'SF Mono', 'Courier New', monospace;
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      background: #f9fafb;
      padding: 5px 10px;
      border-radius: 6px;
      display: inline-block;
      border: 1px solid #e5e7eb;
    }

    .demo-hipps-code--highlight {
      color: #15803d;
      background: #f0fdf4;
      border-color: #86efac;
    }

    .demo-hipps-arrow {
      color: #9ca3af;
      display: flex;
      align-items: center;
    }

    .demo-hipps-arrow svg {
      width: 18px;
      height: 18px;
    }

    .demo-hipps-revenue {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: #f0fdf4;
      border-radius: 6px;
      padding: 6px 10px;
      color: #15803d;
      font-weight: 600;
      font-size: 11px;
      border: 1px solid #d1fae5;
    }

    .demo-hipps-revenue svg {
      width: 12px;
      height: 12px;
      color: #15803d;
    }

    .demo-hipps-card__footer {
      padding: 10px;
      border-top: 1px solid #e8f5f0;
      background: #fafffe;
    }

    .demo-hipps-action-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 12px;
      background: #16a34a;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .demo-hipps-action-btn:hover {
      background: #15803d;
    }

    .demo-hipps-action-btn svg {
      width: 12px;
      height: 12px;
    }

    /* Empty State */
    .demo-empty-state {
      text-align: center;
      padding: 24px 16px;
      color: #9ca3af;
      font-size: 12px;
    }

    /* Scrollbar styling */
    .demo-dashboard::-webkit-scrollbar {
      width: 6px;
    }

    .demo-dashboard::-webkit-scrollbar-track {
      background: transparent;
    }

    .demo-dashboard::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    .demo-dashboard::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }

    /* Old query list styles (kept for compatibility) */
    .demo-query-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .demo-query-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .demo-query-item:hover {
      background: #e8e8e8;
    }

    .demo-query-code {
      font-family: monospace;
      font-weight: 600;
      color: #1976d2;
      background: white;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .demo-query-info {
      flex: 1;
    }

    .demo-query-desc {
      font-weight: 500;
      color: #333;
    }

    .demo-query-patient {
      font-size: 12px;
      color: #666;
    }

    .demo-query-status {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .demo-query-status--pending {
      background: #fff3e0;
      color: #e65100;
    }

    .demo-query-status--sent {
      background: #e3f2fd;
      color: #1565c0;
    }

    .demo-opportunity-card {
      background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #2e7d32;
    }

    .demo-opportunity-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .demo-arrow {
      color: #2e7d32;
    }

    .demo-opportunity-new {
      color: #2e7d32;
      font-weight: 600;
    }

    .demo-opportunity-detail {
      font-size: 13px;
      color: #555;
      margin-bottom: 12px;
    }

    .demo-icd10-btn {
      background: #1976d2;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .demo-icd10-btn:hover {
      background: #1565c0;
    }

    /* ===== MDS Analysis Styles ===== */
    .demo-mds-summary {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .demo-mds-hipps {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-bottom: 12px;
    }

    .demo-hipps-current, .demo-hipps-potential {
      text-align: center;
    }

    .demo-hipps-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
    }

    .demo-hipps-code {
      font-size: 24px;
      font-weight: 700;
      font-family: monospace;
      color: #333;
    }

    .demo-hipps-code--highlight {
      color: #2e7d32;
    }

    .demo-hipps-rate {
      font-size: 14px;
      color: #666;
    }

    .demo-hipps-arrow {
      font-size: 24px;
      color: #2e7d32;
    }

    .demo-hipps-diff {
      text-align: center;
      color: #2e7d32;
      font-weight: 600;
    }

    .demo-mds-components {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .demo-component {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
    }

    .demo-component--opportunity {
      background: #e8f5e9;
      border: 1px solid #2e7d32;
    }

    .demo-component-label {
      font-size: 12px;
      color: #666;
    }

    .demo-component-value {
      font-size: 18px;
      font-weight: 700;
      font-family: monospace;
    }

    .demo-component-desc {
      font-size: 11px;
      color: #888;
    }

    .demo-nta-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .demo-nta-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .demo-nta-item--suggested {
      background: #e8f5e9;
      border: 1px dashed #2e7d32;
    }

    .demo-nta-code {
      font-family: monospace;
      font-weight: 600;
    }

    .demo-empty {
      text-align: center;
      color: #888;
      padding: 16px;
      font-style: italic;
    }

    /* ===== Therapy Progress Styles ===== */
    .demo-therapy-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .demo-therapy-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .demo-therapy-label {
      width: 32px;
      font-weight: 600;
      font-size: 11px;
      color: #666;
    }

    .demo-therapy-bar {
      flex: 1;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    }

    .demo-therapy-fill {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #8bc34a);
      border-radius: 4px;
      transition: width 0.3s;
    }

    .demo-therapy-mins {
      font-size: 11px;
      color: #666;
      min-width: 60px;
      text-align: right;
    }

    /* ===== Chat Styles ===== */
    .demo-chat {
      display: flex;
      flex-direction: column;
    }

    .demo-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding-bottom: 16px;
    }

    .demo-chat-message {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .demo-chat-avatar {
      width: 32px;
      height: 32px;
      background: #1976d2;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      flex-shrink: 0;
    }

    .demo-chat-bubble {
      background: #f5f5f5;
      padding: 12px 16px;
      border-radius: 12px;
      max-width: 80%;
    }

    .demo-chat-bubble ul {
      margin: 8px 0 0 0;
      padding-left: 20px;
    }

    .demo-chat-bubble li {
      margin: 4px 0;
    }

    .demo-chat-input {
      display: flex;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
    }

    .demo-chat-textbox {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 20px;
      outline: none;
    }

    .demo-chat-textbox:focus {
      border-color: #1976d2;
    }

    .demo-chat-send {
      width: 40px;
      height: 40px;
      border: none;
      background: #1976d2;
      color: white;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ===== ICD-10 Modal Styles ===== */
    .demo-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 100000;
    }

    .demo-modal--open {
      display: block;
    }

    .demo-modal-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
    }

    .demo-modal-container {
      position: absolute;
      top: 20px;
      left: 20px;
      right: 20px;
      bottom: 20px;
      background: white;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .demo-modal-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      background: #1976d2;
      color: white;
      gap: 16px;
    }

    .demo-modal-back, .demo-modal-close {
      background: transparent;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
    }

    .demo-modal-title {
      flex: 1;
      font-weight: 600;
    }

    .demo-modal-body {
      flex: 1;
      overflow: hidden;
    }

    .demo-icd10-layout {
      display: grid;
      grid-template-columns: 280px 1fr 1fr;
      height: 100%;
    }

    .demo-icd10-sidebar {
      background: #f5f5f5;
      border-right: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
    }

    .demo-icd10-categories {
      border-bottom: 1px solid #e0e0e0;
    }

    .demo-icd10-cat {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px;
      cursor: pointer;
      border-left: 3px solid transparent;
    }

    .demo-icd10-cat:hover {
      background: #e8e8e8;
    }

    .demo-icd10-cat--active {
      background: white;
      border-left-color: #1976d2;
    }

    .demo-icd10-codes {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .demo-icd10-code {
      padding: 12px;
      background: white;
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      border: 2px solid transparent;
    }

    .demo-icd10-code:hover {
      border-color: #e0e0e0;
    }

    .demo-icd10-code--active {
      border-color: #1976d2;
    }

    .demo-icd10-code--suggested {
      background: #e8f5e9;
      border-color: #2e7d32;
    }

    .demo-code-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .demo-code-icd {
      font-family: monospace;
      font-weight: 700;
      color: #1976d2;
    }

    .demo-code-pts {
      font-size: 12px;
      color: #2e7d32;
      font-weight: 600;
    }

    .demo-code-desc {
      font-size: 13px;
      color: #333;
      margin-bottom: 4px;
    }

    .demo-code-evidence {
      font-size: 11px;
      color: #888;
    }

    .demo-icd10-evidence {
      border-right: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
    }

    .demo-evidence-header {
      padding: 12px 16px;
      font-weight: 600;
      border-bottom: 1px solid #e0e0e0;
    }

    .demo-evidence-cards {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .demo-evidence-card {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .demo-evidence-type {
      font-weight: 600;
      color: #1976d2;
    }

    .demo-evidence-date {
      font-size: 12px;
      color: #888;
      margin-bottom: 8px;
    }

    .demo-evidence-text {
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .demo-evidence-text mark {
      background: #fff59d;
      padding: 0 2px;
    }

    .demo-evidence-view {
      background: white;
      border: 1px solid #ddd;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .demo-icd10-pdf {
      display: flex;
      flex-direction: column;
      background: #eee;
    }

    .demo-pdf-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background: #333;
      color: white;
    }

    .demo-pdf-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .demo-pdf-controls button {
      background: #555;
      border: none;
      color: white;
      width: 24px;
      height: 24px;
      cursor: pointer;
    }

    .demo-pdf-viewer {
      flex: 1;
      overflow: auto;
      padding: 20px;
      display: flex;
      justify-content: center;
    }

    .demo-pdf-page {
      background: white;
      width: 600px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: Georgia, serif;
      line-height: 1.6;
    }

    .demo-highlight {
      background: #fff59d;
      padding: 0 2px;
    }

    /* ===== Quick Actions ===== */
    .demo-quick-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .demo-action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: #333;
      transition: all 0.2s;
    }

    .demo-action-btn:hover {
      background: #e8e8e8;
      border-color: #1976d2;
    }

    .demo-action-btn svg {
      color: #1976d2;
    }

    /* ===== MAR/TAR Table Styles ===== */
    .demo-mar-table {
      width: 100%;
      border-collapse: collapse;
    }

    .demo-mar-table th,
    .demo-mar-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    .demo-mar-table th {
      background: #f9fafb;
      font-weight: 600;
      font-size: 13px;
      color: #374151;
    }

    .demo-mar-table td {
      font-size: 14px;
    }

    .demo-mar-route,
    .demo-mar-status,
    .demo-tar-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .demo-mar-route--po { background: #dbeafe; color: #1e40af; }
    .demo-mar-route--inh { background: #fef3c7; color: #92400e; }
    .demo-mar-route--iv { background: #fee2e2; color: #991b1b; }
    .demo-mar-route--im { background: #ede9fe; color: #5b21b6; }

    .demo-mar-status--active,
    .demo-tar-status--active { background: #dcfce7; color: #166534; }
    .demo-mar-status--prn { background: #fef3c7; color: #92400e; }
    .demo-mar-status--hold { background: #fee2e2; color: #991b1b; }

    /* MAR Timeline */
    .demo-mar-timeline {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .demo-mar-time-slot {
      display: flex;
      gap: 16px;
      padding: 12px;
      border-radius: 8px;
    }

    .demo-mar-time {
      font-weight: 600;
      font-family: monospace;
      min-width: 50px;
      color: #4b5563;
    }

    .demo-mar-admin {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .demo-mar-admin--given {
      background: #f0fdf4;
    }

    .demo-mar-time-slot:has(.demo-mar-admin--given) {
      background: #f0fdf4;
    }

    .demo-mar-time-slot:has(.demo-mar-admin--upcoming) {
      background: #fefce8;
    }

    .demo-mar-checkmark {
      color: #16a34a;
      font-weight: bold;
    }

    .demo-mar-pending {
      color: #ca8a04;
    }

    /* Therapy Progress Bars */
    .demo-therapy-progress-ring {
      text-align: center;
      padding: 12px;
      margin-bottom: 8px;
    }

    .demo-therapy-progress-value {
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
    }

    .demo-therapy-progress-label {
      font-size: 11px;
      color: #6b7280;
    }

    .demo-therapy-bar-wrapper {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }

    .demo-therapy-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }

    /* ============================================
       PDPM ANALYZER SLIDE-OUT PANEL
       ============================================ */

    .pdpm-demo__overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483641;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .pdpm-demo__overlay--open {
      pointer-events: auto;
    }
    .pdpm-demo__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .pdpm-demo__overlay--open .pdpm-demo__backdrop {
      opacity: 1;
    }
    .pdpm-demo__drawer {
      position: absolute;
      top: 0;
      right: 0;
      width: 440px;
      max-width: calc(100vw - 40px);
      height: 100%;
      max-height: 100vh;
      background: #fff;
      box-shadow: -8px 0 30px rgba(0, 0, 0, 0.18);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .pdpm-demo__overlay--open .pdpm-demo__drawer {
      transform: translateX(0);
    }

    /* Header */
    .pdpm-demo__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
      flex-shrink: 0;
    }
    .pdpm-demo__header-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pdpm-demo__title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }
    .pdpm-demo__subtitle {
      font-size: 12px;
      color: #6b7280;
    }
    .pdpm-demo__close {
      background: none;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      width: 32px;
      height: 32px;
      font-size: 18px;
      color: #6b7280;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .pdpm-demo__close:hover {
      background: #f3f4f6;
      color: #111827;
    }

    /* Body */
    .pdpm-demo__body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 14px 16px;
    }
    .pdpm-demo__body::-webkit-scrollbar { width: 5px; }
    .pdpm-demo__body::-webkit-scrollbar-track { background: transparent; }
    .pdpm-demo__body::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
    .pdpm-demo__body::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
    .pdpm-demo__body-inner {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* HIPPS Display */
    .pdpm-demo__hipps {
      text-align: center;
      padding: 6px 0;
    }
    .pdpm-demo__hipps-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }
    .pdpm-demo__hipps-block {
      text-align: center;
    }
    .pdpm-demo__hipps-label {
      font-size: 10px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .pdpm-demo__hipps-code {
      font-size: 24px;
      font-weight: 800;
      color: #111827;
      letter-spacing: 1.5px;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    .pdpm-demo__hipps-code--potential {
      color: #059669;
    }
    .pdpm-demo__hipps-arrow {
      font-size: 18px;
      color: #9ca3af;
    }

    /* Payment Card */
    .pdpm-demo__payment-card {
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .pdpm-demo__payment-label {
      font-size: 10px;
      color: #059669;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .pdpm-demo__payment-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pdpm-demo__payment-current {
      font-size: 15px;
      color: #374151;
    }
    .pdpm-demo__payment-arrow {
      color: #9ca3af;
    }
    .pdpm-demo__payment-potential {
      font-size: 15px;
      font-weight: 600;
      color: #059669;
    }
    .pdpm-demo__payment-delta {
      font-size: 13px;
      font-weight: 700;
      color: #059669;
      background: #dcfce7;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: auto;
    }

    /* Opportunity Rows */
    .pdpm-demo__opps {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: #f3f4f6;
      border-radius: 6px;
      overflow: hidden;
    }
    .pdpm-demo__opp-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      background: #fff;
      cursor: pointer;
      transition: background 0.15s;
    }
    .pdpm-demo__opp-row:hover {
      background: #fefce8;
    }
    .pdpm-demo__opp-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .pdpm-demo__opp-code {
      font-size: 12px;
      font-weight: 700;
      color: #1e40af;
      font-family: monospace;
      flex-shrink: 0;
    }
    .pdpm-demo__opp-name {
      font-size: 13px;
      color: #374151;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pdpm-demo__opp-go {
      color: #9ca3af;
      flex-shrink: 0;
    }
    .pdpm-demo__impact-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: 10px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      padding: 1px 6px;
      flex-shrink: 0;
    }
    .pdpm-demo__chip-k {
      font-weight: 700;
      color: #1e40af;
    }
    .pdpm-demo__chip-v {
      color: #3b82f6;
    }

    /* Cards */
    .pdpm-demo__card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .pdpm-demo__card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    .pdpm-demo__card-header--collapsible {
      cursor: pointer;
      user-select: none;
    }
    .pdpm-demo__card-header--collapsible:hover {
      background: #f3f4f6;
    }
    .pdpm-demo__card-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .pdpm-demo__card-title {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
      flex: 1;
    }
    .pdpm-demo__card-badge {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      background: #e5e7eb;
      padding: 1px 8px;
      border-radius: 10px;
    }
    .pdpm-demo__card-badge--pending {
      color: #d97706;
      background: #fef3c7;
    }
    .pdpm-demo__card-chevron {
      transition: transform 0.2s;
      color: #9ca3af;
      flex-shrink: 0;
    }
    .pdpm-demo__card-chevron--open {
      transform: rotate(180deg);
    }
    .pdpm-demo__card-body {
      padding: 8px 12px;
    }

    /* Component Breakdown */
    .pdpm-demo__comp-row {
      border-bottom: 1px solid #f3f4f6;
    }
    .pdpm-demo__comp-row:last-child {
      border-bottom: none;
    }
    .pdpm-demo__comp-row--improved {
      background: linear-gradient(90deg, transparent, #f0fdf4);
    }
    .pdpm-demo__comp-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .pdpm-demo__comp-header:hover {
      background: #f9fafb;
    }
    .pdpm-demo__comp-label {
      font-size: 12px;
      font-weight: 700;
      color: #6b7280;
      width: 52px;
      flex-shrink: 0;
    }
    .pdpm-demo__comp-name {
      font-size: 13px;
      color: #374151;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pdpm-demo__comp-code {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      font-family: monospace;
      flex-shrink: 0;
    }
    .pdpm-demo__comp-change {
      font-size: 12px;
      font-weight: 600;
      color: #059669;
      flex-shrink: 0;
    }
    .pdpm-demo__comp-chevron {
      transition: transform 0.2s;
      color: #9ca3af;
      flex-shrink: 0;
    }
    .pdpm-demo__comp-chevron--open {
      transform: rotate(180deg);
    }
    .pdpm-demo__comp-detail {
      padding: 0 14px 12px;
    }
    .pdpm-demo__comp-qualifier {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #f9fafb;
      border-radius: 4px;
    }

    /* Component items */
    .pdpm-demo__captured-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #9ca3af;
      margin: 8px 0 4px;
    }
    .pdpm-demo__captured-label--opps {
      color: #d97706;
    }
    .pdpm-demo__ci-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .pdpm-demo__ci-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .pdpm-demo__ci-row:hover {
      background: #fefce8;
    }
    .pdpm-demo__ci-row--captured {
      opacity: 0.7;
    }
    .pdpm-demo__ci-row--captured:hover {
      opacity: 1;
      background: #f0fdf4;
    }
    .pdpm-demo__ci-check {
      color: #059669;
      font-size: 12px;
      margin-top: 1px;
      flex-shrink: 0;
    }
    .pdpm-demo__ci-code {
      font-size: 11px;
      font-weight: 700;
      color: #1e40af;
      font-family: monospace;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .pdpm-demo__ci-body {
      flex: 1;
      min-width: 0;
    }
    .pdpm-demo__ci-name {
      font-size: 12px;
      color: #374151;
      display: block;
    }
    .pdpm-demo__ci-help {
      font-size: 11px;
      color: #9ca3af;
      display: block;
    }
    .pdpm-demo__ci-pts {
      font-size: 11px;
      font-weight: 600;
      color: #059669;
      background: #dcfce7;
      padding: 1px 6px;
      border-radius: 4px;
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* NTA Level Track */
    .pdpm-demo__nta-track {
      padding: 4px 14px 8px;
    }
    .pdpm-demo__nta-bar {
      position: relative;
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 4px;
    }
    .pdpm-demo__nta-bar-cur {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: #3b82f6;
      border-radius: 3px;
    }
    .pdpm-demo__nta-bar-gain {
      position: absolute;
      top: 0;
      height: 100%;
      background: repeating-linear-gradient(
        -45deg,
        #86efac,
        #86efac 3px,
        #bbf7d0 3px,
        #bbf7d0 6px
      );
      border-radius: 0 3px 3px 0;
    }
    .pdpm-demo__nta-lvls {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .pdpm-demo__nta-lvl {
      font-size: 10px;
      color: #9ca3af;
      font-family: monospace;
    }
    .pdpm-demo__nta-lvl--cur {
      color: #3b82f6;
      font-weight: 700;
    }
    .pdpm-demo__nta-lvl--tgt {
      color: #059669;
      font-weight: 700;
    }
    .pdpm-demo__nta-away {
      font-size: 11px;
      color: #6b7280;
    }

    /* SLP Tier */
    .pdpm-demo__tier-row {
      padding: 2px 14px 6px;
      font-size: 11px;
      color: #6b7280;
      display: flex;
      gap: 8px;
    }
    .pdpm-demo__tier-segment {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    /* Query list */
    .pdpm-demo__query-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .pdpm-demo__query-item,
    .pdpm-demo__signed-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-bottom: 1px solid #f3f4f6;
      flex-wrap: wrap;
    }
    .pdpm-demo__query-item:last-child,
    .pdpm-demo__signed-item:last-child {
      border-bottom: none;
    }
    .pdpm-demo__query-main {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }
    .pdpm-demo__query-code {
      font-size: 11px;
      font-weight: 700;
      color: #1e40af;
      font-family: monospace;
      flex-shrink: 0;
    }
    .pdpm-demo__query-code--signed {
      color: #059669;
    }
    .pdpm-demo__query-text {
      font-size: 13px;
      color: #374151;
      flex: 1;
    }
    .pdpm-demo__query-pill {
      font-size: 11px;
      color: #d97706;
      background: #fef3c7;
      padding: 2px 8px;
      border-radius: 10px;
      flex-shrink: 0;
    }
    .pdpm-demo__query-date {
      font-size: 11px;
      color: #9ca3af;
    }
    .pdpm-demo__signed-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }
    .pdpm-demo__signed-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .pdpm-demo__signed-badge--coding {
      color: #d97706;
      background: #fef3c7;
      font-weight: 600;
    }
    .pdpm-demo__signed-item--needs-coding {
      background: #fffbeb;
    }

    /* Clinical Scores */
    .pdpm-demo__scores {
      display: flex;
      justify-content: space-around;
      padding: 12px 8px;
      gap: 8px;
    }
    .pdpm-demo__sc {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .pdpm-demo__sc-ring {
      position: relative;
      width: 52px;
      height: 52px;
    }
    .pdpm-demo__sc-ring svg {
      display: block;
    }
    .pdpm-demo__sc-val {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: #111827;
    }
    .pdpm-demo__sc-label {
      font-size: 11px;
      color: #6b7280;
    }
    .pdpm-demo__sc-severity {
      font-size: 10px;
      font-weight: 600;
    }

    /* Compliance */
    .pdpm-demo__compliance-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #f9fafb;
    }
    .pdpm-demo__compliance-row:last-child {
      border-bottom: none;
    }
    .pdpm-demo__compliance-icon {
      font-size: 14px;
      flex-shrink: 0;
      width: 20px;
      text-align: center;
    }
    .pdpm-demo__compliance-icon--pass {
      color: #059669;
    }
    .pdpm-demo__compliance-icon--fail {
      color: #ef4444;
    }
    .pdpm-demo__compliance-label {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
      width: 80px;
      flex-shrink: 0;
    }
    .pdpm-demo__compliance-msg {
      font-size: 12px;
      color: #6b7280;
      flex: 1;
    }

    /* Section Progress */
    .pdpm-demo__sp-bar-row {
      margin-bottom: 8px;
    }
    .pdpm-demo__sp-bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .pdpm-demo__sp-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .pdpm-demo__sp-counts {
      display: flex;
      gap: 12px;
      font-size: 11px;
    }
    .pdpm-demo__sp-count--done { color: #059669; }
    .pdpm-demo__sp-count--wip { color: #d97706; }
    .pdpm-demo__sp-count--todo { color: #9ca3af; }
    .pdpm-demo__sp-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .pdpm-demo__sp-tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 500;
    }
    .pdpm-demo__sp-tag--done {
      background: #dcfce7;
      color: #059669;
    }
    .pdpm-demo__sp-tag--wip {
      background: #fef3c7;
      color: #d97706;
    }
    .pdpm-demo__sp-tag--todo {
      background: #f3f4f6;
      color: #9ca3af;
    }
    `;
    document.head.appendChild(style);
  }
})();
