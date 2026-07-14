/**
 * Super Verify — injects a "Super Verify" button next to PCC's native Verify
 * button on the MDS section-listing page (`/clinical/mds3/sectionlisting.xhtml`).
 *
 * On click it opens a full-screen Preact modal that scrapes every section's
 * live answers, POSTs them to `/api/extension/mds/verify`, and shows PDPM
 * reimbursement findings + a QM trigger preview.
 *
 * Mirrors `modules/care-plan-stamp/inject-button.js`: URL check, idempotent
 * injection, polling init, MutationObserver re-injection on SPA nav, and a
 * dynamic Preact import so the modal stays out of the initial bundle.
 *
 * GA: injects for ALL users (no beta allowlist — the interview scheduler is
 * the only surface still behind mds-beta-gate). The verify route itself is
 * gated server-side on org `mdsSolver` module access; orgs without it get the
 * modal's 403 error state, and logged-out users get the login alert on click.
 */

const BTN_ID = 'super-verify-btn';
const OVERLAY_ID = 'super-verify-overlay';

function _isSectionListingPage() {
  return window.location.pathname.includes('/clinical/mds3/sectionlisting.xhtml');
}

// assessId + clientId: the #verifyBtnForm hidden inputs are the most reliable
// source on this page; fall back to the URL param / DOM scrape.
function _readIds() {
  const form = document.getElementById('verifyBtnForm');
  let assessId = form?.querySelector('input[name="assessId"]')?.value || '';
  let clientId = form?.querySelector('input[name="clientId"]')?.value || '';
  if (!assessId) assessId = new URLSearchParams(window.location.search).get('ESOLassessid') || '';
  if (!clientId) clientId = (window.scrapeClientIdFromDOM?.() || '');
  return { assessId, clientId };
}

function _makeButton() {
  // NOT a PCC `.mdsbutton` — that class is a left/right sprite-cap button (the
  // right cap gif lives on an inner <span>), so any background override leaves a
  // white sliver. We use a self-contained indigo pill (styled in
  // css/super-verify.css) sized to align with the native 24px action buttons.
  const a = document.createElement('a');
  a.className = 'sv-inject-btn';
  a.id = BTN_ID;
  a.href = 'javascript:;';
  a.title = 'Super Verify — last-chance PDPM + Quality Measure check before you lock';
  a.setAttribute('data-track', 'super_verify_button_clicked');
  a.innerHTML =
    '<span class="sv-inject-btn__ic" aria-hidden="true">✨</span>' +
    '<span>Super Verify</span>';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    _handleClick();
  });
  return a;
}

async function _handleClick() {
  const { assessId, clientId } = _readIds();
  if (!assessId) {
    alert('Could not detect the MDS assessment on this page. Please refresh and try again.');
    return;
  }

  // Check auth before opening — saves the user a useless error inside the modal.
  try {
    const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!auth?.authenticated) {
      alert('Please log in to Super LTC before using Super Verify.');
      return;
    }
  } catch (_) {
    // If the auth check itself fails (unlikely), let the modal surface the error.
  }

  await _openModal({ assessId, patientId: clientId });
}

async function _openModal({ assessId, patientId }) {
  // Tear down any existing overlay (defensive — shouldn't happen).
  document.getElementById(OVERLAY_ID)?.remove();

  // Lazy-load Preact + the modal so every PCC page load doesn't pay for it —
  // only the section-listing page, only on click.
  const [{ render, h }, { SuperVerifyModal }] = await Promise.all([
    import('preact'),
    import('./SuperVerifyModal.jsx'),
  ]);

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Hide the Super FAB so it doesn't fight the modal. Restored on close.
  const fab = document.getElementById('super-bubbles-container');
  const prevFabDisplay = fab?.style.display;
  if (fab) fab.style.display = 'none';

  const handleClose = () => {
    render(null, overlay);
    overlay.remove();
    document.body.style.overflow = '';
    if (fab) fab.style.display = prevFabDisplay || '';
  };

  render(h(SuperVerifyModal, { assessId, patientId, onClose: handleClose }), overlay);
}

/**
 * Inject the Super Verify button. Idempotent — a second pass is a no-op.
 * Anchor priority: after PCC's verify form (#verifyBtnForm); else after the
 * refresh button (#refreshMDSDataButton); else append to #mdsactionbuttons.
 */
export async function injectSuperVerifyButton() {
  if (!_isSectionListingPage()) return;
  if (document.getElementById(BTN_ID)) return; // already injected

  const btn = _makeButton();
  const form = document.getElementById('verifyBtnForm');
  if (form && form.parentNode) {
    form.parentNode.insertBefore(btn, form.nextSibling);
    return;
  }
  const refresh = document.getElementById('refreshMDSDataButton');
  if (refresh && refresh.parentNode) {
    refresh.parentNode.insertBefore(btn, refresh.nextSibling);
    return;
  }
  const bar = document.getElementById('mdsactionbuttons');
  if (bar) bar.appendChild(btn);
}

function _initWithPolling() {
  injectSuperVerifyButton();
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (document.getElementById(BTN_ID) || tries >= 10) {
      clearInterval(id);
      return;
    }
    injectSuperVerifyButton();
  }, 250);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initWithPolling);
} else {
  _initWithPolling();
}

// Re-check on URL changes (PCC does full reloads, but SPA-ish nav can fire
// before our target exists). Matches super-menu/init.js's pattern.
let _lastUrl = window.location.href;
const _urlObs = new MutationObserver(() => {
  if (window.location.href !== _lastUrl) {
    _lastUrl = window.location.href;
    if (_isSectionListingPage()) _initWithPolling();
  }
});
_urlObs.observe(document.body, { childList: true, subtree: true });

window.SuperVerifyInjector = { inject: injectSuperVerifyButton };
