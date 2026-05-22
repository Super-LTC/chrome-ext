// MDS Section Overlay for Super LTC Chrome Extension
// Detects MDS pages, injects badges on questions, shows popovers with AI rationale/evidence
// Extracted from original content.js (commit 05cb4a0)

import { render, h } from 'preact';
import { PDFViewer } from './components/PDFViewer.jsx';
import { fetchDocument, fetchClinicalNote, fetchTherapyDocument, fetchUda, formatDateDisplay, formatDateTimeDisplay } from './evidence-viewers.js';
import { UdaViewer } from './modules/uda-viewer/UdaViewer.jsx';

// ============================================
// State Management
// ============================================
const SuperOverlay = {
  results: [],
  currentMismatchIndex: -1,
  dismissedItems: new Set(),
  serverDecisions: {},  // Keyed by mdsItem+mdsColumn (e.g. "O0250B", "I2000")
  panelExpanded: false,
  initialized: false,
  patientId: null  // Stored from API response for diagnosis queries
};

// ============================================
// Care Plan Coverage Dots (Section I)
// ============================================
const CarePlanDots = {
  _data: null,
  _fetched: false,
  _patientId: null,

  async fetch(patientId, facilityName, orgSlug) {
    // Reset cache if patient changed
    if (this._patientId && this._patientId !== patientId) {
      this._data = null;
      this._fetched = false;
    }
    this._patientId = patientId;
    if (this._fetched) return this._data;
    try {
      const params = new URLSearchParams({ facilityName: facilityName || '', orgSlug: orgSlug || '' });
      const endpoint = `/api/extension/patients/${patientId}/mds-coverage?${params}`;
      const result = await chrome.runtime.sendMessage({ type: 'API_REQUEST', endpoint });
      if (result.success) this._data = result.data;
      this._fetched = true;
    } catch (err) {
      console.warn('[CarePlanDots] fetch failed:', err);
    }
    return this._data;
  },

  getItem(mdsItem) {
    return this._data?.items?.[mdsItem] || null;
  }
};
window.CarePlanDots = CarePlanDots;

// ============================================
// Loading Status Toast
// ============================================
const SuperLoadingStatus = {
  _el: null,
  _tasks: new Map(), // key → { label, done }

  show() {
    if (this._el) return;
    const el = document.createElement('div');
    el.id = 'super-loading-status';
    el.innerHTML = `<div class="super-loading-status__spinner"></div><span class="super-loading-status__text">Loading...</span>`;
    document.body.appendChild(el);
    this._el = el;
  },

  addTask(key, label) {
    this._tasks.set(key, { label, done: false });
    this.show();
    this._render();
  },

  completeTask(key) {
    const task = this._tasks.get(key);
    if (task) task.done = true;
    this._render();
    // If all done, fade out
    const allDone = [...this._tasks.values()].every(t => t.done);
    if (allDone) {
      setTimeout(() => this.hide(), 600);
    }
  },

  _render() {
    if (!this._el) return;
    const pending = [...this._tasks.values()].filter(t => !t.done);
    const done = [...this._tasks.values()].filter(t => t.done);
    const text = pending.length > 0
      ? pending[0].label + (pending.length > 1 ? ` (+${pending.length - 1} more)` : '')
      : 'Done';
    const textEl = this._el.querySelector('.super-loading-status__text');
    if (textEl) textEl.textContent = text;
    // Update spinner visibility
    const spinner = this._el.querySelector('.super-loading-status__spinner');
    if (spinner) spinner.style.display = pending.length > 0 ? '' : 'none';
  },

  hide() {
    if (this._el) {
      this._el.classList.add('super-loading-status--out');
      setTimeout(() => {
        if (this._el) { this._el.remove(); this._el = null; }
        this._tasks.clear();
      }, 200);
    }
  },

  /**
   * Show a one-off notice (e.g. "AI not run yet") in place of the spinner
   * and auto-hide after durationMs. Also marks every pending task as done
   * so the regular completion path doesn't race or leak spinners.
   */
  showNotice(message, durationMs = 5000) {
    this.show();
    if (!this._el) return;
    this._tasks.forEach(t => { t.done = true; });
    const spinner = this._el.querySelector('.super-loading-status__spinner');
    const text = this._el.querySelector('.super-loading-status__text');
    if (spinner) spinner.style.display = 'none';
    if (text) text.textContent = message;
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => this.hide(), durationMs);
  }
};

// Evidence cache — keyed by "section:itemCode", stores fetched evidence data
const EvidenceCache = new Map();

/**
 * Fetch evidence for a specific MDS item on demand.
 * Returns cached data if previously fetched.
 */
async function fetchItemEvidence(section, itemCode) {
  const cacheKey = `${section}:${itemCode}`;
  if (EvidenceCache.has(cacheKey)) return EvidenceCache.get(cacheKey);

  const params = new URLSearchParams({
    externalAssessmentId: SuperOverlay.assessmentId,
    facilityName: SuperOverlay.facilityName,
    orgSlug: SuperOverlay.orgSlug,
  });
  window.appendMDSContextParams?.(params);
  const endpoint = `/api/extension/mds/sections/${section}/items/${encodeURIComponent(itemCode)}/evidence?${params}`;

  const response = await chrome.runtime.sendMessage({ type: 'API_REQUEST', endpoint });
  if (!response.success) throw new Error(response.error || 'Failed to fetch evidence');

  const item = response.data?.item || {};

  // Section O stores evidence per-column (item.columns.A.evidence, item.columns.B.evidence)
  // rather than at the item top-level. Build a column-keyed map so callers can pick the
  // right column's evidence, and expose a flat merged array as a fallback.
  const evidenceByColumn = {};
  if (item.columns && typeof item.columns === 'object') {
    Object.entries(item.columns).forEach(([col, colData]) => {
      if (colData && Array.isArray(colData.evidence) && colData.evidence.length > 0) {
        evidenceByColumn[col] = colData.evidence;
      }
    });
  }
  const flatEvidence = item.evidence && item.evidence.length
    ? item.evidence
    : Object.values(evidenceByColumn).flat();

  const result = {
    evidence: flatEvidence,
    evidenceByColumn,
    queryEvidence: item.queryEvidence || [],
    validation: item.validation || {},
    columns: item.columns || null,
    // Section J falls data
    falls: item.falls || null,
    fallCount: item.fallCount ?? null,
    lookbackWindow: item.lookbackWindow || null
  };
  EvidenceCache.set(cacheKey, result);
  return result;
}

// Expose on window for other content scripts (query-send-modal.js, etc.)
window.SuperOverlay = SuperOverlay;
window.fetchItemEvidence = fetchItemEvidence;
window.showIncidentDetailModal = showIncidentDetailModal;
window.renderSplitAdministrations = renderSplitAdministrations;
window.renderSplitNote = renderSplitNote;
window.renderSplitTherapy = renderSplitTherapy;
window.renderSplitUda = renderSplitUda;

// ============================================
// Message Listener (existing functionality)
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_FACILITY') {
    const facilityInfo = getFacilityInfo();
    sendResponse(facilityInfo);
  }
  return true;
});

function getFacilityInfo() {
  const facLink = document.getElementById('pccFacLink');
  if (facLink) {
    return {
      facility: facLink.title || facLink.textContent?.trim() || null,
      facilityShort: facLink.textContent?.trim() || null
    };
  }
  return { facility: null, facilityShort: null };
}

// ============================================
// API Integration
// ============================================

/**
 * Extract MDS page parameters from URL
 * URL format: /mds3/section.xhtml?ESOLassessid=4767518&sectioncode=O
 */
function getMDSPageParams() {
  const url = new URL(window.location.href);
  return {
    assessmentId: url.searchParams.get('ESOLassessid'),
    section: url.searchParams.get('sectioncode')
  };
}

/**
 * Gather all parameters needed for API call
 */
async function getAPIParams() {
  const { assessmentId, section } = getMDSPageParams();

  // Get org from background (cookie)
  const orgResponse = getOrg();
  const orgSlug = orgResponse?.org;

  // Get facility from DOM — try multiple sources
  const facilityInfo = getFacilityInfo();
  const chatFacility = typeof getChatFacilityInfo === 'function' ? getChatFacilityInfo() : null;
  const facilityName = facilityInfo?.facility || chatFacility || '';

  return { assessmentId, section, orgSlug, facilityName };
}

// Expose getAPIParams globally for evidence-viewers.js
window.getCurrentParams = getAPIParams;

/**
 * Fetch section data from API via background script
 */
async function fetchSectionData(params) {
  const { assessmentId, section, orgSlug, facilityName } = params;

  const sectionParams = new URLSearchParams({
    externalAssessmentId: assessmentId,
    facilityName,
    orgSlug,
  });
  window.appendMDSContextParams?.(sectionParams);
  const endpoint = `/api/extension/mds/sections/${section}?${sectionParams}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  return response.data;
}

/**
 * Fetch all decisions for this assessment from the server.
 * Returns a map keyed by mdsItem+mdsColumn (e.g. "O0250B", "I2000").
 */
async function fetchDecisions(params) {
  const { assessmentId, orgSlug, facilityName } = params;

  const decisionParams = new URLSearchParams({
    externalAssessmentId: assessmentId,
    facilityName,
    orgSlug,
  });
  window.appendMDSContextParams?.(decisionParams);
  const endpoint = `/api/extension/mds/decisions?${decisionParams}`;

  const response = await chrome.runtime.sendMessage({ type: 'API_REQUEST', endpoint });
  if (!response.success) {
    console.log('Super LTC: Could not fetch decisions', response.error);
    return {};
  }
  return response.data?.decisions || {};
}

// ============================================
// Initialization
// ============================================
async function initSuperOverlay() {
  if (SuperOverlay.initialized) return;

  // Check if we're on an MDS section page
  if (!isMDSPage()) {
    console.log('Super LTC: Not an MDS section page, skipping overlay');
    return;
  }

  console.log('Super LTC: MDS page detected, initializing overlay');

  // Check auth first
  const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  if (!authState.authenticated) {
    console.log('Super LTC: Not authenticated, skipping overlay');
    return;
  }

  try {
    // Gather API parameters
    const params = await getAPIParams();
    console.log('Super LTC: API params:', params);

    // Validate required params
    if (!params.assessmentId || !params.section) {
      console.log('Super LTC: Missing URL params (assessmentId or section)');
      return;
    }

    if (!params.orgSlug || !params.facilityName) {
      console.log('Super LTC: Missing org or facility info');
      return;
    }

    // Fetch section data and decisions in parallel
    console.log('Super LTC: Fetching section data and decisions from API...');
    SuperLoadingStatus.addTask('mds', 'Loading MDS analysis...');
    SuperLoadingStatus.addTask('decisions', 'Loading decisions...');
    const [apiResponse, decisions] = await Promise.all([
      fetchSectionData(params).then(r => { SuperLoadingStatus.completeTask('mds'); return r; }),
      fetchDecisions(params).then(r => { SuperLoadingStatus.completeTask('decisions'); return r; })
    ]);
    console.log('Super LTC: API response:', apiResponse);
    console.log('Super LTC: Decisions:', decisions);

    // Store patientId from assessment for diagnosis queries
    if (apiResponse.assessment?.patientId) {
      SuperOverlay.patientId = apiResponse.assessment.patientId;
      console.log('Super LTC: Stored patientId:', SuperOverlay.patientId);
    }

    // Transform response to overlay format
    const data = transformAPIResponse(apiResponse, params.section);

    if (!data.items || data.items.length === 0) {
      console.log('Super LTC: No items in API response');
      return;
    }

    // Store context for query features and lazy evidence loading.
    // If the backend's ARD-fallback resolver matched a different row (e.g. PCC
    // issued a new externalAssessmentId after the nurse edited ARD/type), prefer
    // the server-returned authoritative id so subsequent calls hit it directly.
    const resolvedId = apiResponse.assessment?.externalAssessmentId;
    const resolvedVia = apiResponse.assessment?.resolvedVia;
    if (resolvedId && resolvedVia && resolvedVia !== 'none' && resolvedId !== params.assessmentId) {
      console.log('Super LTC: ARD-fallback resolver matched via', resolvedVia, '— updating assessmentId', params.assessmentId, '→', resolvedId);
      SuperOverlay.assessmentId = resolvedId;
    } else {
      SuperOverlay.assessmentId = params.assessmentId;
    }
    SuperOverlay.facilityName = params.facilityName;
    SuperOverlay.orgSlug = params.orgSlug;
    SuperOverlay.section = params.section;

    // Store server decisions so processQuestion can look up prior decisions
    SuperOverlay.serverDecisions = decisions;
    await loadDismissedItems();
    processItems(data.items);
    createSummaryPanel();

    SuperOverlay.initialized = true;
    console.log('Super LTC: Overlay initialized with', data.items.length, 'items');

    // Load queries for this assessment (async, non-blocking)
    SuperLoadingStatus.addTask('queries', 'Loading queries...');
    const queriesPromise = loadAssessmentQueries(params.assessmentId, params.facilityName, params.orgSlug);
    if (queriesPromise && queriesPromise.then) {
      queriesPromise.then(() => SuperLoadingStatus.completeTask('queries')).catch(() => SuperLoadingStatus.completeTask('queries'));
    } else {
      SuperLoadingStatus.completeTask('queries');
    }

    // Care plan coverage dots for Section I (async, non-blocking)
    if (params.section === 'I' && SuperOverlay.patientId) {
      SuperLoadingStatus.addTask('careplan', 'Loading care plan coverage...');
      CarePlanDots.fetch(SuperOverlay.patientId, params.facilityName, params.orgSlug)
        .then(() => { injectCarePlanDots(); SuperLoadingStatus.completeTask('careplan'); })
        .catch(() => SuperLoadingStatus.completeTask('careplan'));
    }

  } catch (error) {
    console.error('Super LTC: Failed to fetch section data:', error);
    const msg = String(error?.message || error || '');
    const friendly = /no completed run/i.test(msg)
      ? 'AI analysis not run for this section yet'
      : `Super LTC couldn't load: ${msg || 'unknown error'}`;
    SuperLoadingStatus.showNotice(friendly);
  }
}

function isMDSPage() {
  // Check for MDS-specific elements
  const hasQuestionWrappers = document.querySelectorAll('[id$="_wrapper"]').length > 0;
  const hasSectionNavigation = document.getElementById('sectionnavigation') !== null;
  const urlIndicatesMDS = window.location.href.includes('/mds3/') ||
                          window.location.href.includes('section.xhtml');

  return hasQuestionWrappers && (hasSectionNavigation || urlIndicatesMDS);
}

// ============================================
// Item Processing
// ============================================
function processItems(items) {
  SuperOverlay.results = [];

  console.log('Super LTC: processItems called with', items.length, 'items:', items);

  items.forEach(item => {
    // Process each column (A, B, C)
    Object.keys(item.columns || {}).forEach(column => {
      const aiAnswer = item.columns[column];
      if (!aiAnswer) return;

      // Find the corresponding DOM element
      const elementId = `${item.mdsItem}${column}_wrapper`;
      console.log(`Super LTC: Looking for element: ${elementId}`);
      const questionEl = document.getElementById(elementId);

      if (!questionEl) {
        console.log(`Super LTC: Not found: ${elementId}, trying alternatives...`);
        // Try alternative ID format
        const altElementId = `${item.mdsItem}${column}`;
        const altQuestionEl = document.querySelector(`[id="${altElementId}_wrapper"]`) ||
                              document.querySelector(`[id^="${item.mdsItem}"][id$="${column}_wrapper"]`);
        if (altQuestionEl) {
          console.log(`Super LTC: Found alt element: ${altQuestionEl.id}`);
          processQuestion(altQuestionEl, item, column, aiAnswer);
        } else {
          console.log(`Super LTC: No element found for ${item.mdsItem} col ${column} (n/a field)`);
        }
        return;
      }

      console.log(`Super LTC: Found element: ${elementId}`);
      processQuestion(questionEl, item, column, aiAnswer);
    });
  });

  console.log('Super LTC: processItems complete, SuperOverlay.results:', SuperOverlay.results.length);
}

function processQuestion(questionEl, item, column, aiAnswer) {
  // Get PCC's current answer
  const pccAnswer = getPCCAnswer(questionEl);

  // Determine comparison status
  const status = determineStatus(aiAnswer, pccAnswer);

  // Create result object
  const result = {
    elementId: questionEl.id,
    element: questionEl,
    mdsItem: item.mdsItem,
    column: column,
    description: item.description,
    aiAnswer: aiAnswer,
    pccAnswer: pccAnswer,
    status: status
  };

  // Check server-side decisions — first from decisions endpoint, then from section data
  const decisionKey = column ? `${item.mdsItem}${column}` : item.mdsItem;
  const serverDecision = SuperOverlay.serverDecisions[decisionKey];
  if (serverDecision) {
    const dismissKey = `${item.mdsItem}-${column}`;
    result.userDecision = serverDecision;
    if (serverDecision.decision === 'disagree') {
      SuperOverlay.dismissedItems.add(dismissKey);
      result.status = 'dismissed';
    } else if (serverDecision.decision === 'agree') {
      SuperOverlay.dismissedItems.add(dismissKey);
      result.status = 'dismissed';
    }
  } else if (aiAnswer.userDecision?.decision === 'disagree') {
    const dismissKey = `${item.mdsItem}-${column}`;
    SuperOverlay.dismissedItems.add(dismissKey);
    result.status = 'dismissed';
    result.userDecision = aiAnswer.userDecision;
  } else if (aiAnswer.userDecision?.decision === 'agree') {
    result.userDecision = aiAnswer.userDecision;
  }

  SuperOverlay.results.push(result);

  // Inject badge
  injectBadge(questionEl, result);
}

function getPCCAnswer(questionEl) {
  // Look for selected response - return raw data-value
  const selectedResponse = questionEl.querySelector('.responses a.selected');
  if (selectedResponse) {
    return selectedResponse.getAttribute('data-value');
  }

  // Try to find from signed response area
  const signedResponse = questionEl.querySelector('.signed_response .responses a.selected');
  if (signedResponse) {
    return signedResponse.getAttribute('data-value');
  }

  // Check for locked response
  const lockedResponse = questionEl.querySelector('.locked_response .responses a.selected');
  if (lockedResponse) {
    return lockedResponse.getAttribute('data-value');
  }

  // Check for numeric input (like K0200 height/weight)
  const numericInput = questionEl.querySelector('.readonlyquestionvalue b');
  if (numericInput) {
    return numericInput.textContent?.trim();
  }

  return null;
}

/**
 * Normalize answer to common format for comparison
 * Converts yes/no to 1/0, handles needs_review, etc.
 */
function normalizeAnswer(answer) {
  if (!answer) return null;
  const lower = String(answer).toLowerCase().trim();

  // Convert yes/no to 1/0
  if (lower === 'yes') return '1';
  if (lower === 'no') return '0';
  if (lower === 'dash') return '-';
  if (lower === 'needs_review') return null; // Treat as no answer for comparison

  return lower;
}

/**
 * Format answer for display (converts 0/1 to No/Yes for readability)
 * @param {string|number} answer - The answer value
 * @param {boolean} isNumeric - If true, display as number (don't convert 0/1 to No/Yes)
 */
function formatAnswerForDisplay(answer, isNumeric = false) {
  if (answer === null || answer === undefined) return '?';
  const str = String(answer).trim();

  // For numeric fields (like day counts), display as-is
  if (isNumeric) {
    return str;
  }

  // Convert 0/1 to No/Yes for better readability
  if (str === '0') return 'No';
  if (str === '1') return 'Yes';
  if (str === '-') return '-';

  return str.toUpperCase();
}

function determineStatus(aiAnswer, pccAnswer) {
  // Check if dismissed
  const key = `${aiAnswer.mdsItem}-${aiAnswer.column}`;
  if (SuperOverlay.dismissedItems.has(key)) {
    return 'dismissed';
  }

  // Section I: Handle special status values (code, needs_physician_query, dont_code, needs_review)
  if (aiAnswer.status === 'needs_physician_query' || aiAnswer.status === 'needs_review') {
    return 'review';
  }

  // Section I: code/dont_code statuses are definitive - skip confidence check
  const hasDefinitiveStatus = aiAnswer.status === 'code' || aiAnswer.status === 'dont_code';

  // Section M: Use comparisonStatus from API if available
  if (aiAnswer.comparisonStatus) {
    switch (aiAnswer.comparisonStatus) {
      case 'match':
        return 'match';
      case 'mismatch':
        return 'mismatch';
      case 'needs_review':
      case 'not_coded':
        return 'review';
    }
  }

  // Needs review if low/medium confidence or needs_review answer
  // BUT skip this check if we have a definitive status (code/dont_code)
  if (!hasDefinitiveStatus) {
    if (aiAnswer.confidence === 'low' || aiAnswer.confidence === 'medium') {
      return 'review';
    }

    if (aiAnswer.answer?.toLowerCase() === 'needs_review') {
      return 'review';
    }
  }

  // Normalize both answers for comparison
  // Use status field to derive answer for Section I items (code=Yes, dont_code=No)
  let aiValue;
  if (aiAnswer.status === 'dont_code') {
    aiValue = '0'; // No
  } else if (aiAnswer.status === 'code') {
    aiValue = '1'; // Yes
  } else {
    aiValue = normalizeAnswer(aiAnswer.answer);
  }
  const pccValue = normalizeAnswer(pccAnswer);

  if (!pccValue) {
    return 'review'; // No PCC answer yet
  }

  if (aiValue === pccValue) {
    return 'match';
  }

  return 'mismatch';
}

// ============================================
// Badge Injection
// ============================================
function injectBadge(questionEl, result) {
  // Remove existing badge if any
  const existingBadge = questionEl.querySelector('.super-badge');
  if (existingBadge) {
    existingBadge.remove();
  }

  // Create badge
  const badge = document.createElement('div');
  badge.className = 'super-badge';
  badge.setAttribute('data-mds-item', result.mdsItem);
  badge.setAttribute('data-column', result.column);

  // Set status class and text
  const answerText = formatAnswerForDisplay(result.aiAnswer.answer, result.aiAnswer.isNumeric);

  switch (result.status) {
    case 'match':
      badge.classList.add('super-badge--match');
      badge.innerHTML = `<span class="super-badge__icon">&#10003;</span> Super: ${answerText}`;
      break;
    case 'mismatch':
      badge.classList.add('super-badge--mismatch');
      badge.innerHTML = `<span class="super-badge__icon">&#10007;</span> Super: ${answerText}`;
      break;
    case 'review':
      badge.classList.add('super-badge--review');
      badge.innerHTML = `<span class="super-badge__icon">&#9888;</span> Super: ${answerText}`;
      break;
    case 'dismissed':
      if (result.userDecision?.decision === 'disagree') {
        badge.classList.add('super-badge--mismatch', 'super-badge--dismissed', 'super-badge--disagreed');
        badge.innerHTML = `<span class="super-badge__icon">&#10007;</span> Dismissed`;
      } else {
        badge.classList.add('super-badge--match', 'super-badge--dismissed');
        badge.innerHTML = `<span class="super-badge__icon">&#10003;</span> Super: ${answerText}`;
      }
      break;
  }

  // Add click handler
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    window.SuperAnalytics?.track?.('mds_badge_clicked', {
      item_code: String(result.mdsItem || ''),
      column: String(result.column || ''),
      status: String(result.status || ''),
    });
    showPopover(badge, result);
  });

  // Find the best place to insert the badge based on question type
  const questionType = questionEl.getAttribute('data-questiontype');

  if (questionType === 'rad') {
    // For radio questions, place badge after the question label
    const questionLabel = questionEl.querySelector('.question_label');
    if (questionLabel) {
      badge.style.display = 'inline-block';
      badge.style.marginLeft = '12px';
      badge.style.verticalAlign = 'middle';
      questionLabel.appendChild(badge);
    } else {
      // Fallback: append to question element
      questionEl.appendChild(badge);
    }
  } else {
    // For other question types (checkboxes, numeric), place after responses
    const responseArea = questionEl.querySelector('.question_content') ||
                         questionEl.querySelector('.responses')?.parentElement;

    if (responseArea) {
      const responsesUl = responseArea.querySelector('.responses');
      if (responsesUl) {
        responsesUl.style.display = 'inline-block';
        responsesUl.parentElement.appendChild(badge);
      } else {
        responseArea.appendChild(badge);
      }
    }
  }

  // Add secondary query badge for Section I items (all diagnoses can be queried)
  // Uses QueryBadges module which shows status if query exists, or "Query" button if not
  if (result.mdsItem && result.mdsItem.startsWith('I')) {
    QueryBadges.injectQueryBadge(questionEl, result, badge);
  }
}

// ============================================
// Care Plan Dots — Injection (Section I)
// ============================================

/**
 * Extract ICD-10 code from an I8000 question element.
 * Signed MDS: value lives in `.readonlyquestionvalue` (e.g. "K62.1    RECTAL POLYP").
 * Open MDS: value lives in the row's `<input type="text">` (e.g. value="Z47.1").
 */
function extractIcd10FromElement(questionEl) {
  const codeRegex = /^([A-Z]\d[\dA-Z]*\.?\d*)/i;

  const readonlyVal = questionEl.querySelector('.readonlyquestionvalue')?.textContent?.trim();
  if (readonlyVal && readonlyVal !== '{blank}') {
    const m = readonlyVal.match(codeRegex);
    if (m) return m[1];
  }

  const input = questionEl.querySelector('input[type="text"][id^="I8000"]');
  const inputVal = input?.value?.trim();
  if (inputVal) {
    const m = inputVal.match(codeRegex);
    if (m) return m[1];
  }

  return null;
}

/**
 * Find a matching diagnosis for an ICD-10 code across I8000 items AND otherDiagnoses.
 */
function findI8000Match(icd10) {
  if (!CarePlanDots._data) return null;
  // Check I8000 matchedDiagnoses first
  const i8000 = CarePlanDots.getItem('I8000');
  if (i8000) {
    const match = i8000.matchedDiagnoses.find(d => d.code === icd10);
    if (match) return match;
  }
  // Then check otherDiagnoses
  const others = CarePlanDots._data.otherDiagnoses || [];
  const otherMatch = others.find(d => d.code === icd10);
  if (otherMatch) return otherMatch;
  return null;
}

/**
 * Append a care plan shield dot to a target element.
 */
function appendShieldDot(targetEl, dotStatus, clickData) {
  // Remove existing
  const existing = targetEl.querySelector('.super-careplan-dot');
  if (existing) existing.remove();

  const shieldColor = dotStatus === 'covered' ? '#22c55e' : dotStatus === 'partial' ? '#f59e0b' : '#ef4444';
  const dot = document.createElement('span');
  dot.className = `super-careplan-dot super-careplan-dot--${dotStatus}`;
  dot.title = `Care Plan: ${dotStatus}`;
  dot.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${shieldColor}" stroke="${shieldColor}" stroke-width="1"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

  dot.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCarePlanInline(dot, clickData);
  });

  targetEl.appendChild(dot);
}

/**
 * Inject care plan dots on all Section I items after coverage data loads.
 */
function injectCarePlanDots() {
  if (!CarePlanDots._data) return;

  // 1. Standard Section I items (have solver badges in SuperOverlay.results)
  SuperOverlay.results.forEach(result => {
    if (!result.mdsItem || !result.mdsItem.startsWith('I')) return;
    if (result.mdsItem.startsWith('I8000')) return; // handled below

    const questionEl = result.element;
    if (!questionEl) return;

    const mainBadge = questionEl.querySelector('.super-badge');
    if (!mainBadge || !mainBadge.parentElement) return;

    const coverage = CarePlanDots.getItem(result.mdsItem);
    if (!coverage) return;

    appendShieldDot(mainBadge.parentElement, coverage.overallStatus, {
      diagnoses: coverage.matchedDiagnoses,
      label: `${result.mdsItem} \u2014 ${coverage.label || ''}`,
      unchecked: coverage.unchecked || false
    });
  });

  // 2. I8000 items — scan DOM directly (may not have solver badges)
  const i8000Wrappers = document.querySelectorAll('[id^="I8000"][id$="_wrapper"]');
  i8000Wrappers.forEach(questionEl => {
    const icd10 = extractIcd10FromElement(questionEl);
    if (!icd10) return; // blank slot

    const match = findI8000Match(icd10);
    if (!match) return;

    const status = match.carePlanStatus || 'missing';

    // Find where to append — after badge if exists, else after question_label
    let targetEl = questionEl.querySelector('.super-badge')?.parentElement;
    if (!targetEl) {
      targetEl = questionEl.querySelector('.question_label');
    }
    if (!targetEl) return;

    appendShieldDot(targetEl, status, {
      diagnoses: [match],
      label: `I8000 \u2014 ${icd10}`
    });
  });
}

/**
 * Toggle an inline detail panel for a care plan dot.
 * Simplified: shows status + focus name + short reason. No ICD-10 clutter.
 */
function toggleCarePlanInline(dot, data) {
  const parent = dot.parentElement;
  const existingPanel = parent.querySelector('.super-careplan-inline');
  if (existingPanel) {
    existingPanel.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'super-careplan-inline';

  const statusLabels = { covered: 'Care Planned', partial: 'Partially Care Planned', missing: 'Not Care Planned' };
  const statusColors = { covered: '#16a34a', partial: '#d97706', missing: '#dc2626' };

  // Handle unchecked items (coded on MDS but never AI-analyzed)
  if (data.unchecked) {
    panel.innerHTML = `
      <div style="border-left: 3px solid #dc2626; padding: 8px 10px; border-radius: 4px; background: #fff;">
        <div style="font-size: 13px; font-weight: 700; color: #dc2626; margin-bottom: 3px;">Not Care Planned</div>
        <div style="font-size: 12px; color: #475569; line-height: 1.5;">This diagnosis is coded on the MDS but has not been evaluated for care plan coverage yet.</div>
      </div>`;
    parent.appendChild(panel);
    return;
  }

  (data.diagnoses || []).forEach(d => {
    const status = d.carePlanStatus || d.status || 'missing';
    const color = statusColors[status] || '#64748b';
    const label = statusLabels[status] || status;

    let focusName = '';
    if (d.matchedFocus) {
      focusName = d.matchedFocus.split('\n')[0].split('--')[0].trim();
      focusName = focusName.replace(/\s+AEB\s*$/i, '').trim();
    }

    let html = `
      <div style="border-left: 3px solid ${color}; padding: 6px 10px; margin-bottom: 6px; border-radius: 4px; background: #fff;">
        <div style="font-size: 12px; font-weight: 700; color: ${color}; margin-bottom: 2px;">${label}</div>`;

    if (focusName) {
      html += `<div style="font-size: 12px; color: #334155; line-height: 1.4;">${escapeHTML(focusName)}</div>`;
    }

    if (d.reason) {
      html += `<div style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 4px;">${escapeHTML(d.reason)}</div>`;
    }

    html += `</div>`;
    panel.innerHTML += html;
  });

  parent.appendChild(panel);
}

// ============================================
// Popover Component
// ============================================
function showPopover(anchorEl, result) {
  // Remove any existing popover and backdrop
  closePopover();

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'super-backdrop';
  backdrop.addEventListener('click', closePopover);
  document.body.appendChild(backdrop);

  // Create popover
  const popover = document.createElement('div');
  popover.className = 'super-popover';
  popover.innerHTML = buildPopoverHTML(result);

  // Store evidence data for split-view access (populated lazily)
  popover._evidence = [];
  popover._result = result;
  popover._docCache = new Map();
  popover._anchorEl = anchorEl;
  popover._section = SuperOverlay.section;

  // Position popover
  document.body.appendChild(popover);
  positionPopover(popover, anchorEl);

  // Setup event listeners
  setupPopoverListeners(popover, result);

  // Prefetch all PDF documents
  prefetchDocuments(popover);
}

/**
 * Build care plan coverage HTML for popover (Section I items only).
 */
function renderCarePlanCoverage(result) {
  if (!result.mdsItem || !result.mdsItem.startsWith('I') || !CarePlanDots._data) return '';

  let coverage = null;
  let diagnoses = [];

  if (result.mdsItem.startsWith('I8000')) {
    const icd10 = extractIcd10FromElement(result.element);
    if (!icd10) return '';
    const i8000 = CarePlanDots.getItem('I8000');
    if (!i8000) return '';
    const match = i8000.matchedDiagnoses.find(d => d.code === icd10);
    if (!match) return '';
    diagnoses = [match];
    coverage = { overallStatus: match.carePlanStatus };
  } else {
    coverage = CarePlanDots.getItem(result.mdsItem);
    if (!coverage) return '';
    diagnoses = coverage.matchedDiagnoses || [];
  }

  const status = coverage.overallStatus;
  const statusColors = { covered: '#22c55e', partial: '#f59e0b', missing: '#ef4444' };
  const statusLabels = { covered: 'Care Planned', partial: 'Partially Care Planned', missing: 'Not Care Planned' };
  const color = statusColors[status] || '#9ca3af';
  const label = statusLabels[status] || status;

  // Build detail content (hidden by default)
  let detailHTML = '';
  if (coverage.unchecked) {
    detailHTML = `<div style="font-size: 12px; color: #475569; line-height: 1.5;">Coded on MDS but not yet evaluated for care plan coverage.</div>`;
  } else {
  diagnoses.forEach(d => {
    let focusName = '';
    if (d.matchedFocus) {
      focusName = d.matchedFocus.split('\n')[0].split('--')[0].trim().replace(/\s+AEB\s*$/i, '').trim();
    }
    if (focusName) {
      detailHTML += `<div style="font-size: 12px; color: #334155; line-height: 1.4; margin-bottom: 2px;">
        <strong>Focus:</strong> ${escapeHTML(focusName)}
      </div>`;
    }
    if (d.reason) {
      detailHTML += `<div style="font-size: 12px; color: #475569; line-height: 1.5; margin-top: 4px;">${escapeHTML(d.reason)}</div>`;
    }
  });
  } // end else (not unchecked)

  let html = `
    <div class="super-careplan-popover-section" style="margin: 10px 0; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-left: 3px solid ${color}; cursor: pointer;"
         onclick="var d=this.querySelector('.super-careplan-popover-detail');var a=this.querySelector('.super-careplan-popover-chevron');if(d.style.display==='none'){d.style.display='block';a.textContent='\\u25BC'}else{d.style.display='none';a.textContent='\\u25B6'}">
      <div style="display: flex; align-items: center; gap: 6px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span style="font-size: 12px; font-weight: 700; color: ${color};">${label}</span>
        <span class="super-careplan-popover-chevron" style="font-size: 9px; color: #94a3b8; margin-left: auto;">&#9654;</span>
      </div>
      <div class="super-careplan-popover-detail" style="display: none; margin-top: 6px;">${detailHTML}</div>
    </div>`;
  return html;
}

function buildPopoverHTML(result) {
  const ai = result.aiAnswer;
  const confidenceDots = renderConfidenceDots(ai.confidence);
  const totalEvidenceCount = (ai.evidenceCount || 0) + (ai.queryEvidenceCount || 0);
  const evidenceHTML = renderEvidencePlaceholder(totalEvidenceCount);
  const datesHTML = renderDates(ai);
  const triggersHTML = renderTriggers(ai.triggers);
  const icd10HTML = renderIcd10Suggestions(ai.suggestedIcd10);
  const statusBadgeHTML = renderStatusBadge(ai.status);

  // Section E: Distinct dates for frequency items
  const distinctDatesHTML = renderDistinctDates(ai.distinctDates);

  // Section H: Incontinence episode dates
  const incontinenceEpisodeDatesHTML = renderIncontinenceEpisodeDates(ai.incontinenceEpisodeDates, ai.lookbackWindow);

  // Section N: Lookback context line for numeric items (N0300, N0350A, N0350B)
  const sectionNLookbackHTML = renderSectionNLookback(result.mdsItem, ai.lookbackWindow);

  // Section N: Medications
  const injectionsHTML = renderMedications(ai.injections, 'Injections');
  const insulinHTML = renderMedications(ai.insulinInjections, 'Insulin Injections');
  const medicationsTakenHTML = renderMedications(ai.medicationsTaken, 'Medications Taken');
  const routineMedsHTML = renderMedications(ai.routineMedications, 'Routine Medications');
  const prnMedsHTML = renderMedications(ai.prnMedications, 'PRN Medications');
  const indicationsHTML = renderMedicationIndications(ai.medicationsWithIndication);
  const orderChangesHTML = renderOrderChanges(ai.orderChanges);
  const issuesHTML = renderDrugRegimenIssues(ai.issuesFound);

  // Section J: Falls
  const fallsHTML = ai.falls && ai.falls.length > 0
    ? renderFalls(ai.falls, ai.fallCount, ai.lookbackWindow)
    : (ai.fallCount > 0 ? renderFallsPlaceholder(ai.fallCount) : '');

  return `
    <div class="super-popover-header">
      <div>
        <div class="super-popover-header__title">${result.mdsItem} - ${result.description}</div>
        <div class="super-popover-header__subtitle">Column ${result.column}${statusBadgeHTML}</div>
      </div>
      <!-- NO_TRACK: close-X -->
      <button class="super-popover-close" aria-label="Close">&times;</button>
    </div>
    <div class="super-popover-body">
      <div class="super-answer-row">
        <div class="super-answer">
          <span class="super-answer__label">Super Answer:</span>
          <span class="super-answer__value super-answer__value--${normalizeAnswer(ai.answer)}">${formatAnswerForDisplay(ai.answer, ai.isNumeric)}</span>
        </div>
        <div class="super-confidence">
          <span class="super-confidence__label">Confidence:</span>
          <div class="super-confidence__dots">${confidenceDots}</div>
        </div>
      </div>
      ${sectionNLookbackHTML}

      ${result.pccAnswer ? `
      <div class="super-answer-row" style="padding-top: 0; border: none; margin-bottom: 8px;">
        <div class="super-answer">
          <span class="super-answer__label">PCC Answer:</span>
          <span class="super-answer__value super-answer__value--${normalizeAnswer(result.pccAnswer)}">${formatAnswerForDisplay(result.pccAnswer, ai.isNumeric)}</span>
        </div>
        <div style="font-size: 12px; color: ${result.status === 'match' ? 'var(--super-match)' : result.status === 'mismatch' ? 'var(--super-mismatch)' : 'var(--super-review)'}; font-weight: 600;">
          ${result.status === 'match' ? 'Match' : result.status === 'mismatch' ? 'Mismatch' : 'Needs Review'}
        </div>
      </div>
      ` : ''}

      ${ai.diagnosisSummary || ai.treatmentSummary ? `
      <div class="super-step-lines" style="display: flex; flex-direction: column; gap: 4px; margin: 8px 0;">
        ${ai.diagnosisSummary ? `
        <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.4;">
          <span style="flex-shrink: 0; color: ${ai.diagnosisPassed ? 'var(--super-match)' : 'var(--super-mismatch)'}; font-weight: 700;">${ai.diagnosisPassed ? '\u2713' : '\u2717'}</span>
          <span><strong style="color: var(--super-gray-600);">Dx:</strong> <span style="color: var(--super-gray-500);">${escapeHTML(ai.diagnosisSummary)}</span></span>
        </div>
        ` : ''}
        ${ai.treatmentSummary ? `
        <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.4;">
          <span style="flex-shrink: 0; color: ${ai.activeStatusPassed ? 'var(--super-match)' : 'var(--super-mismatch)'}; font-weight: 700;">${ai.activeStatusPassed ? '\u2713' : '\u2717'}</span>
          <span><strong style="color: var(--super-gray-600);">Tx:</strong> <span style="color: var(--super-gray-500);">${escapeHTML(ai.treatmentSummary)}</span></span>
        </div>
        ` : ''}
      </div>
      ` : ''}

      ${renderCarePlanCoverage(result)}

      <div class="super-rationale super-rationale--collapsed">
        <div class="super-rationale__label" onclick="this.parentElement.classList.toggle('super-rationale--collapsed')">Rationale <span class="super-rationale__chevron">&#9660;</span></div>
        <div class="super-rationale__text">${ai.rationale || 'No rationale provided.'}</div>
      </div>

      ${triggersHTML}
      ${icd10HTML}
      ${distinctDatesHTML}
      ${incontinenceEpisodeDatesHTML}
      ${injectionsHTML}
      ${insulinHTML}
      ${medicationsTakenHTML}
      ${routineMedsHTML}
      ${prnMedsHTML}
      ${indicationsHTML}
      ${orderChangesHTML}
      ${issuesHTML}
      ${fallsHTML}
      ${datesHTML}
      ${evidenceHTML}
    </div>
    <div class="super-popover-actions">
      <!-- NO_TRACK: legacy MDS overlay popover action; engagement covered by downstream query_modal_opened / disagree form -->
      <button class="super-btn super-btn--agree" data-action="agree">&#10003; Agree</button>
      <!-- NO_TRACK: legacy MDS overlay popover action -->
      <button class="super-btn super-btn--disagree" data-action="disagree">&#10007; Disagree</button>
      ${result.mdsItem && result.mdsItem.startsWith('I') ? `
        <!-- NO_TRACK: opens QuerySendModal which fires its own query_modal_opened -->
        <button class="super-btn super-btn--query" data-action="query">? Query Physician</button>
      ` : ''}
    </div>
  `;
}

// Helper: Render status badge for Section I items
function renderStatusBadge(status) {
  if (!status) return '';

  const badges = {
    'code': '<span style="margin-left: 8px; background: #059669; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Recommend Coding</span>',
    'needs_physician_query': '<span style="margin-left: 8px; background: #d97706; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Query Physician</span>',
    'dont_code': '<span style="margin-left: 8px; background: #6b7280; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">No Evidence</span>'
  };

  return badges[status] || '';
}

// Helper: Render triggers for Section I needs_physician_query items
function renderTriggers(triggers) {
  if (!triggers || triggers.length === 0) return '';

  const triggerItems = triggers.map(t => {
    const operator = { lt: '<', gt: '>', lte: '≤', gte: '≥', eq: '=' }[t.operator] || t.operator;
    return `
      <div class="super-trigger-item">
        <span class="super-trigger-item__type">${t.type?.toUpperCase() || 'LAB'}</span>
        <span class="super-trigger-item__detail">${t.field}: ${t.actualValue} ${operator} ${t.threshold}</span>
        ${t.metAt ? `<span class="super-trigger-item__date">${t.metAt}</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="super-triggers-section">
      <div class="super-triggers-section__label">Triggers Found</div>
      <div class="super-triggers-list">${triggerItems}</div>
    </div>
  `;
}

// Helper: Render ICD10 suggestions for Section I items
function renderIcd10Suggestions(icd10Codes) {
  if (!icd10Codes || icd10Codes.length === 0) return '';

  return `
    <div class="super-icd10-section">
      <div class="super-icd10-section__label">Suggested ICD-10 Codes</div>
      <div class="super-icd10-list">
        ${icd10Codes.map(code => `<span class="super-icd10-code">${code}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderConfidenceDots(confidence) {
  const levels = { high: 3, medium: 2, low: 1 };
  const level = levels[confidence] || 1;

  let dots = '';
  for (let i = 0; i < 3; i++) {
    const filled = i < level;
    dots += `<div class="super-confidence__dot ${filled ? 'super-confidence__dot--filled ' + confidence : ''}"></div>`;
  }
  return dots;
}

function renderEvidenceCard(ev, evIdx) {
  // Handle multiple evidence formats:
  // - Section I documents: quoteText, displayName, rationale
  // - Section I orders/admins: orderDescription, displayName, rationale (quoteText may be null)
  // - Other sections: quote, sourceType
  const quote = ev.quoteText || ev.orderDescription || ev.quote || ev.text || '';
  const sourceType = ev.sourceType || ev.type || inferSourceType(ev.displayName, ev.evidenceId);
  const typeClass = `super-evidence-card__type--${sourceType}`;
  const typeLabel = ev.displayName || formatSourceType(sourceType);

  // Use rationale as display text for admin/order evidence that has no quote
  const displayText = quote || ev.rationale || '';

  // Skip if nothing to display at all
  if (!displayText) return '';

  // Check if this is an order evidence that can show administrations
  const isOrder = sourceType === 'order';
  const orderId = ev.sourceId || ev.evidenceId || '';

  // Check if this evidence has a viewable type (clinical note, therapy doc, PDF)
  const { viewerType, id: viewerId, chunk: viewerChunk } = typeof parseEvidenceForViewer === 'function'
    ? parseEvidenceForViewer(ev)
    : { viewerType: null, id: null };

  const isViewable = isOrder || viewerType;
  const clickableClass = isViewable ? 'super-evidence-card--clickable' : '';

  // Data attributes for click handling
  let dataAttrs = '';
  if (isOrder) {
    dataAttrs = `data-order-id="${orderId}"`;
  } else if (viewerType) {
    dataAttrs = `data-viewer-type="${viewerType}" data-viewer-id="${viewerId}"`;
    // Add quote text for highlighting in therapy documents
    if (quote) {
      const escapedQuote = quote.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      dataAttrs += ` data-quote="${escapedQuote}"`;
    }
    // Add wordBlocks data if available (for PDF documents)
    if (ev.wordBlocks && Array.isArray(ev.wordBlocks) && ev.wordBlocks.length > 0) {
      const wordBlocksJson = JSON.stringify(ev.wordBlocks).replace(/"/g, '&quot;');
      dataAttrs += ` data-word-blocks="${wordBlocksJson}"`;
    }
  }

  // Action text based on type
  let actionText = '';
  if (isOrder) actionText = 'View Administrations';
  else if (viewerType === 'therapy-document') actionText = 'View Document';
  else if (viewerType === 'clinical-note') actionText = 'View Note';
  else if (viewerType === 'document') actionText = 'View PDF';
  else if (viewerType === 'uda') actionText = 'View Assessment';

  const actionHTML = isViewable ? `
    <div class="super-evidence-card__action">
      <span>${actionText}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </div>
  ` : '';

  // Don't repeat rationale if it's already the display text
  const showRationale = ev.rationale && quote;

  return `
    <div class="super-evidence-card ${clickableClass}" ${dataAttrs} data-ev-idx="${evIdx}">
      <div class="super-evidence-card__header">
        <span class="super-evidence-card__type ${typeClass}">${typeLabel}</span>
      </div>
      <div class="super-evidence-card__quote">${displayText}</div>
      ${showRationale ? `<div class="super-evidence-card__rationale">${ev.rationale}</div>` : ''}
      ${actionHTML}
    </div>
  `;
}

function getEvidenceCategoryOverlay(ev) {
  const sourceType = ev.sourceType || ev.type || inferSourceType(ev.displayName, ev.evidenceId);
  const evidenceId = ev.evidenceId || ev.sourceId || '';
  if (sourceType === 'order' || sourceType === 'mar' || evidenceId.startsWith('order-') || evidenceId.startsWith('admin-') || evidenceId.startsWith('mar-')) return 'orders';
  if (sourceType === 'progress-note' || sourceType === 'nursing-note' || sourceType === 'clinical_note' || evidenceId.startsWith('pcc-prognote-') || evidenceId.startsWith('pcc-practnote-') || evidenceId.startsWith('patient-practnote-')) return 'notes';
  if (sourceType === 'document' || sourceType === 'therapy-doc' || evidenceId.startsWith('therapy-doc-') || evidenceId.includes('-chunk-')) return 'documents';
  if (sourceType) return 'other';
  return 'documents';
}

const OVERLAY_CATEGORY_LABELS = { orders: 'Orders', notes: 'Notes', documents: 'Documents', other: 'Other' };

function renderEvidence(evidence) {
  if (!evidence || evidence.length === 0) {
    return '';
  }

  // Categorize
  const categories = {};
  evidence.forEach(ev => {
    const cat = getEvidenceCategoryOverlay(ev);
    categories[cat] = (categories[cat] || 0) + 1;
  });
  const catKeys = Object.keys(categories).sort();
  const showChips = catKeys.length > 1;

  // Tag each card with its category
  const cards = evidence.map((ev, evIdx) => {
    const card = renderEvidenceCard(ev, evIdx);
    if (!card) return '';
    const cat = getEvidenceCategoryOverlay(ev);
    return card.replace('<div class="super-evidence-card', `<div data-ev-cat="${cat}" class="super-evidence-card`);
  }).filter(c => c).join('');

  if (!cards) return '';

  const chipsHTML = showChips ? `
    <div class="super-ev-filters">
      <!-- NO_TRACK: evidence category filter sub-control inside popover -->
      <button class="super-ev-chip super-ev-chip--active" data-ev-filter="all">All (${evidence.length})</button>
      ${catKeys.map(cat => `<button class="super-ev-chip" data-ev-filter="${cat}">${OVERLAY_CATEGORY_LABELS[cat] || cat} (${categories[cat]})</button>`).join('')} <!-- NO_TRACK: evidence category filter sub-control -->
    </div>
  ` : '';

  return `
    <div class="super-evidence-section">
      <div class="super-evidence-section__label">Evidence (${evidence.length})</div>
      ${chipsHTML}
      <div class="super-evidence-list">${cards}</div>
    </div>
  `;
}

function renderEvidencePlaceholder(count) {
  if (!count) return '';
  return `
    <div class="super-evidence-section" data-evidence-section>
      <div class="super-evidence-section__label">Evidence (${count})</div>
      <div class="super-evidence-list" data-evidence-container>
        <div class="super-evidence-loading"><div class="super-viewer-loading__spinner"></div><span>Loading evidence...</span></div>
      </div>
    </div>
  `;
}

// Helper: Infer source type from filename/evidenceId for Section I evidence
function inferSourceType(displayName, evidenceId) {
  // Check evidenceId first (e.g., "order-jc9js716uh70", "admin-zm8ur6f0uhs7")
  if (evidenceId) {
    if (evidenceId.startsWith('order-')) return 'order';
    if (evidenceId.startsWith('admin-')) return 'order';
    if (evidenceId.startsWith('mar-')) return 'mar';
    if (evidenceId.startsWith('lab-')) return 'lab-result';
  }

  if (!displayName) return 'document';
  const lower = displayName.toLowerCase();
  if (lower.includes('dc_summary') || lower.includes('discharge')) return 'progress-note';
  if (lower.includes('lab')) return 'lab-result';
  if (lower.includes('order')) return 'order';
  if (lower.includes('mar')) return 'mar';
  if (lower.includes('vital')) return 'vital-signs';
  if (lower.includes('nursing')) return 'nursing-note';
  if (lower.includes('history') || lower.includes('h&p') || lower.includes('physical')) return 'progress-note';
  if (lower.includes('eval') || lower.includes('st ') || lower.includes('slp')) return 'progress-note';
  return 'document';
}

function formatSourceType(type) {
  const labels = {
    'order': 'Order',
    'mar': 'MAR',
    'lab-result': 'Lab',
    'progress-note': 'Progress Note',
    'nursing-note': 'Nursing Note',
    'vital-signs': 'Vitals'
  };
  return labels[type] || type;
}

function renderDates(aiAnswer) {
  if (!aiAnswer.firstAdministered && !aiAnswer.lastAdministered && !aiAnswer.startDate) {
    return '';
  }

  let datesHTML = '<div class="super-dates">';

  if (aiAnswer.startDate) {
    datesHTML += `
      <div class="super-dates__item">
        <span class="super-dates__label">Start:</span>
        <span class="super-dates__value">${aiAnswer.startDate}</span>
      </div>
    `;
  }

  if (aiAnswer.firstAdministered) {
    datesHTML += `
      <div class="super-dates__item">
        <span class="super-dates__label">First:</span>
        <span class="super-dates__value">${aiAnswer.firstAdministered}</span>
      </div>
    `;
  }

  if (aiAnswer.lastAdministered) {
    datesHTML += `
      <div class="super-dates__item">
        <span class="super-dates__label">Last:</span>
        <span class="super-dates__value">${aiAnswer.lastAdministered}</span>
      </div>
    `;
  }

  datesHTML += '</div>';
  return datesHTML;
}

// Helper: Render distinct dates for Section E frequency items
function renderDistinctDates(distinctDates) {
  if (!distinctDates || distinctDates.length === 0) return '';

  return `
    <div class="super-dates-section">
      <div class="super-dates-section__label">Dates Observed (${distinctDates.length})</div>
      <div class="super-dates-list">
        ${distinctDates.map(date => `<span class="super-date-chip">${date}</span>`).join('')}
      </div>
    </div>
  `;
}

// Helper: Render lookback context line for Section N numeric items
function renderSectionNLookback(mdsItem, lookbackWindow) {
  const isNumericN = mdsItem === 'N0300' || mdsItem === 'N0350A' || mdsItem === 'N0350B';
  if (!isNumericN || !lookbackWindow) return '';
  return `<div class="super-lookback-info">Lookback: ${lookbackWindow.startDate} – ${lookbackWindow.endDate} (${lookbackWindow.daysCovered} days)</div>`;
}

// Helper: Render incontinence episode dates for Section H
function renderIncontinenceEpisodeDates(episodeDates, lookbackWindow) {
  if (!episodeDates || episodeDates.length === 0) return '';

  const lookbackInfo = lookbackWindow
    ? `<div class="super-lookback-info">Lookback: ${lookbackWindow.startDate} - ${lookbackWindow.endDate}</div>`
    : '';

  return `
    <div class="super-dates-section">
      <div class="super-dates-section__label">Episode Dates (${episodeDates.length})</div>
      ${lookbackInfo}
      <div class="super-dates-list">
        ${episodeDates.map(date => `<span class="super-date-chip">${date}</span>`).join('')}
      </div>
    </div>
  `;
}

// Helper: Render medications for Section N items
function renderMedications(medications, label = 'Medications') {
  if (!medications || medications.length === 0) return '';

  const medItems = medications.map(med => {
    const hasAdmins = med.administrationCount && med.administrationCount > 0;
    const orderId = med.orderId || med.sourceId || '';
    const isClickable = hasAdmins && orderId;

    const adminInfo = hasAdmins
      ? `<span class="super-med-admin">${med.administrationCount} admin${med.administrationCount > 1 ? 's' : ''}</span>`
      : '';
    const routeInfo = med.route ? `<span class="super-med-route">${med.route}</span>` : '';
    const typeInfo = med.insulinType ? `<span class="super-med-type">${med.insulinType}</span>` : '';
    const activeRange = (med.firstAdministered && med.lastAdministered)
      ? `<span class="super-med-active">active ${med.firstAdministered} – ${med.lastAdministered}</span>`
      : '';

    const clickableClass = isClickable ? 'super-med-item--clickable' : '';
    const orderDataAttr = isClickable ? `data-order-id="${orderId}"` : '';

    return `
      <div class="super-med-item ${clickableClass}" ${orderDataAttr}>
        <div class="super-med-item__name">${med.medicationName}</div>
        <div class="super-med-item__details">
          ${routeInfo}${typeInfo}${activeRange}${adminInfo}
          ${isClickable ? '<span class="super-med-view">View →</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="super-meds-section">
      <div class="super-meds-section__label">${label} (${medications.length})</div>
      <div class="super-meds-list">${medItems}</div>
    </div>
  `;
}

// Helper: Render medication indications for N0415 Column 2
function renderMedicationIndications(medicationsWithIndication) {
  if (!medicationsWithIndication || medicationsWithIndication.length === 0) return '';

  const medItems = medicationsWithIndication.map(med => {
    const indicationStatus = med.hasIndication
      ? '<span class="super-indication super-indication--yes">Has Indication</span>'
      : '<span class="super-indication super-indication--no">No Indication</span>';

    const evidenceHTML = Array.isArray(med.evidence) && med.evidence.length
      ? `<div class="super-indication-item__evidence">${med.evidence.map(ev => renderEvidenceCard(ev, -1)).join('')}</div>`
      : '';

    return `
      <div class="super-indication-item">
        <div class="super-indication-item__name">${med.medicationName}</div>
        ${indicationStatus}
        ${med.rationale ? `<div class="super-indication-item__rationale">${med.rationale}</div>` : ''}
        ${evidenceHTML}
      </div>
    `;
  }).join('');

  return `
    <div class="super-indications-section">
      <div class="super-indications-section__label">Indication Status</div>
      <div class="super-indications-list">${medItems}</div>
    </div>
  `;
}

// Helper: Render order changes for N0350B
function renderOrderChanges(orderChanges) {
  if (!orderChanges || orderChanges.length === 0) return '';

  const changeItems = orderChanges.map(change => {
    return `
      <div class="super-change-item">
        <div class="super-change-item__med">${change.medicationName}</div>
        <div class="super-change-item__detail">
          <span class="super-change-type">${change.changeType}</span>
          ${change.previousValue ? `<span class="super-change-from">${change.previousValue}</span>` : ''}
          ${change.newValue ? `<span class="super-change-to">${change.newValue}</span>` : ''}
        </div>
        ${change.changeDate ? `<div class="super-change-date">${change.changeDate}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="super-changes-section">
      <div class="super-changes-section__label">Order Changes (${orderChanges.length})</div>
      <div class="super-changes-list">${changeItems}</div>
    </div>
  `;
}

// Helper: Render drug regimen issues for N2001
function renderDrugRegimenIssues(issuesFound) {
  if (!issuesFound || issuesFound.length === 0) return '';

  const issueItems = issuesFound.map(issue => {
    const meds = issue.medications?.join(', ') || '';
    return `
      <div class="super-issue-item">
        <span class="super-issue-type">${issue.issueType?.replace(/_/g, ' ')}</span>
        <div class="super-issue-desc">${issue.description}</div>
        ${meds ? `<div class="super-issue-meds">${meds}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="super-issues-section">
      <div class="super-issues-section__label">Issues Found (${issuesFound.length})</div>
      <div class="super-issues-list">${issueItems}</div>
    </div>
  `;
}

// ============================================
// Section J — Falls Evidence
// ============================================

function formatFallDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatInjuryList(fall) {
  // Prefer structured injuries[] (type + location); fall back to injuryTypes[]
  if (Array.isArray(fall.injuries) && fall.injuries.length) {
    return fall.injuries
      .map(i => {
        const type = escapeHTML(i.type || '');
        const loc = i.location ? ` (${escapeHTML(i.location)})` : '';
        return type ? `${type}${loc}` : '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(fall.injuryTypes) && fall.injuryTypes.length) {
    return fall.injuryTypes.map(t => escapeHTML(t)).join(', ');
  }
  return '';
}

function truncateText(text, max = 140) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

function renderFallRow(fall) {
  const date = formatFallDate(fall.incidentDate);
  const type = escapeHTML(fall.incidentType || 'Fall');
  const resident = escapeHTML(fall.residentName || '');

  const injuryDetail = formatInjuryList(fall);
  let injuryText = 'No injury';
  if (fall.hasMajorInjury) {
    injuryText = 'Major injury' + (injuryDetail ? `: ${injuryDetail}` : '');
  } else if (fall.hasInjury) {
    injuryText = 'Minor injury' + (injuryDetail ? `: ${injuryDetail}` : '');
  }
  const injuryClass = fall.hasMajorInjury ? 'super-fall__injury--major' : fall.hasInjury ? 'super-fall__injury--minor' : '';

  const badges = [];
  if (fall.isWitnessed === true) badges.push('<span class="super-fall__badge super-fall__badge--witnessed">Witnessed</span>');
  else if (fall.isWitnessed === false) badges.push('<span class="super-fall__badge super-fall__badge--unwitnessed">Unwitnessed</span>');
  if (fall.isHospitalized) badges.push('<span class="super-fall__badge super-fall__badge--hospitalized">Hospitalized</span>');
  const badgesHTML = badges.length ? `<div class="super-fall__badges">${badges.join('')}</div>` : '';

  const narrative = truncateText(fall.nursingDescription);
  const narrativeHTML = narrative
    ? `<div class="super-fall__narrative">“${escapeHTML(narrative)}”</div>`
    : '';

  return `
    <div class="super-fall-row" data-incident-id="${fall.incidentId || ''}" role="button">
      <div class="super-fall__header">
        <span class="super-fall__date">${date}</span>
        <span class="super-fall__type">${type}</span>
      </div>
      ${resident ? `<div class="super-fall__resident">${resident}</div>` : ''}
      <div class="super-fall__injury ${injuryClass}">${injuryText}</div>
      ${badgesHTML}
      ${narrativeHTML}
      <div class="super-fall__action">
        <span>View Incident</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </div>
    </div>
  `;
}

function renderFalls(falls, fallCount, lookbackWindow) {
  if (!falls || falls.length === 0) return '';

  const lookbackHTML = lookbackWindow
    ? `<div class="super-lookback-info">Lookback: ${lookbackWindow.startDate} – ${lookbackWindow.endDate} (${lookbackWindow.daysCovered} days)</div>`
    : '';

  const rows = falls.map(f => renderFallRow(f)).join('');

  return `
    <div class="super-falls-section" data-falls-section>
      <div class="super-falls-section__label">Falls (${fallCount ?? falls.length})</div>
      ${lookbackHTML}
      <div class="super-falls-list">${rows}</div>
    </div>
  `;
}

function renderFallsPlaceholder(fallCount) {
  if (!fallCount) return '';
  return `
    <div class="super-falls-section" data-falls-section>
      <div class="super-falls-section__label">Falls (${fallCount})</div>
      <div class="super-falls-list" data-falls-container>
        <div class="super-evidence-loading"><div class="super-viewer-loading__spinner"></div><span>Loading falls...</span></div>
      </div>
    </div>
  `;
}

// ============================================
// Incident Detail Modal
// ============================================

async function fetchIncidentDetail(incidentId) {
  const endpoint = `/api/extension/incidents/${encodeURIComponent(incidentId)}`;
  const response = await chrome.runtime.sendMessage({ type: 'API_REQUEST', endpoint });
  if (!response.success) throw new Error(response.error || 'Failed to fetch incident');
  return response.data?.incident || response.data;
}

function showIncidentDetailModal(incidentId) {
  // Remove any existing incident modal
  document.querySelectorAll('.super-incident-modal').forEach(el => el.remove());

  const modal = document.createElement('div');
  modal.className = 'super-incident-modal';
  modal.innerHTML = `
    <div class="super-incident-modal__backdrop"></div>
    <div class="super-incident-modal__container">
      <div class="super-incident-modal__header">
        <div class="super-incident-modal__header-text">
          <span class="super-incident-modal__title">Incident Detail</span>
        </div>
        <!-- NO_TRACK: close-X -->
        <button class="super-incident-modal__close" aria-label="Close">&times;</button>
      </div>
      <div class="super-incident-modal__body">
        <div class="super-viewer-loading"><div class="super-viewer-loading__spinner"></div><span>Loading incident...</span></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  const close = () => modal.remove();
  modal.querySelector('.super-incident-modal__backdrop').addEventListener('click', close);
  modal.querySelector('.super-incident-modal__close').addEventListener('click', close);

  // Fetch and render
  fetchIncidentDetail(incidentId).then(incident => {
    const body = modal.querySelector('.super-incident-modal__body');
    const header = modal.querySelector('.super-incident-modal__header');

    // Update header with incident info
    const typeBadge = incident.incidentType || 'Fall Incident';
    const statusText = incident.isClosed ? 'Closed' : 'Open';
    const statusClass = incident.isClosed ? 'super-incident-status--closed' : 'super-incident-status--open';

    header.querySelector('.super-incident-modal__header-text').innerHTML = `
      <span class="super-incident-modal__type-badge">${escapeHTML(typeBadge)}</span>
      <span class="super-incident-modal__title">#${escapeHTML(incident.incidentNumber || incident.pccIncidentId || '')}</span>
      <span class="super-incident-status ${statusClass}">${statusText}</span>
    `;

    if (!incident.detail) {
      body.innerHTML = `
        <div class="super-incident-no-detail">
          <div class="super-incident-no-detail__icon">📋</div>
          <div class="super-incident-no-detail__text">Detail not yet synced</div>
          <div class="super-incident-no-detail__sub">This incident's detail has not been fetched from PCC yet. It will be available after the next sync.</div>
        </div>
      `;
      return;
    }

    body.innerHTML = renderIncidentDetail(incident);
  }).catch(err => {
    console.error('[Super LTC] Failed to load incident:', err);
    const body = modal.querySelector('.super-incident-modal__body');
    body.innerHTML = `
      <div class="super-viewer-error">
        <div class="super-viewer-error__icon">⚠️</div>
        <div class="super-viewer-error__message">${escapeHTML(err.message || 'Failed to load incident')}</div>
      </div>
    `;
  });
}

function renderIncidentDetail(incident) {
  const d = incident.detail;
  const detail = d.detail || {};
  const injury = d.injury || {};
  const factors = d.factors;
  const action = d.action || {};

  const sections = [];

  // Date info
  const incidentDate = formatFallDate(incident.incidentDate);
  const closeDate = incident.incidentCloseDate ? formatFallDate(incident.incidentCloseDate) : null;
  const residentName = incident.residentName || '';

  sections.push(`
    <div class="super-incident__meta">
      ${residentName ? `<div class="super-incident__resident">${escapeHTML(residentName)}</div>` : ''}
      <div class="super-incident__dates">
        <span>Incident Date: <strong>${incidentDate}</strong></span>
        ${closeDate ? `<span>Closed: <strong>${closeDate}</strong></span>` : ''}
      </div>
    </div>
  `);

  // Descriptions
  const hasDescriptions = detail.nursingDescription || detail.residentDescription || detail.actionTaken;
  if (hasDescriptions) {
    let descHTML = '<div class="super-incident__section"><div class="super-incident__section-title">Descriptions</div>';
    if (detail.nursingDescription) {
      descHTML += `<div class="super-incident__field"><div class="super-incident__field-label">Nursing Description</div><div class="super-incident__field-value">${escapeHTML(detail.nursingDescription)}</div></div>`;
    }
    if (detail.residentDescription) {
      descHTML += `<div class="super-incident__field"><div class="super-incident__field-label">Resident Description</div><div class="super-incident__field-value">${escapeHTML(detail.residentDescription)}</div></div>`;
    }
    if (detail.actionTaken) {
      descHTML += `<div class="super-incident__field"><div class="super-incident__field-label">Action Taken</div><div class="super-incident__field-value">${escapeHTML(detail.actionTaken)}</div></div>`;
    }
    descHTML += '</div>';
    sections.push(descHTML);
  }

  // Injury section
  const injuries = injury.injuries || [];
  const mentalStatus = injury.mentalStatus || {};
  {
    let injHTML = '<div class="super-incident__section"><div class="super-incident__section-title">Injury</div>';

    if (injuries.length > 0) {
      injHTML += '<div class="super-incident__injuries">';
      injuries.forEach(inj => {
        injHTML += `<div class="super-incident__injury-item">
          <span class="super-incident__injury-type">${escapeHTML(inj.type || 'Injury')}</span>
          ${inj.location ? `<span class="super-incident__injury-location">${escapeHTML(inj.location)}</span>` : ''}
        </div>`;
      });
      injHTML += '</div>';
    } else {
      injHTML += '<div class="super-incident__no-injuries">No injuries reported</div>';
    }

    // Pain level
    if (injury.painLevel && injury.painLevel.value !== undefined) {
      const painVal = injury.painLevel.value === '-1' ? 'Unable to assess' : injury.painLevel.value;
      injHTML += `<div class="super-incident__field"><div class="super-incident__field-label">Pain Level</div><div class="super-incident__field-value">${escapeHTML(String(painVal))}</div></div>`;
    }

    // Mental status
    const orientations = [];
    if (mentalStatus.isOrientedToPerson) orientations.push('Person');
    if (mentalStatus.isOrientedToPlace) orientations.push('Place');
    if (mentalStatus.isOrientedToTime) orientations.push('Time');
    if (mentalStatus.isOrientedToSituation) orientations.push('Situation');
    if (orientations.length > 0) {
      injHTML += `<div class="super-incident__field"><div class="super-incident__field-label">Mental Status</div><div class="super-incident__field-value">Oriented to: ${orientations.join(', ')}</div></div>`;
    }

    // Witnessed / Hospitalized
    const flags = [];
    if (detail.isWitnessed !== undefined) flags.push(`Witnessed: ${detail.isWitnessed ? 'Yes' : 'No'}`);
    if (detail.isHospitalized !== undefined) flags.push(`Hospitalized: ${detail.isHospitalized ? 'Yes' : 'No'}`);
    if (flags.length > 0) {
      injHTML += `<div class="super-incident__field"><div class="super-incident__field-label">Details</div><div class="super-incident__field-value">${flags.join(' · ')}</div></div>`;
    }

    injHTML += '</div>';
    sections.push(injHTML);
  }

  // Contributing factors
  if (factors && ((Array.isArray(factors) && factors.length > 0) || (!Array.isArray(factors) && Object.keys(factors).length > 0))) {
    let factorsHTML = '<div class="super-incident__section"><div class="super-incident__section-title">Contributing Factors</div>';
    if (Array.isArray(factors)) {
      factorsHTML += '<ul class="super-incident__factors-list">';
      factors.forEach(f => { factorsHTML += `<li>${escapeHTML(typeof f === 'string' ? f : f.name || JSON.stringify(f))}</li>`; });
      factorsHTML += '</ul>';
    } else {
      factorsHTML += `<div class="super-incident__field-value">${escapeHTML(JSON.stringify(factors))}</div>`;
    }
    factorsHTML += '</div>';
    sections.push(factorsHTML);
  }

  // Actions & Follow-up
  const hasActions = (action.notifiedPersons?.length > 0) || (action.progressNotes?.length > 0) || (action.triggeredUDAs?.length > 0) || action.carePlan;
  if (hasActions) {
    let actHTML = '<div class="super-incident__section"><div class="super-incident__section-title">Actions &amp; Follow-up</div>';

    // Notified persons
    if (action.notifiedPersons?.length > 0) {
      actHTML += '<div class="super-incident__subsection"><div class="super-incident__subsection-title">Notified Persons</div>';
      actHTML += '<div class="super-incident__notified-list">';
      action.notifiedPersons.forEach(p => {
        actHTML += `<div class="super-incident__notified">
          <span class="super-incident__notified-role">${escapeHTML(p.connection || '')}</span>
          <span class="super-incident__notified-name">${escapeHTML(p.name || '')}</span>
          ${p.date ? `<span class="super-incident__notified-date">${escapeHTML(p.date)}</span>` : ''}
        </div>`;
      });
      actHTML += '</div></div>';
    }

    // Progress notes
    if (action.progressNotes?.length > 0) {
      actHTML += '<div class="super-incident__subsection"><div class="super-incident__subsection-title">Progress Notes</div>';
      action.progressNotes.forEach(note => {
        const noteId = note.id || '';
        const clickableClass = noteId ? ' super-incident__note--clickable' : '';
        const dataAttr = noteId ? ` data-note-id="${escapeHTML(noteId)}"` : '';
        actHTML += `<div class="super-incident__note${clickableClass}"${dataAttr} role="${noteId ? 'button' : ''}">
          <div class="super-incident__note-header">
            <span class="super-incident__note-type">${escapeHTML(note.type || 'Note')}</span>
            <span class="super-incident__note-date">${escapeHTML(note.effectiveDate || '')}</span>
            ${note.author ? `<span class="super-incident__note-author">${escapeHTML(note.author)}</span>` : ''}
          </div>
          ${note.note ? `<div class="super-incident__note-text">${escapeHTML(note.note)}</div>` : ''}
          ${noteId ? `<div class="super-fall__action"><span>View Full Note</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>` : ''}
        </div>`;
      });
      actHTML += '</div>';
    }

    // Triggered UDAs
    if (action.triggeredUDAs?.length > 0) {
      actHTML += '<div class="super-incident__subsection"><div class="super-incident__subsection-title">Triggered UDAs</div>';
      action.triggeredUDAs.forEach(uda => {
        const statusClass = uda.status === 'Complete' ? 'super-incident__uda-status--complete' : uda.status === 'Errors' ? 'super-incident__uda-status--error' : '';
        actHTML += `<div class="super-incident__uda">
          <span class="super-incident__uda-desc">${escapeHTML(uda.description || '')}</span>
          <span class="super-incident__uda-date">${escapeHTML(uda.date || '')}</span>
          <span class="super-incident__uda-status ${statusClass}">${escapeHTML(uda.status || '')}</span>
        </div>`;
      });
      actHTML += '</div>';
    }

    // Care plan
    if (action.carePlan) {
      const cp = action.carePlan;
      const items = [];
      if (cp.isCarePlanReviewed !== undefined) items.push(`Care plan reviewed: ${cp.isCarePlanReviewed ? 'Yes' : 'No'}`);
      if (cp.isUnusualOccurrenceReport !== undefined) items.push(`Unusual occurrence report: ${cp.isUnusualOccurrenceReport ? 'Yes' : 'No'}`);
      if (cp.isCareConferenceRequired !== undefined) items.push(`Care conference required: ${cp.isCareConferenceRequired ? 'Yes' : 'No'}`);
      if (items.length > 0) {
        actHTML += '<div class="super-incident__subsection"><div class="super-incident__subsection-title">Care Plan</div>';
        actHTML += `<div class="super-incident__care-plan">${items.map(i => `<div>${i}</div>`).join('')}</div>`;
        actHTML += '</div>';
      }
    }

    actHTML += '</div>';
    sections.push(actHTML);
  }

  return sections.join('');
}

function setupFallClickHandlers(container) {
  // Find the closest popover ancestor (for split view) or use modal fallback
  const popover = container.closest?.('.super-popover') || container;

  container.querySelectorAll('.super-fall-row[data-incident-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const incidentId = row.dataset.incidentId;
      if (!incidentId) return;

      // Use split view if we're inside the overlay popover
      if (popover.classList?.contains('super-popover')) {
        enterSplitView(popover, 'incident', incidentId, {});
      } else {
        showIncidentDetailModal(incidentId);
      }
    });
  });
}

function positionPopover(popover, anchorEl) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();

  let top = anchorRect.bottom + 8;
  let left = anchorRect.left;

  // Adjust if popover would go off-screen
  if (left + popoverRect.width > window.innerWidth - 16) {
    left = window.innerWidth - popoverRect.width - 16;
  }

  if (top + popoverRect.height > window.innerHeight - 16) {
    top = anchorRect.top - popoverRect.height - 8;
  }

  // Ensure minimum positioning
  left = Math.max(16, left);
  top = Math.max(16, top);

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function setupPopoverListeners(popover, result) {
  // Close button
  popover.querySelector('.super-popover-close').addEventListener('click', closePopover);

  // Action buttons
  popover.querySelector('[data-action="agree"]').addEventListener('click', () => {
    handleAction('agree', result);
  });

  popover.querySelector('[data-action="disagree"]').addEventListener('click', () => {
    handleAction('disagree', result);
  });

  // Query button (for Section I diagnosis items). If the auto-load is still
  // in flight (or hasn't run because the user clicked before scroll finished
  // setting up evidence), block the click until evidence is backfilled onto
  // result.aiAnswer — otherwise the query modal opens with no citations.
  const queryBtn = popover.querySelector('[data-action="query"]');
  if (queryBtn) {
    queryBtn.addEventListener('click', async () => {
      await ensureEvidenceLoaded(result, queryBtn);
      closePopover();
      window.QuerySendModal?.show(result);
    });
  }

  // Order evidence click handlers for viewing administrations
  setupAdministrationViewers(popover);

  // Evidence filter chips (if rendered statically)
  setupEvidenceFilters(popover);

  // Falls click handlers (if falls are already rendered from transformer data)
  setupFallClickHandlers(popover);

  // Auto-load falls from evidence API if only placeholder was rendered
  const fallsContainer = popover.querySelector('[data-falls-container]');
  if (fallsContainer && result.aiAnswer.fallCount > 0) {
    fetchItemEvidence(SuperOverlay.section, result.mdsItem).then(data => {
      if (data.falls && data.falls.length > 0) {
        // Backfill falls data onto aiAnswer
        result.aiAnswer.falls = data.falls;
        if (data.lookbackWindow) result.aiAnswer.lookbackWindow = data.lookbackWindow;

        // Render fall rows
        const rows = data.falls.map(f => renderFallRow(f)).join('');
        fallsContainer.innerHTML = rows || '<div class="super-evidence-empty">No falls data available</div>';

        // Update label
        const label = popover.querySelector('.super-falls-section__label');
        if (label) label.textContent = `Falls (${data.falls.length})`;

        // Add lookback info if available
        if (data.lookbackWindow) {
          const existingLookback = popover.querySelector('.super-lookback-info');
          if (!existingLookback) {
            const lookbackEl = document.createElement('div');
            lookbackEl.className = 'super-lookback-info';
            lookbackEl.textContent = `Lookback: ${data.lookbackWindow.startDate} – ${data.lookbackWindow.endDate} (${data.lookbackWindow.daysCovered} days)`;
            fallsContainer.parentElement.insertBefore(lookbackEl, fallsContainer);
          }
        }

        // Attach click handlers
        setupFallClickHandlers(popover);
      } else {
        fallsContainer.innerHTML = '<div class="super-evidence-empty">No falls data available</div>';
      }
    }).catch(err => {
      console.error('[Super LTC] Failed to load falls:', err);
      fallsContainer.innerHTML = '<div class="super-evidence-error">Failed to load falls data</div>';
    });
  }

  // Auto-load evidence when popover opens
  const evidenceContainer = popover.querySelector('[data-evidence-container]');
  if (evidenceContainer) {
    const totalCount = (result.aiAnswer.evidenceCount || 0) + (result.aiAnswer.queryEvidenceCount || 0);
    if (totalCount > 0) {
      // Stash the in-flight promise so the Query button can await it if the
      // user clicks before the auto-load resolves (otherwise QuerySendModal
      // opens with empty evidence and the AI note has nothing to cite).
      const evidencePromise = fetchItemEvidence(SuperOverlay.section, result.mdsItem).then(data => {
        // Prefer per-column evidence when available (Section O nests evidence inside columns.A/B)
        const columnEvidence = (result.column && data.evidenceByColumn?.[result.column]) || null;
        const baseEvidence = columnEvidence || data.evidence || [];
        const allEvidence = [...baseEvidence, ...(data.queryEvidence || [])];
        popover._evidence = allEvidence;

        // Backfill onto aiAnswer for query modal
        result.aiAnswer.evidence = baseEvidence;
        result.aiAnswer.queryEvidence = data.queryEvidence || [];
        if (data.validation) result.aiAnswer.validation = data.validation;

        // Render cards
        const cards = allEvidence.map((ev, i) => renderEvidenceCard(ev, i)).filter(c => c).join('');
        evidenceContainer.innerHTML = cards || '<div class="super-evidence-empty">No evidence available</div>';

        // Update evidence count label
        const label = popover.querySelector('.super-evidence-section__label');
        if (label) label.textContent = `Evidence (${allEvidence.length})`;

        // Add filter chips if multiple categories
        const categories = {};
        allEvidence.forEach(ev => {
          const cat = getEvidenceCategoryOverlay(ev);
          categories[cat] = (categories[cat] || 0) + 1;
        });
        const catKeys = Object.keys(categories).sort();
        if (catKeys.length > 1) {
          const section = popover.querySelector('.super-evidence-section');
          if (section && !section.querySelector('.super-ev-filters')) {
            const chipsDiv = document.createElement('div');
            chipsDiv.className = 'super-ev-filters';
            chipsDiv.innerHTML = `
              <!-- NO_TRACK: evidence category filter sub-control inside popover -->
              <button class="super-ev-chip super-ev-chip--active" data-ev-filter="all">All (${allEvidence.length})</button>
              ${catKeys.map(cat => `<button class="super-ev-chip" data-ev-filter="${cat}">${OVERLAY_CATEGORY_LABELS[cat] || cat} (${categories[cat]})</button>`).join('')} <!-- NO_TRACK: evidence category filter sub-control -->
            `;
            const evList = section.querySelector('.super-evidence-list');
            section.insertBefore(chipsDiv, evList);
          }
        }

        // Tag cards with categories
        evidenceContainer.querySelectorAll('.super-evidence-card').forEach((card, i) => {
          if (allEvidence[i]) {
            card.setAttribute('data-ev-cat', getEvidenceCategoryOverlay(allEvidence[i]));
          }
        });

        // Re-attach viewers + prefetch PDFs + filters
        setupAdministrationViewers(popover);
        setupEvidenceFilters(popover);
        prefetchDocuments(popover);
      }).catch(err => {
        console.error('[Super LTC] Failed to load evidence:', err);
        evidenceContainer.innerHTML = '<div class="super-evidence-error">Failed to load evidence</div>';
      });
      result.aiAnswer._evidencePromise = evidencePromise;
    }
  }
}

function setupEvidenceFilters(container) {
  container.querySelectorAll('.super-ev-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const filter = chip.dataset.evFilter;
      const section = chip.closest('.super-evidence-section');
      if (!section) return;

      // Update active chip
      section.querySelectorAll('.super-ev-chip').forEach(c => c.classList.remove('super-ev-chip--active'));
      chip.classList.add('super-ev-chip--active');

      // Show/hide cards
      section.querySelectorAll('.super-evidence-card').forEach(card => {
        if (filter === 'all' || card.dataset.evCat === filter) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

function setupAdministrationViewers(popover) {
  // Handle clicks on clickable evidence cards (orders, notes, therapy docs, PDFs)
  popover.querySelectorAll('.super-evidence-card--clickable').forEach(card => {
    card.addEventListener('click', async (e) => {
      e.stopPropagation();

      // Determine viewer type and ID
      const orderId = card.dataset.orderId;
      const viewerType = card.dataset.viewerType;
      const viewerId = card.dataset.viewerId;
      const evIdx = card.dataset.evIdx != null ? parseInt(card.dataset.evIdx, 10) : -1;

      let splitType = null;
      let splitId = null;
      let extra = { _idx: evIdx };

      if (orderId) {
        splitType = 'order';
        splitId = orderId;
      } else if (viewerType && viewerId) {
        splitType = viewerType;
        splitId = viewerId;
        if (card.dataset.wordBlocks) {
          try { extra.wordBlocks = JSON.parse(card.dataset.wordBlocks); } catch {}
        }
        if (card.dataset.quote) extra.quote = card.dataset.quote;
      }

      if (splitType && splitId) {
        enterSplitView(popover, splitType, splitId, extra);
        return;
      }

      console.error('Super LTC: No valid ID found on evidence card');
    });
  });

  // Handle clicks on medication items with administrations
  popover.querySelectorAll('.super-med-item--clickable').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const orderId = item.dataset.orderId;
      if (!orderId) {
        console.error('Super LTC: No order ID found on medication item');
        return;
      }
      await showAdministrationModal(orderId);
    });
  });
}

// ============================================
// Split-View: Inline Evidence Viewer
// ============================================

/**
 * Prefetch all viewable evidence sources.
 * PDF documents are prefetched eagerly; other types are fetched on demand.
 */
async function prefetchDocuments(popover) {
  const evidence = popover._evidence || [];
  const cache = popover._docCache;
  if (!evidence.length) return;

  let params;
  try {
    params = await window.getCurrentParams();
  } catch { return; }

  for (const ev of evidence) {
    const parsed = typeof parseEvidenceForViewer === 'function' ? parseEvidenceForViewer(ev) : { viewerType: null, id: null };
    if (parsed.viewerType !== 'document' || !parsed.id || cache.has(parsed.id)) continue;

    const cacheKey = `document:${parsed.id}`;
    const promise = fetchDocument(parsed.id, params)
      .then(result => {
        const entry = cache.get(cacheKey);
        if (entry) entry.data = result.document;
        return result.document;
      })
      .catch(err => {
        console.warn('[SuperOverlay] Prefetch failed for', parsed.id, err);
        return null;
      });

    cache.set(cacheKey, { data: null, promise });
  }
}

/**
 * Collect all viewable evidence items (documents, notes, therapy docs, orders).
 */
function getViewableEvidence(popover) {
  const evidence = popover._evidence || [];
  return evidence.filter(ev => {
    const sourceType = ev.sourceType || '';
    const orderId = ev.sourceId || ev.evidenceId || '';
    const isOrder = sourceType === 'order' || orderId.startsWith('order-');
    if (isOrder) return true;

    const parsed = typeof parseEvidenceForViewer === 'function' ? parseEvidenceForViewer(ev) : { viewerType: null };
    return parsed.viewerType !== null;
  }).map(ev => {
    // Annotate each evidence item with its resolved viewer info
    const sourceType = ev.sourceType || '';
    const orderId = ev.sourceId || ev.evidenceId || '';
    const isOrder = sourceType === 'order' || orderId.startsWith('order-');

    if (isOrder) {
      return { ...ev, _viewerType: 'order', _viewerId: orderId.replace(/^order-/, '') };
    }
    const parsed = typeof parseEvidenceForViewer === 'function' ? parseEvidenceForViewer(ev) : { viewerType: null, id: null };
    return { ...ev, _viewerType: parsed.viewerType, _viewerId: parsed.id };
  });
}

/** Get a short action label for the viewer type */
function getViewerLabel(viewerType) {
  switch (viewerType) {
    case 'document': return 'PDF';
    case 'clinical-note': return 'Note';
    case 'therapy-document': return 'Therapy';
    case 'order': return 'Orders';
    case 'uda': return 'Assessment';
    default: return 'Source';
  }
}

/**
 * Transform the popover into split-view mode showing evidence inline.
 * Supports: document (PDF), clinical-note, therapy-document, order.
 */
async function enterSplitView(popover, viewerType, viewerId, extra = {}) {
  // Save original body & actions for "back"
  if (!popover._savedBody) {
    popover._savedBody = popover.querySelector('.super-popover-body')?.innerHTML;
    popover._savedActions = popover.querySelector('.super-popover-actions')?.innerHTML;
  }

  // Add split class (widens the popover)
  popover.classList.add('super-popover--split');

  // Store active source index for highlighting (each evidence is distinct)
  const activeIdx = extra._idx != null ? extra._idx : -1;
  popover._activeSourceIdx = activeIdx;

  // Build split layout
  const body = popover.querySelector('.super-popover-body');
  body.className = 'super-popover-body super-popover-body--split';
  body.style.maxHeight = 'none';

  // For incident viewer type, build a falls sidebar instead of evidence sidebar
  const isIncidentView = viewerType === 'incident';
  const falls = popover._result?.aiAnswer?.falls || [];

  let sidebarHTML;
  if (isIncidentView && falls.length > 0) {
    const fallCards = falls.map((fall, idx) => {
      const isActive = fall.incidentId === viewerId;
      const date = formatFallDate(fall.incidentDate);
      const type = escapeHTML(fall.incidentType || 'Fall');
      let injuryLabel = 'No injury';
      if (fall.hasMajorInjury) injuryLabel = 'Major injury';
      else if (fall.hasInjury) injuryLabel = 'Minor injury';

      return `
        <div class="super-split__source-card${isActive ? ' super-split__source-card--active' : ''}"
             data-idx="${idx}" data-viewer-type="incident" data-viewer-id="${fall.incidentId || ''}" role="button">
          <div class="super-split__source-badge-row">
            <span class="super-split__source-type">Incident</span>
            <span class="super-split__source-badge">${date}</span>
          </div>
          <div class="super-split__source-snippet">${type}</div>
          <div class="super-split__source-page" style="color: ${fall.hasMajorInjury ? '#991b1b' : fall.hasInjury ? '#92400e' : '#166534'}">${injuryLabel}</div>
        </div>
      `;
    }).join('');

    sidebarHTML = `
      <div class="super-split__sidebar">
        <div class="super-split__sidebar-label">Falls (${falls.length})</div>
        ${fallCards}
      </div>
    `;
  } else {
    const viewableEvidence = getViewableEvidence(popover);

    // Build source sidebar cards — each evidence item is distinct (even same doc)
    const sourceCards = viewableEvidence.map((ev, idx) => {
      const isActive = idx === activeIdx;
      const displayName = ev.displayName || formatSourceType(ev.sourceType || inferSourceType(ev.displayName, ev.evidenceId));
      const snippet = ev.quoteText || ev.orderDescription || ev.quote || '';
      const truncated = snippet.length > 80 ? snippet.slice(0, 80) + '...' : snippet;
      const page = ev.wordBlocks?.[0]?.p;
      const typeLabel = getViewerLabel(ev._viewerType);

      let extraAttrs = '';
      if (ev.wordBlocks && Array.isArray(ev.wordBlocks) && ev.wordBlocks.length > 0) {
        extraAttrs += ` data-word-blocks="${JSON.stringify(ev.wordBlocks).replace(/"/g, '&quot;')}"`;
      }
      if (ev.quoteText || ev.quote) {
        const q = (ev.quoteText || ev.quote || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        extraAttrs += ` data-quote="${q}"`;
      }

      return `
        <div class="super-split__source-card${isActive ? ' super-split__source-card--active' : ''}"
             data-idx="${idx}" data-viewer-type="${ev._viewerType}" data-viewer-id="${ev._viewerId}"${extraAttrs} role="button">
          <div class="super-split__source-badge-row">
            <span class="super-split__source-type">${escapeHTML(typeLabel)}</span>
            <span class="super-split__source-badge">${escapeHTML(displayName)}</span>
          </div>
          ${truncated ? `<div class="super-split__source-snippet">${escapeHTML(truncated)}</div>` : ''}
          ${page ? `<div class="super-split__source-page">Page ${page}</div>` : ''}
        </div>
      `;
    }).join('');

    sidebarHTML = `
      <div class="super-split__sidebar">
        <div class="super-split__sidebar-label">Sources (${viewableEvidence.length})</div>
        ${sourceCards}
      </div>
    `;
  }

  body.innerHTML = `
    ${sidebarHTML}
    <div class="super-split__viewer" id="super-split-viewer">
      <div class="super-split__viewer-loading">
        <div class="super-viewer-loading__spinner"></div>
        <span>Loading...</span>
      </div>
    </div>
  `;

  // Add back button to header
  const header = popover.querySelector('.super-popover-header');
  if (header && !header.querySelector('.super-split__back-btn')) {
    const backBtn = document.createElement('button');
    backBtn.className = 'super-split__back-btn';
    backBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Back`;
    backBtn.addEventListener('click', () => exitSplitView(popover));
    header.insertBefore(backBtn, header.firstChild);
  }

  // Source card click handlers — switch active source by index
  body.querySelectorAll('.super-split__source-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx, 10);
      if (isNaN(idx) || idx === popover._activeSourceIdx) return;

      const type = card.dataset.viewerType;
      const id = card.dataset.viewerId;
      const cardExtra = { _idx: idx };
      if (card.dataset.wordBlocks) {
        try { cardExtra.wordBlocks = JSON.parse(card.dataset.wordBlocks); } catch {}
      }
      if (card.dataset.quote) cardExtra.quote = card.dataset.quote;
      enterSplitView(popover, type, id, cardExtra);
    });
  });

  // Reposition popover to center at wider size
  const popW = Math.min(960, window.innerWidth - 32);
  const popH = Math.min(window.innerHeight - 32, 700);
  popover.style.left = `${Math.max(16, (window.innerWidth - popW) / 2)}px`;
  popover.style.top = `${Math.max(16, (window.innerHeight - popH) / 2)}px`;
  popover.style.width = `${popW}px`;
  popover.style.height = `${popH}px`;

  // Render the appropriate viewer content
  const viewerEl = body.querySelector('#super-split-viewer');
  await renderSplitContent(popover, viewerEl, viewerType, viewerId, extra);
}

/**
 * Render the right-pane content based on viewer type.
 */
async function renderSplitContent(popover, viewerEl, viewerType, viewerId, extra) {
  viewerEl.innerHTML = `<div class="super-split__viewer-loading"><div class="super-viewer-loading__spinner"></div><span>Loading...</span></div>`;

  try {
    if (viewerType === 'document') {
      await renderSplitPDF(popover, viewerEl, viewerId, extra.wordBlocks);
    } else if (viewerType === 'clinical-note') {
      await renderSplitNote(viewerEl, viewerId, undefined, extra?.quote || null);
    } else if (viewerType === 'therapy-document') {
      await renderSplitTherapy(viewerEl, viewerId, extra.quote);
    } else if (viewerType === 'order') {
      await renderSplitAdministrations(viewerEl, viewerId);
    } else if (viewerType === 'incident') {
      await renderSplitIncident(viewerEl, viewerId);
    } else if (viewerType === 'uda') {
      await renderSplitUda(viewerEl, viewerId, extra.quote);
    } else {
      viewerEl.innerHTML = `<div class="super-split__viewer-loading"><span>Unknown source type</span></div>`;
    }
  } catch (err) {
    console.error('[SuperOverlay] Split view load failed:', err);
    viewerEl.innerHTML = `<div class="super-split__viewer-loading"><span>Failed to load: ${escapeHTML(err.message)}</span></div>`;
  }
}

/** Render PDF document in split viewer using Preact PDFViewer */
async function renderSplitPDF(popover, viewerEl, documentId, wordBlocks) {
  const cache = popover._docCache;
  const cacheKey = `document:${documentId}`;
  let doc;

  const cached = cache.get(cacheKey);
  if (cached?.data) {
    doc = cached.data;
  } else if (cached?.promise) {
    doc = await cached.promise;
  } else {
    const params = await window.getCurrentParams();
    const result = await fetchDocument(documentId, params);
    doc = result.document;
    cache.set(cacheKey, { data: doc, promise: Promise.resolve(doc) });
  }

  if (!doc) throw new Error('Document not found');

  const targetPage = wordBlocks?.[0]?.p || 1;
  viewerEl.innerHTML = '';
  render(
    h(PDFViewer, {
      url: doc.signedUrl || null,
      wordBlocks: wordBlocks || [],
      targetPage,
      title: doc.title || 'Document',
      documentType: doc.documentType,
      effectiveDate: doc.effectiveDate,
      fileSize: doc.fileSize,
      expiresAt: true,
      openInNewTabUrl: doc.signedUrl || null,
    }),
    viewerEl
  );
}

/** Render clinical note inline in split viewer */
/**
 * Fuzzy-highlight note text against a quote. Splits the quote into
 * clauses (≥15 chars) and looks for each case-insensitively; falls back
 * to 3-word sliding windows. Non-matched segments are HTML-escaped;
 * matched segments are wrapped in <mark class="super-split-note-highlight">.
 */
function buildSplitNoteHTML(noteText, quote) {
  if (!noteText) return 'No note content available.';
  const full = String(noteText);
  if (!quote) return escapeHTML(full);

  const phrases = String(quote)
    .split(/[.;:\n]+/)
    .map(p => p.replace(/[*"'`()]/g, '').trim())
    .filter(p => p.length >= 15);

  console.log('[NoteHighlight/split] quote length:', quote.length, 'phrases:', phrases.length);

  const lower = full.toLowerCase();
  const ranges = [];
  for (const phrase of phrases) {
    const p = phrase.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(p, idx)) !== -1) {
      ranges.push([idx, idx + phrase.length]);
      idx += phrase.length;
    }
  }
  console.log('[NoteHighlight/split] phrase matches:', ranges.length);

  if (ranges.length === 0) {
    const words = String(quote).toLowerCase().replace(/[*"'`()]/g, '').split(/\s+/).filter(w => w.length >= 3);
    for (let i = 0; i <= words.length - 3; i++) {
      const tri = words.slice(i, i + 3).join(' ');
      if (tri.length < 12) continue;
      let idx = 0;
      while ((idx = lower.indexOf(tri, idx)) !== -1) {
        ranges.push([idx, idx + tri.length]);
        idx += tri.length;
      }
    }
    console.log('[NoteHighlight/split] trigram matches:', ranges.length);
  }

  if (ranges.length === 0) return escapeHTML(full);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0].slice()];
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = ranges[i];
    if (curr[0] <= prev[1]) prev[1] = Math.max(prev[1], curr[1]);
    else merged.push(curr.slice());
  }

  let out = '';
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) out += escapeHTML(full.slice(cursor, start));
    out += `<mark class="super-split-note-highlight" data-split-note-highlight="true">${escapeHTML(full.slice(start, end))}</mark>`;
    cursor = end;
  }
  if (cursor < full.length) out += escapeHTML(full.slice(cursor));
  return out;
}

async function renderSplitNote(viewerEl, noteId, overrideParams, highlightQuote = null) {
  console.log('[NoteHighlight/split] renderSplitNote noteId=', noteId, 'quote?', !!highlightQuote);
  const params = overrideParams || await window.getCurrentParams();
  const data = await fetchClinicalNote(noteId, params);

  // Handle document fallback — backend returns {type: "document", document: {...}} when
  // the clinical note ID is actually a document (e.g., chunk IDs mislabeled as clinical_note)
  if (data.type === 'document' && data.document) {
    const doc = data.document;
    if (doc.signedUrl) {
      // Render PDF viewer for documents with signed URLs
      const container = document.createElement('div');
      container.style.cssText = 'width:100%;height:100%';
      viewerEl.innerHTML = '';
      viewerEl.appendChild(container);
      render(h(PDFViewer, {
        url: doc.signedUrl,
        title: doc.title || 'Document',
        documentType: doc.category,
        effectiveDate: doc.effectiveDate,
        expiresAt: true,
        openInNewTabUrl: doc.signedUrl,
      }), container);
    } else {
      // Fallback to extracted text
      viewerEl.innerHTML = `
        <div class="super-split__content">
          <div class="super-split__content-header">
            <h3 class="super-split__content-title">${escapeHTML(doc.title || 'Document')}</h3>
            <span class="super-split__content-badge">Document</span>
          </div>
          ${doc.effectiveDate ? `<div class="super-split__content-meta">${formatDateDisplay(doc.effectiveDate)}</div>` : ''}
          <div class="super-split__content-body">
            <pre class="super-split__note-text">${escapeHTML(doc.extractedText || 'No content available.')}</pre>
          </div>
        </div>
      `;
    }
    return;
  }

  const note = data.note;
  const noteTypeLabel = note.noteType === 'practitioner' ? 'Practitioner Note' : 'Progress Note';
  viewerEl.innerHTML = `
    <div class="super-split__content">
      <div class="super-split__content-header">
        <h3 class="super-split__content-title">${escapeHTML(note.department || noteTypeLabel)}</h3>
        <span class="super-split__content-badge">${noteTypeLabel}</span>
      </div>
      ${note.provider ? `<div class="super-split__content-meta">${escapeHTML(note.provider)}</div>` : ''}
      <div class="super-split__content-meta">
        ${note.effectiveDate ? formatDateDisplay(note.effectiveDate) : ''}
        ${note.visitType ? ` &middot; ${escapeHTML(note.visitType)}` : ''}
      </div>
      <div class="super-split__content-body">
        <pre class="super-split__note-text">${buildSplitNoteHTML(note.noteText, highlightQuote)}</pre>
      </div>
      ${note.signedDate ? `<div class="super-split__content-footer">Signed: ${formatDateTimeDisplay(note.signedDate)}</div>` : ''}
    </div>
  `;

  if (highlightQuote) {
    requestAnimationFrame(() => {
      const first = viewerEl.querySelector('[data-split-note-highlight="true"]');
      console.log('[NoteHighlight/split] marks in DOM:', viewerEl.querySelectorAll('[data-split-note-highlight="true"]').length);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

/** Render therapy document inline in split viewer */
async function renderSplitTherapy(viewerEl, therapyDocId, highlightQuote, overrideParams) {
  const params = overrideParams || await window.getCurrentParams();
  const data = await fetchTherapyDocument(therapyDocId, params);
  const doc = data.therapyDocument;

  const title = doc.title || `${doc.therapyType || ''} ${doc.documentType || 'Document'}`.trim();
  let bodyHTML = '';

  // Build structured content from therapy doc fields
  if (doc.patientInfo) {
    bodyHTML += `<div class="super-split__therapy-section"><strong>Patient:</strong> ${escapeHTML(doc.patientInfo.name || '')}</div>`;
  }
  if (doc.treatmentDiagnosis) {
    bodyHTML += `<div class="super-split__therapy-section"><strong>Treatment Diagnosis:</strong> ${escapeHTML(doc.treatmentDiagnosis)}</div>`;
  }
  if (doc.goals && doc.goals.length > 0) {
    bodyHTML += `<div class="super-split__therapy-section"><strong>Goals:</strong><ul>${doc.goals.map(g => `<li>${escapeHTML(typeof g === 'string' ? g : g.description || JSON.stringify(g))}</li>`).join('')}</ul></div>`;
  }
  if (doc.content || doc.rawContent) {
    const text = doc.content || (typeof doc.rawContent === 'string' ? doc.rawContent : JSON.stringify(doc.rawContent, null, 2));
    bodyHTML += `<pre class="super-split__note-text">${escapeHTML(text)}</pre>`;
  }
  if (!bodyHTML) {
    bodyHTML = `<pre class="super-split__note-text">${escapeHTML(JSON.stringify(doc, null, 2))}</pre>`;
  }

  viewerEl.innerHTML = `
    <div class="super-split__content">
      <div class="super-split__content-header">
        <h3 class="super-split__content-title">${escapeHTML(title)}</h3>
        ${doc.documentType ? `<span class="super-split__content-badge">${escapeHTML(doc.documentType)}</span>` : ''}
      </div>
      ${doc.therapyType ? `<div class="super-split__content-meta">${escapeHTML(doc.therapyType)}</div>` : ''}
      ${doc.effectiveDate ? `<div class="super-split__content-meta">${formatDateDisplay(doc.effectiveDate)}</div>` : ''}
      <div class="super-split__content-body">${bodyHTML}</div>
    </div>
  `;

  // Highlight quoted text if provided
  if (highlightQuote && highlightQuote.length > 10) {
    const textEl = viewerEl.querySelector('.super-split__note-text');
    if (textEl) {
      const html = textEl.innerHTML;
      const escaped = escapeHTML(highlightQuote);
      const idx = html.indexOf(escaped);
      if (idx !== -1) {
        textEl.innerHTML = html.slice(0, idx) +
          `<mark class="super-split__highlight">${escaped}</mark>` +
          html.slice(idx + escaped.length);
        textEl.querySelector('.super-split__highlight')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
}

/** Render UDA (structured assessment) inline in split viewer */
async function renderSplitUda(viewerEl, udaId, quoteText) {
  const params = await window.getCurrentParams();
  const patientId = window.SuperOverlay?.patientId
    || (() => {
      try { return new URL(window.location.href).searchParams.get('ESOLclientid'); }
      catch { return null; }
    })();

  if (!patientId) {
    viewerEl.innerHTML = `<div class="super-split__viewer-loading"><span>Missing patient context</span></div>`;
    return;
  }

  const data = await fetchUda(udaId, patientId, params, quoteText || null);
  const uda = data.uda;
  const matchKeys = new Set(data.matchKeys || []);

  viewerEl.innerHTML = '';
  const container = document.createElement('div');
  container.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;min-height:0;';
  viewerEl.appendChild(container);

  render(
    h(UdaViewer, { uda, matchKeys, quoteText: quoteText || null }),
    container
  );
}

/** Render administration (MAR/TAR) records inline in split viewer */
async function renderSplitAdministrations(viewerEl, orderId, customDateRange, overrideParams) {
  const params = overrideParams || await getAPIParams();
  const data = await fetchAdministrations(orderId, params, customDateRange || {});
  const { order, dateRange, adminRecords } = data;

  const firstRecord = adminRecords?.[0];
  const reportType = firstRecord?.type === 'treatment' ? 'tar' : 'mar';
  const isMar = reportType === 'mar' || order.category === 'Medication';
  const typeIcon = isMar ? '💊' : '⚡';
  const typeBadge = isMar ? 'MAR' : 'TAR';
  const typeBadgeClass = isMar ? 'super-admin-badge--mar' : 'super-admin-badge--tar';
  const gridData = buildAdminGridData(adminRecords || [], dateRange);
  const eventCount = countEvents(gridData);
  const formattedDateRange = formatDateRangeDisplay(dateRange.startDate, dateRange.endDate);

  viewerEl.innerHTML = `
    <div class="super-split__admin">
      <div class="super-admin-modal__header">
        <div class="super-admin-modal__title-row">
          <span class="super-admin-modal__icon">${typeIcon}</span>
          <div class="super-admin-modal__title">
            <span class="super-admin-modal__order-name">${escapeHTML(order.name || 'Order')}</span>
            <span class="super-admin-badge ${typeBadgeClass}">${typeBadge}</span>
          </div>
        </div>
        ${order.directions ? `<div class="super-admin-modal__directions">${escapeHTML(order.directions)}</div>` : ''}
        <div class="super-admin-modal__meta">
          ${gridData.times.length} time slot${gridData.times.length !== 1 ? 's' : ''}
          ${order.startDate || order.endDate ? `<span class="super-admin-modal__dates">
            ${order.startDate ? `Start: ${formatOrderDate(order.startDate)}` : ''}
            ${order.startDate && order.endDate ? ' · ' : ''}
            ${order.endDate ? `Stop: ${formatOrderDate(order.endDate)}` : ''}
          </span>` : ''}
        </div>
      </div>
      <div class="super-admin-modal__date-bar">
        <!-- NO_TRACK: pure-UI week nav inside admin grid modal -->
        <button class="super-admin-modal__nav-btn" data-dir="prev" title="Previous week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span class="super-admin-modal__date-range">📅 ${formattedDateRange}</span>
        <!-- NO_TRACK: pure-UI week nav inside admin grid modal -->
        <button class="super-admin-modal__nav-btn" data-dir="next" title="Next week">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="super-admin-modal__body">
        ${adminRecords && adminRecords.length > 0
          ? renderAdminGrid(gridData, order)
          : '<div class="super-admin-empty">No events found in this date range</div>'
        }
      </div>
      <div class="super-admin-modal__footer">
        <span class="super-admin-modal__event-count">${eventCount} event${eventCount !== 1 ? 's' : ''}</span>
        <div class="super-admin-legend">
          <span class="super-admin-legend__item super-admin-legend__item--given">✓ Given</span>
          <span class="super-admin-legend__item super-admin-legend__item--refused">2 Refused</span>
          <span class="super-admin-legend__item super-admin-legend__item--loa">3 LOA</span>
          <span class="super-admin-legend__item super-admin-legend__item--hold">5 Hold</span>
        </div>
      </div>
    </div>
  `;

  // Wire up date navigation — pass the shifted range to avoid re-fetching defaults
  viewerEl.querySelectorAll('.super-admin-modal__nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dir = btn.dataset.dir;
      const newRange = shiftDateRange(dateRange, dir === 'next' ? 7 : -7);
      viewerEl.innerHTML = `<div class="super-split__viewer-loading"><div class="super-split__spinner"></div><span>Loading...</span></div>`;
      try {
        await renderSplitAdministrations(viewerEl, orderId, newRange, params);
      } catch (err) {
        viewerEl.innerHTML = `<div class="super-split__viewer-loading"><span>Failed to load: ${escapeHTML(err.message)}</span></div>`;
      }
    });
  });
}

/**
 * Render incident detail in split viewer.
 */
async function renderSplitIncident(viewerEl, incidentId) {
  const incident = await fetchIncidentDetail(incidentId);

  if (!incident.detail) {
    viewerEl.innerHTML = `
      <div class="super-split__content">
        <div class="super-incident-no-detail">
          <div class="super-incident-no-detail__icon">📋</div>
          <div class="super-incident-no-detail__text">Detail not yet synced</div>
          <div class="super-incident-no-detail__sub">This incident's detail has not been fetched from PCC yet. It will be available after the next sync.</div>
        </div>
      </div>
    `;
    return;
  }

  const typeBadge = escapeHTML(incident.incidentType || 'Fall Incident');
  const statusText = incident.isClosed ? 'Closed' : 'Open';
  const statusClass = incident.isClosed ? 'super-incident-status--closed' : 'super-incident-status--open';
  const incidentNum = incident.incidentNumber || incident.pccIncidentId || '';

  viewerEl.innerHTML = `
    <div class="super-split__content">
      <div class="super-split__content-header">
        <span class="super-incident-modal__type-badge">${typeBadge}</span>
        <span class="super-split__content-title">#${escapeHTML(incidentNum)}</span>
        <span class="super-incident-status ${statusClass}">${statusText}</span>
      </div>
      <div class="super-split__content-body">
        ${renderIncidentDetail(incident)}
      </div>
    </div>
  `;

  // Wire up clickable progress notes — load full note in viewer with back nav
  viewerEl.querySelectorAll('.super-incident__note--clickable[data-note-id]').forEach(noteEl => {
    noteEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const noteId = noteEl.dataset.noteId;
      if (!noteId) return;

      // Save current content for back navigation
      const savedHTML = viewerEl.innerHTML;

      // Show loading
      viewerEl.innerHTML = `
        <div class="super-split__content">
          <button class="super-incident__note-back" type="button"><!-- NO_TRACK: back nav inside incident split-view -->
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Incident
          </button>
          <div class="super-viewer-loading"><div class="super-viewer-loading__spinner"></div><span>Loading note...</span></div>
        </div>
      `;

      // Back button restores incident view
      viewerEl.querySelector('.super-incident__note-back').addEventListener('click', () => {
        viewerEl.innerHTML = savedHTML;
        // Re-attach note click handlers
        setupNoteClickHandlers(viewerEl);
      });

      // Render the full note
      const noteContainer = document.createElement('div');
      noteContainer.className = 'super-incident__full-note';
      try {
        await renderSplitNote(noteContainer, noteId);
        // Replace loading with back button + note content
        viewerEl.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'super-split__content';

        const backBtn = document.createElement('button');
        backBtn.className = 'super-incident__note-back';
        backBtn.type = 'button';
        backBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Back to Incident`;
        backBtn.addEventListener('click', () => {
          viewerEl.innerHTML = savedHTML;
          setupNoteClickHandlers(viewerEl);
        });

        wrapper.appendChild(backBtn);
        wrapper.appendChild(noteContainer);
        viewerEl.appendChild(wrapper);
      } catch (err) {
        console.error('[Super LTC] Failed to load note:', err);
        viewerEl.innerHTML = `
          <div class="super-split__content">
            <button class="super-incident__note-back" type="button"><!-- NO_TRACK: back nav inside incident split-view (error path) -->
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Incident
            </button>
            <div class="super-viewer-error">
              <div class="super-viewer-error__icon">⚠️</div>
              <div class="super-viewer-error__message">${escapeHTML(err.message || 'Failed to load note')}</div>
            </div>
          </div>
        `;
        viewerEl.querySelector('.super-incident__note-back').addEventListener('click', () => {
          viewerEl.innerHTML = savedHTML;
          setupNoteClickHandlers(viewerEl);
        });
      }
    });
  });
}

/** Re-attach note click handlers after restoring incident HTML */
function setupNoteClickHandlers(viewerEl) {
  // Re-run renderSplitIncident's click handler setup by finding the closest
  // split viewer and re-calling — but simpler to just recurse the setup inline.
  viewerEl.querySelectorAll('.super-incident__note--clickable[data-note-id]').forEach(noteEl => {
    noteEl.addEventListener('click', async function handler(e) {
      e.stopPropagation();
      const noteId = noteEl.dataset.noteId;
      if (!noteId) return;

      const savedHTML = viewerEl.innerHTML;

      viewerEl.innerHTML = `
        <div class="super-split__content">
          <button class="super-incident__note-back" type="button"><!-- NO_TRACK: back nav inside incident split-view -->
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Incident
          </button>
          <div class="super-viewer-loading"><div class="super-viewer-loading__spinner"></div><span>Loading note...</span></div>
        </div>
      `;

      viewerEl.querySelector('.super-incident__note-back').addEventListener('click', () => {
        viewerEl.innerHTML = savedHTML;
        setupNoteClickHandlers(viewerEl);
      });

      const noteContainer = document.createElement('div');
      noteContainer.className = 'super-incident__full-note';
      try {
        await renderSplitNote(noteContainer, noteId);
        viewerEl.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'super-split__content';
        const backBtn = document.createElement('button');
        backBtn.className = 'super-incident__note-back';
        backBtn.type = 'button';
        backBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Back to Incident`;
        backBtn.addEventListener('click', () => {
          viewerEl.innerHTML = savedHTML;
          setupNoteClickHandlers(viewerEl);
        });
        wrapper.appendChild(backBtn);
        wrapper.appendChild(noteContainer);
        viewerEl.appendChild(wrapper);
      } catch (err) {
        viewerEl.innerHTML = `
          <div class="super-split__content">
            <button class="super-incident__note-back" type="button"><!-- NO_TRACK: back nav inside incident split-view (re-attached error path) -->
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Incident
            </button>
            <div class="super-viewer-error">
              <div class="super-viewer-error__icon">⚠️</div>
              <div class="super-viewer-error__message">${escapeHTML(err.message || 'Failed to load note')}</div>
            </div>
          </div>
        `;
        viewerEl.querySelector('.super-incident__note-back').addEventListener('click', () => {
          viewerEl.innerHTML = savedHTML;
          setupNoteClickHandlers(viewerEl);
        });
      }
    });
  });
}

/**
 * Return popover from split-view to summary mode.
 */
function exitSplitView(popover) {
  popover.classList.remove('super-popover--split');
  popover._activeSourceIdx = null;

  // Unmount Preact PDFViewer if present
  const viewerEl = popover.querySelector('#super-split-viewer');
  if (viewerEl) render(null, viewerEl);

  // Restore body
  const body = popover.querySelector('.super-popover-body');
  body.className = 'super-popover-body';
  body.style.maxHeight = '';
  if (popover._savedBody) body.innerHTML = popover._savedBody;

  // Re-render loaded evidence into the restored body
  if (popover._evidence && popover._evidence.length > 0) {
    const container = body.querySelector('[data-evidence-container]');
    if (container) {
      container.innerHTML = popover._evidence.map((ev, i) => renderEvidenceCard(ev, i)).filter(c => c).join('');
    }
  }

  // Restore actions
  const actions = popover.querySelector('.super-popover-actions');
  if (actions && popover._savedActions) actions.innerHTML = popover._savedActions;

  // Remove back button
  const backBtn = popover.querySelector('.super-split__back-btn');
  if (backBtn) backBtn.remove();

  // Reset size & reposition
  popover.style.width = '';
  popover.style.height = '';
  if (popover._anchorEl) {
    positionPopover(popover, popover._anchorEl);
  } else {
    popover.style.left = `${Math.max(16, (window.innerWidth - 380) / 2)}px`;
    popover.style.top = `${Math.max(16, (window.innerHeight - 500) / 2)}px`;
  }

  // Re-attach evidence card click listeners
  setupAdministrationViewers(popover);
}

function closePopover() {
  const popover = document.querySelector('.super-popover');
  // Unmount any Preact PDFViewer before removing
  if (popover) {
    const viewerEl = popover.querySelector('#super-split-viewer');
    if (viewerEl) render(null, viewerEl);
  }
  popover?.remove();
  document.querySelector('.super-backdrop')?.remove();
}

// ============================================
// Administration Modal (MAR/TAR Viewer)
// ============================================

async function showAdministrationModal(orderId) {
  // Get current page context
  const params = await getAPIParams();

  // Create and show loading modal
  const modal = createAdminModalShell();
  document.body.appendChild(modal);

  try {
    // Fetch administration data
    const data = await fetchAdministrations(orderId, params);

    // Render the full modal content
    renderAdminModalContent(modal, data, orderId, params);
  } catch (error) {
    console.error('Super LTC: Failed to fetch administrations', error);
    renderAdminModalError(modal, error.message);
  }
}

function createAdminModalShell() {
  const modal = document.createElement('div');
  modal.className = 'super-admin-modal';
  modal.innerHTML = `
    <div class="super-admin-modal__backdrop"></div>
    <div class="super-admin-modal__container">
      <div class="super-admin-modal__header">
        <div class="super-admin-modal__title">
          <span class="super-admin-modal__order-name">Loading...</span>
        </div>
        <button class="super-admin-modal__close">&times;</button><!-- NO_TRACK: close-X -->
      </div>
      <div class="super-admin-modal__body">
        <div class="super-admin-loading">
          <div class="super-admin-loading__spinner"></div>
          <span>Loading administration records...</span>
        </div>
      </div>
    </div>
  `;

  // Setup close handlers
  modal.querySelector('.super-admin-modal__close').addEventListener('click', () => modal.remove());
  modal.querySelector('.super-admin-modal__backdrop').addEventListener('click', () => modal.remove());

  // Close on Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  return modal;
}

function renderAdminModalContent(modal, data, orderId, params) {
  const { order, dateRange, adminRecords } = data;

  // Determine report type from first record or order category
  const firstRecord = adminRecords?.[0];
  const reportType = firstRecord?.type === 'treatment' ? 'tar' : 'mar';

  const container = modal.querySelector('.super-admin-modal__container');
  container.innerHTML = buildAdminModalHTML(order, dateRange, adminRecords || [], reportType);

  // Setup event listeners
  setupAdminModalListeners(modal, orderId, params, dateRange);
}

function buildAdminModalHTML(order, dateRange, adminRecords, reportType) {
  const formattedDateRange = formatDateRangeDisplay(dateRange.startDate, dateRange.endDate);
  const isMar = reportType === 'mar' || order.category === 'Medication';
  const typeIcon = isMar ? '💊' : '⚡';
  const typeBadge = isMar ? 'MAR' : 'TAR';
  const typeBadgeClass = isMar ? 'super-admin-badge--mar' : 'super-admin-badge--tar';

  // Build the grid data
  const gridData = buildAdminGridData(adminRecords, dateRange);
  const eventCount = countEvents(gridData);

  return `
    <div class="super-admin-modal__header">
      <div class="super-admin-modal__title-row">
        <span class="super-admin-modal__icon">${typeIcon}</span>
        <div class="super-admin-modal__title">
          <span class="super-admin-modal__order-name">${escapeHTML(order.name || 'Order')}</span>
          <span class="super-admin-badge ${typeBadgeClass}">${typeBadge}</span>
        </div>
        <button class="super-admin-modal__close">&times;</button><!-- NO_TRACK: close-X -->
      </div>
      ${order.directions ? `<div class="super-admin-modal__directions">${escapeHTML(order.directions)}</div>` : ''}
      <div class="super-admin-modal__meta">
        ${gridData.times.length} time slot${gridData.times.length !== 1 ? 's' : ''}
        ${order.startDate || order.endDate ? `<span class="super-admin-modal__dates">
          ${order.startDate ? `Start: ${formatOrderDate(order.startDate)}` : ''}
          ${order.startDate && order.endDate ? ' · ' : ''}
          ${order.endDate ? `Stop: ${formatOrderDate(order.endDate)}` : ''}
        </span>` : ''}
      </div>
    </div>

    <div class="super-admin-modal__date-bar">
      <!-- NO_TRACK: pure-UI week nav inside admin grid modal -->
      <button class="super-admin-modal__nav-btn" data-dir="prev" title="Previous week">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <span class="super-admin-modal__date-range">📅 ${formattedDateRange}</span>
      <!-- NO_TRACK: pure-UI week nav inside admin grid modal -->
      <button class="super-admin-modal__nav-btn" data-dir="next" title="Next week">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
    </div>

    <div class="super-admin-modal__body">
      ${adminRecords.length > 0
        ? renderAdminGrid(gridData, order)
        : '<div class="super-admin-empty">No events found in this date range</div>'
      }
    </div>

    <div class="super-admin-modal__footer">
      <span class="super-admin-modal__event-count">${eventCount} event${eventCount !== 1 ? 's' : ''}</span>
      <div class="super-admin-legend">
        <span class="super-admin-legend__item super-admin-legend__item--given">✓ Given</span>
        <span class="super-admin-legend__item super-admin-legend__item--refused">2 Refused</span>
        <span class="super-admin-legend__item super-admin-legend__item--loa">3 LOA</span>
        <span class="super-admin-legend__item super-admin-legend__item--hold">5 Hold</span>
      </div>
    </div>
  `;
}

// Build grid data structure: times as rows, dates as columns
function buildAdminGridData(adminRecords, dateRange) {
  const allTimes = new Set();

  // Collect time slots from events (unchanged)
  for (const record of adminRecords) {
    if (!record.events) continue;
    for (const event of record.events) {
      if (event.time) allTimes.add(event.time);
    }
  }

  // Sort times (numeric times first, then alpha like "BS")
  const times = [...allTimes].sort((a, b) => {
    const aIsNumeric = /^\d+$/.test(a);
    const bIsNumeric = /^\d+$/.test(b);
    if (aIsNumeric && bIsNumeric) return a.localeCompare(b);
    if (aIsNumeric) return -1;
    if (bIsNumeric) return 1;
    return a.localeCompare(b);
  });

  // Generate dates from the lookback window, not from events.
  const dates = enumerateDateRange(dateRange.startDate, dateRange.endDate);

  // Build lookup: { time: { date: GridCell } }
  const grid = {};

  for (const record of adminRecords) {
    if (!record.events) continue;
    for (const event of record.events) {
      if (!event.time || !event.date) continue;
      const dateKey = normalizeDateKey(event.date);
      if (!grid[event.time]) grid[event.time] = {};
      grid[event.time][dateKey] = {
        status: mapAdminStatus(event.status),
        staffInitials: event.staffInitials || '',
        value: event.value || '',
        chartCode: event.chartCode || null,
      };
    }
  }

  return { times, dates, grid };
}

function mapAdminStatus(status) {
  if (!status) return 'scheduled';
  const s = status.toLowerCase();
  if (s === 'given' || s === 'administered') return 'given';
  if (s === 'measured') return 'measured';
  if (s === 'refused') return 'refused';
  return 'not_given';
}

function countEvents(gridData) {
  let count = 0;
  for (const time of Object.keys(gridData.grid)) {
    count += Object.keys(gridData.grid[time]).length;
  }
  return count;
}

// Render the grid with times as rows, dates as columns
function renderAdminGrid(gridData, order) {
  const { times, dates, grid } = gridData;

  if (times.length === 0 || dates.length === 0) {
    return '<div class="super-admin-empty">No events found in this date range</div>';
  }

  const dateOutsideOrder = {};
  for (const date of dates) {
    dateOutsideOrder[date] = isDateOutsideOrderRange(date, order);
  }

  // Build date headers with day name and date
  const dateHeaders = dates.map(date => {
    const formatted = formatGridDate(date);
    return `<th class="super-admin-grid__date-header">
      <div class="super-admin-grid__day">${formatted.day}</div>
      <div class="super-admin-grid__date">${formatted.date}</div>
    </th>`;
  }).join('');

  // Build rows (one per time slot)
  const rows = times.map(time => {
    const cells = dates.map(date => {
      const cell = grid[time]?.[date];
      return renderGridCell(cell, dateOutsideOrder[date]);
    }).join('');

    return `
      <tr class="super-admin-grid__row">
        <td class="super-admin-grid__time">${formatTime(time)}</td>
        ${cells}
      </tr>
    `;
  }).join('');

  return `
    <div class="super-admin-grid-wrapper">
      <table class="super-admin-grid">
        <thead>
          <tr>
            <th class="super-admin-grid__time-header">Time</th>
            ${dateHeaders}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderGridCell(cell, isOutsideOrder) {
  if (!cell) {
    if (isOutsideOrder) {
      return '<td class="super-admin-grid__cell super-admin-grid__cell--no-order" title="No order active">·</td>';
    }
    return '<td class="super-admin-grid__cell super-admin-grid__cell--empty" title="No event recorded">-</td>';
  }

  const { status, staffInitials, value, chartCode } = cell;
  let cellClass = 'super-admin-grid__cell';
  let content = '';

  // Chart code "0" means "given" — treat it like given status
  const isGiven = status === 'given' || status === 'measured' || chartCode === '0' || chartCode === 0;

  if (isGiven) {
    cellClass += ' super-admin-grid__cell--given';
    content = '<span class="super-admin-grid__check">✓</span>';
    if (staffInitials) {
      content += `<span class="super-admin-grid__initials">${escapeHTML(staffInitials)}</span>`;
    }
    if (value) {
      content += `<span class="super-admin-grid__value">${escapeHTML(value)}</span>`;
    }
  } else if (chartCode) {
    // Other non-zero chart codes get special display
    cellClass += ` super-admin-grid__cell--code-${chartCode}`;
    content = `<span class="super-admin-grid__code">${chartCode}</span>`;
    if (staffInitials) {
      content += `<span class="super-admin-grid__initials">${escapeHTML(staffInitials)}</span>`;
    }
  } else {
    cellClass += ' super-admin-grid__cell--empty';
    content = '-';
  }

  return `<td class="${cellClass}">${content}</td>`;
}

// Helper functions
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatOrderDate(dateStr) {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRangeDisplay(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

function formatGridDate(dateStr) {
  const date = parseDate(dateStr);

  // Handle invalid dates
  if (isNaN(date.getTime())) {
    return { day: '???', date: dateStr };
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    day: days[date.getDay()],
    date: `${months[date.getMonth()]} ${date.getDate()}`
  };
}

function formatTime(time) {
  // Handle non-standard times like "BS" (blood sugar)
  if (!time) return time;

  // If it's not a 4-digit time, return as-is
  if (!/^\d{4}$/.test(time)) return time;

  // Convert "0800" to "8:00 AM"
  const hours = parseInt(time.substring(0, 2), 10);
  const mins = time.substring(2, 4);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${mins} ${ampm}`;
}

function parseDate(dateStr) {
  // Handle ISO format, "MM/DD/YYYY", and "YYYY-MM-DD" formats
  if (!dateStr) return new Date();

  // Already an ISO string with T (e.g., "2025-10-22T00:00:00.000Z")
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }

  // MM/DD/YYYY format
  if (dateStr.includes('/')) {
    const [month, day, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
  }

  // YYYY-MM-DD format
  return new Date(dateStr + 'T00:00:00');
}

// Normalize date to YYYY-MM-DD string for consistent grid keys
function normalizeDateKey(dateStr) {
  if (!dateStr) return '';

  // If it's already YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // For ISO strings like "2025-10-22T00:00:00.000Z", extract the date part
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }

  // For other formats, parse and format
  const date = parseDate(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return formatDateForAPI(date);
}

function isDateOutsideOrderRange(dateStr, order) {
  if (!order || !order.startDate) return false;
  const date = parseDate(dateStr);
  const start = parseDate(order.startDate);
  if (date < start) return true;
  if (order.endDate) {
    const end = parseDate(order.endDate);
    if (date > end) return true;
  }
  return false;
}

// Returns YYYY-MM-DD strings for every day in [start, end] inclusive.
function enumerateDateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatDateForAPI(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function shiftDateRange(dateRange, days) {
  const start = parseDate(dateRange.startDate);
  const end = parseDate(dateRange.endDate);
  start.setDate(start.getDate() + days);
  end.setDate(end.getDate() + days);
  return {
    startDate: formatDateForAPI(start),
    endDate: formatDateForAPI(end),
    isDefault: false
  };
}

function formatDateForAPI(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// API fetch function
async function fetchAdministrations(orderId, params, dateRange = {}) {
  let endpoint = `/api/extension/orders/${orderId}/administrations?` +
    `externalAssessmentId=${params.assessmentId}` +
    `&facilityName=${encodeURIComponent(params.facilityName)}` +
    `&orgSlug=${params.orgSlug}` +
    `&type=both`;

  if (dateRange.startDate) endpoint += `&startDate=${dateRange.startDate}`;
  if (dateRange.endDate) endpoint += `&endDate=${dateRange.endDate}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint
  });

  if (!response.success) throw new Error(response.error || 'Failed to fetch data');
  return response.data;
}

// Event listeners for modal
function setupAdminModalListeners(modal, orderId, params, currentDateRange) {
  // Close button
  modal.querySelector('.super-admin-modal__close')?.addEventListener('click', () => modal.remove());

  // Date navigation
  modal.querySelectorAll('.super-admin-modal__nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dir = btn.dataset.dir;
      const newRange = shiftDateRange(currentDateRange, dir === 'next' ? 7 : -7);

      // Show loading in body
      const body = modal.querySelector('.super-admin-modal__body');
      body.innerHTML = '<div class="super-admin-loading"><div class="super-admin-loading__spinner"></div><span>Loading...</span></div>';

      try {
        const data = await fetchAdministrations(orderId, params, newRange);
        // Re-render the full modal content
        renderAdminModalContent(modal, data, orderId, params);
      } catch (error) {
        body.innerHTML = `<div class="super-admin-error"><p>Failed to load data</p><span>${escapeHTML(error.message)}</span></div>`;
      }
    });
  });
}

function renderAdminModalError(modal, message) {
  const container = modal.querySelector('.super-admin-modal__container');
  container.innerHTML = `
    <div class="super-admin-modal__header">
      <div class="super-admin-modal__title">
        <span class="super-admin-modal__order-name">Error</span>
      </div>
      <button class="super-admin-modal__close">&times;</button><!-- NO_TRACK: close-X -->
    </div>
    <div class="super-admin-modal__body">
      <div class="super-admin-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <p>Failed to load administration records</p>
        <span class="super-admin-error__detail">${escapeHTML(message)}</span>
      </div>
    </div>
  `;

  modal.querySelector('.super-admin-modal__close').addEventListener('click', () => modal.remove());
}

// ============================================
// Diagnosis Query Modal
// ============================================

// Get context needed for query modal
async function getQueryContext() {
  const url = new URL(window.location.href);
  const assessmentId = url.searchParams.get('ESOLassessid');

  // Use stored patientId from API response (preferred), fallback to URL param
  const patientId = SuperOverlay.patientId || url.searchParams.get('ESOLclientid');

  // Get org from cookie
  const orgResponse = getOrg();
  const orgSlug = orgResponse?.org;

  // Get facility from DOM
  const facilityInfo = getFacilityInfo();
  const facilityName = facilityInfo?.facility;

  // Get patient name from DOM (PCC header)
  const patientNameEl = document.querySelector('.patient-name, #patientName, .patientName, [class*="patient-name"]');
  const patientName = patientNameEl?.textContent?.trim() || 'Patient';

  // Get DOB if available
  const dobEl = document.querySelector('.patient-dob, #patientDOB, [class*="patient-dob"]');
  const patientDOB = dobEl?.textContent?.trim() || '';

  return {
    patientId,
    patientName,
    patientDOB,
    facilityName,
    orgSlug,
    assessmentId
  };
}

// Fetch practitioners for dropdown
async function fetchPractitioners(facilityName, orgSlug) {
  const endpoint = `/api/extension/practitioners?facilityName=${encodeURIComponent(facilityName)}&orgSlug=${orgSlug}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint
  });

  if (!response.success) throw new Error(response.error || 'Failed to fetch practitioners');
  return response.data?.practitioners || [];
}

// Create and send diagnosis query
async function createAndSendQuery(queryData, practitionerId, nurseNote) {
  const { facilityName, orgSlug } = queryData;

  // Step 1: Create the query
  const createEndpoint = `/api/extension/diagnosis-queries`;
  const createBody = {
    patientId: queryData.patientId,
    facilityName: facilityName,
    orgSlug: orgSlug,
    mdsAssessmentId: queryData.assessmentId,
    mdsItem: queryData.mdsItem,
    mdsItemName: queryData.mdsItemName,
    queryReason: queryData.queryReason,
    keyFindings: queryData.keyFindings,
    queryEvidence: queryData.queryEvidence,
    recommendedIcd10: queryData.recommendedIcd10,
    aiGeneratedNote: nurseNote
  };

  const createResponse = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: createEndpoint,
    options: {
      method: 'POST',
      body: JSON.stringify(createBody)
    }
  });

  if (!createResponse.success) throw new Error(createResponse.error || 'Failed to create query');

  const queryId = createResponse.data?.query?.id;
  if (!queryId) throw new Error('No query ID returned');

  // Step 2: Send the query to the practitioner
  const sendEndpoint = `/api/extension/diagnosis-queries/${queryId}/send`;
  const sendBody = {
    practitionerIds: [practitionerId],
    nurseEditedNote: nurseNote
  };

  const sendResponse = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: sendEndpoint,
    options: {
      method: 'POST',
      body: JSON.stringify(sendBody)
    }
  });

  if (!sendResponse.success) throw new Error(sendResponse.error || 'Failed to send query');

  return sendResponse.data;
}

// Create query modal shell with loading state
function createQueryModalShell() {
  const modal = document.createElement('div');
  modal.className = 'super-query-modal';
  modal.innerHTML = `
    <div class="super-query-modal__backdrop"></div>
    <div class="super-query-modal__container">
      <div class="super-query-modal__header">
        <div class="super-query-modal__title-row">
          <span class="super-query-modal__icon">?</span>
          <span class="super-query-modal__name">Query Physician</span>
        </div>
        <button class="super-query-modal__close">&times;</button><!-- NO_TRACK: close-X -->
      </div>
      <div class="super-query-modal__body">
        <div class="super-query-loading">
          <div class="super-query-loading__spinner"></div>
          <span>Loading...</span>
        </div>
      </div>
    </div>
  `;

  // Close handlers
  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
  };
  modal.querySelector('.super-query-modal__close').addEventListener('click', closeModal);
  modal.querySelector('.super-query-modal__backdrop').addEventListener('click', closeModal);

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  return modal;
}

// Show the query modal
async function showQueryModal(result) {
  const modal = createQueryModalShell();
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  try {
    // Get context first
    const context = await getQueryContext();

    // Fetch practitioners
    const practitioners = await fetchPractitioners(context.facilityName, context.orgSlug);

    // Render the modal content
    renderQueryModalContent(modal, result, context, practitioners);
  } catch (error) {
    console.error('Super LTC: Failed to load query modal', error);
    renderQueryModalError(modal, error.message);
  }
}

// Generate default note text (fallback if API fails)
function generateDefaultNote(result) {
  const ai = result.aiAnswer;
  const diagnosisName = ai.mdsItemName || result.description;
  return `Please review the clinical evidence for potential ${diagnosisName} diagnosis. See supporting evidence below.`;
}

// Fetch AI-generated note from backend
async function fetchAIGeneratedNote(result) {
  // Pass the MDS item code and entire solver result object
  const mdsItem = result.mdsItem;  // e.g., "I5600" for Malnutrition
  const solverResult = result.aiAnswer;

  const endpoint = `/api/extension/diagnosis-queries/generate-note`;
  const body = {
    mdsItem: mdsItem,
    solverResult: solverResult
  };

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: endpoint,
    options: {
      method: 'POST',
      body: JSON.stringify(body)
    }
  });

  if (!response.success || !response.data?.note) {
    throw new Error(response.error || 'No note returned');
  }

  // Return full response including ICD-10 data
  return {
    note: response.data.note,
    preferredIcd10: response.data.preferredIcd10 || null,
    icd10Options: response.data.icd10Options || []
  };
}

// Build evidence accordion HTML
function buildQueryEvidenceHTML(evidence) {
  if (!evidence || evidence.length === 0) {
    return '<div class="super-query-evidence-empty">No evidence available</div>';
  }

  return evidence.map(ev => {
    const quote = ev.findingText || ev.quoteText || ev.quote || ev.orderDescription || '';
    const source = ev.source || ev.displayName || ev.sourceType || 'Document';
    const rationale = ev.rationale || '';

    return `
      <div class="super-query-evidence-item">
        <div class="super-query-evidence-source">${escapeHTML(source)}</div>
        <div class="super-query-evidence-quote">"${escapeHTML(quote)}"</div>
        ${rationale ? `<div class="super-query-evidence-rationale">${escapeHTML(rationale)}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Render the query modal content
function renderQueryModalContent(modal, result, context, practitioners) {
  const ai = result.aiAnswer;
  const container = modal.querySelector('.super-query-modal__container');

  // Build key findings HTML
  const keyFindingsHTML = (ai.keyFindings || []).map(f =>
    `<li class="super-query-finding">${escapeHTML(f)}</li>`
  ).join('') || '<li class="super-query-finding--empty">No key findings provided</li>';

  // Build evidence accordion HTML — evidence may already be loaded (backfilled by popover)
  const alreadyLoaded = Array.isArray(ai.evidence) && ai.evidence.length > 0;
  const evidenceData = alreadyLoaded
    ? (ai.queryEvidence?.length > 0 ? ai.queryEvidence : ai.evidence)
    : [];
  const totalCount = alreadyLoaded ? evidenceData.length : ((ai.evidenceCount || 0) + (ai.queryEvidenceCount || 0));
  const evidenceHTML = alreadyLoaded
    ? buildQueryEvidenceHTML(evidenceData)
    : (totalCount > 0 ? '<div class="super-evidence-loading"><div class="super-viewer-loading__spinner"></div><span>Loading evidence...</span></div>' : '<div class="super-query-evidence-empty">No evidence available</div>');

  // Build practitioners dropdown HTML
  const practitionerOptionsHTML = practitioners.map(p => {
    const displayName = p.firstName && p.lastName
      ? `${p.firstName} ${p.lastName}${p.title ? `, ${p.title}` : ''}`
      : p.name || 'Unknown';
    return `<option value="${escapeHTML(p.id)}">${escapeHTML(displayName)}</option>`;
  }).join('');

  container.innerHTML = `
    <div class="super-query-modal__header">
      <div class="super-query-modal__title-row">
        <span class="super-query-modal__icon">?</span>
        <div class="super-query-modal__title">
          <span class="super-query-modal__name">Diagnosis Query</span>
          <span class="super-query-badge">${escapeHTML(result.mdsItem)}</span>
        </div>
      </div>
      <button class="super-query-modal__close">&times;</button><!-- NO_TRACK: close-X -->
    </div>

    <div class="super-query-modal__body">
      <!-- Patient Info Header -->
      <div class="super-query-patient-header">
        <div class="super-query-patient-header__name">${escapeHTML(context.patientName)}</div>
        <div class="super-query-patient-header__info">
          ${context.patientDOB ? `<span>DOB: ${escapeHTML(context.patientDOB)}</span>` : ''}
          <span>${escapeHTML(context.facilityName || 'Unknown Facility')}</span>
        </div>
      </div>

      <!-- Diagnosis Name -->
      <div class="super-query-section">
        <div class="super-query-section__label">Diagnosis</div>
        <div class="super-query-diagnosis-name">${escapeHTML(ai.mdsItemName || result.description)}</div>
      </div>

      <!-- ICD-10 Code Selection -->
      <div class="super-query-section">
        <div class="super-query-section__label">ICD-10 Code</div>
        <select class="super-query-icd10-select" id="super-query-icd10">
          <option value="">Loading ICD-10 codes...</option>
        </select>
      </div>

      <!-- Note (editable) -->
      <div class="super-query-section">
        <div class="super-query-section__label">Query Note</div>
        <div class="super-query-note-wrapper">
          <textarea class="super-query-note super-query-note--loading" id="super-query-note" rows="4" placeholder="Enter note for physician..." disabled>Generating note...</textarea>
          <div class="super-query-note-spinner"></div>
        </div>
      </div>

      <!-- Key Findings (read-only) -->
      <div class="super-query-section">
        <div class="super-query-section__label">Key Findings</div>
        <ul class="super-query-findings-list">${keyFindingsHTML}</ul>
      </div>

      <!-- Evidence Preview (collapsible) -->
      <div class="super-query-section">
        <details class="super-query-evidence-accordion">
          <summary class="super-query-evidence-toggle">
            Evidence Preview (${totalCount})
          </summary>
          <div class="super-query-evidence-content">${evidenceHTML}</div>
        </details>
      </div>

      <!-- Practitioner Dropdown -->
      <div class="super-query-section">
        <div class="super-query-section__label">Send To</div>
        <select class="super-query-practitioner" id="super-query-practitioner">
          <option value="">Select a practitioner...</option>
          ${practitionerOptionsHTML}
        </select>
      </div>
    </div>

    <div class="super-query-modal__footer">
      <!-- NO_TRACK: legacy MDS overlay diagnosis-query modal cancel; modern queries/ flow tracks query_modal_closed -->
      <button class="super-query-modal__btn super-query-modal__btn--secondary" data-action="cancel">Cancel</button>
      <!-- NO_TRACK: legacy MDS overlay diagnosis-query send; modern queries/ flow tracks query_send_started -->
      <button class="super-query-modal__btn super-query-modal__btn--primary" data-action="send" disabled>Send Query</button>
    </div>
  `;

  setupQueryModalListeners(modal, result, context);

  // Lazy-load evidence if not already loaded
  if (!alreadyLoaded && totalCount > 0) {
    fetchItemEvidence(SuperOverlay.section, result.mdsItem).then(data => {
      // Prefer per-column evidence for Section O (evidence nested in columns.A/B)
      const columnEvidence = (result.column && data.evidenceByColumn?.[result.column]) || null;
      const baseEvidence = columnEvidence || data.evidence || [];
      result.aiAnswer.evidence = baseEvidence;
      result.aiAnswer.queryEvidence = data.queryEvidence || [];
      const evidenceContainer = modal.querySelector('.super-query-evidence-content');
      if (evidenceContainer) {
        const merged = (data.queryEvidence?.length > 0 ? data.queryEvidence : baseEvidence) || [];
        evidenceContainer.innerHTML = buildQueryEvidenceHTML(merged);
        // Update count in accordion summary
        const toggle = modal.querySelector('.super-query-evidence-toggle');
        if (toggle) toggle.textContent = `Evidence Preview (${merged.length})`;
      }
    }).catch(err => {
      console.error('[Super LTC] Failed to load evidence for query modal:', err);
      const evidenceContainer = modal.querySelector('.super-query-evidence-content');
      if (evidenceContainer) evidenceContainer.innerHTML = '<div class="super-query-evidence-empty">Failed to load evidence</div>';
    });
  }

  // Fetch AI-generated note asynchronously
  fetchAndPopulateNote(modal, result);
}

// Fetch AI note and populate textarea + ICD-10 dropdown
async function fetchAndPopulateNote(modal, result) {
  const textarea = modal.querySelector('#super-query-note');
  const spinner = modal.querySelector('.super-query-note-spinner');
  const icd10Select = modal.querySelector('#super-query-icd10');

  if (!textarea) return;

  try {
    const { note, preferredIcd10, icd10Options } = await fetchAIGeneratedNote(result);
    textarea.value = note;

    // Populate ICD-10 dropdown if we have options
    if (icd10Select && icd10Options.length > 0) {
      const optionsHTML = icd10Options.map(opt => {
        const code = typeof opt === 'object' ? opt.code : opt;
        const desc = typeof opt === 'object' ? opt.description : '';
        const isPreferred = preferredIcd10 && preferredIcd10.code === code;
        return `<option value="${escapeHTML(code)}" ${isPreferred ? 'selected' : ''}>${escapeHTML(code)}${desc ? ` - ${escapeHTML(desc)}` : ''}</option>`;
      }).join('');
      icd10Select.innerHTML = `<option value="">Select ICD-10 code...</option>${optionsHTML}`;

      // If we have a preferred code, pre-select it
      if (preferredIcd10) {
        icd10Select.value = preferredIcd10.code;
      }
    }
  } catch (error) {
    console.error('Super LTC: Failed to generate AI note, using fallback', error);
    textarea.value = generateDefaultNote(result);
  } finally {
    // Remove loading state
    textarea.classList.remove('super-query-note--loading');
    textarea.disabled = false;
    if (spinner) spinner.remove();
  }
}

// Render error state in query modal
function renderQueryModalError(modal, message) {
  const container = modal.querySelector('.super-query-modal__container');
  container.innerHTML = `
    <div class="super-query-modal__header">
      <div class="super-query-modal__title-row">
        <span class="super-query-modal__icon">!</span>
        <span class="super-query-modal__name">Error</span>
      </div>
      <button class="super-query-modal__close">&times;</button><!-- NO_TRACK: close-X -->
    </div>
    <div class="super-query-modal__body">
      <div class="super-query-error">
        <p>Failed to load query form</p>
        <span class="super-query-error__detail">${escapeHTML(message)}</span>
      </div>
    </div>
    <div class="super-query-modal__footer">
      <!-- NO_TRACK: error-state close in legacy MDS overlay diagnosis-query modal -->
      <button class="super-query-modal__btn super-query-modal__btn--secondary" data-action="cancel">Close</button>
    </div>
  `;

  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
  };

  modal.querySelector('.super-query-modal__close').addEventListener('click', closeModal);
  modal.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
}

// Setup event listeners for query modal
function setupQueryModalListeners(modal, result, context) {
  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
  };

  // Close button
  modal.querySelector('.super-query-modal__close').addEventListener('click', closeModal);

  // Cancel button
  modal.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);

  // Practitioner selection enables Send button
  const practitionerSelect = modal.querySelector('#super-query-practitioner');
  const sendBtn = modal.querySelector('[data-action="send"]');

  practitionerSelect.addEventListener('change', () => {
    sendBtn.disabled = !practitionerSelect.value;
  });

  // Send button
  sendBtn.addEventListener('click', async () => {
    const practitionerId = practitionerSelect.value;
    const noteText = modal.querySelector('#super-query-note').value;
    const selectedIcd10 = modal.querySelector('#super-query-icd10')?.value || '';

    if (!practitionerId) {
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'mds_overlay_query_send',
        error_code: 'no_practitioner',
        error_type: 'validation',
      });
      alert('Please select a practitioner');
      return;
    }

    // Guard: evidence may still be loading
    const ai_ = result.aiAnswer;
    if (!Array.isArray(ai_.evidence) && !Array.isArray(ai_.queryEvidence)) {
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'mds_overlay_query_send',
        error_code: 'evidence_loading',
        error_type: 'validation',
      });
      alert('Evidence is still loading. Please wait a moment.');
      return;
    }

    // Show loading state
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const ai = result.aiAnswer;

      // Build recommendedIcd10 array - include selected code first if present
      let recommendedIcd10 = ai.recommendedIcd10 || [];
      if (selectedIcd10 && !recommendedIcd10.some(c => (typeof c === 'object' ? c.code : c) === selectedIcd10)) {
        recommendedIcd10 = [{ code: selectedIcd10 }, ...recommendedIcd10];
      }

      const queryData = {
        mdsItem: result.mdsItem,
        mdsItemName: ai.mdsItemName || ai.kbCategory?.categoryName || result.description,
        queryReason: ai.rationale || ai.queryReason || '',
        keyFindings: ai.keyFindings || [],
        queryEvidence: ai.evidence || ai.queryEvidence || [],
        recommendedIcd10: recommendedIcd10,
        patientId: context.patientId,
        assessmentId: context.assessmentId,
        facilityName: context.facilityName,
        orgSlug: context.orgSlug
      };

      await createAndSendQuery(queryData, practitionerId, noteText);

      // Show success and close
      showQuerySuccessToast();
      closeModal();

    } catch (error) {
      console.error('Super LTC: Failed to send query', error);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'mds_overlay_query_send',
        error_code: (window.SuperAnalytics?.toErrorCode?.(error) ?? 'unknown'),
        error_type: 'api_error',
      });
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Query';
      alert(`Failed to send query: ${error.message}`);
    }
  });
}

// Show success toast after sending query
function showQuerySuccessToast() {
  const toast = document.createElement('div');
  toast.className = 'super-query-success-toast';
  toast.innerHTML = `
    <div class="super-query-success-toast__content">
      <span class="super-query-success-toast__icon">&#10003;</span>
      <span>Query sent successfully!</span>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'superToastOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// Summary Panel
// ============================================
function createSummaryPanel() {
  // Remove existing panel
  document.querySelector('.super-panel')?.remove();

  const counts = getCounts();
  const itemsToReview = SuperOverlay.results.filter(r =>
    r.status === 'mismatch' || r.status === 'review'
  );

  const panel = document.createElement('div');
  panel.className = 'super-panel super-panel--collapsed';
  panel.innerHTML = buildPanelHTML(counts, itemsToReview);

  document.body.appendChild(panel);
  setupPanelListeners(panel);
}

function getCounts() {
  return {
    match: SuperOverlay.results.filter(r => r.status === 'match' || r.status === 'dismissed').length,
    mismatch: SuperOverlay.results.filter(r => r.status === 'mismatch').length,
    review: SuperOverlay.results.filter(r => r.status === 'review').length
  };
}

function buildPanelHTML(counts, itemsToReview) {
  const itemsHTML = itemsToReview.length > 0
    ? itemsToReview.map(buildPanelItemHTML).join('')
    : '<div class="super-panel-empty"><div class="super-panel-empty__icon">&#10003;</div><div class="super-panel-empty__text">All items match!</div></div>';

  const hasItemsToReview = itemsToReview.length > 0;

  return `
    <div class="super-panel-header">
      <div class="super-panel-header__title">
        <div class="super-panel-header__logo">S</div>
        Super Review
      </div>
      <div class="super-panel-header__actions">
        <!-- NO_TRACK: pure-UI panel toggle (collapse/expand) -->
        <button class="super-panel-header__btn super-panel-header__btn--toggle" aria-label="Toggle panel">&#9650;</button>
        <!-- NO_TRACK: close-X for review panel -->
        <button class="super-panel-header__btn super-panel-header__btn--close" aria-label="Close panel">&times;</button>
      </div>
    </div>
    <div class="super-panel-summary">
      <div class="super-panel-counts">
        <span class="super-panel-count super-panel-count--match">${counts.match} &#10003;</span>
        <span class="super-panel-count super-panel-count--mismatch">${counts.mismatch} &#10007;</span>
        <span class="super-panel-count super-panel-count--review">${counts.review} &#9888;</span>
      </div>
      <!-- NO_TRACK: pure-UI button to launch Super MDS Mode -->
      <button class="super-panel-blitz" title="Walk every item one at a time">&#9889; Super Mode</button>
      <!-- NO_TRACK: pure-UI navigation between review items in legacy MDS overlay panel -->
      <button class="super-panel-next" ${!hasItemsToReview ? 'disabled' : ''}>
        Next &rarr;
      </button>
    </div>
    <div class="super-panel-details">
      <div class="super-panel-details__inner">
        <div class="super-panel-section">Items to Review</div>
        <div class="super-panel-list">
          ${itemsHTML}
        </div>
      </div>
    </div>
  `;
}

function buildPanelItemHTML(result) {
  const iconClass = result.status === 'mismatch'
    ? 'super-panel-item__icon--mismatch'
    : 'super-panel-item__icon--review';
  const icon = result.status === 'mismatch' ? '&#10007;' : '&#9888;';
  const aiAnswer = formatAnswerForDisplay(result.aiAnswer.answer, result.aiAnswer.isNumeric);
  const pccAnswer = formatAnswerForDisplay(result.pccAnswer, result.aiAnswer.isNumeric);

  return `
    <div class="super-panel-item" data-element-id="${result.elementId}">
      <span class="super-panel-item__icon ${iconClass}">${icon}</span>
      <div class="super-panel-item__content">
        <div class="super-panel-item__title">${result.mdsItem} ${result.description} (Col ${result.column})</div>
        <div class="super-panel-item__compare">PCC: ${pccAnswer} | Super: ${aiAnswer}</div>
      </div>
      <span class="super-panel-item__arrow">&rarr;</span>
    </div>
  `;
}

function setupPanelListeners(panel) {
  // Toggle expand/collapse
  panel.querySelector('.super-panel-header').addEventListener('click', (e) => {
    if (!e.target.closest('.super-panel-header__btn--close')) {
      togglePanel(panel);
    }
  });

  panel.querySelector('.super-panel-header__btn--toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel(panel);
  });

  // Close button
  panel.querySelector('.super-panel-header__btn--close').addEventListener('click', () => {
    panel.remove();
  });

  // Next button
  panel.querySelector('.super-panel-next').addEventListener('click', () => {
    navigateToNext();
  });

  // Super MDS Mode launcher
  panel.querySelector('.super-panel-blitz')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.openSuperMDSMode?.();
  });

  // Item clicks
  panel.querySelectorAll('.super-panel-item').forEach(item => {
    item.addEventListener('click', () => {
      const elementId = item.getAttribute('data-element-id');
      navigateToItem(elementId);
    });
  });
}

function togglePanel(panel) {
  panel.classList.toggle('super-panel--expanded');
  panel.classList.toggle('super-panel--collapsed');
  SuperOverlay.panelExpanded = panel.classList.contains('super-panel--expanded');

  const toggleBtn = panel.querySelector('.super-panel-header__btn--toggle');
  toggleBtn.innerHTML = SuperOverlay.panelExpanded ? '&#9660;' : '&#9650;';
}

// ============================================
// Navigation
// ============================================
function navigateToNext() {
  const itemsToReview = SuperOverlay.results.filter(r =>
    r.status === 'mismatch' || r.status === 'review'
  );

  if (itemsToReview.length === 0) return;

  SuperOverlay.currentMismatchIndex = (SuperOverlay.currentMismatchIndex + 1) % itemsToReview.length;
  const result = itemsToReview[SuperOverlay.currentMismatchIndex];

  navigateToItem(result.elementId);
}

function navigateToItem(elementId) {
  const result = SuperOverlay.results.find(r => r.elementId === elementId);
  if (!result || !result.element) return;

  // Scroll to element
  result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Add highlight animation
  result.element.classList.add('super-highlight');
  setTimeout(() => {
    result.element.classList.remove('super-highlight');
  }, 2000);

  // Open popover
  const badge = result.element.querySelector('.super-badge');
  if (badge) {
    setTimeout(() => {
      showPopover(badge, result);
    }, 300);
  }
}

// ============================================
// Action Handlers
// ============================================

/**
 * POST a user decision (agree/disagree) for an MDS item to the API.
 */
async function postItemDecision(result, decision, note) {
  const mdsColumn = result.column || '';
  const body = {
    externalAssessmentId: SuperOverlay.assessmentId,
    facilityName: SuperOverlay.facilityName,
    orgSlug: SuperOverlay.orgSlug,
    decision,
    note: note || '',
    mdsColumn,
    ...(window.getMDSContextBodyFields?.() || {}),
  };
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: `/api/extension/mds/items/${encodeURIComponent(result.mdsItem)}/decision`,
    options: { method: 'POST', body: JSON.stringify(body) },
  });
  if (!response.success) throw new Error(response.error || 'Failed to save decision');
  return response.data;
}

async function handleAction(action, result) {
  const key = `${result.mdsItem}-${result.column}`;

  if (action === 'agree') {
    const popover = document.querySelector('.super-popover');
    const btns = popover ? popover.querySelectorAll('.super-popover-actions .super-btn') : [];
    const agreeBtn = popover?.querySelector('[data-action="agree"]');

    // Disable buttons, show spinner on agree
    btns.forEach(b => b.disabled = true);
    if (agreeBtn) agreeBtn.innerHTML = '<span class="super-btn__spinner"></span> Agree';

    try {
      await postItemDecision(result, 'agree', '');

      // Click the PCC response that matches the solver's answer
      selectPCCAnswer(result);

      // Mark as dismissed
      SuperOverlay.dismissedItems.add(key);
      saveDismissedItems();
      result.status = 'dismissed';
      result.userDecision = { decision: 'agree' };
      injectBadge(result.element, result);
      createSummaryPanel();
      closePopover();

      window.SuperAnalytics?.track?.('mds_item_decision', {
        item_code: String(result.mdsItem || ''),
        column: String(result.column || ''),
        decision: 'agree',
        has_reason: false,
        surface: 'mds_overlay_popover',
      });

      // Notify PDPM Analyzer to re-fetch
      window.dispatchEvent(new CustomEvent('super:item-decision', {
        detail: { mdsItem: result.mdsItem, column: result.column, decision: 'agree' }
      }));

      console.log(`Super LTC: User agreed with ${result.mdsItem} Column ${result.column}, selected solver answer`);
    } catch (err) {
      console.error('Super LTC: Failed to save agree decision:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'mds_item_decision',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      showPopoverError(popover, err.message || 'Failed to save decision');
      btns.forEach(b => b.disabled = false);
      if (agreeBtn) agreeBtn.innerHTML = '&#10003; Agree';
    }
  } else if (action === 'disagree') {
    showDisagreeForm(result);
  }
}

/**
 * Click the PCC page response link that matches the solver's answer.
 * PCC uses toggleSelection(anchor, jqSelector, value) on click,
 * so just clicking the right <a> triggers their handler.
 */
function selectPCCAnswer(result) {
  const solverAnswer = normalizeAnswer(result.aiAnswer?.answer);
  if (!solverAnswer) {
    console.log('Super LTC: No solver answer to select');
    return;
  }

  const responseLinks = result.element.querySelectorAll('.responses a');
  const targetLink = Array.from(responseLinks).find(
    a => a.getAttribute('data-value') === solverAnswer
  );

  if (targetLink) {
    // Don't click if already selected — toggleSelection would deselect it
    if (!targetLink.classList.contains('selected')) {
      targetLink.click();
      console.log(`Super LTC: Selected PCC answer "${solverAnswer}" for ${result.mdsItem}`);
    } else {
      console.log(`Super LTC: PCC already has "${solverAnswer}" selected for ${result.mdsItem}, skipping`);
    }
  } else {
    console.log(`Super LTC: Could not find PCC response for value "${solverAnswer}" on ${result.mdsItem}`);
  }
}

/**
 * Replace action buttons with a "why?" textarea form.
 */
function showDisagreeForm(result) {
  const popover = document.querySelector('.super-popover');
  if (!popover) return;

  const actionsEl = popover.querySelector('.super-popover-actions');
  if (!actionsEl) return;

  actionsEl.innerHTML = `
    <div class="super-disagree-form">
      <label class="super-disagree-form__label">Why do you disagree?</label>
      <textarea class="super-disagree-form__input" placeholder="Describe your reasoning..." rows="3"></textarea>
      <div class="super-disagree-form__buttons">
        <!-- NO_TRACK: cancels legacy disagree feedback form (returns to popover actions) -->
        <button class="super-btn super-btn--cancel" data-action="cancel-disagree">Cancel</button>
        <!-- NO_TRACK: submits legacy disagree feedback (vanilla overlay; no schema event for inline disagree) -->
        <button class="super-btn super-btn--primary" data-action="submit-disagree">Submit</button>
      </div>
    </div>
  `;

  const textarea = actionsEl.querySelector('.super-disagree-form__input');
  textarea?.focus();

  actionsEl.querySelector('[data-action="cancel-disagree"]').addEventListener('click', () => {
    restorePopoverActions(popover, result);
  });

  actionsEl.querySelector('[data-action="submit-disagree"]').addEventListener('click', () => {
    submitDisagreeFeedback(result, textarea.value.trim());
  });

  // Ctrl/Cmd+Enter to submit
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      submitDisagreeFeedback(result, textarea.value.trim());
    }
  });
}

/**
 * Restore the original Agree / Disagree / Query buttons after cancelling disagree.
 */
function restorePopoverActions(popover, result) {
  const actionsEl = popover.querySelector('.super-popover-actions');
  if (!actionsEl) return;

  actionsEl.innerHTML = `
    <!-- NO_TRACK: re-render of legacy MDS overlay popover actions (cancelled disagree) -->
    <button class="super-btn super-btn--agree" data-action="agree">&#10003; Agree</button>
    <!-- NO_TRACK: re-render of legacy MDS overlay popover actions -->
    <button class="super-btn super-btn--disagree" data-action="disagree">&#10007; Disagree</button>
    ${result.mdsItem && result.mdsItem.startsWith('I') ? `
      <!-- NO_TRACK: re-render of legacy popover; opens QuerySendModal which fires query_modal_opened -->
      <button class="super-btn super-btn--query" data-action="query">? Query Physician</button>
    ` : ''}
  `;

  actionsEl.querySelector('[data-action="agree"]').addEventListener('click', () => handleAction('agree', result));
  actionsEl.querySelector('[data-action="disagree"]').addEventListener('click', () => handleAction('disagree', result));
  const queryBtn = actionsEl.querySelector('[data-action="query"]');
  if (queryBtn) {
    queryBtn.addEventListener('click', async () => {
      await ensureEvidenceLoaded(result, queryBtn);
      closePopover();
      window.QuerySendModal?.show(result);
    });
  }
}

/**
 * Block opening QuerySendModal until evidence is backfilled onto
 * result.aiAnswer. Awaits the in-flight auto-load promise if present;
 * otherwise kicks off a one-shot fetch (covers the case where the popover
 * was rendered without an auto-load — e.g. evidenceCount=0 but the user
 * still wants to query, or restoreActions was called).
 *
 * Shows a brief "Loading…" state on the button so the click feels alive.
 */
async function ensureEvidenceLoaded(result, btnEl) {
  if (!result?.aiAnswer || !result.mdsItem) return;

  const haveArr = (a) => Array.isArray(a) && a.length > 0;
  if (haveArr(result.aiAnswer.evidence) || haveArr(result.aiAnswer.queryEvidence)) return;

  const restore = btnEl ? setBtnLoading(btnEl, 'Loading evidence…') : null;
  try {
    // Reuse the auto-load promise if it's in flight, ignoring its rejections
    // — we'll re-check evidence afterwards and fall through to a fresh fetch
    // if the backfill didn't happen for any reason.
    if (result.aiAnswer._evidencePromise) {
      try { await result.aiAnswer._evidencePromise; } catch (_) {}
    }

    const stillEmpty = !haveArr(result.aiAnswer.evidence) && !haveArr(result.aiAnswer.queryEvidence);
    if (stillEmpty) {
      const data = await fetchItemEvidence(SuperOverlay.section, result.mdsItem);
      const columnEvidence = (result.column && data.evidenceByColumn?.[result.column]) || null;
      result.aiAnswer.evidence = columnEvidence || data.evidence || [];
      result.aiAnswer.queryEvidence = data.queryEvidence || [];
      if (data.validation) result.aiAnswer.validation = data.validation;
    }
  } catch (err) {
    console.error('[Super LTC] ensureEvidenceLoaded failed:', err);
  } finally {
    if (restore) restore();
  }
}

/**
 * Replace a button's content with a small spinner + label during async work.
 * Returns a restore() callback the caller must invoke when done.
 */
function setBtnLoading(btnEl, label = 'Loading…') {
  if (!btnEl) return () => {};
  const original = btnEl.innerHTML;
  const wasDisabled = btnEl.disabled;
  btnEl.disabled = true;
  btnEl.style.opacity = '0.75';
  btnEl.innerHTML = `<span class="super-btn__spinner" style="width:10px;height:10px;margin-right:6px;"></span>${label}`;
  return () => {
    btnEl.innerHTML = original;
    btnEl.disabled = wasDisabled;
    btnEl.style.opacity = '';
  };
}

/**
 * Show an inline error message in the popover above the actions area.
 */
function showPopoverError(popover, message) {
  if (!popover) return;
  // Remove any existing error
  popover.querySelector('.super-popover-error')?.remove();
  const errDiv = document.createElement('div');
  errDiv.className = 'super-popover-error';
  errDiv.textContent = message;
  const actions = popover.querySelector('.super-popover-actions');
  if (actions) {
    actions.parentNode.insertBefore(errDiv, actions);
  } else {
    popover.appendChild(errDiv);
  }
}

/**
 * Submit disagree feedback and dismiss the item.
 */
async function submitDisagreeFeedback(result, reason) {
  const key = `${result.mdsItem}-${result.column}`;
  const popover = document.querySelector('.super-popover');
  const btns = popover ? popover.querySelectorAll('.super-disagree-form__buttons .super-btn') : [];
  const submitBtn = popover?.querySelector('[data-action="submit-disagree"]');

  // Disable buttons, show spinner on submit
  btns.forEach(b => b.disabled = true);
  if (submitBtn) submitBtn.innerHTML = '<span class="super-btn__spinner"></span> Submit';

  try {
    await postItemDecision(result, 'disagree', reason);

    SuperOverlay.dismissedItems.add(key);
    saveDismissedItems();
    result.status = 'dismissed';
    result.userDecision = { decision: 'disagree', note: reason };
    injectBadge(result.element, result);
    createSummaryPanel();
    closePopover();

    window.SuperAnalytics?.track?.('mds_item_decision', {
      item_code: String(result.mdsItem || ''),
      column: String(result.column || ''),
      decision: 'disagree',
      has_reason: !!(reason && reason.length > 0),
      surface: 'mds_overlay_popover',
    });

    // Notify PDPM Analyzer to re-fetch
    window.dispatchEvent(new CustomEvent('super:item-decision', {
      detail: { mdsItem: result.mdsItem, column: result.column, decision: 'disagree' }
    }));

    console.log(`Super LTC: User disagreed with ${result.mdsItem} Column ${result.column}`, { reason });
  } catch (err) {
    console.error('Super LTC: Failed to save disagree decision:', err);
    window.SuperAnalytics?.track?.('error_shown', {
      surface: 'mds_item_decision',
      error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
      error_type: 'api_error',
    });
    showPopoverError(popover, err.message || 'Failed to save decision');
    btns.forEach(b => b.disabled = false);
    if (submitBtn) submitBtn.innerHTML = 'Submit';
  }
}

// ============================================
// Storage
// ============================================
async function loadDismissedItems() {
  try {
    const data = await chrome.storage.local.get('superDismissedItems');
    if (data.superDismissedItems) {
      SuperOverlay.dismissedItems = new Set(data.superDismissedItems);
    }
  } catch (e) {
    console.log('Super LTC: Could not load dismissed items', e);
  }
}

function saveDismissedItems() {
  try {
    chrome.storage.local.set({
      superDismissedItems: Array.from(SuperOverlay.dismissedItems)
    });
  } catch (e) {
    console.log('Super LTC: Could not save dismissed items', e);
  }
}

// ============================================
// Query Loading
// ============================================
async function loadAssessmentQueries(assessmentId, facilityName, orgSlug) {
  try {
    console.log('Super LTC: Loading queries for assessment', assessmentId);

    // Use QueryState to load queries (from queries/query-state.js)
    await QueryState.loadQueries(assessmentId, facilityName, orgSlug);

    // Update badges to show query status
    if (QueryState.queries.length > 0) {
      QueryBadges.updateAllBadges();
      QueryPanel.updatePanel();
      console.log('Super LTC: Updated UI with', QueryState.queries.length, 'queries');
    }
  } catch (error) {
    console.error('Super LTC: Failed to load queries (non-fatal):', error);
    // Non-fatal - queries are supplementary
  }
}

// ============================================
// Initialize
// ============================================
console.log('Super LTC content script loaded on:', window.location.href);

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSuperOverlay);
} else {
  // Small delay to ensure all elements are rendered
  setTimeout(initSuperOverlay, 500);
}

// Also try to initialize on URL changes (for SPA navigation)
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    SuperOverlay.initialized = false;
    setTimeout(initSuperOverlay, 500);
  }
}).observe(document.body, { childList: true, subtree: true });
