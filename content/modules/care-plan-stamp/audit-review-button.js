/**
 * Injects an audit banner on PCC's view_review.jsp (Care Plan Reviews page).
 *
 * Same look + behavior as audit-banner.js on careplandetail_rev.jsp, but
 * anchored to the per-department review table on this page. Always opens
 * the modal in Comprehensive mode — this page is always for established plans.
 *
 * v1: global audit (not department-sliced).
 */

const BANNER_ID = 'super-audit-review-banner';
const OVERLAY_ID_FALLBACK = 'super-cpas-overlay';

function _isReviewPage() {
  return window.location.href.includes('view_review.jsp');
}

function _resolvePatientId() {
  const fromUrl = new URLSearchParams(window.location.search).get('ESOLclientid');
  if (fromUrl) return fromUrl;
  const html = document.body?.innerHTML || '';
  const m = html.match(/ESOLclientid=(\d+)/);
  return m ? m[1] : null;
}

async function _renderBanner() {
  if (!_isReviewPage()) return;
  if (document.getElementById(BANNER_ID)) return;

  const patientId = _resolvePatientId();
  if (!patientId) return;

  // Anchor: inject above the per-department review table. We look for
  // the table cell containing "Department" header text and walk up.
  const headers = Array.from(document.querySelectorAll('th, td'));
  const deptHeader = headers.find((el) => /^\s*Department\s*$/i.test(el.textContent || ''));
  const table = deptHeader?.closest('table');
  const anchor = table || document.querySelector('.content') || document.body.firstElementChild;
  if (!anchor || !anchor.parentNode) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'super-audit-banner is-loading';
  banner.innerHTML = `
    <span class="super-audit-banner__icon">🔍</span>
    <span class="super-audit-banner__text">Loading care plan audit…</span>
  `;
  anchor.parentNode.insertBefore(banner, anchor);

  try {
    const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!auth?.authenticated) { banner.remove(); return; }
  } catch (_) { /* proceed */ }

  const facilityName = typeof getChatFacilityInfo === 'function' ? (getChatFacilityInfo() || '') : '';
  const orgSlug = typeof getOrg === 'function' ? (getOrg()?.org || '') : '';

  try {
    // Scrape existing plan so server can dedupe; without it the banner
    // reports the raw rule-engine count and disagrees with the modal.
    let existingFocusTexts = [];
    try {
      const fullPlan = await window.CarePlanStampDiscover?.scrapeFullCarePlan?.(patientId);
      existingFocusTexts = fullPlan?.focusTexts || [];
    } catch (_) { /* best-effort */ }
    const resp = await window.CarePlanAuditAPI.fetchAudit({
      patientId, facilityName, orgSlug, existingFocusTexts,
    });
    const audit = resp.audit || resp;
    _paint(banner, audit, { patientId, facilityName, orgSlug });
  } catch (e) {
    banner.className = 'super-audit-banner is-error';
    banner.innerHTML = `
      <span class="super-audit-banner__icon">⚠</span>
      <span class="super-audit-banner__text">Audit failed to load.</span>
      <!-- NO_TRACK: pure-UI retry of failed audit fetch -->
      <button type="button" class="super-audit-banner__retry">Retry</button>
    `;
    banner.querySelector('.super-audit-banner__retry')?.addEventListener('click', () => {
      banner.remove();
      _renderBanner();
    });
  }
}

function _paint(banner, audit, ctx) {
  const a = audit?.toAdd?.length || 0;
  const c = audit?.toCheck?.length || 0;
  const r = audit?.toRemove?.length || 0;
  const total = a + c + r;

  if (total === 0) {
    banner.className = 'super-audit-banner is-clean';
    banner.innerHTML = `
      <span class="super-audit-banner__icon">✓</span>
      <span class="super-audit-banner__text">SuperLTC audit: plan looks complete.</span>
    `;
    return;
  }

  const parts = [];
  if (a) parts.push(`<strong>${a}</strong> to add`);
  if (r) parts.push(`<strong>${r}</strong> to remove`);
  if (c) parts.push(`<strong>${c}</strong> to verify`);

  banner.className = 'super-audit-banner is-actionable';
  banner.innerHTML = `
    <span class="super-audit-banner__icon">🔍</span>
    <span class="super-audit-banner__text">SuperLTC Audit · ${parts.join(' · ')}</span>
    <!-- NO_TRACK: opened_from_review_page tracked in _openWizard click handler -->
    <button type="button" class="super-audit-banner__cta">Open audit →</button>
  `;
  banner.querySelector('.super-audit-banner__cta').addEventListener('click', () => _openWizard(ctx));
}

async function _openWizard({ patientId, facilityName, orgSlug }) {
  document.getElementById(OVERLAY_ID_FALLBACK)?.remove();

  const [{ render, h }, { CarePlanStampModal }] = await Promise.all([
    import('preact'),
    import('./CarePlanStampModal.jsx'),
  ]);

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID_FALLBACK;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const fab = document.getElementById('super-bubbles-container');
  const prevFabDisplay = fab?.style.display;
  if (fab) fab.style.display = 'none';

  const handleClose = () => {
    render(null, overlay);
    overlay.remove();
    document.body.style.overflow = '';
    if (fab) fab.style.display = prevFabDisplay || '';
  };

  // The review page header shows "Client: Smith, John (6106)" — scrape if available.
  let patientName = '';
  try {
    const m = (document.body?.innerText || '').match(/Client:\s*([^\n(]+)/);
    if (m) patientName = m[1].replace(/DO NOT USE/i, '').trim();
  } catch (_) { /* */ }

  render(
    h(CarePlanStampModal, {
      patientId,
      patientName,
      facilityName,
      orgSlug,
      defaultMode: 'comprehensive',
      onClose: handleClose,
    }),
    overlay
  );

  window.SuperAnalytics?.track?.('care_plan_audit_opened_from_review_page', { patient_id: patientId });
}

function _initWithPolling() {
  _renderBanner();
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (document.getElementById(BANNER_ID)) { clearInterval(id); return; }
    _renderBanner();
    if (tries >= 10) clearInterval(id);
  }, 250);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initWithPolling);
} else {
  _initWithPolling();
}

let _lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== _lastUrl) {
    _lastUrl = window.location.href;
    if (_isReviewPage()) _initWithPolling();
  }
}).observe(document.body, { childList: true, subtree: true });
