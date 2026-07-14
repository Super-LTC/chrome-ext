/**
 * Injects a slim audit banner above the PCC action row on careplandetail_rev.jsp.
 *
 * Shows counts from /api/extension/care-plan/audit. Clicking "Review →"
 * opens the existing CarePlanStampModal in Comprehensive mode.
 *
 * Per-patient dismissible via sessionStorage. Hidden (replaced with a quiet
 * "✓ looks complete") when audit returns zero items in all three buckets.
 *
 * Mirrors inject-button.js's polling + MutationObserver patterns.
 */

const BANNER_ID = 'super-audit-banner';
const OVERLAY_ID_FALLBACK = 'super-cpas-overlay';
const DISMISS_KEY = 'super_audit_banner_dismissed';

function _isCarePlanDetailPage() {
  return window.location.href.includes('careplandetail_rev.jsp');
}

function _resolvePatientId() {
  // Prefer the stable numeric id (the URL may carry an ephemeral EID_ token).
  const stable = window.resolveStableClientId?.();
  if (stable) return stable;
  const fromUrl = new URLSearchParams(window.location.search).get('ESOLclientid');
  if (/^\d+$/.test(fromUrl || '')) return fromUrl;
  try {
    const v = document?.needs?.ESOLclientid?.value;
    if (/^\d+$/.test(v || '')) return v;
  } catch (_) { /* */ }
  const hidden = document.querySelector('input[name="ESOLclientid"]');
  if (/^\d+$/.test(hidden?.value || '')) return hidden.value;
  const html = document.body?.innerHTML || '';
  const m = html.match(/ESOLclientid=(\d+)/);
  return m ? m[1] : (fromUrl || null);
}

function _dismissKeyFor(patientId) {
  return `${DISMISS_KEY}:${patientId}`;
}

async function _renderBanner() {
  if (!_isCarePlanDetailPage()) return;
  if (document.getElementById(BANNER_ID)) return;

  const patientId = _resolvePatientId();
  if (!patientId) return;
  if (sessionStorage.getItem(_dismissKeyFor(patientId))) return;

  // Anchor: inject above the action row that contains "New Custom Focus".
  const newCustomBtn = document.querySelector('[id="idNewCustomFocusBtn"]');
  if (!newCustomBtn) return;
  // Walk up to a sensible container (the row's <tr> or wrapping div).
  const actionRow = newCustomBtn.closest('tr, div');
  if (!actionRow || !actionRow.parentNode) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'super-audit-banner is-loading';
  banner.innerHTML = `
    <span class="super-audit-banner__icon">🔍</span>
    <span class="super-audit-banner__text">Loading care plan audit…</span>
  `;
  actionRow.parentNode.insertBefore(banner, actionRow);

  // Pre-auth: silent fail if not authed (no banner spam on logged-out sessions).
  try {
    const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
    if (!auth?.authenticated) { banner.remove(); return; }
  } catch (_) { /* proceed; fetch will surface the auth error */ }

  const facilityName = typeof getChatFacilityInfo === 'function' ? (getChatFacilityInfo() || '') : '';
  const orgSlug = typeof getOrg === 'function' ? (getOrg()?.org || '') : '';

  try {
    // Scrape the existing plan so the server can dedupe. Without this, the
    // banner over-reports (rule engine fires N rules, but the modal would
    // collapse the matches into onPlan and show a smaller toAdd count).
    let existingFocusTexts = [];
    try {
      const fullPlan = await window.CarePlanStampDiscover?.scrapeFullCarePlan?.(patientId);
      existingFocusTexts = fullPlan?.focusTexts || [];
    } catch (_) { /* scrape best-effort; server still returns un-deduped audit */ }
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
  // area_covered rows are map-only states, not worklist actions — keep them out
  // of the "N to review" count (mirrors worklistModel.actionableChecks).
  const c = (audit?.toCheck || []).filter((it) => it.kind !== 'area_covered').length;
  const r = audit?.toRemove?.length || 0;
  const total = a + c + r;

  if (total === 0) {
    banner.className = 'super-audit-banner is-clean';
    banner.innerHTML = `
      <span class="super-audit-banner__icon">✓</span>
      <span class="super-audit-banner__text">SuperLTC audit: care plan looks complete.</span>
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
    <!-- NO_TRACK: opened_from_banner tracked in _openWizard click handler -->
    <button type="button" class="super-audit-banner__cta">Review →</button>
    <!-- NO_TRACK: pure-UI dismiss of banner -->
    <button type="button" class="super-audit-banner__dismiss" aria-label="Dismiss">×</button>
  `;
  const isV2 = audit?.engineVersion === 'v2';
  banner.querySelector('.super-audit-banner__cta').addEventListener('click', () => _openWizard(ctx, isV2));
  banner.querySelector('.super-audit-banner__dismiss').addEventListener('click', () => {
    sessionStorage.setItem(_dismissKeyFor(ctx.patientId), '1');
    banner.remove();
  });
}

async function _openWizard({ patientId, facilityName, orgSlug }, isV2 = false) {
  // Reuse the modal mount path from inject-button.js — duplicate the relevant
  // bits inline to avoid coupling to inject-button's internals.
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

  // Scrape patient name same way inject-button does
  let patientName = '';
  try {
    const m = (document.body?.innerText || '').match(/Resident:\s*([^\n(]+)/);
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

  window.SuperAnalytics?.track?.('care_plan_audit_opened_from_banner', { patient_id: patientId });
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
    if (_isCarePlanDetailPage()) _initWithPolling();
  }
}).observe(document.body, { childList: true, subtree: true });
