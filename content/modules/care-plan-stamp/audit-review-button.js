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
  // Prefer the stable numeric id (the URL may carry an ephemeral EID_ token).
  const stable = window.resolveStableClientId?.();
  if (stable) return stable;
  const fromUrl = new URLSearchParams(window.location.search).get('ESOLclientid');
  if (/^\d+$/.test(fromUrl || '')) return fromUrl;
  const html = document.body?.innerHTML || '';
  const m = html.match(/ESOLclientid=(\d+)/);
  return m ? m[1] : (fromUrl || null);
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
    <span class="super-audit-banner__icon super-audit-banner__icon--pulse">🔍</span>
    <span class="super-audit-banner__text">Checking this care plan against the chart…</span>
    <span class="super-audit-banner__shimmer" aria-hidden="true"></span>
  `;
  anchor.parentNode.insertBefore(banner, anchor);

  // Staged loading copy (same honesty treatment as the modal's LoadingState):
  // a static "Loading…" for 10+ seconds reads as broken; tell them what's
  // happening and that long = first-run, not stuck.
  const loadStages = [
    [4000, 'Cross-checking diagnoses, orders, and existing focuses…'],
    [9000, 'Still working — the first check on a resident takes the longest…'],
    [20000, 'Almost there. Big chart — thorough check.'],
  ];
  const stageTimers = loadStages.map(([at, text]) =>
    setTimeout(() => {
      const t = banner.querySelector('.super-audit-banner__text');
      if (t && banner.classList.contains('is-loading')) t.textContent = text;
    }, at),
  );
  const clearStages = () => stageTimers.forEach(clearTimeout);

  try {
    const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!auth?.authenticated) { clearStages(); banner.remove(); return; }
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
    clearStages();
    _paint(banner, audit, { patientId, facilityName, orgSlug });
  } catch (e) {
    clearStages();
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
  const r = audit?.toRemove?.length || 0;
  // toCheck deliberately excluded: verifies are soft FYI rows inside the audit,
  // never a banner chore. Only adds/removes make the banner actionable.
  const total = a + r;

  if (total === 0) {
    banner.className = 'super-audit-banner is-clean';
    banner.innerHTML = `
      <span class="super-audit-banner__icon">✓</span>
      <span class="super-audit-banner__text">SuperLTC audit: plan looks complete.</span>
    `;
    return;
  }

  // Banner shows only the ACTIONABLE counts (add/remove). Verifies are soft
  // FYI rows inside the audit and never appear here (Jul 21 dev pass).
  const parts = [];
  if (a) parts.push(`<strong>${a}</strong> to add`);
  if (r) parts.push(`<strong>${r}</strong> to remove`);

  banner.className = 'super-audit-banner is-actionable';
  banner.innerHTML = `
    <span class="super-audit-banner__icon">🔍</span>
    <span class="super-audit-banner__text">SuperLTC Audit · ${parts.join(' · ')}</span>
    <!-- NO_TRACK: opened_from_review_page tracked in _openWizard click handler -->
    <button type="button" class="super-audit-banner__cta">Open audit →</button>
  `;
  const isV2 = audit?.engineVersion === 'v2';
  banner.querySelector('.super-audit-banner__cta').addEventListener('click', () => _openWizard(ctx, isV2));
}

async function _openWizard({ patientId, facilityName, orgSlug }, isV2 = false) {
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
    // V2 only — keep V1 byte-for-byte. Re-run the audit so the banner reflects
    // what the nurse just did: stamps refreshed PCC's plan (re-scraped on
    // render) and skips persisted to our DB (V2 drops them from the count).
    // _renderBanner no-ops if a banner already exists, so clear it first.
    if (isV2) {
      document.getElementById(BANNER_ID)?.remove();
      _renderBanner();
    }
  };

  // The review page header shows "Client: Smith, John (6106)" — but variants
  // label it "Resident:"/"Patient:". Scrape whichever is present: an empty
  // name makes the backend JIT-stub new admits as "Patient <id>" and every
  // "(resident name)" fill stays a placeholder.
  let patientName = '';
  try {
    const m = (document.body?.innerText || '').match(/(?:Resident|Client|Patient):\s*([^\n(]+)/);
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
