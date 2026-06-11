// content/super-menu/managed-care-header.js
// Injects the per-patient "Managed Care" button into PCC's resident header
// (the .rh-icon-buttons group next to Print/Options). Tolerant by design:
// the header has compact/standard/expanded variants and older facilities may
// not render .rh-icon-buttons at all — in that case we simply don't inject
// (the MC FAB still gives access).
import { RecertAPI } from '../modules/managed-care/recert-api.js';

const BTN_ID = 'super-mc-header-btn';
const POLL_MS = 1000;
const MAX_POLLS = 15;

function getPatientFromHeader() {
  // Prefer the URL param (matches getMDSContext); fall back to the header's
  // "Client ID: NNN" title span.
  const url = new URL(window.location.href);
  let patientId = url.searchParams.get('ESOLclientid');
  const nameEl = document.querySelector('.residentName#name, .residentName');
  if (!patientId) {
    const idSpan = nameEl?.querySelector('span[title^="Client ID:"]');
    const m = idSpan?.title?.match(/Client ID:\s*(\d+)/);
    patientId = m?.[1] || null;
  }
  const patientName = nameEl ? nameEl.childNodes[0]?.textContent?.trim() || null : null;
  return { patientId, patientName };
}

async function tryInject() {
  if (document.getElementById(BTN_ID)) return true;        // idempotent
  const iconGroup = document.querySelector('.residentHeaderDetails .rh-icon-buttons');
  if (!iconGroup) return false;
  const { patientId, patientName } = getPatientFromHeader();
  if (!patientId) return false;

  const orgSlug = localStorage.getItem('CORE.org_code');
  const facLink = document.getElementById('pccFacLink');
  const facilityName = facLink?.title || facLink?.textContent?.trim();
  if (!orgSlug || !facilityName) return false;

  const enabled = await RecertAPI.moduleStatus({ facilityName, orgSlug });
  if (!enabled) return true; // resolved: gated off, stop polling

  const wrapper = document.createElement('div');
  wrapper.className = 'rh-icon-menu-wrapper';
  wrapper.innerHTML = `
    <!-- NO_TRACK: panel mount emits mc_panel_opened (source flows through props) -->
    <button type="button" id="${BTN_ID}" class="rh-icon-btn mc-header-btn" aria-label="Managed Care">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M12 12v6"/>
      </svg>
      <span class="mc-header-btn__badge" id="super-mc-header-badge" style="display:none;"></span>
      <div class="rh-hover-details">Managed Care</div>
    </button>`;
  // Before PCC's print button so ours reads as part of the group.
  iconGroup.prepend(wrapper);

  document.getElementById(BTN_ID).addEventListener('click', (e) => {
    e.stopPropagation();
    window.ManagedCareLauncher?.open({ patientId, patientName, source: 'header' });
  });

  // Per-patient badge: any tracked in-flight/unseen run. Counts are global on
  // the tracker; per-patient precision comes from the panel itself — the header
  // badge is a glance signal, v1 shows the tracker's counts.
  window.McRunTracker?.subscribe(({ inFlight, unseenDone }) => {
    const b = document.getElementById('super-mc-header-badge');
    if (!b) return;
    const n = inFlight + unseenDone;
    b.style.display = n ? '' : 'none';
    b.textContent = String(n);
  });
  return true;
}

function start(attempt = 0) {
  tryInject().then((settled) => {
    if (!settled && attempt < MAX_POLLS) setTimeout(() => start(attempt + 1), POLL_MS);
  });
}

start();
// PCC's clinical chart is full-page-load navigation, but re-arm on pageshow
// (bfcache restores) so the button survives back/forward.
window.addEventListener('pageshow', () => start());
