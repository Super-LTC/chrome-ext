// Super Menu Context Detection

// Cache for patient name to avoid repeated DOM queries
let cachedPatientName = null;
let cachedPatientId = null;

function getChatPatientId() {
  const url = new URL(window.location.href);
  return url.searchParams.get('ESOLclientid');
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
  const url = new URL(window.location.href);
  const assessmentId = url.searchParams.get('ESOLassessid');
  const patientId = url.searchParams.get('ESOLclientid');

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

  // Check if we're on an MDS section page
  const isMDSSection = (
    (window.location.href.includes('/mds3/') || window.location.href.includes('section.xhtml')) &&
    assessmentId
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

// Resolve externalPatientId from current PCC page state (URL first, fall back
// to SuperOverlay's resolved id on MDS section pages where URL lacks ESOLclientid).
function getMDSResolverPatientId() {
  const fromUrl = getChatPatientId();
  if (fromUrl) return fromUrl;
  const fromOverlay = window.SuperOverlay?.patientId;
  return fromOverlay ? String(fromOverlay) : null;
}

// Append the three MDS-resolver context fields to a URLSearchParams.
// Safe to call when fields are missing — only sets what it can read.
function appendMDSContextParams(params) {
  const meta = getPCCAssessmentMetaFromDOM();
  const externalPatientId = getMDSResolverPatientId();
  if (externalPatientId) params.set('externalPatientId', externalPatientId);
  if (meta.assessmentType) params.set('assessmentType', meta.assessmentType);
  if (meta.ardDate) params.set('ardDate', meta.ardDate);
  return params;
}

// Same fields, but for POST JSON bodies. Returns a plain object — caller
// spreads it into the body.
function getMDSContextBodyFields() {
  const meta = getPCCAssessmentMetaFromDOM();
  const externalPatientId = getMDSResolverPatientId();
  const out = {};
  if (externalPatientId) out.externalPatientId = externalPatientId;
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
  const assessmentId = url.searchParams.get('ESOLassessid');
  if (assessmentId) {
    // SuperOverlay stores the internal patientId once the section data loads.
    // We pass it as externalPatientId since the backend resolves it the same way.
    if (window.SuperOverlay?.patientId) {
      context.externalPatientId = String(window.SuperOverlay.patientId);
    }
    // Also pass assessmentId so backend has full MDS context
    context.externalAssessmentId = assessmentId;
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
