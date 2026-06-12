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
  const nameEl = document.querySelector('.residentName#name, .residentName');
  if (!nameEl) return false;
  const { patientId, patientName } = getPatientFromHeader();
  if (!patientId) return false;

  const orgSlug = localStorage.getItem('CORE.org_code');
  const facLink = document.getElementById('pccFacLink');
  const facilityName = facLink?.title || facLink?.textContent?.trim();
  if (!orgSlug || !facilityName) return false;

  const enabled = await RecertAPI.moduleStatus({ facilityName, orgSlug });
  if (!enabled) return true; // resolved: gated off, stop polling

  // A labeled chip right beside the resident's name — the icon-group placement
  // shipped first and was invisible next to PCC's own identical document icons.
  const wrapper = document.createElement('span');
  wrapper.className = 'mc-header-chip-wrapper';
  wrapper.innerHTML = `
    <!-- NO_TRACK: panel mount emits mc_panel_opened (source flows through props) -->
    <button type="button" id="${BTN_ID}" class="mc-header-btn" aria-label="Managed Care">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2"/><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M12 10v6"/><path d="M9 13h6"/>
      </svg>
      Managed Care
      <span class="mc-header-btn__badge" id="super-mc-header-badge" style="display:none;"></span>
    </button>`;
  nameEl.appendChild(wrapper);

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
