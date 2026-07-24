// Super Menu Context Detection

import {
  resolveStableClientId,
  scrapeNumericClientIdFromDOM,
  resolveStableAssessmentId,
  scrapePccPublicIdFromDOM,
} from './client-id.js';

// Cache for patient name to avoid repeated DOM queries
let cachedPatientName = null;
let cachedPatientId = null;

function getChatPatientId() {
  // PCC URLs may now carry an ephemeral EID_ token instead of the numeric id.
  // resolveStableClientId() recovers the stable numeric id from the page so the
  // value is safe to send to the backend / store. Returns null off patient pages.
  return resolveStableClientId();
}

function getPatientNameFromPage() {
  // Try to get patient name from PCC page elements
  // Common locations: header, breadcrumb, patient info section

  // Try patient header (most common)
  const patientHeader = document.querySelector('.patient-header-name, .patientName, #patientName, .pcc-patient-name');
  if (patientHeader?.textContent?.trim()) {
    return patientHeader.textContent.trim();
  }

  // Try breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb-patient, .pcc-breadcrumb .patient');
  if (breadcrumb?.textContent?.trim()) {
    return breadcrumb.textContent.trim();
  }

  // Try page title area
  const titleArea = document.querySelector('.page-title-patient, .chart-header');
  if (titleArea?.textContent?.trim()) {
    // Extract just the name part if it contains other info
    const text = titleArea.textContent.trim();
    // Often format is "Patient Name - DOB" or "Patient Name (MRN)"
    const nameMatch = text.match(/^([^-(\n]+)/);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
  }

  return null;
}

function getMDSContext() {
  // Resolve the stable NUMERIC assessment id for backend use — the raw ESOLassessid
  // URL param is an ephemeral EID_ token on migrated facilities, which the backend
  // rejects. Keep the raw value ONLY to detect that we're on a section page: on a
  // flipped page the numeric may be null, but we're still on MDS and must report
  // scope 'mds' (else the side-panel silently downgrades to patient/global scope).
  const rawAssessmentId = new URL(window.location.href).searchParams.get('ESOLassessid');
  const assessmentId = resolveStableAssessmentId();
  const patientId = resolveStableClientId();

  // Get patient name, using cache if same patient
  let patientName = null;
  if (patientId) {
    if (patientId === cachedPatientId && cachedPatientName) {
      patientName = cachedPatientName;
    } else {
      patientName = getPatientNameFromPage();
      if (patientName) {
        cachedPatientName = patientName;
        cachedPatientId = patientId;
      }
    }
  } else {
    // Clear cache when no patient
    cachedPatientName = null;
    cachedPatientId = null;
  }

  // Check if we're on an MDS section page — gate on raw URL presence (EID_ or
  // numeric), NOT the resolved numeric, so flipped pages still report scope 'mds'.
  const isMDSSection = (
    (window.location.href.includes('/mds3/') || window.location.href.includes('section.xhtml')) &&
    rawAssessmentId
  );

  if (isMDSSection) {
    return {
      scope: 'mds',
      assessmentId,
      patientId: patientId || null,
      patientName
    };
  }

  if (patientId) {
    return {
      scope: 'patient',
      assessmentId: null,
      patientId,
      patientName
    };
  }

  return {
    scope: 'global',
    assessmentId: null,
    patientId: null,
    patientName: null
  };
}

// Update cached patient name (called when API returns patient data)
function setCachedPatientName(patientId, name) {
  cachedPatientId = patientId;
  cachedPatientName = name;
}

function getChatFacilityInfo() {
  const facLink = document.getElementById('pccFacLink');
  if (facLink) {
    return facLink.title || facLink.textContent?.trim() || null;
  }
  return null;
}

// Read org code from PCC's localStorage (set by PCC's own init script)
// Returns { org: 'hcg', allCookies: [] } to match the old cookie-based shape
function getOrg() {
  const org = localStorage.getItem('CORE.org_code') || null;
  return { org };
}

// Handle messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_FACILITY') {
    const facility = getChatFacilityInfo();
    sendResponse({ facility });
    return false;
  }
  if (message.type === 'GET_ORG') {
    sendResponse(getOrg());
    return false;
  }
});

// Scrape ARD date + assessment type from the live PCC assessment proptable.
// Landmarks (present on section.xhtml and similar pages):
//   #assessArdId                           → ARD in YYYY-MM-DD
//   table.proptable tr > td.label "OBRA Reason:" / "PPS Reason:" /
//     "PPS OMRA:" / "Entry/Discharge:"     → type rows; pick first non-blank,
//                                            non-"None of the above" value.
// Returns { ardDate: 'YYYY-MM-DD'|null, assessmentType: string|null }.
// IMPORTANT: read from DOM (not cached/API values) so the backend's
// ARD-fallback resolver fires when PCC issues a fresh externalAssessmentId
// after the nurse edits ARD or assessment type.
function getPCCAssessmentMetaFromDOM() {
  const ardRaw = document.getElementById('assessArdId')?.textContent?.trim() || '';
  const ardDate = /^\d{4}-\d{2}-\d{2}$/.test(ardRaw) ? ardRaw : null;

  let assessmentType = null;
  const TYPE_LABELS = new Set(['OBRA Reason:', 'PPS Reason:', 'PPS OMRA:', 'Entry/Discharge:']);
  const rows = document.querySelectorAll('table.proptable tr');
  for (const row of rows) {
    const labelEl = row.querySelector('td.label');
    if (!labelEl) continue;
    const label = labelEl.textContent.trim();
    if (!TYPE_LABELS.has(label)) continue;
    const valueEl = labelEl.nextElementSibling;
    const value = valueEl?.textContent?.trim() || '';
    if (!value) continue;
    if (value.toLowerCase() === 'none of the above') continue;
    assessmentType = value;
    break;
  }
  return { ardDate, assessmentType };
}

// Scrape an ESOLclientid from the live MDS section page when it's not in the
// URL. On section.xhtml the client id never appears in the page URL, but PCC
// embeds it in link builders (e.g. the diag-find anchor
// `/mds3diagfind.jsp?...&ESOLclientid=2657250&...`) and inline scripts. This is
// the only patient signal available in the "Run it" 404 case, where section
// data never loads so SuperOverlay.patientId is still null.
function scrapeClientIdFromDOM() {
  // Delegates to the shared resolver, which scrapes the numeric id from the
  // hidden form input, anchor hrefs, and inline scripts (digits only — never an
  // EID_ token).
  return scrapeNumericClientIdFromDOM();
}

// Resolve the externalPatientId for /api/extension/mds/* calls. This MUST be the
// NUMERIC PCC id — the backend rejects our internal SuperLTC id here, which
// collapses assessment resolution to ASSESSMENT_NOT_FOUND ("not synced" overlay).
//   1. The current page's numeric id: a numeric ESOLclientid in the URL, or one
//      recovered from the DOM (hidden input / anchors / resident header) on
//      migrated pages whose URL carries only an EID_ token or — on MDS section
//      pages — no client id at all. Always the current patient, so it wins.
//   2. Fallback: the numeric EXTERNAL id captured from a prior section response
//      for this resident (SuperOverlay.externalPatientId).
// It deliberately NEVER falls back to SuperOverlay.patientId: that is our
// INTERNAL id (valid only in diagnosis-query POST bodies / patient-scoped
// routes). Sending it as externalPatientId is the root cause of the overlay
// inconsistency — some sections got the internal id, some got none.
function getMDSResolverPatientId() {
  const fromPage = getChatPatientId() || scrapeClientIdFromDOM();
  if (fromPage) return fromPage;
  const cachedExternal = window.SuperOverlay?.externalPatientId;
  if (cachedExternal) return String(cachedExternal);
  return null;
}

// Append the MDS-resolver context fields to a URLSearchParams.
// Safe to call when fields are missing — only sets what it can read.
//   externalPatientId — numeric PCC client id (never our internal id, never EID)
//   pccPublicId       — MRN; the durable patient anchor #966 accepts as a
//                       separate key when the numeric client id is EID-dead
//                       (the norm on flipped MDS pages). Ride-along redundancy:
//                       backend prefers numeric and ignores the rest.
//   assessmentType    — REQUIRED to split same-ARD pairs (5-Day + Admission);
//                       without it the backend's never-guess resolver 404s.
//   ardDate           — final resolver tier.
function appendMDSContextParams(params) {
  const meta = getPCCAssessmentMetaFromDOM();
  const externalPatientId = getMDSResolverPatientId();
  const pccPublicId = scrapePccPublicIdFromDOM();
  if (externalPatientId) params.set('externalPatientId', externalPatientId);
  if (pccPublicId) params.set('pccPublicId', pccPublicId);
  if (meta.assessmentType) params.set('assessmentType', meta.assessmentType);
  if (meta.ardDate) params.set('ardDate', meta.ardDate);
  return params;
}

// Same fields, but for POST JSON bodies. Returns a plain object — caller
// spreads it into the body.
function getMDSContextBodyFields() {
  const meta = getPCCAssessmentMetaFromDOM();
  const externalPatientId = getMDSResolverPatientId();
  const pccPublicId = scrapePccPublicIdFromDOM();
  const out = {};
  if (externalPatientId) out.externalPatientId = externalPatientId;
  if (pccPublicId) out.pccPublicId = pccPublicId;
  if (meta.assessmentType) out.assessmentType = meta.assessmentType;
  if (meta.ardDate) out.ardDate = meta.ardDate;
  return out;
}

// Shared helper: get orgSlug + facilityName for API calls
// Used by evidence-viewers.js, icd10-viewer.js, etc.
function getCurrentParams() {
  const facilityName = getChatFacilityInfo() || '';
  const orgSlug = getOrg()?.org || '';
  return { facilityName, orgSlug };
}

// Build the context object for the chat API based on current page.
// Returns { orgSlug, facilityName, externalPatientId? } matching the backend's
// external-ID resolution (step 2b in /api/chat route).
function getChatContext() {
  const orgSlug = getOrg()?.org || '';
  const facilityName = getChatFacilityInfo() || '';
  const context = { orgSlug, facilityName };

  // 1. Standard patient pages — ESOLclientid in URL
  const urlPatientId = getChatPatientId();
  if (urlPatientId) {
    context.externalPatientId = urlPatientId;
    return context;
  }

  // 2. MDS pages — no ESOLclientid in URL, but SuperOverlay may have resolved
  //    the patientId from the assessment API response
  const url = new URL(window.location.href);
  // Presence of any ESOLassessid (EID_ or numeric) means we're on a section
  // page — detection only; never forward the raw value to the backend.
  const rawAssessmentId = url.searchParams.get('ESOLassessid');
  if (rawAssessmentId) {
    // MDS section page: resolve the NUMERIC PCC id (page scrape, or the external
    // id cached from a prior section response). Never send SuperOverlay.patientId
    // here — that internal SuperLTC id is not a valid externalPatientId. The
    // /api/chat route resolves externalPatientId as an external id (step 2b), the
    // same as /mds/*, so the internal id would fail to bind the patient.
    const externalPatientId = getMDSResolverPatientId();
    if (externalPatientId) context.externalPatientId = externalPatientId;
    // pccPublicId (MRN) is the durable patient anchor when the numeric id is
    // EID-dead (the norm on flipped pages); harmless if the route ignores it.
    const pccPublicId = scrapePccPublicIdFromDOM();
    if (pccPublicId) context.pccPublicId = pccPublicId;
    // Send only the NUMERIC assessment id — omit the ephemeral EID_ token, which
    // the backend rejects. null when unresolvable → resolve via patient + type.
    const externalAssessmentId = resolveStableAssessmentId();
    if (externalAssessmentId) context.externalAssessmentId = externalAssessmentId;
    return context;
  }

  // 3. Facility-only or org-only page — no patient context
  return context;
}

// Make available globally for cross-file access
window.getChatPatientId = getChatPatientId;
window.getPatientNameFromPage = getPatientNameFromPage;
window.getMDSContext = getMDSContext;
window.setCachedPatientName = setCachedPatientName;
window.getChatFacilityInfo = getChatFacilityInfo;
window.getOrg = getOrg;
window.getCurrentParams = getCurrentParams;
window.getChatContext = getChatContext;
window.getPCCAssessmentMetaFromDOM = getPCCAssessmentMetaFromDOM;
window.appendMDSContextParams = appendMDSContextParams;
window.getMDSContextBodyFields = getMDSContextBodyFields;
window.scrapeClientIdFromDOM = scrapeClientIdFromDOM;
