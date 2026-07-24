/**
 * Shared evidence helpers used by ItemPopover and ItemDetailView.
 *
 * Mirrors the original mds-overlay.js logic for source-type inference,
 * viewer resolution, and evidence-open actions.
 */

export function inferSourceType(displayName, evidenceId) {
  if (evidenceId) {
    if (evidenceId.startsWith('order-')) return 'order';
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

export const SOURCE_LABELS = {
  'order': 'Order',
  'mar': 'MAR',
  'lab-result': 'Lab',
  'progress-note': 'Progress Note',
  'nursing-note': 'Nursing Note',
  'vital-signs': 'Vitals',
  'therapy-doc': 'Therapy Doc',
  'document': 'Document',
};

export function parseViewer(ev) {
  const sourceType = ev.sourceType || '';
  const sourceId = ev.sourceId || ev.id || '';
  const evType = ev.type || '';
  const evidenceId = ev.evidenceId || sourceId;

  // Early check: if sourceId contains -chunk-, it's a document regardless of type label
  // (AI sometimes mislabels document chunks as clinical_note)
  if (sourceId && sourceId.includes('-chunk-')) {
    return { viewerType: 'document', id: sourceId.split('-chunk-')[0], chunk: parseInt(sourceId.split('-chunk-')[1], 10) };
  }

  // Direct sourceType
  if (sourceType === 'progress-note' && sourceId) return { viewerType: 'clinical-note', id: sourceId };
  if (sourceType === 'therapy-doc' && sourceId) return { viewerType: 'therapy-document', id: sourceId };
  if (sourceType === 'document' && sourceId) return { viewerType: 'document', id: sourceId };
  if (sourceType === 'uda' || sourceType === 'wound-assessment') {
    const udaId = (sourceId || evidenceId || '').replace(/^uda-/, '');
    if (udaId) return { viewerType: 'uda', id: udaId };
  }

  // queryEvidence format
  if (evType === 'clinical_note' && sourceId) {
    return {
      viewerType: 'clinical-note',
      id: sourceId
        .replace(/^pcc-prognote-/, '')
        .replace(/^pcc-practnote-/, '')
        .replace(/^patient-practnote-/, ''),
    };
  }
  if (evType === 'therapy_document' && sourceId) {
    return { viewerType: 'therapy-document', id: sourceId.replace(/^therapy-doc-/, '') };
  }
  if (evType === 'document' && sourceId) return { viewerType: 'document', id: sourceId };
  if (evType === 'order' && sourceId) return { viewerType: 'order', id: sourceId };

  // evidenceId prefixes
  if (evidenceId) {
    if (evidenceId.startsWith('therapy-doc-')) return { viewerType: 'therapy-document', id: evidenceId.replace('therapy-doc-', '') };
    if (evidenceId.startsWith('pcc-prognote-')) return { viewerType: 'clinical-note', id: evidenceId.replace('pcc-prognote-', '') };
    if (evidenceId.startsWith('pcc-practnote-')) return { viewerType: 'clinical-note', id: evidenceId.replace('pcc-practnote-', '') };
    if (evidenceId.startsWith('patient-practnote-')) return { viewerType: 'clinical-note', id: evidenceId.replace('patient-practnote-', '') };
    if (evidenceId.includes('-chunk-')) return { viewerType: 'document', id: evidenceId.split('-chunk-')[0], chunk: parseInt(evidenceId.split('-chunk-')[1], 10) };
    if (evidenceId.startsWith('uda-')) return { viewerType: 'uda', id: evidenceId.replace('uda-', '') };
  }
  // Last resort: some endpoints (I8000 audit/suggestion evidence) ship a bare
  // documentId alongside wordBlocks instead of a chunk-encoded evidenceId.
  if (ev.documentId) return { viewerType: 'document', id: String(ev.documentId) };
  return { viewerType: null, id: null };
}

export function openEvidence(ev) {
  const viewer = parseViewer(ev);
  const quote = ev.quoteText || ev.quote || ev.snippet || '';

  if (viewer.viewerType === 'clinical-note' && viewer.id) {
    return window.showClinicalNoteModal?.(viewer.id, quote || null);
  }
  if (viewer.viewerType === 'therapy-document' && viewer.id) {
    return window.showTherapyDocModal?.(viewer.id, quote);
  }
  if (viewer.viewerType === 'document' && viewer.id) {
    return window.showDocumentModal?.(viewer.id, ev.wordBlocks || []);
  }
  if (viewer.viewerType === 'uda' && viewer.id) {
    return window.showUdaModal?.(viewer.id, quote, ev.patientId || null);
  }
  // Order evidence — show administrations
  const orderId = ev.sourceId || ev.evidenceId || '';
  if ((ev.sourceType === 'order' || orderId.startsWith('order-')) && window.showAdministrationModal) {
    return window.showAdministrationModal(orderId.replace(/^order-/, ''));
  }
  // Fallback
  window.SuperDocViewer?.open(ev);
}

export function getActionText(ev) {
  const viewer = parseViewer(ev);
  if (ev.sourceType === 'order' || (ev.evidenceId || '').startsWith('order-')) return 'View Administrations';
  if (viewer.viewerType === 'therapy-document') return 'View Document';
  if (viewer.viewerType === 'clinical-note') return 'View Note';
  if (viewer.viewerType === 'document') return 'View PDF';
  if (viewer.viewerType === 'uda') return 'View Assessment';
  return null;
}
