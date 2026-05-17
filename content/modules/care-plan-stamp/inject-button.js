/**
 * Injects an "Auto-Populate Care Plan" button on PCC's careplandetail page,
 * next to PCC's native "New Custom Focus" button. Clicking it opens a
 * full-screen Preact wizard.
 *
 * Mirrors the patterns used by `super-menu/init.js` (URL check, idempotence,
 * MutationObserver re-injection on SPA nav, dynamic Preact import for the
 * modal so it stays out of the initial bundle).
 */

const BTN_ID_PREFIX = 'super-cpas-btn-';   // suffix with row index to support top+bottom rows
const OVERLAY_ID = 'super-cpas-overlay';

function _isCarePlanDetailPage() {
  return window.location.href.includes('careplandetail_rev.jsp');
}

function _alreadyInjected(root) {
  return !!root.querySelector(`[id^="${BTN_ID_PREFIX}"]`);
}

function _makeButton(idSuffix) {
  // Native-looking `pccButton` with a subtle sparkle prefix to signal "AI / smart".
  const btn = document.createElement('input');
  btn.type = 'button';
  btn.className = 'pccButton';
  btn.id = `${BTN_ID_PREFIX}${idSuffix}`;
  btn.value = '✨ AI Care Plan';
  btn.title = 'AI-assisted care plan: auto-populate for new admits, audit + review for established plans';
  // Style: same shape as pccButton but tinted to draw the eye without screaming.
  btn.style.cssText = `
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff;
    border: 1px solid #4338ca;
    font-weight: 600;
    margin-left: 6px;
    cursor: pointer;
  `;
  btn.setAttribute('data-track', 'care_plan_autopop_button_clicked');
  btn.addEventListener('click', _handleClick);
  return btn;
}

async function _handleClick() {
  const patientId = _resolvePatientId();
  if (!patientId) {
    alert('Could not detect patient ID on this page. Please refresh and try again.');
    return;
  }

  // Pull facility + org from existing helpers (defined in content/super-menu/context.js).
  const facilityName = typeof getChatFacilityInfo === 'function' ? (getChatFacilityInfo() || '') : '';
  const orgSlug = typeof getOrg === 'function' ? (getOrg()?.org || '') : '';
  const patientName = _scrapePatientName();
  // Note: existing-focus discovery now lives inside the modal load (via
  // CarePlanStampDiscover.scrapeFullCarePlan), so it walks all paginated
  // pages instead of just whatever's in the current DOM. See below — the
  // _scrapeExistingFocusTexts helper is retained for diagnostics only.

  // Pick default wizard mode based on whether the patient already has
  // a populated care plan. Empty plan → Initial Admit auto-pop;
  // established plan → Comprehensive Review (audit). The toggle inside
  // the modal lets the nurse override.
  const existingTexts = _scrapeExistingFocusTexts();
  const defaultMode = existingTexts.length === 0 ? 'initial' : 'comprehensive';

  if (defaultMode === 'comprehensive') {
    window.SuperAnalytics?.track?.('care_plan_audit_opened_from_button', {
      patient_id: patientId,
      n_existing_focus_texts: existingTexts.length,
    });
  }

  // Check auth before opening — saves the user from seeing a useless error inside the modal.
  try {
    const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!auth?.authenticated) {
      alert('Please log in to Super LTC before using Auto-Populate Care Plan.');
      return;
    }
  } catch (_) {
    // If auth check fails (unlikely), let the modal show the actual error.
  }

  await _openModal({ patientId, patientName, facilityName, orgSlug, defaultMode });
}

/**
 * Resolve the PCC clientid from any reliable source on the page.
 * URL is preferred but not always populated (e.g. when nav lands via a form
 * submit). Falls back to the page's `<form name="needs">` hidden input,
 * any hidden ESOLclientid input anywhere, then string-scrapes onclick/data-*
 * attributes for `ESOLclientid=<digits>`.
 */
function _resolvePatientId() {
  // 1. URL query param
  const fromUrl = new URLSearchParams(window.location.search).get('ESOLclientid');
  if (fromUrl) return fromUrl;

  // 2. `document.needs` form (the legacy form PCC's own JS reads from)
  try {
    const v = document?.needs?.ESOLclientid?.value;
    if (v) return v;
  } catch (_) { /* document.needs may not exist */ }

  // 3. Any hidden ESOLclientid input on the page
  const hidden = document.querySelector('input[name="ESOLclientid"]');
  if (hidden?.value) return hidden.value;

  // 4. Last resort: regex any inline string referencing the param
  const html = document.body?.innerHTML || '';
  const m = html.match(/ESOLclientid=(\d+)/);
  if (m) return m[1];

  return null;
}

function _scrapePatientName() {
  // PCC's careplandetail page shows: "Resident: lopez, paul (6306)" in the header.
  // Best effort — fall back to nothing if we can't find it.
  const txt = document.body?.innerText || '';
  const m = txt.match(/Resident:\s*([^\n(]+)/);
  return m ? m[1].replace(/DO NOT USE/i, '').trim() : '';
}

/**
 * Scrape the focus_text strings already on this patient's care plan.
 *
 * PCC's careplandetail layout (per row, per focus):
 *   <td>...<a href="javascript:editNeed(NEEDID,NEEDID)">edit</a>...</td>
 *   <td>...<span class="text1">FOCUS TEXT</span>...</td>
 *
 * We anchor on the editNeed link (unambiguous — goals use editGoal, interventions
 * use editIntervention), walk to its row, and grab the first `span.text1` in that
 * row's Focus column.
 *
 * Returned strings get trimmed; empties dropped. Order is the page order
 * (doesn't matter — backend matches by keyword, not by index).
 */
function _scrapeExistingFocusTexts() {
  if (!_isCarePlanDetailPage()) return [];
  const editLinks = document.querySelectorAll('a[href*="editNeed("]');
  const texts = [];
  editLinks.forEach((a) => {
    // Walk up to the outer table-row that contains this focus
    const row = a.closest('tr');
    if (!row) return;
    // The first text1 in this row is the focus statement
    const span = row.querySelector('span.text1');
    if (!span) return;
    const t = span.textContent.replace(/\s+/g, ' ').trim();
    if (t) texts.push(t);
  });
  return texts;
}

async function _openModal({ patientId, patientName, facilityName, orgSlug, defaultMode }) {
  // Tear down any existing overlay (defensive — shouldn't happen).
  document.getElementById(OVERLAY_ID)?.remove();

  // Lazy-load Preact + the wizard. Keeps this out of the initial bundle for
  // every PCC page load — only the careplan page pays the cost, only on click.
  const [{ render, h }, { CarePlanStampModal }] = await Promise.all([
    import('preact'),
    import('./CarePlanStampModal.jsx'),
  ]);

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Hide PCC FAB (#super-bubbles-container) and any other persistent overlays so
  // they don't visually fight the modal. Restored on close.
  const fab = document.getElementById('super-bubbles-container');
  const prevFabDisplay = fab?.style.display;
  if (fab) fab.style.display = 'none';

  const handleClose = () => {
    render(null, overlay);
    overlay.remove();
    document.body.style.overflow = '';
    if (fab) fab.style.display = prevFabDisplay || '';
  };

  render(
    h(CarePlanStampModal, { patientId, patientName, facilityName, orgSlug, defaultMode, onClose: handleClose }),
    overlay
  );
}

/**
 * Walk every "New Custom Focus" button on the page (typically two — top + bottom)
 * and inject our button after each one. Idempotent: a second pass is a no-op.
 */
function injectCarePlanStampButton() {
  if (!_isCarePlanDetailPage()) return;

  // PCC uses duplicate IDs (top + bottom button rows). querySelectorAll for safety.
  const targets = document.querySelectorAll('[id="idNewCustomFocusBtn"]');
  if (!targets.length) return;

  targets.forEach((target, i) => {
    const btnId = `${BTN_ID_PREFIX}${i}`;
    if (document.getElementById(btnId)) return; // already injected
    const btn = _makeButton(i);
    target.parentNode.insertBefore(btn, target.nextSibling);
  });
}

// Run on load + on SPA-ish nav (PCC does full reloads, but content scripts
// re-inject on each load — and existing super-menu init runs a MutationObserver
// for URL changes that may fire before our DOM target exists). Safest path:
// run once, then poll briefly for the buttons to appear.
function _initWithPolling() {
  injectCarePlanStampButton();
  // PCC loads buttons synchronously in the page render, so a short retry handles
  // the rare case where this file runs before the buttons hit the DOM.
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (document.querySelector(`[id^="${BTN_ID_PREFIX}"]`)) { clearInterval(id); return; }
    injectCarePlanStampButton();
    if (tries >= 10) clearInterval(id);
  }, 250);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initWithPolling);
} else {
  _initWithPolling();
}

// Re-check on URL changes (matches super-menu/init.js's pattern for SPA nav).
let _lastUrl = window.location.href;
const _urlObs = new MutationObserver(() => {
  if (window.location.href !== _lastUrl) {
    _lastUrl = window.location.href;
    if (_isCarePlanDetailPage()) _initWithPolling();
  }
});
_urlObs.observe(document.body, { childList: true, subtree: true });

window.CarePlanStampInjector = { inject: injectCarePlanStampButton };
