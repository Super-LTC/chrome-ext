// Super Menu Initialization

// Inject "AI Code Patient" button on Med Diag pages
function injectAICodeButton() {
  if (!window.location.href.includes('medDiagChart') && !window.location.href.includes('meddiag')) return;
  if (document.getElementById('super-ai-code-btn')) return;

  // Create a styled button that stands out but fits alongside PCC buttons
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'super-ai-code-btn';
  btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">` +
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>` +
    `</svg>AI Code Patient</span>`;
  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 4px 14px;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff;
    font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 8px;
    vertical-align: middle;
    box-shadow: 0 1px 3px rgba(79,70,229,0.4);
    transition: all 0.15s ease;
    letter-spacing: 0.01em;
  `;
  btn.addEventListener('click', () => {
    if (window.ICD10Viewer) {
      window.ICD10Viewer.open();
    }
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'linear-gradient(135deg, #818cf8, #6366f1)';
    btn.style.boxShadow = '0 2px 8px rgba(99,102,241,0.5)';
    btn.style.transform = 'translateY(-1px)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
    btn.style.boxShadow = '0 1px 3px rgba(79,70,229,0.4)';
    btn.style.transform = 'translateY(0)';
  });

  // Target: the .dropDownButtonContainer in the pccModuleHeader that has the Reports button
  const reportsBtn = document.querySelector('.pccModuleHeader .dropDownButtonContainer .pccButton[value*="Reports"]');
  if (reportsBtn) {
    const container = reportsBtn.closest('.dropDownButtonContainer');
    container.appendChild(btn);
  } else {
    // Fallback: any .pccModuleHeader cell
    const headerCell = document.querySelector('td.pccModuleHeader');
    if (headerCell) {
      headerCell.appendChild(btn);
    } else {
      // Last fallback: insert before the diagnosis table
      const table = document.querySelector('#meddiaglisting, .pccResults, [id*="meddiag"]');
      if (table) {
        table.parentNode.insertBefore(btn, table);
      }
    }
  }

  // Only show test button in dev/demo mode
  if (_isTestMode()) {
    _injectTestAddCodeButton(btn);
  }
}

// Inject "est" links on the MDS list page (cp_mds.jsp) for 5-Day assessments
function injectMdsEstimateLinks() {
  if (!window.location.href.includes('cp_mds.jsp')) return;

  // cp_mds.jsp now carries an ephemeral EID_ token in its URL; resolve the
  // stable numeric id from the page so the injected links use a storable id.
  // On fully-flipped pages there is NO numeric client id anywhere — the MRN
  // (resident header, via appendMDSContextParams) is the patient anchor then,
  // so keep injecting as long as either exists.
  const patientId = window.resolveStableClientId?.() || '';
  const mrn = window.scrapePccPublicIdFromDOM?.() || '';
  if (!patientId && !mrn) return;

  // Find all assessment rows in the MDS table
  const rows = document.querySelectorAll('tr[bgcolor] td:first-child');
  rows.forEach(td => {
    // Check if this row is a 5-Day assessment by looking at the description cell
    const descCell = td.parentElement?.querySelector('td:nth-child(3)');
    const desc = descCell?.textContent?.trim() || '';
    const is5Day = desc.toLowerCase().includes('5 day') || desc.toLowerCase().includes('5-day');
    if (!is5Day) return;

    // Extract the NUMERIC assessment ID: edit/view link first, then the
    // pdpmAnalyzer(...) call in the HIPPS cell (which keeps the numeric id
    // even after the row links flip to EID_ tokens). A flipped row with no
    // HIPPS yields null — the backend then finds the closest 5-Day via the
    // patient anchor (numeric id or MRN), so still inject the link.
    const rowHtml = td.parentElement?.outerHTML || '';
    const assessmentId = rowHtml.match(/ESOLassessid=(\d+)/)?.[1] || null;

    // Don't inject twice
    if (td.querySelector('.super-est-link')) return;

    const link = document.createElement('a');
    link.className = 'listbutton super-est-link';
    link.href = 'javascript:void(0)';
    link.textContent = 'est';
    link.title = 'PDPM Estimate & ARD Recommendation';
    link.style.cssText = 'color:#4f46e5;font-weight:600;';
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const [{ render, h }, { ArdEstimator }] = await Promise.all([
          import('preact'),
          import('../modules/ard-estimator/ArdEstimator.jsx')
        ]);

        // Create overlay
        let overlay = document.getElementById('ard-estimator-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'ard-estimator-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999980;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;';
        document.body.appendChild(overlay);

        const container = document.createElement('div');
        container.style.cssText = 'width:90vw;max-width:750px;height:85vh;border-radius:12px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.25);display:flex;flex-direction:column;transition:max-width 0.25s ease,height 0.15s ease;';
        overlay.appendChild(container);

        const orgResponse = typeof getOrg === 'function' ? getOrg() : null;
        const facilityName = typeof getChatFacilityInfo === 'function' ? getChatFacilityInfo() : '';

        const closeOverlay = () => {
          render(null, container);
          overlay.remove();
        };

        overlay.addEventListener('click', (ev) => {
          if (ev.target === overlay) closeOverlay();
        });

        render(
          h(ArdEstimator, {
            patientId,
            facilityName: facilityName || '',
            orgSlug: orgResponse?.org || '',
            assessmentId,
            onBack: closeOverlay,
            onClose: closeOverlay
          }),
          container
        );
      } catch (err) {
        console.error('[Super] Failed to open ARD Estimator:', err);
        window.SuperAnalytics?.track?.('error_caught', {
          surface: 'ard_estimator_open',
          error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        });
      }
    });

    // Add after the last link
    td.appendChild(document.createTextNode('\u00a0\u00a0'));
    td.appendChild(link);
  });
}

/**
 * Check if we're in test/dev mode
 */
function _isTestMode() {
  return window.location.hostname === 'localhost' ||
         window.location.protocol === 'file:' ||
         window.location.hostname.includes('netlify.app') ||
         window.ICD10_USE_MOCK_DATA === true ||
         window.__DEMO_MODE === true;
}

/**
 * Inject a test button for manually adding a code to PCC (dev/demo only)
 */
function _injectTestAddCodeButton(siblingBtn) {
  if (document.getElementById('super-test-add-code-btn')) return;

  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.id = 'super-test-add-code-btn';
  testBtn.textContent = 'Test Add Code';
  testBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    background: #ff9800;
    color: #fff;
    font: 600 11px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 6px;
    vertical-align: middle;
  `;

  testBtn.addEventListener('click', () => {
    _showTestAddCodeDialog();
  });

  siblingBtn.parentNode.insertBefore(testBtn, siblingBtn.nextSibling);
}

/**
 * Show a simple test dialog for adding a code directly
 */
function _showTestAddCodeDialog() {
  // Remove existing dialog if any
  const existing = document.getElementById('super-test-add-dialog');
  if (existing) existing.remove();

  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

  const dialog = document.createElement('div');
  dialog.id = 'super-test-add-dialog';
  dialog.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    padding: 24px; z-index: 999999; width: 360px; font-family: -apple-system, sans-serif;
  `;

  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px; font-size: 16px; color: #333;">Test Add Code to PCC</h3>
    <div style="margin-bottom: 12px;">
      <label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">ICD-10 Code</label>
      <input id="test-icd-code" type="text" value="E11.9" placeholder="e.g. E11.9"
        style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; box-sizing: border-box;" />
    </div>
    <div style="margin-bottom: 16px;">
      <label style="display:block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Effective Date</label>
      <input id="test-icd-date" type="date" value="${today.toISOString().split('T')[0]}"
        style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; box-sizing: border-box;" />
    </div>
    <div id="test-add-status" style="font-size: 13px; color: #666; margin-bottom: 12px; min-height: 20px;"></div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <!-- NO_TRACK: dev-only test dialog cancel -->
      <button id="test-add-cancel" style="padding: 8px 16px; background: #eee; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancel</button>
      <!-- NO_TRACK: dev-only test dialog action (manual ICD-10 add for QA) -->
      <button id="test-add-confirm" style="padding: 8px 16px; background: #4caf50; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Add to PCC</button>
    </div>
  `;

  document.body.appendChild(dialog);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'super-test-add-backdrop';
  backdrop.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 999998;';
  backdrop.addEventListener('click', () => { dialog.remove(); backdrop.remove(); });
  document.body.appendChild(backdrop);

  dialog.querySelector('#test-add-cancel').addEventListener('click', () => {
    dialog.remove(); backdrop.remove();
  });

  dialog.querySelector('#test-add-confirm').addEventListener('click', async () => {
    const code = dialog.querySelector('#test-icd-code').value.trim();
    const rawDate = dialog.querySelector('#test-icd-date').value;
    // Convert YYYY-MM-DD from date picker to MM/DD/YYYY for PCC
    const [yr, mo, dy] = rawDate.split('-');
    const date = mo && dy && yr ? `${mo}/${dy}/${yr}` : '';
    const statusEl = dialog.querySelector('#test-add-status');
    const confirmBtn = dialog.querySelector('#test-add-confirm');

    if (!code || !date) {
      statusEl.textContent = 'Code and date are required';
      statusEl.style.color = '#c62828';
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Adding...';
    statusEl.textContent = 'Looking up code in PCC...';
    statusEl.style.color = '#666';

    try {
      // Get patient ID — prefer the stable numeric id (the URL may carry an
      // ephemeral EID_ token).
      const urlParams = new URLSearchParams(window.location.search);
      const clientId = window.resolveStableClientId?.() || urlParams.get('ESOLclientid');

      if (!clientId) {
        statusEl.textContent = 'Could not find patient ID (ESOLclientid) in URL';
        statusEl.style.color = '#c62828';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Add to PCC';
        return;
      }

      // Step 1: Look up code
      const lookup = await PCCDiagnosisClient.lookupCode(code);
      statusEl.textContent = `Found: ${lookup.code} (ID: ${lookup.diagnosisId}). Submitting...`;

      // Step 2: Get rank
      const rankOptions = await PCCDiagnosisClient.fetchRankOptions(clientId);
      const rankId = PCCDiagnosisClient.autoSelectRank(rankOptions);

      // Step 3: Submit
      const result = await PCCDiagnosisClient.submitDiagnosis({
        clientId,
        diagnosisId: lookup.diagnosisId,
        icd10Code: lookup.code,
        description: lookup.name,
        onsetDate: date,
        rankId
      });

      if (result.success) {
        statusEl.textContent = `Success! ${code} added to PCC.`;
        statusEl.style.color = '#2e7d32';
        confirmBtn.textContent = 'Done';
        setTimeout(() => { dialog.remove(); backdrop.remove(); }, 2000);
      } else {
        window.SuperAnalytics?.track?.('error_shown', {
          surface: 'icd10_add_pcc',
          error_code: (window.SuperAnalytics?.toErrorCode?.(result.error) ?? 'unknown'),
          error_type: 'api_error',
        });
        statusEl.textContent = `Failed: ${result.error}`;
        statusEl.style.color = '#c62828';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Add to PCC';
      }
    } catch (err) {
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'icd10_add_pcc',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = '#c62828';
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Add to PCC';
    }
  });
}

async function checkAuthAndPrompt() {
  try {
    const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!authState.authenticated) {
      showLoginBar();
    }
  } catch (e) {
    console.warn('Super Menu: Auth check failed:', e);
    showLoginBar();
  }
}

function showLoginBar() {
  if (document.getElementById('super-login-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'super-login-bar';
  bar.innerHTML = `
    <div class="super-login-bar__content">
      <span class="super-login-bar__logo">S</span>
      <span class="super-login-bar__text">Super LTC is ready — log in to get started</span>
      <!-- NO_TRACK: user_logged_in fires post-OAuth completion via storage listener -->
      <button class="super-login-bar__btn" id="super-login-bar-btn">Log In</button>
      <!-- NO_TRACK: pure-UI dismiss of login bar -->
      <button class="super-login-bar__dismiss" id="super-login-bar-dismiss" title="Dismiss">&times;</button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #super-login-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 999999;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: super-login-slide-down 0.3s ease-out;
    }
    @keyframes super-login-slide-down {
      from { transform: translateY(-100%); }
      to { transform: translateY(0); }
    }
    .super-login-bar__content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      max-width: 100%;
    }
    .super-login-bar__logo {
      background: rgba(255,255,255,0.2);
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
      flex-shrink: 0;
    }
    .super-login-bar__text {
      flex: 1;
    }
    .super-login-bar__btn {
      background: white;
      color: #4f46e5;
      border: none;
      padding: 6px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .super-login-bar__btn:hover {
      background: #eef2ff;
    }
    .super-login-bar__dismiss {
      background: none;
      border: none;
      color: rgba(255,255,255,0.7);
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      flex-shrink: 0;
    }
    .super-login-bar__dismiss:hover {
      color: white;
    }
  `;
  bar.appendChild(style);
  document.body.appendChild(bar);

  document.getElementById('super-login-bar-btn').addEventListener('click', async () => {
    const btn = document.getElementById('super-login-bar-btn');
    btn.textContent = 'Opening...';
    btn.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'LOGIN' });
      if (response.success && response.authUrl) {
        window.open(response.authUrl, '_blank');
        bar.remove();
      } else {
        btn.textContent = 'Failed — try again';
        btn.disabled = false;
      }
    } catch (e) {
      btn.textContent = 'Failed — try again';
      btn.disabled = false;
    }
  });

  document.getElementById('super-login-bar-dismiss').addEventListener('click', () => {
    bar.remove();
  });
}

// Listen for auth changes to dismiss the bar
chrome.storage.onChanged.addListener((changes) => {
  if (changes.authToken && changes.authToken.newValue) {
    const bar = document.getElementById('super-login-bar');
    if (bar) bar.remove();
  }
});

function initSuperChat() {
  if (SuperMenu.initialized) {
    console.log('Super Menu: Already initialized');
    return;
  }

  console.log('Super Menu: Initializing');

  // Check auth and show login bar if needed
  checkAuthAndPrompt();

  // Check for patient ID (for chat functionality)
  const patientId = getChatPatientId();
  if (patientId) {
    console.log('Super Menu: Patient context detected:', patientId);
    // Load existing chat session
    loadChatSession();
  }

  // Create dual bubble launcher (MDS + Chat)
  createBubbles();

  // Inject AI Code button on Med Diag pages
  injectAICodeButton();

  // Augment the meddiag listing table with CP + Query columns
  if (window.MedDiagAugment?.init) {
    const urlPid = window.resolveStableClientId?.();
    const ctxPid = (typeof getChatPatientId === 'function') ? getChatPatientId() : null;
    const facName = (typeof getChatFacilityInfo === 'function') ? getChatFacilityInfo() : '';
    const orgInfo = (typeof getOrg === 'function') ? getOrg() : null;
    window.MedDiagAugment.init({
      patientId: urlPid || ctxPid,
      facilityName: facName || '',
      orgSlug: orgInfo?.org || '',
    });
  }

  // Inject ARD Estimate links on MDS list page
  injectMdsEstimateLinks();

  // Restore Command Center or auto-open PDPM Analyzer on MDS pages
  try {
    const restore = sessionStorage.getItem('super_cc_restore');
    if (restore) {
      sessionStorage.removeItem('super_cc_restore');
      const state = JSON.parse(restore);
      // Only restore if saved within last 30 seconds
      if (state.timestamp && (Date.now() - state.timestamp) < 30000) {
        setTimeout(() => {
          if (state.openAnalyzer) {
            const context = getMDSContext();
            if (context.assessmentId) {
              // Clear any prior dismissal — user explicitly navigated here from Command Center
              sessionStorage.removeItem('super_analyzer_dismissed');
              PDPMAnalyzerLauncher.open(context, { mode: state.analyzerMode || 'panel' });
            }
          } else {
            MDSCommandCenterLauncher.open({ initialExpandedId: state.expandedId });
          }
        }, 800);
      }
    } else {
      // Show edge tab on MDS section pages (user can click to open analyzer)
      setTimeout(() => {
        const context = getMDSContext();
        if (context.scope === 'mds' && context.assessmentId) {
          PDPMAnalyzerLauncher._showEdgeTab(context);
        }
      }, 800);
    }
  } catch (_) {}

  SuperMenu.initialized = true;
  console.log('Super Menu: Initialization complete');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initSuperChat, 500);
  });
} else {
  setTimeout(initSuperChat, 500);
}

// Re-check on URL changes (SPA navigation)
let chatLastUrl = window.location.href;
let lastContext = null;

const chatUrlObserver = new MutationObserver(() => {
  if (window.location.href !== chatLastUrl) {
    const oldUrl = chatLastUrl;
    chatLastUrl = window.location.href;

    // Get old and new context
    const oldPatientId = new URL(oldUrl).searchParams.get('ESOLclientid');
    const newPatientId = getChatPatientId();
    const newContext = getMDSContext();

    // Check if patient context changed
    if (oldPatientId !== newPatientId) {
      console.log('Super Menu: Patient context changed, updating chat session');
      if (newPatientId) {
        loadChatSession();
      }
    }

    // Track context changes and clear MDS cache on navigation
    const scopeChanged = !lastContext ||
                         lastContext.scope !== newContext.scope ||
                         lastContext.patientId !== newContext.patientId ||
                         lastContext.assessmentId !== newContext.assessmentId;

    if (scopeChanged) {
      console.log('Super Menu: Context changed from', lastContext?.scope, 'to', newContext.scope);
      lastContext = newContext;

      if (typeof MDSViewState !== 'undefined') {
        MDSViewState.data = null;
        MDSViewState.context = newContext;
        MDSViewState.manualContext = null;
      }
    }

    // Invalidate dashboard cache on navigation (data might have changed)
    if (window.DashboardState) {
      DashboardState.invalidateCache();
    }

    // Update FAB patient button visibility based on context
    if (typeof updateBubblesContext === 'function') {
      updateBubblesContext();
    }

    // Re-inject AI Code button if navigated to Med Diag page
    injectAICodeButton();

    // Re-init meddiag augment if patient or page changed
    if (window.MedDiagAugment?.init) {
      const urlPid = window.resolveStableClientId?.();
      const ctxPid = (typeof getChatPatientId === 'function') ? getChatPatientId() : null;
      const facName = (typeof getChatFacilityInfo === 'function') ? getChatFacilityInfo() : '';
      const orgInfo = (typeof getOrg === 'function') ? getOrg() : null;
      window.MedDiagAugment.init({
        patientId: urlPid || ctxPid,
        facilityName: facName || '',
        orgSlug: orgInfo?.org || '',
      });
    }
  }
});

chatUrlObserver.observe(document.body, { childList: true, subtree: true });

// Initialize context tracking
setTimeout(() => {
  if (typeof getMDSContext === 'function') {
    lastContext = getMDSContext();
  }
}, 100);

// Make available globally for cross-file access
window.initSuperChat = initSuperChat;
