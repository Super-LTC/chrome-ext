/**
 * Evidence Viewers for Clinical Notes, Therapy Documents, and PDFs
 *
 * This module provides modal viewers for different types of patient evidence:
 * - Clinical Notes (progress notes, practitioner notes)
 * - Therapy Documents (EVAL, TEN, PR, RECERT, DISCH)
 * - PDF Documents
 */

import { render, h } from 'preact';
import { PDFViewer } from './components/PDFViewer.jsx';
import { UdaViewer } from './modules/uda-viewer/UdaViewer.jsx';
import { track, toErrorCode } from './utils/analytics.js';

// Idempotent close-tracker: reads viewer type + open timestamp stashed on the
// modal element by show*Modal, fires evidence_viewer_closed once per modal.
function trackEvidenceClose(modal) {
  if (!modal || modal.dataset.evClosed === '1') return;
  modal.dataset.evClosed = '1';
  const type = modal.dataset.evType;
  const openTs = parseInt(modal.dataset.evOpenTs, 10);
  if (!type || !openTs) return;
  track('evidence_viewer_closed', { type, duration_ms: Date.now() - openTs });
}

// =============================================================================
// EVIDENCE DETECTION
// =============================================================================

/**
 * Parse evidence object to determine if it has a viewable type
 * Handles both patterns:
 * 1. Direct: sourceType="progress-note" + sourceId
 * 2. evidenceId prefix: "pcc-prognote-xxx", "therapy-doc-xxx", etc.
 */
function parseEvidenceForViewer(ev) {
  const { sourceType, evidenceId } = ev;
  // Some API formats use "id" instead of "sourceId"
  const sourceId = ev.sourceId || ev.id || '';
  const evType = ev.type; // queryEvidence uses "type" field (e.g., "clinical_note")

  // Pattern 1: Direct sourceType (from some API responses)
  if (sourceType === 'progress-note' && sourceId) {
    return { viewerType: 'clinical-note', id: sourceId };
  }
  if (sourceType === 'therapy-doc' && sourceId) {
    return { viewerType: 'therapy-document', id: sourceId };
  }
  if (sourceType === 'document' && sourceId) {
    return { viewerType: 'document', id: sourceId };
  }
  if (sourceType === 'uda' || sourceType === 'wound-assessment') {
    const udaId = (sourceId || evidenceId || '').replace(/^uda-/, '');
    if (udaId) return { viewerType: 'uda', id: udaId };
  }

  // Early check: if sourceId contains -chunk-, it's a document regardless of type label
  // (AI sometimes mislabels document chunks as clinical_note)
  if (sourceId && sourceId.includes('-chunk-')) {
    return { viewerType: 'document', id: sourceId.split('-chunk-')[0], chunk: parseInt(sourceId.split('-chunk-')[1], 10) };
  }

  // Pattern 1b: queryEvidence format uses "type" + "sourceId"
  // sourceId may have prefixes like "pcc-prognote-xxx" / "pcc-practnote-xxx" /
  // legacy "patient-practnote-xxx" — strip whichever is present.
  if (evType === 'clinical_note' && sourceId) {
    const noteId = sourceId
      .replace(/^pcc-prognote-/, '')
      .replace(/^pcc-practnote-/, '')
      .replace(/^patient-practnote-/, '');
    return { viewerType: 'clinical-note', id: noteId };
  }
  if (evType === 'therapy_document' && sourceId) {
    const docId = sourceId.replace(/^therapy-doc-/, '');
    return { viewerType: 'therapy-document', id: docId };
  }
  if (evType === 'document' && sourceId) {
    return { viewerType: 'document', id: sourceId };
  }

  // Pattern 2: evidenceId prefixes
  const eid = evidenceId || sourceId;
  if (eid) {
    if (eid.startsWith('therapy-doc-')) {
      return { viewerType: 'therapy-document', id: eid.replace('therapy-doc-', '') };
    }
    if (eid.startsWith('pcc-prognote-')) {
      return { viewerType: 'clinical-note', id: eid.replace('pcc-prognote-', '') };
    }
    if (eid.startsWith('pcc-practnote-')) {
      return { viewerType: 'clinical-note', id: eid.replace('pcc-practnote-', '') };
    }
    if (eid.startsWith('patient-practnote-')) {
      return { viewerType: 'clinical-note', id: eid.replace('patient-practnote-', '') };
    }
    if (eid.includes('-chunk-')) {
      // Document chunks: "abc123-chunk-1" -> "abc123"
      return { viewerType: 'document', id: eid.split('-chunk-')[0], chunk: parseInt(eid.split('-chunk-')[1], 10) };
    }
    if (eid.startsWith('uda-')) {
      return { viewerType: 'uda', id: eid.replace('uda-', '') };
    }
  }

  return { viewerType: null, id: null };
}

// =============================================================================
// MODAL MOUNT POINT
// =============================================================================

/**
 * If the ICD10 viewer (or another top-level modal) is open, append evidence
 * modals inside its container so they share the same stacking context and
 * appear on top. Otherwise fall back to document.body.
 */
function getModalMountPoint() {
  // Super Review mode hosts inline source viewing in its right panel
  const smmHost = document.querySelector('.smm-source-host');
  if (smmHost) return smmHost;

  // Check for open ICD10 viewer container first
  const icd10Container = document.querySelector('.icd10-viewer-modal__container');
  if (icd10Container) return icd10Container;

  return document.body;
}

// =============================================================================
// API FETCH FUNCTIONS
// =============================================================================

export async function fetchClinicalNote(noteId, params) {
  const endpoint = `/api/extension/clinical-notes/${noteId}?` +
    `facilityName=${encodeURIComponent(params.facilityName)}` +
    `&orgSlug=${params.orgSlug}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint
  });
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function fetchTherapyDocument(therapyDocId, params) {
  const endpoint = `/api/extension/therapy-documents/${therapyDocId}?` +
    `facilityName=${encodeURIComponent(params.facilityName)}` +
    `&orgSlug=${params.orgSlug}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint
  });
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function fetchDocument(documentId, params) {
  const endpoint = `/api/extension/documents/${documentId}?` +
    `facilityName=${encodeURIComponent(params.facilityName)}` +
    `&orgSlug=${params.orgSlug}`;

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint
  });
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function fetchUda(udaId, patientId, params, quoteText = null) {
  let endpoint = `/api/extension/patients/${patientId}/uda/${udaId}?` +
    `facilityName=${encodeURIComponent(params.facilityName)}` +
    `&orgSlug=${params.orgSlug}`;

  if (quoteText) {
    endpoint += `&quote=${encodeURIComponent(quoteText)}`;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint
  });
  if (!response.success) throw new Error(response.error);
  return response.data;
}

function resolvePatientIdForUda() {
  if (typeof window !== 'undefined') {
    const fromOverlay = window.SuperOverlay?.patientId;
    if (fromOverlay) return fromOverlay;
    try {
      const fromUrl = new URL(window.location.href).searchParams.get('ESOLclientid');
      if (fromUrl) return fromUrl;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// =============================================================================
// SHARED MODAL UTILITIES
// =============================================================================

function escapeHTMLViewer(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTimeDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

// =============================================================================
// HIGHLIGHTING UTILITIES
// =============================================================================

const HIGHLIGHT_DATA_ATTR = 'data-evidence-highlight';

/**
 * Normalize text for comparison - lowercase, collapse whitespace, trim
 */
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Check if a field's text matches (contains or is contained by) the quote text
 */
function textMatchesQuote(fieldText, quoteText) {
  if (!fieldText || !quoteText) return false;

  const normalizedField = normalizeText(fieldText);
  const normalizedQuote = normalizeText(quoteText);

  // Skip very short texts to avoid false positives
  if (normalizedField.length < 10 || normalizedQuote.length < 10) return false;

  // Check if field contains quote or quote contains field
  return normalizedField.includes(normalizedQuote) || normalizedQuote.includes(normalizedField);
}

/**
 * Check if at least 2 words from the quote appear in the field text
 * More lenient matching for when exact substring doesn't work
 */
function textHasWordOverlap(fieldText, quoteText, minWordLength = 4) {
  if (!fieldText || !quoteText) return false;

  const normalizedField = normalizeText(fieldText);
  const normalizedQuote = normalizeText(quoteText);

  // Extract words from quote that are long enough
  const quoteWords = normalizedQuote
    .split(/\s+/)
    .filter(word => word.length >= minWordLength);

  // Check if at least 2 significant words from quote appear in field
  const matchingWords = quoteWords.filter(word => normalizedField.includes(word));

  return matchingWords.length >= 2;
}

/**
 * Check if field text should be highlighted based on quote
 */
function isTextHighlighted(highlightQuote, fieldText) {
  return textMatchesQuote(fieldText, highlightQuote) || textHasWordOverlap(fieldText, highlightQuote);
}

/**
 * Check if any text in an array matches the quote
 */
function anyTextMatchesQuote(texts, quoteText) {
  return texts.some(text => textMatchesQuote(text, quoteText) || textHasWordOverlap(text, quoteText));
}

// =============================================================================
// FIELD EXTRACTION UTILITIES
// =============================================================================

/**
 * Safely extract string value from field with PascalCase/camelCase support
 */
function getStringField(obj, pascalKey, camelKey) {
  const value = getField(obj, pascalKey, camelKey);
  return value ? String(value) : '';
}

/**
 * Format date string as M/D/YYYY
 */
function formatDocumentDateNew(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  } catch {
    return dateString;
  }
}

/**
 * Format date with time for signatures (M/D/YYYY H:MM:SS AM/PM)
 */
function formatSignatureDateTime(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
  } catch {
    return dateString;
  }
}

function setupModalCloseHandlers(modal, modalClass) {
  // Only manage body overflow if we're mounted directly on body
  const isOnBody = !document.querySelector('.icd10-viewer-modal__container');
  if (isOnBody) document.body.style.overflow = 'hidden';

  // Restore body scroll when modal closes
  const closeModal = () => {
    if (isOnBody) document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  };

  // Close button
  modal.querySelector(`.${modalClass}__close`).addEventListener('click', closeModal);

  // Backdrop click
  modal.querySelector(`.${modalClass}__backdrop`).addEventListener('click', closeModal);

  // Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function renderModalError(modal, errorMessage, modalClass) {
  const body = modal.querySelector(`.${modalClass}__body`);
  body.innerHTML = `
    <div class="super-viewer-error">
      <div class="super-viewer-error__icon">⚠️</div>
      <div class="super-viewer-error__message">${escapeHTMLViewer(errorMessage)}</div>
    </div>
  `;
}

// =============================================================================
// CLINICAL NOTES MODAL
// =============================================================================

async function showClinicalNoteModal(noteId, highlightQuote = null, source = 'unknown') {
  console.log('[NoteHighlight] showClinicalNoteModal noteId=', noteId, 'quote?', !!highlightQuote, 'quoteLen=', highlightQuote ? highlightQuote.length : 0);
  // Get params from content.js (exposed on window)
  const params = await window.getCurrentParams();

  const modal = createNoteModalShell();
  modal.dataset.evType = 'clinical_notes';
  modal.dataset.evOpenTs = String(Date.now());
  track('evidence_viewer_opened', { type: 'clinical_notes', source });
  getModalMountPoint().appendChild(modal);

  try {
    const data = await fetchClinicalNote(noteId, params);
    console.log('[NoteHighlight] note fetched, noteText length:', data?.note?.noteText?.length || 0);
    renderNoteModalContent(modal, data.note, highlightQuote);
  } catch (error) {
    console.error('[NoteHighlight] fetch failed:', error);
    renderModalError(modal, error.message, 'super-note-modal');
  }
}

function createNoteModalShell() {
  const modal = document.createElement('div');
  modal.className = 'super-note-modal';
  modal.innerHTML = `
    <div class="super-note-modal__backdrop"></div>
    <div class="super-note-modal__container">
      <div class="super-note-modal__header">
        <div class="super-note-modal__title">
          <span class="super-note-modal__name">Loading...</span>
        </div>
        <button class="super-note-modal__close">&times;</button> <!-- NO_TRACK -->

      </div>
      <div class="super-note-modal__body">
        <div class="super-viewer-loading">
          <div class="super-viewer-loading__spinner"></div>
          <span>Loading note...</span>
        </div>
      </div>
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-note-modal');
  return modal;
}

/**
 * Build a highlighted HTML body for a clinical/practitioner note.
 *
 * Strategy: split the quote on sentence/clause punctuation, keep phrases
 * ≥15 chars, search each case-insensitively in the note text, wrap hits
 * in <mark>. Merges overlapping ranges so adjacent matches fuse into one
 * continuous highlight.
 */
function buildHighlightedNoteText(noteText, quote) {
  if (!noteText) return 'No note content available.';
  const full = String(noteText);
  if (!quote) return escapeHTMLViewer(full);

  const phrases = String(quote)
    .split(/[.;:\n]+/)
    .map(p => p.replace(/[*"'`()]/g, '').trim())
    .filter(p => p.length >= 15);

  console.log('[NoteHighlight] quote length:', quote.length, 'phrases extracted:', phrases.length, phrases);

  if (phrases.length === 0) return escapeHTMLViewer(full);

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

  console.log('[NoteHighlight] raw match ranges:', ranges.length);

  // Fallback: word-trigram search when no long phrase matched verbatim.
  // Slide a 3-word window over the quote and look for each window in note.
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
    console.log('[NoteHighlight] trigram fallback ranges:', ranges.length);
  }

  if (ranges.length === 0) {
    console.log('[NoteHighlight] no matches found; rendering plain escaped text');
    return escapeHTMLViewer(full);
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0].slice()];
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = ranges[i];
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1]);
    } else {
      merged.push(curr.slice());
    }
  }

  console.log('[NoteHighlight] merged ranges:', merged.length, merged);

  let out = '';
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) out += escapeHTMLViewer(full.slice(cursor, start));
    out += `<mark class="super-note-highlight" ${HIGHLIGHT_DATA_ATTR}="true">${escapeHTMLViewer(full.slice(start, end))}</mark>`;
    cursor = end;
  }
  if (cursor < full.length) out += escapeHTMLViewer(full.slice(cursor));
  return out;
}

function renderNoteModalContent(modal, note, highlightQuote = null) {
  const container = modal.querySelector('.super-note-modal__container');

  const noteTypeLabel = note.noteType === 'practitioner' ? 'Practitioner Note' : 'Progress Note';
  const noteTypeBadgeClass = note.noteType === 'practitioner' ? 'super-note-badge--practitioner' : 'super-note-badge--progress';

  container.innerHTML = `
    <div class="super-note-modal__header">
      <div class="super-note-modal__title-row">
        <span class="super-note-modal__icon">📝</span>
        <div class="super-note-modal__title">
          <span class="super-note-modal__name">${escapeHTMLViewer(note.department || noteTypeLabel)}</span>
          <span class="super-note-badge ${noteTypeBadgeClass}">${noteTypeLabel}</span>
        </div>
        <button class="super-note-modal__close">&times;</button> <!-- NO_TRACK -->

      </div>
      ${note.provider ? `<div class="super-note-modal__provider">${escapeHTMLViewer(note.provider)}</div>` : ''}
      <div class="super-note-modal__meta">
        ${note.effectiveDate ? `<span>${formatDateDisplay(note.effectiveDate)}</span>` : ''}
        ${note.visitType ? `<span class="super-note-modal__visit-type">${escapeHTMLViewer(note.visitType)}</span>` : ''}
        ${note.task ? `<span class="super-note-modal__task">${escapeHTMLViewer(note.task)}</span>` : ''}
      </div>
    </div>

    <div class="super-note-modal__body">
      <div class="super-note-modal__text">${buildHighlightedNoteText(note.noteText, highlightQuote)}</div>
    </div>

    <div class="super-note-modal__footer">
      ${note.signedDate ? `<span class="super-note-modal__signed">Signed: ${formatDateTimeDisplay(note.signedDate)}</span>` : ''}
      ${note.hasAddendum ? `<span class="super-note-modal__addendum">Has Addendum</span>` : ''}
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-note-modal');

  if (highlightQuote) {
    setTimeout(() => {
      const all = modal.querySelectorAll(`[${HIGHLIGHT_DATA_ATTR}="true"]`);
      console.log('[NoteHighlight] post-render marks found in DOM:', all.length);
      if (all.length > 0) {
        all[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  }
}

// =============================================================================
// THERAPY DOCUMENTS MODAL
// =============================================================================

async function showTherapyDocModal(therapyDocId, highlightQuote = null, source = 'unknown') {
  const params = await window.getCurrentParams();

  const modal = createTherapyModalShell();
  modal.dataset.evType = 'therapy';
  modal.dataset.evOpenTs = String(Date.now());
  track('evidence_viewer_opened', { type: 'therapy', source });
  getModalMountPoint().appendChild(modal);

  try {
    const data = await fetchTherapyDocument(therapyDocId, params);
    renderTherapyModalContent(modal, data.therapyDocument, highlightQuote);
  } catch (error) {
    renderModalError(modal, error.message, 'super-therapy-modal');
  }
}

function createTherapyModalShell() {
  const modal = document.createElement('div');
  modal.className = 'super-therapy-modal';
  modal.dataset.zoom = '100';
  modal.innerHTML = `
    <div class="super-therapy-modal__backdrop"></div>
    <div class="super-therapy-modal__container">
      <div class="super-therapy-modal__toolbar">
        <div class="super-therapy-modal__toolbar-title">Loading...</div>
        <div class="super-therapy-modal__toolbar-controls">
          <div class="super-therapy-modal__zoom">
            <button class="super-therapy-modal__zoom-btn" data-zoom-action="out" title="Zoom Out">−</button> <!-- NO_TRACK -->
            <span class="super-therapy-modal__zoom-level">100%</span>
            <button class="super-therapy-modal__zoom-btn" data-zoom-action="in" title="Zoom In">+</button> <!-- NO_TRACK -->
          </div>
          <button class="super-therapy-modal__close">&times;</button> <!-- NO_TRACK -->
        </div>
      </div>
      <div class="super-therapy-modal__body">
        <div class="super-viewer-loading">
          <div class="super-viewer-loading__spinner"></div>
          <span>Loading therapy document...</span>
        </div>
      </div>
      <div class="super-therapy-modal__footer">
        <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary super-therapy-modal__close-btn">Close</button> <!-- NO_TRACK -->
      </div>
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-therapy-modal');
  setupTherapyZoomHandlers(modal);

  // Also set up close for the footer button
  modal.querySelector('.super-therapy-modal__close-btn')?.addEventListener('click', () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  });

  return modal;
}

function setupTherapyZoomHandlers(modal) {
  const zoomLevels = [50, 75, 100, 125, 150];

  modal.querySelectorAll('.super-therapy-modal__zoom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.zoomAction;
      const currentZoom = parseInt(modal.dataset.zoom) || 100;
      const currentIndex = zoomLevels.indexOf(currentZoom);

      let newZoom = currentZoom;
      if (action === 'in' && currentIndex < zoomLevels.length - 1) {
        newZoom = zoomLevels[currentIndex + 1];
      } else if (action === 'out' && currentIndex > 0) {
        newZoom = zoomLevels[currentIndex - 1];
      }

      modal.dataset.zoom = newZoom;

      // Update zoom level display
      const zoomDisplay = modal.querySelector('.super-therapy-modal__zoom-level');
      if (zoomDisplay) zoomDisplay.textContent = `${newZoom}%`;

      // Apply zoom to document
      const doc = modal.querySelector('.super-therapy-doc');
      if (doc) {
        doc.style.transform = `scale(${newZoom / 100})`;
        doc.style.transformOrigin = 'top center';
      }
    });
  });
}

function renderTherapyModalContent(modal, doc, highlightQuote = null) {
  const { documentType } = doc;

  // Route to type-specific renderer
  switch (documentType) {
    case 'EVAL':
      renderEvalDocument(modal, doc, highlightQuote);
      break;
    case 'TEN':
      renderTENDocument(modal, doc, highlightQuote);
      break;
    case 'PR':
      renderProgressReport(modal, doc, highlightQuote);
      break;
    case 'RECERT':
      renderRecertDocument(modal, doc, highlightQuote);
      break;
    case 'DISCH':
      renderDischargeDocument(modal, doc, highlightQuote);
      break;
    default:
      renderGenericTherapyDoc(modal, doc, highlightQuote);
  }

  // Setup highlight navigation if there are highlights
  if (highlightQuote) {
    setTimeout(() => {
      setupHighlightNavigation(modal);
    }, 100);
  }
}

function setupHighlightNavigation(modal) {
  const highlights = modal.querySelectorAll(`[${HIGHLIGHT_DATA_ATTR}="true"]`);
  if (highlights.length === 0) return;

  // Scroll to first highlight
  highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

  // If only one highlight, no need for navigation
  if (highlights.length === 1) return;

  // Create floating navigation UI
  const nav = document.createElement('div');
  nav.className = 'super-therapy-highlight-nav';
  nav.innerHTML = `
    <button class="super-therapy-highlight-nav__btn" data-action="prev" title="Previous highlight"> <!-- NO_TRACK -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>
    <span class="super-therapy-highlight-nav__count">1 of ${highlights.length}</span>
    <button class="super-therapy-highlight-nav__btn" data-action="next" title="Next highlight"> <!-- NO_TRACK -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>
  `;

  const modalBody = modal.querySelector('.super-therapy-modal__body');
  if (modalBody) {
    modalBody.appendChild(nav);
  }

  let currentIndex = 0;

  const goToHighlight = (index) => {
    // Remove active class from all
    highlights.forEach(h => h.classList.remove('super-therapy-highlight--active'));

    // Add active class to current
    highlights[index].classList.add('super-therapy-highlight--active');
    highlights[index].scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Update counter
    nav.querySelector('.super-therapy-highlight-nav__count').textContent = `${index + 1} of ${highlights.length}`;
  };

  nav.querySelectorAll('.super-therapy-highlight-nav__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'prev') {
        currentIndex = currentIndex > 0 ? currentIndex - 1 : highlights.length - 1;
      } else {
        currentIndex = currentIndex < highlights.length - 1 ? currentIndex + 1 : 0;
      }
      goToHighlight(currentIndex);
    });
  });

  // Mark first as active
  highlights[0].classList.add('super-therapy-highlight--active');
}

// Discipline full names for document headers
const DISCIPLINE_NAMES = {
  'PT': 'Physical Therapy',
  'OT': 'Occupational Therapy',
  'ST': 'Speech Therapy'
};

// Document type labels for toolbar
const DOC_TYPE_LABELS = {
  'EVAL': 'Initial Evaluation',
  'TEN': 'Treatment Note',
  'PR': 'Progress Report',
  'RECERT': 'Recertification',
  'DISCH': 'Discharge Summary'
};

// Get document name mappings for the centered document title
const DOC_TYPE_TITLES = {
  'EVAL': 'Initial Evaluation',
  'TEN': 'Treatment Encounter Note(s)',
  'PR': 'Progress Report',
  'RECERT': 'Recertification',
  'DISCH': 'Discharge Summary'
};

// Get field from NetHealth JSON (handles PascalCase and camelCase)
function getField(data, ...keys) {
  for (const key of keys) {
    if (data[key] !== undefined) return data[key];
    // Try PascalCase
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    if (data[pascal] !== undefined) return data[pascal];
  }
  return null;
}

// =============================================================================
// PDF-STYLE SHARED RENDERING COMPONENTS
// =============================================================================

// Render the document header (centered discipline + title, provider/patient row)
function renderDocumentHeader(doc) {
  const json = doc.jsonData || {};
  const params = json.Parameters || json.parameters || {};

  const discipline = doc.discipline || '';
  const disciplineName = DISCIPLINE_NAMES[discipline] || discipline || 'Therapy';
  const docType = doc.documentType || '';
  const docTitle = DOC_TYPE_TITLES[docType] || json.BodyDocumentName || json.bodyDocumentName || docType;

  const providerName = doc.providerName ||
    getField(params, 'ProviderName', 'providerName') ||
    getField(json, 'HeaderProviderName', 'headerProviderName') || '';

  const patientName = getField(params, 'PatientName', 'patientName') ||
    getField(json, 'HeaderPatientName', 'headerPatientName') ||
    getField(json, 'BodyPatientName', 'bodyPatientName') || '';

  return `
    <div class="super-therapy-doc__header">
      <div class="super-therapy-doc__discipline">${escapeHTMLViewer(disciplineName)}</div>
      <div class="super-therapy-doc__title">${escapeHTMLViewer(docTitle)}</div>
    </div>
    <div class="super-therapy-doc__info-row">
      <div class="super-therapy-doc__provider">
        <span class="super-therapy-doc__provider-label">Provider: </span>${escapeHTMLViewer(providerName)}
      </div>
      <div class="super-therapy-doc__patient">${escapeHTMLViewer(patientName)}</div>
    </div>
  `;
}

// Render Identification Information table with blue header
function renderIdentificationTable(doc) {
  const json = doc.jsonData || {};
  const params = json.Parameters || json.parameters || {};

  const patientName = getField(params, 'PatientName', 'patientName') ||
    getField(json, 'BodyPatientName', 'bodyPatientName') || '';
  const mrn = getField(params, 'MedicalRecordNumber', 'medicalRecordNumber') ||
    getField(json, 'BodyMRN', 'bodyMRN') || '';
  const dob = getField(params, 'DateOfBirth', 'dateOfBirth') ||
    getField(json, 'BodyDOB', 'bodyDOB') || '';
  const payer = getField(params, 'PayerName', 'payerName') || '';
  const startOfCare = getField(params, 'StartOfCare', 'startOfCare') || '';

  return `
    <div class="super-therapy-section">
      <div class="super-therapy-section-header">Identification Information</div>
      <div class="super-therapy-section__body">
        <table class="super-therapy-id-table">
          <tr>
            <td class="super-therapy-id-table__label">Patient:</td>
            <td class="super-therapy-id-table__value">${escapeHTMLViewer(patientName)}</td>
            ${dob ? `<td class="super-therapy-id-table__label">DOB:</td><td class="super-therapy-id-table__value">${escapeHTMLViewer(dob)}</td>` : ''}
            ${startOfCare ? `<td class="super-therapy-id-table__label">Start of Care:</td><td class="super-therapy-id-table__value">${escapeHTMLViewer(startOfCare)}</td>` : ''}
          </tr>
          <tr>
            ${payer ? `<td class="super-therapy-id-table__label">Payer:</td><td class="super-therapy-id-table__value">${escapeHTMLViewer(payer)}</td>` : ''}
            <td class="super-therapy-id-table__label">MRN:</td>
            <td class="super-therapy-id-table__value" ${payer ? '' : 'colspan="3"'}>${escapeHTMLViewer(mrn)}</td>
          </tr>
        </table>
      </div>
    </div>
  `;
}

// Render Diagnoses table with blue header
function renderDiagnosesTable(diagnoses) {
  if (!diagnoses || diagnoses.length === 0) return '';

  const medicalDx = diagnoses.filter(d => d.IsMedicalDx || d.isMedicalDx);
  const treatmentDx = diagnoses.filter(d => d.IsTreatmentDx || d.isTreatmentDx);

  if (medicalDx.length === 0 && treatmentDx.length === 0) return '';

  return `
    <div class="super-therapy-section">
      <div class="super-therapy-section-header">Diagnoses</div>
      <div class="super-therapy-section__body">
        <table class="super-therapy-dx-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Code</th>
              <th>Description</th>
              <th>Onset</th>
            </tr>
          </thead>
          <tbody>
            ${medicalDx.map(d => `
              <tr>
                <td>Medical</td>
                <td class="super-therapy-dx-table__code">${escapeHTMLViewer(d.Code || d.code || '')}</td>
                <td>${escapeHTMLViewer(d.Description || d.description || '')}</td>
                <td>${formatDateDisplay(d.OnsetDate || d.onsetDate) || '-'}</td>
              </tr>
            `).join('')}
            ${treatmentDx.map(d => `
              <tr>
                <td>Treatment</td>
                <td class="super-therapy-dx-table__code">${escapeHTMLViewer(d.Code || d.code || '')}</td>
                <td>${escapeHTMLViewer(d.Description || d.description || '')}</td>
                <td>${formatDateDisplay(d.OnsetDate || d.onsetDate) || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Render a single goal card matching the main app format
function renderGoalCard(goal, isLongTerm = false, highlightQuote = null) {
  const goalType = isLongTerm ? 'LTG' : 'STG';
  const goalNum = goal.GoalNum || goal.goalNum || '?';
  const status = goal.GoalStatus || goal.goalStatus || 'Continue';
  const statusClass = `super-therapy-goal__status--${status.toLowerCase().replace(/\s+/g, '')}`;
  const goalText = goal.GoalText || goal.goalText || '';
  const targetDate = goal.TargetDate || goal.targetDate || '';
  const plofText = goal.GoalPlofText || goal.goalPlofText || '';
  const baselineText = goal.BaselineValueText || goal.baselineValueText || '';
  const priorText = goal.PriorValueText || goal.priorValueText || '';
  const currentText = goal.CurrentValueText || goal.currentValueText || '';
  const comments = goal.Comments || goal.comments || '';
  const measurementCaption = goal.MeasurementCaption || goal.measurementCaption || '';

  // Check highlighting
  const allTexts = [goalText, comments, baselineText, priorText, currentText, plofText];
  const hasMatch = anyTextMatchesQuote(allTexts, highlightQuote);
  const highlightAttr = hasMatch ? `${HIGHLIGHT_DATA_ATTR}="true"` : '';
  const goalTextHighlight = isTextHighlighted(highlightQuote, goalText) ? 'super-therapy-highlight' : '';
  const commentsHighlight = isTextHighlighted(highlightQuote, comments) ? 'super-therapy-highlight' : '';

  return `
    <div class="super-therapy-goal" ${highlightAttr}>
      <div class="super-therapy-goal__header">
        <div class="super-therapy-goal__title">${goalType} #${goalNum} - ${status}</div>
        <span class="super-therapy-goal__status ${statusClass}">${status}</span>
      </div>
      <div class="super-therapy-goal__body">
        <p class="super-therapy-goal__text ${goalTextHighlight}">${escapeHTMLViewer(goalText)}</p>
        ${targetDate ? `<p class="super-therapy-goal__target">Target: ${formatDateDisplay(targetDate)}</p>` : ''}
      </div>
      <div class="super-therapy-goal__progress">
        <div>
          <div class="super-therapy-goal__progress-item">
            <div class="super-therapy-goal__progress-label">PLOF</div>
            <div class="super-therapy-goal__progress-value">${escapeHTMLViewer(plofText || 'Not specified')}</div>
          </div>
          ${baselineText ? `
            <div class="super-therapy-goal__progress-item">
              <div class="super-therapy-goal__progress-label">Baseline${measurementCaption ? ` <span class="super-therapy-goal__progress-sublabel">(${escapeHTMLViewer(measurementCaption)})</span>` : ''}</div>
              <div class="super-therapy-goal__progress-value">${escapeHTMLViewer(baselineText)}</div>
            </div>
          ` : ''}
        </div>
        <div>
          ${priorText ? `
            <div class="super-therapy-goal__progress-item">
              <div class="super-therapy-goal__progress-label">Previous</div>
              <div class="super-therapy-goal__progress-value">${escapeHTMLViewer(priorText)}</div>
            </div>
          ` : ''}
          ${currentText ? `
            <div class="super-therapy-goal__progress-item">
              <div class="super-therapy-goal__progress-label">Current</div>
              <div class="super-therapy-goal__progress-value">${escapeHTMLViewer(currentText)}</div>
            </div>
          ` : ''}
        </div>
      </div>
      ${comments ? `
        <div class="super-therapy-goal__comments">
          <span class="super-therapy-goal__comments-label">Comments: </span>
          <span class="${commentsHighlight}">${escapeHTMLViewer(comments)}</span>
        </div>
      ` : ''}
    </div>
  `;
}

// Render Goals section with blue header
function renderGoalsSection(goals, highlightQuote = null) {
  if (!goals || goals.length === 0) return '';

  const stGoals = goals.filter(g => !g.IsLongTerm && !g.isLongTerm);
  const ltGoals = goals.filter(g => g.IsLongTerm || g.isLongTerm);

  return `
    <div class="super-therapy-section">
      <div class="super-therapy-section-header">Goals</div>
      <div class="super-therapy-section__body">
        ${ltGoals.length > 0 ? `
          <div class="super-therapy-goals-title">Long-Term Goals</div>
          ${ltGoals.map(g => renderGoalCard(g, true, highlightQuote)).join('')}
        ` : ''}
        ${stGoals.length > 0 ? `
          <div class="super-therapy-goals-title">Short-Term Goals</div>
          ${stGoals.map(g => renderGoalCard(g, false, highlightQuote)).join('')}
        ` : ''}
      </div>
    </div>
  `;
}

// Render Interventions/Approaches section
function renderInterventionsSection(approaches) {
  if (!approaches || approaches.length === 0) return '';

  return `
    <div class="super-therapy-section">
      <div class="super-therapy-section-header">Plan of Treatment - Interventions</div>
      <div class="super-therapy-section__body">
        ${approaches.map(a => `
          <div class="super-therapy-intervention">
            <span class="super-therapy-intervention__code">${escapeHTMLViewer(a.Code || a.code || '')}</span>
            - ${escapeHTMLViewer(a.Description || a.description || '')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Render Assessment sections with blue headers
function renderAssessmentSections(assessmentLayout, highlightQuote = null) {
  if (!assessmentLayout || assessmentLayout.length === 0) return '';

  // Group by PrintSectionName
  const sections = {};
  assessmentLayout.forEach(item => {
    const sectionName = item.PrintSectionName || item.printSectionName || item.SectionName || item.sectionName || 'Assessment';
    const groupName = item.PrintGroupName || item.printGroupName || item.GroupName || item.groupName || '';
    const values = item.GroupValues || item.groupValues || '';

    if (!sections[sectionName]) {
      sections[sectionName] = [];
    }
    sections[sectionName].push({ groupName, values });
  });

  return Object.entries(sections).map(([sectionName, items]) => `
    <div class="super-therapy-section">
      <div class="super-therapy-section-header">${escapeHTMLViewer(sectionName)}</div>
      <div class="super-therapy-section__body">
        ${items.map(item => {
          const isHighlighted = isTextHighlighted(highlightQuote, item.values);
          const highlightAttr = isHighlighted ? `${HIGHLIGHT_DATA_ATTR}="true"` : '';
          const highlightClass = isHighlighted ? 'super-therapy-highlight' : '';

          return `
            <div class="super-therapy-detail-item" ${highlightAttr}>
              ${item.groupName ? `<div class="super-therapy-detail-item__name">${escapeHTMLViewer(item.groupName)}</div>` : ''}
              <div class="super-therapy-detail-item__value ${highlightClass}">${escapeHTMLViewer(item.values)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

// Render Service Matrix table
function renderServiceMatrix(serviceMatrixData) {
  if (!serviceMatrixData) return '';

  const dates = serviceMatrixData.Dates || serviceMatrixData.dates || [];
  const rows = serviceMatrixData.ServiceRows || serviceMatrixData.serviceRows || [];

  if (dates.length === 0 || rows.length === 0) return '';

  return `
    <div class="super-therapy-section">
      <div class="super-therapy-section-header">Service Matrix</div>
      <div class="super-therapy-section__body">
        <table class="super-therapy-matrix">
          <thead>
            <tr>
              <th class="super-therapy-matrix__service-col">Service</th>
              ${dates.map(d => `<th>${escapeHTMLViewer(d)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="super-therapy-matrix__service-col">${escapeHTMLViewer(row.ServiceCodeAndAbbrev || '')}</td>
                ${dates.map(d => {
                  const mins = row.DurationsByDate?.[d] || '';
                  return `<td>${mins ? mins + 'm' : '-'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${serviceMatrixData.TotalUniqueDays ? `<div style="margin-top: 8px; font-size: 12px; color: #6b7280;">Total Treatment Days: ${serviceMatrixData.TotalUniqueDays}</div>` : ''}
      </div>
    </div>
  `;
}

// Render Signature section
function renderSignatureSection(signatures) {
  if (!signatures) return '';

  const origSig = signatures.OriginalSignatureText || signatures.originalSignatureText;
  const origDate = signatures.OriginalSignatureDate || signatures.originalSignatureDate;
  const coSig = signatures.OriginalCoSignatureText || signatures.originalCoSignatureText;
  const coDate = signatures.OriginalCosignatureDate || signatures.originalCosignatureDate;

  if (!origSig && !coSig) return '';

  return `
    <div class="super-therapy-signatures">
      ${origSig ? `
        <div class="super-therapy-signature">
          <div class="super-therapy-signature__line">
            <div class="super-therapy-signature__name-area">
              <div class="super-therapy-signature__name">${escapeHTMLViewer(origSig)}</div>
              <div class="super-therapy-signature__label">Original Signature:</div>
            </div>
            ${origDate ? `
              <div class="super-therapy-signature__date-area">
                <div class="super-therapy-signature__date">${formatSignatureDateTime(origDate)}</div>
                <div class="super-therapy-signature__date-label">Date</div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
      ${coSig ? `
        <div class="super-therapy-signature">
          <div class="super-therapy-signature__line">
            <div class="super-therapy-signature__name-area">
              <div class="super-therapy-signature__name">${escapeHTMLViewer(coSig)}</div>
              <div class="super-therapy-signature__label">Cosignature:</div>
            </div>
            ${coDate ? `
              <div class="super-therapy-signature__date-area">
                <div class="super-therapy-signature__date">${formatSignatureDateTime(coDate)}</div>
                <div class="super-therapy-signature__date-label">Date</div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
      <div class="super-therapy-page-num">Page 1 of 1</div>
    </div>
  `;
}

// =============================================================================
// DOCUMENT TYPE RENDERERS
// =============================================================================

// Helper to generate toolbar HTML with zoom controls
function renderTherapyToolbar(title, currentZoom = 100) {
  return `
    <div class="super-therapy-modal__toolbar">
      <div class="super-therapy-modal__toolbar-title">${escapeHTMLViewer(title)}</div>
      <div class="super-therapy-modal__toolbar-controls">
        <div class="super-therapy-modal__zoom">
          <button class="super-therapy-modal__zoom-btn" data-zoom-action="out" title="Zoom Out">−</button> <!-- NO_TRACK -->
          <span class="super-therapy-modal__zoom-level">${currentZoom}%</span>
          <button class="super-therapy-modal__zoom-btn" data-zoom-action="in" title="Zoom In">+</button> <!-- NO_TRACK -->
        </div>
        <button class="super-therapy-modal__close">&times;</button> <!-- NO_TRACK -->
      </div>
    </div>
  `;
}

// TEN (Treatment Note) Document Renderer
function renderTENDocument(modal, doc, highlightQuote = null) {
  const container = modal.querySelector('.super-therapy-modal__container');
  const json = doc.jsonData || {};
  const currentZoom = parseInt(modal.dataset.zoom) || 100;
  const title = doc.displayName || `${doc.discipline} TEN - Treatment Note`;

  // Extract data
  const sections = json.Sections || json.sections || [];
  const completedDate = getField(json, 'CompletedDateFormatted', 'completedDateFormatted') || '';
  const assessmentDate = getField(json, 'AssessmentDateFormatted', 'assessmentDateFormatted') || completedDate;
  const signatures = {
    OriginalSignatureText: json.OriginalSignatureText || json.originalSignatureText,
    OriginalSignatureDate: json.OriginalSignatureDate || json.originalSignatureDate,
    OriginalCoSignatureText: json.OriginalCoSignatureText || json.originalCoSignatureText,
    OriginalCosignatureDate: json.OriginalCosignatureDate || json.originalCosignatureDate
  };

  // Extract treatment details
  const treatmentDetails = [];
  const dailyServicesSections = sections[0];
  if (dailyServicesSections) {
    const details = dailyServicesSections.Details || dailyServicesSections.details || [];
    details.forEach(detail => {
      treatmentDetails.push({
        name: detail.PrintGroupName || detail.printGroupName || '',
        value: detail.GroupValues || detail.groupValues || ''
      });
    });
  }

  container.innerHTML = `
    ${renderTherapyToolbar(title, currentZoom)}
    <div class="super-therapy-modal__body">
      <div class="super-therapy-doc">
        ${renderDocumentHeader(doc)}
        ${renderIdentificationTable(doc)}

        <!-- Date of Service box -->
        <div class="super-therapy-dates-box">
          <div class="super-therapy-dates-box__item">Date of Service: ${escapeHTMLViewer(assessmentDate)}</div>
          <div class="super-therapy-dates-box__item">Completed Date: ${escapeHTMLViewer(completedDate)}</div>
        </div>

        <!-- Summary of Daily Skilled Services -->
        ${treatmentDetails.length > 0 ? `
          <div class="super-therapy-section">
            <div class="super-therapy-section-header">Summary of Daily Skilled Services</div>
            <div class="super-therapy-section__body">
              ${treatmentDetails.map(td => {
                const isCode = /^\d{5}/.test(td.name);
                const isHighlighted = isTextHighlighted(highlightQuote, td.value);
                const highlightAttr = isHighlighted ? `${HIGHLIGHT_DATA_ATTR}="true"` : '';
                const highlightClass = isHighlighted ? 'super-therapy-highlight' : '';

                return `
                  <div class="super-therapy-detail-item" ${highlightAttr}>
                    <div class="super-therapy-detail-item__name ${isCode ? 'super-therapy-detail-item__name--code' : ''}">${escapeHTMLViewer(td.name)}</div>
                    <div class="super-therapy-detail-item__value ${highlightClass}">${escapeHTMLViewer(td.value)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${renderSignatureSection(signatures)}
      </div>
    </div>
    <div class="super-therapy-modal__footer">
      <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary super-therapy-modal__close-btn">Close</button> <!-- NO_TRACK -->
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-therapy-modal');
  setupTherapyZoomHandlers(modal);
  modal.querySelector('.super-therapy-modal__close-btn')?.addEventListener('click', () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  });
}

// EVAL Document Renderer
function renderEvalDocument(modal, doc, highlightQuote = null) {
  const container = modal.querySelector('.super-therapy-modal__container');
  const json = doc.jsonData || {};
  const currentZoom = parseInt(modal.dataset.zoom) || 100;
  const title = doc.displayName || `${doc.discipline} Eval - Initial Evaluation`;

  // Extract data
  const identifierInfo = json.IdentifierInfo || json.identifierInfo || {};
  const diagnoses = json.Diagnoses || json.diagnoses || [];
  const goals = json.GoalTargets || json.goalTargets || [];
  const approaches = json.Approaches || json.approaches || [];
  const assessment = json.AssessmentLayout || json.assessmentLayout || [];
  const signatures = json.ESignatures || json.eSignatures || {};

  // Plan info
  const frequency = getField(identifierInfo, 'Frequency', 'frequency') || '';
  const duration = getField(identifierInfo, 'Duration', 'duration') || '';
  const intensity = getField(identifierInfo, 'Intensity', 'intensity') || '';
  const dateRange = getField(identifierInfo, 'DateRange', 'dateRange') || '';
  const physicianName = getField(identifierInfo, 'PhysicianFullName', 'physicianFullName') || '';
  const physicianNPI = getField(identifierInfo, 'NPI', 'npi') || '';

  container.innerHTML = `
    ${renderTherapyToolbar(title, currentZoom)}
    <div class="super-therapy-modal__body">
      <div class="super-therapy-doc">
        ${renderDocumentHeader(doc)}
        ${renderIdentificationTable(doc)}

        <!-- Treatment Plan Info -->
        ${(frequency || duration || intensity || dateRange) ? `
          <div class="super-therapy-plan-info">
            ${dateRange ? `<div class="super-therapy-plan-info__item"><span class="super-therapy-plan-info__label">Certification Period: </span>${escapeHTMLViewer(dateRange)}</div>` : ''}
            ${frequency ? `<div class="super-therapy-plan-info__item"><span class="super-therapy-plan-info__label">Frequency: </span>${escapeHTMLViewer(frequency)}</div>` : ''}
            ${duration ? `<div class="super-therapy-plan-info__item"><span class="super-therapy-plan-info__label">Duration: </span>${escapeHTMLViewer(duration)}</div>` : ''}
            ${intensity ? `<div class="super-therapy-plan-info__item"><span class="super-therapy-plan-info__label">Intensity: </span>${escapeHTMLViewer(intensity)}</div>` : ''}
          </div>
        ` : ''}

        <!-- Physician Certification -->
        ${physicianName ? `
          <div class="super-therapy-section">
            <div class="super-therapy-section-header">Physician Certification</div>
            <div class="super-therapy-section__body">
              <div><strong>Physician:</strong> ${escapeHTMLViewer(physicianName)}</div>
              ${physicianNPI ? `<div><strong>NPI:</strong> ${escapeHTMLViewer(physicianNPI)}</div>` : ''}
            </div>
          </div>
        ` : ''}

        ${renderDiagnosesTable(diagnoses)}
        ${renderGoalsSection(goals, highlightQuote)}
        ${renderInterventionsSection(approaches)}
        ${renderAssessmentSections(assessment, highlightQuote)}
        ${renderSignatureSection(signatures)}
      </div>
    </div>
    <div class="super-therapy-modal__footer">
      <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary super-therapy-modal__close-btn">Close</button> <!-- NO_TRACK -->
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-therapy-modal');
  setupTherapyZoomHandlers(modal);
  modal.querySelector('.super-therapy-modal__close-btn')?.addEventListener('click', () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  });
}

// PR (Progress Report) Document Renderer
function renderProgressReport(modal, doc, highlightQuote = null) {
  const container = modal.querySelector('.super-therapy-modal__container');
  const json = doc.jsonData || {};
  const currentZoom = parseInt(modal.dataset.zoom) || 100;
  const title = doc.displayName || `${doc.discipline} PR - Progress Report`;

  const diagnoses = json.Diagnoses || json.diagnoses || [];
  const stGoals = json.AllActiveShortTermGoals || json.allActiveShortTermGoals || [];
  const ltGoals = json.AllActiveLongTermGoals || json.allActiveLongTermGoals || [];
  const allGoals = [...stGoals.map(g => ({...g, IsLongTerm: false})), ...ltGoals.map(g => ({...g, IsLongTerm: true}))];
  const approaches = json.Approaches || json.approaches || [];
  const assessment = json.AssessmentLayout || json.assessmentLayout || [];
  const serviceMatrix = json.ServiceMatrixData || json.serviceMatrixData || {};
  const signatures = json.ESignatures || json.eSignatures || {};

  container.innerHTML = `
    ${renderTherapyToolbar(title, currentZoom)}
    <div class="super-therapy-modal__body">
      <div class="super-therapy-doc">
        ${renderDocumentHeader(doc)}
        ${renderIdentificationTable(doc)}
        ${renderDiagnosesTable(diagnoses)}
        ${renderGoalsSection(allGoals, highlightQuote)}
        ${renderServiceMatrix(serviceMatrix)}
        ${renderInterventionsSection(approaches)}
        ${renderAssessmentSections(assessment, highlightQuote)}
        ${renderSignatureSection(signatures)}
      </div>
    </div>
    <div class="super-therapy-modal__footer">
      <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary super-therapy-modal__close-btn">Close</button> <!-- NO_TRACK -->
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-therapy-modal');
  setupTherapyZoomHandlers(modal);
  modal.querySelector('.super-therapy-modal__close-btn')?.addEventListener('click', () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  });
}

// RECERT Document Renderer
function renderRecertDocument(modal, doc, highlightQuote = null) {
  const container = modal.querySelector('.super-therapy-modal__container');
  const json = doc.jsonData || {};
  const currentZoom = parseInt(modal.dataset.zoom) || 100;
  const title = doc.displayName || `${doc.discipline} Recert - Recertification`;

  const diagnoses = json.Diagnoses || json.diagnoses || [];
  const goals = json.ProgressGoalTargets || json.progressGoalTargets || [];
  const approaches = json.Approaches || json.approaches || [];
  const assessment = json.AssessmentLayout || json.assessmentLayout || [];
  const serviceMatrix = json.ServiceMatrixData || json.serviceMatrixData || {};
  const signatures = json.ESignatures || json.eSignatures || {};

  container.innerHTML = `
    ${renderTherapyToolbar(title, currentZoom)}
    <div class="super-therapy-modal__body">
      <div class="super-therapy-doc">
        ${renderDocumentHeader(doc)}
        ${renderIdentificationTable(doc)}
        ${renderDiagnosesTable(diagnoses)}
        ${renderGoalsSection(goals, highlightQuote)}
        ${renderServiceMatrix(serviceMatrix)}
        ${renderInterventionsSection(approaches)}
        ${renderAssessmentSections(assessment, highlightQuote)}
        ${renderSignatureSection(signatures)}
      </div>
    </div>
    <div class="super-therapy-modal__footer">
      <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary super-therapy-modal__close-btn">Close</button> <!-- NO_TRACK -->
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-therapy-modal');
  setupTherapyZoomHandlers(modal);
  modal.querySelector('.super-therapy-modal__close-btn')?.addEventListener('click', () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  });
}

// DISCH (Discharge) Document Renderer
function renderDischargeDocument(modal, doc, highlightQuote = null) {
  const container = modal.querySelector('.super-therapy-modal__container');
  const json = doc.jsonData || {};
  const currentZoom = parseInt(modal.dataset.zoom) || 100;
  const title = doc.displayName || `${doc.discipline} Disch - Discharge Summary`;

  const diagnoses = json.Diagnoses || json.diagnoses || [];
  const assessment = json.AssessmentLayout || json.assessmentLayout || [];
  const signatures = json.ESignatures || json.eSignatures || {};

  container.innerHTML = `
    ${renderTherapyToolbar(title, currentZoom)}
    <div class="super-therapy-modal__body">
      <div class="super-therapy-doc">
        ${renderDocumentHeader(doc)}
        ${renderIdentificationTable(doc)}
        ${renderDiagnosesTable(diagnoses)}
        ${renderAssessmentSections(assessment, highlightQuote)}
        ${renderSignatureSection(signatures)}
      </div>
    </div>
    <div class="super-therapy-modal__footer">
      <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary super-therapy-modal__close-btn">Close</button> <!-- NO_TRACK -->
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-therapy-modal');
  setupTherapyZoomHandlers(modal);
  modal.querySelector('.super-therapy-modal__close-btn')?.addEventListener('click', () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  });
}

// Generic Therapy Document Renderer (fallback)
function renderGenericTherapyDoc(modal, doc, highlightQuote = null) {
  const container = modal.querySelector('.super-therapy-modal__container');
  const json = doc.jsonData || {};
  const currentZoom = parseInt(modal.dataset.zoom) || 100;
  const title = doc.displayName || 'Therapy Document';

  container.innerHTML = `
    ${renderTherapyToolbar(title, currentZoom)}
    <div class="super-therapy-modal__body">
      <div class="super-therapy-doc">
        ${renderDocumentHeader(doc)}
        ${renderIdentificationTable(doc)}
        <div class="super-therapy-section">
          <div class="super-therapy-section-header">Document Content</div>
          <div class="super-therapy-section__body">
            <pre class="super-therapy-raw-content">${escapeHTMLViewer(JSON.stringify(json, null, 2))}</pre>
          </div>
        </div>
      </div>
    </div>
    <div class="super-therapy-modal__footer">
      <button class="super-therapy-modal__btn super-therapy-modal__btn--secondary super-therapy-modal__close-btn">Close</button> <!-- NO_TRACK -->
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-therapy-modal');
  setupTherapyZoomHandlers(modal);
  modal.querySelector('.super-therapy-modal__close-btn')?.addEventListener('click', () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  });
}

// =============================================================================
// PDF DOCUMENT MODAL
// =============================================================================

async function showDocumentModal(documentId, wordBlocks = null, source = 'unknown') {
  const params = await window.getCurrentParams();

  const modal = createPdfModalShell();
  modal.dataset.evType = 'pdf';
  modal.dataset.evOpenTs = String(Date.now());
  track('evidence_viewer_opened', { type: 'pdf', source });
  getModalMountPoint().appendChild(modal);

  try {
    const data = await fetchDocument(documentId, params);
    renderPdfModalContent(modal, data.document, wordBlocks);
  } catch (error) {
    renderModalError(modal, error.message, 'super-pdf-modal');
  }
}

function createPdfModalShell() {
  const modal = document.createElement('div');
  modal.className = 'super-pdf-modal';
  modal.innerHTML = `
    <div class="super-pdf-modal__backdrop"></div>
    <div class="super-pdf-modal__container">
      <div class="super-pdf-modal__header">
        <div class="super-pdf-modal__title">
          <span class="super-pdf-modal__name">Loading...</span>
        </div>
        <button class="super-pdf-modal__close">&times;</button> <!-- NO_TRACK -->
      </div>
      <div class="super-pdf-modal__body">
        <div class="super-viewer-loading">
          <div class="super-viewer-loading__spinner"></div>
          <span>Loading document...</span>
        </div>
      </div>
    </div>
  `;

  setupModalCloseHandlers(modal, 'super-pdf-modal');
  return modal;
}

function renderPdfModalContent(modal, doc, wordBlocks = null) {
  const container = modal.querySelector('.super-pdf-modal__container');

  const targetPage = wordBlocks && wordBlocks.length > 0 && wordBlocks[0].p ? wordBlocks[0].p : 1;

  // Close handler removes modal and restores body scroll
  const onClose = () => {
    document.body.style.overflow = '';
    trackEvidenceClose(modal);
    modal.remove();
  };

  container.innerHTML = `
    <div class="super-pdf-modal__header">
      <div class="super-pdf-modal__title-row">
        <span class="super-pdf-modal__icon">📄</span>
        <div class="super-pdf-modal__title">
          <span class="super-pdf-modal__name">${escapeHTMLViewer(doc.title || 'Document')}</span>
          ${doc.documentType ? `<span class="super-pdf-badge">${escapeHTMLViewer(doc.documentType)}</span>` : ''}
        </div>
        <button class="super-pdf-modal__close">&times;</button> <!-- NO_TRACK --> <!-- NO_TRACK -->
      </div>
    </div>
    <div class="super-pdf-modal__body"></div>
  `;

  setupModalCloseHandlers(modal, 'super-pdf-modal');

  // Mount Preact PDFViewer into the modal body
  const body = modal.querySelector('.super-pdf-modal__body');
  render(
    h(PDFViewer, {
      url: doc.signedUrl || null,
      wordBlocks: wordBlocks || [],
      targetPage,
      title: doc.title || 'Document',
      documentType: doc.documentType,
      effectiveDate: doc.effectiveDate,
      fileSize: doc.fileSize,
      onClose,
      expiresAt: true,
      openInNewTabUrl: doc.signedUrl || null,
    }),
    body
  );
}

// Old vanilla PDF rendering functions removed — now handled by Preact PDFViewer component

// =============================================================================
// UDA MODAL
// =============================================================================

function createUdaModalShell() {
  const modal = document.createElement('div');
  modal.className = 'super-uda-modal';
  modal.innerHTML = `
    <div class="super-uda-modal__backdrop"></div>
    <div class="super-uda-modal__container">
      <div class="super-uda-modal__loading">
        <div class="super-uda-modal__loading-spinner"></div>
        <span>Loading assessment...</span>
      </div>
    </div>
  `;
  return modal;
}

async function showUdaModal(udaId, quoteText = null, patientIdOverride = null, source = 'unknown') {
  const params = await window.getCurrentParams();
  const patientId = patientIdOverride || resolvePatientIdForUda();

  const modal = createUdaModalShell();
  modal.dataset.evType = 'uda';
  modal.dataset.evOpenTs = String(Date.now());
  track('evidence_viewer_opened', { type: 'uda', source });
  const isOnBody = !document.querySelector('.icd10-viewer-modal__container');
  getModalMountPoint().appendChild(modal);
  if (isOnBody) document.body.style.overflow = 'hidden';

  const container = modal.querySelector('.super-uda-modal__container');

  const onClose = () => {
    if (isOnBody) document.body.style.overflow = '';
    document.removeEventListener('keydown', escHandler);
    trackEvidenceClose(modal);
    modal.remove();
  };

  const escHandler = (e) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', escHandler);
  modal.querySelector('.super-uda-modal__backdrop').addEventListener('click', onClose);

  if (!patientId) {
    track('error_shown', { surface: 'evidence_viewer', error_code: 'no_patient_context', error_type: 'validation' });
    container.innerHTML = `<div class="super-uda-modal__error">Missing patient context — open this from a patient page.</div>`;
    return;
  }

  try {
    const data = await fetchUda(udaId, patientId, params, quoteText);
    const uda = data.uda;
    const matchKeys = new Set(data.matchKeys || []);

    container.innerHTML = '';
    render(
      h(UdaViewer, { uda, matchKeys, quoteText, onClose }),
      container
    );
  } catch (error) {
    track('error_shown', { surface: 'evidence_viewer', error_code: toErrorCode(error), error_type: 'api_error' });
    container.innerHTML = `<div class="super-uda-modal__error">${escapeHTMLViewer(error.message || 'Failed to load UDA')}</div>`;
  }
}

window.showClinicalNoteModal = showClinicalNoteModal;
window.showTherapyDocModal = showTherapyDocModal;
window.showDocumentModal = showDocumentModal;
window.showUdaModal = showUdaModal;
window.parseEvidenceForViewer = parseEvidenceForViewer;

window.SuperDocViewer = {
  open(evidence) {
    if (!evidence) return;
    console.log('[NoteHighlight] SuperDocViewer.open received:', {
      sourceType: evidence.sourceType,
      type: evidence.type,
      evidenceId: evidence.evidenceId,
      sourceId: evidence.sourceId,
      quoteText: evidence.quoteText?.slice(0, 60),
      quote: evidence.quote?.slice(0, 60),
    });
    const type = evidence.sourceType || evidence.type || '';
    if (type === 'clinical_note' || type === 'progress_note' || type === 'practitioner_note') {
      const rawId = evidence.viewerId || evidence.sourceId || evidence.id || '';
      const id = String(rawId)
        .replace(/^pcc-prognote-/, '')
        .replace(/^pcc-practnote-/, '')
        .replace(/^patient-practnote-/, '');
      const quote = evidence.quoteText || evidence.quote || '';
      window.showClinicalNoteModal(id, quote || null);
      return;
    }
    if (type === 'therapy_doc' || type === 'therapy') {
      const id = evidence.viewerId || evidence.sourceId || evidence.id;
      window.showTherapyDocModal(id, evidence.quote);
      return;
    }
    if (type === 'pdf' || type === 'document') {
      const id = evidence.viewerId || evidence.sourceId || evidence.id;
      window.showDocumentModal(id, evidence.wordBlocks || []);
      return;
    }
    if (type === 'uda' || type === 'wound-assessment') {
      const rawId = evidence.viewerId || evidence.sourceId || evidence.evidenceId || evidence.id || '';
      const id = String(rawId).replace(/^uda-/, '');
      const quote = evidence.quoteText || evidence.quote || '';
      const patientId = evidence.patientId || null;
      if (id) window.showUdaModal(id, quote, patientId);
      return;
    }

    // sourceType missing — fall back to parsing the evidenceId / sourceId prefix
    const parsed = parseEvidenceForViewer(evidence);
    if (!parsed?.viewerType || !parsed.id) return;
    if (parsed.viewerType === 'clinical-note') {
      const quote = evidence.quoteText || evidence.quote || '';
      window.showClinicalNoteModal(parsed.id, quote || null);
    } else if (parsed.viewerType === 'therapy-document') {
      window.showTherapyDocModal(parsed.id, evidence.quoteText || evidence.quote || '');
    } else if (parsed.viewerType === 'document') {
      window.showDocumentModal(parsed.id, evidence.wordBlocks || []);
    } else if (parsed.viewerType === 'uda') {
      const quote = evidence.quoteText || evidence.quote || '';
      window.showUdaModal(parsed.id, quote, evidence.patientId || null);
    }
  }
};
