// Regression tests for evidence viewer resolution.
//
// Bug (2026-07-23): I8000 audit/suggestion evidence is document-chunk evidence
// that ships `evidenceId` ("<docId>-chunk-N") and `documentId` + wordBlocks but
// NO `sourceId`. i8000EvidenceAction gated on sourceId alone, so those cards
// rendered non-clickable ("cant click on them"). parseViewer must resolve such
// evidence to the document viewer via evidenceId, with a bare-documentId
// last-resort fallback.
import { describe, it, expect } from 'vitest';
import { parseViewer } from '../evidence-helpers.js';

describe('parseViewer — I8000 document-chunk evidence (no sourceId)', () => {
  it('resolves a chunk-encoded evidenceId to the document viewer', () => {
    const ev = {
      evidenceId: '2hldq5lx29wl-chunk-10',
      documentId: '2hldq5lx29wl',
      displayName: 'Baker CRF.pdf',
      wordBlocks: [{ p: 9, x: 0.09, y: 0.34, w: 0.08, h: 0.01 }],
    };
    expect(parseViewer(ev)).toEqual({ viewerType: 'document', id: '2hldq5lx29wl', chunk: 10 });
  });

  it('falls back to a bare documentId when no chunk-encoded id is present', () => {
    const ev = { documentId: 's0azpcs98a5t', displayName: 'Baker Clinical.pdf' };
    expect(parseViewer(ev)).toEqual({ viewerType: 'document', id: 's0azpcs98a5t' });
  });

  it('returns a null viewer when there is nothing openable', () => {
    expect(parseViewer({ quoteText: 'orphan quote' })).toEqual({ viewerType: null, id: null });
  });
});
