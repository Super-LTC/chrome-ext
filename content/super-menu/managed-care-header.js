// content/super-menu/managed-care-header.js
// Injects the per-patient "Clinical Update" button into PCC's resident header.
// Preferred anchor is the .rh-icon-buttons group (next to Print/Options); we
// fall back to appending beside .residentName if that group isn't present.
//
// PCC's resident header is server-rendered and re-rendered via AJAX (tab
// switches, generate-chart, etc.), re-running its inline <script> blocks and
// REPLACING the header markup. That wipes our button (and any listener attached
// to it). So we: (1) attach the click listener directly to the button each time
// we inject, AND (2) keep watching with a MutationObserver to re-inject whenever
// PCC blows our button away. A one-shot poller is not enough.
import { RecertAPI } from '../modules/managed-care/recert-api.js';

const BTN_ID = 'super-mc-header-btn';
const DEBUG = false; // flip on to trace header injection / click wiring in the console

function log(...args) { if (DEBUG) console.log('[MC-header]', ...args); }

export function getPatientFromHeader() {
  // Use the SHARED ladder (client-id.js), same as every other patient-anchored
  // surface: a NUMERIC client id when the page still exposes one, plus the
  // resident-header MRN, which survives PCC's EID migration. Sending both lets
  // the backend resolve the patient even when the numeric id is gone.
  const ref = window.resolveStablePatientRef?.() || {};
  const nameEl = document.querySelector('.residentName#name, .residentName');

  // Last resort, kept from the original implementation: the header's
  // "Client ID: NNN" span — but ONLY when it isn't the MRN restated. PCC labels
  // the facility MRN "Client ID" in this header, and an MRN sent as a client id
  // matches no patient: prod, 2026-09-02, across 42,169 active residents, NO
  // patient's MRN equals their PCC client id. Sending it anyway is what produced
  // "Patient not found for the provided external id" on every submit.
  let externalPatientId = ref.externalPatientId || null;
  if (!externalPatientId) {
    const fromSpan = nameEl
      ?.querySelector('span[title^="Client ID:"]')
      ?.title?.match(/Client ID:\s*(\d+)/)?.[1] || null;
    externalPatientId = fromSpan && fromSpan !== ref.pccPublicId ? fromSpan : null;
  }

  const patientName = nameEl ? nameEl.childNodes[0]?.textContent?.trim() || null : null;
  return { externalPatientId, pccPublicId: ref.pccPublicId || null, patientName };
}

function openPanel() {
  const { externalPatientId, pccPublicId, patientName } = getPatientFromHeader();
  log('click → open panel', { externalPatientId, pccPublicId, hasLauncher: !!window.ManagedCareLauncher });
  if (window.ManagedCareLauncher?.open) {
    window.ManagedCareLauncher.open({ patientId: externalPatientId, pccPublicId, patientName, source: 'header' });
  } else {
    console.error('[MC-header] Launcher unavailable; cannot open panel.');
  }
}

function buildButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = BTN_ID;
  btn.className = 'mc-header-btn';
  btn.setAttribute('aria-label', 'Clinical Update');
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2"/><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M12 10v6"/><path d="M9 13h6"/>
    </svg>
    <span class="mc-header-btn__text">Clinical Update</span>
    <span class="mc-header-btn__badge" id="super-mc-header-badge" style="display:none;"></span>`;
  // Direct listener, re-attached on every (re)inject. Also belt-and-suspenders:
  // capture-phase so PCC's bubble-phase jQuery handlers can't pre-empt it.
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPanel();
  }, true);
  wireBadge(btn);
  return btn;
}

function wireBadge(btn) {
  window.McRunTracker?.subscribe(({ inFlight, unseenDone }) => {
    const b = btn.querySelector('#super-mc-header-badge');
    if (!b) return;
    const n = inFlight + unseenDone;
    b.style.display = n ? '' : 'none';
    b.textContent = String(n);
  });
}

// Module gate is resolved once and cached so re-injects (MutationObserver fires
// a lot) don't spam the network. null = not yet checked; true/false = resolved.
let moduleEnabled = null;
let checkingModule = false;

async function ensureModuleEnabled() {
  if (moduleEnabled !== null) return moduleEnabled;
  if (checkingModule) return null; // a check is in flight; let the next tick retry
  const orgSlug = localStorage.getItem('CORE.org_code');
  const facLink = document.getElementById('pccFacLink');
  const facilityName = facLink?.title || facLink?.textContent?.trim();
  if (!orgSlug || !facilityName) return null; // header not ready; retry later
  checkingModule = true;
  try {
    moduleEnabled = await RecertAPI.moduleStatus({ facilityName, orgSlug });
    log('module status resolved:', moduleEnabled);
  } finally {
    checkingModule = false;
  }
  return moduleEnabled;
}

async function tryInject() {
  if (document.getElementById(BTN_ID)) return;        // already present
  const { externalPatientId, pccPublicId } = getPatientFromHeader();
  if (!externalPatientId && !pccPublicId) return;     // not on a patient chart

  const enabled = await ensureModuleEnabled();
  if (enabled !== true) return;                       // gated off or not yet resolved
  if (document.getElementById(BTN_ID)) return;        // raced

  const btn = buildButton();

  // Preferred: drop it into the .rh-icon-buttons group, as the first item so it
  // reads before Print/Options. Fallback: append beside the resident name.
  const iconGroup = document.querySelector('.rh-icon-buttons');
  if (iconGroup) {
    const host = document.createElement('div');
    host.className = 'mc-header-chip-wrapper rh-icon-menu-wrapper';
    host.appendChild(btn);
    iconGroup.insertBefore(host, iconGroup.firstChild);
    log('injected into .rh-icon-buttons');
  } else {
    const nameEl = document.querySelector('.residentName#name, .residentName');
    if (!nameEl) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'mc-header-chip-wrapper';
    wrapper.appendChild(btn);
    nameEl.appendChild(wrapper);
    log('injected beside .residentName (no .rh-icon-buttons found)');
  }
}

// Watch the whole document for header (re)renders. PCC swaps the header markup
// on tab/navigation; whenever our button goes missing we re-inject.
let observer = null;
function startObserving() {
  tryInject();
  if (observer) return;
  observer = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID)) tryInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  log('observer started, top frame =', window === window.top, 'url =', location.href);
}

if (document.body) startObserving();
else document.addEventListener('DOMContentLoaded', startObserving, { once: true });
// bfcache restores re-run nothing; re-arm on pageshow.
window.addEventListener('pageshow', () => { if (!document.getElementById(BTN_ID)) tryInject(); });
