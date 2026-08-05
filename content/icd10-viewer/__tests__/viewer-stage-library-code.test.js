/**
 * Staging guard for library-picked ICD-10 codes (SUP-264).
 *
 * _handleApprove retires the staged annotation from the sidebar by matching
 * item.id. A code searched out of the full ICD-10 library has no annotation
 * behind it, so an unguarded findIndex(a => a.id === undefined) would match the
 * first annotation missing an id and splice a real, un-acted-on finding out of
 * the coder's list.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub the sibling panels this handler talks to before importing the viewer.
window.ICD10Sidebar = { updateData: vi.fn(), init: vi.fn() };
window.ICD10EvidencePanel = { setStagedLeafCodes: vi.fn(), markApproved: vi.fn(), init: vi.fn() };
window.ICD10PDFViewer = { init: vi.fn() };

import '../icd10-viewer.js';

const viewer = window.ICD10Viewer;

function seedViewer() {
  viewer.stagedCodes = [];
  viewer.annotations = [
    { id: 'ann-1', icd10Code: 'I69.320', description: 'Aphasia following cerebral infarction' },
    { id: 'ann-2', icd10Code: 'I69.391', description: 'Dysphagia following cerebral infarction' },
  ];
  viewer.topRanked = [
    {
      groupCode: 'I69',
      annotations: [
        { id: 'ann-1', icd10Code: 'I69.320' },
        { id: 'ann-2', icd10Code: 'I69.391' },
      ],
      annotationCount: 2,
    },
  ];
  viewer.approved = [];
  viewer.approvedDiagnoses = [];
  viewer._updateStagedBadge = vi.fn();
  viewer._refreshSidebarStaged = vi.fn();
}

describe('ICD10Viewer._handleApprove — library-picked codes', () => {
  beforeEach(() => {
    seedViewer();
    vi.clearAllMocks();
  });

  it('stages a library code without dropping any annotation', async () => {
    await viewer._handleApprove({
      id: null,
      icd10Code: 'E11.9',
      description: 'Type 2 diabetes mellitus without complications',
      fromLibrary: true,
    });

    expect(viewer.stagedCodes).toHaveLength(1);
    expect(viewer.stagedCodes[0]).toMatchObject({
      icd10Code: 'E11.9',
      annotationId: null,
      groupCode: 'E11.9',
    });

    // The regression this guards: both findings must survive.
    expect(viewer.annotations.map(a => a.id)).toEqual(['ann-1', 'ann-2']);
    expect(viewer.topRanked[0].annotations).toHaveLength(2);
    expect(viewer.topRanked[0].annotationCount).toBe(2);
  });

  it('still retires the annotation for an evidence-backed code', async () => {
    await viewer._handleApprove({
      id: 'ann-1',
      icd10Code: 'I69.320',
      description: 'Aphasia following cerebral infarction',
      category: 'SLP',
      groupCode: 'I69',
    });

    expect(viewer.stagedCodes[0]).toMatchObject({
      icd10Code: 'I69.320',
      annotationId: 'ann-1',
      category: 'SLP',
      groupCode: 'I69',
    });
    expect(viewer.annotations.map(a => a.id)).toEqual(['ann-2']);
    expect(viewer.topRanked[0].annotations).toHaveLength(1);
    expect(viewer.topRanked[0].annotationCount).toBe(1);
  });

  it('does not splice when neither the staged item nor an annotation has an id', async () => {
    // The findIndex(undefined) failure mode: an annotation with no id would
    // match `a.id === item.id` when item.id is also undefined, silently
    // deleting a finding the coder never touched. Any caller that builds the
    // approve payload without an explicit id lands here.
    viewer.annotations.unshift({ icd10Code: 'R13.10', description: 'Dysphagia, unspecified' });
    viewer.topRanked[0].annotations.unshift({ icd10Code: 'R13.10' });
    viewer.topRanked[0].annotationCount = 3;

    await viewer._handleApprove({
      // no `id` key at all
      icd10Code: 'E11.9',
      description: 'Type 2 diabetes mellitus without complications',
      fromLibrary: true,
    });

    expect(viewer.annotations).toHaveLength(3);
    expect(viewer.annotations[0].icd10Code).toBe('R13.10');
    expect(viewer.topRanked[0].annotations).toHaveLength(3);
    expect(viewer.topRanked[0].annotationCount).toBe(3);
    expect(viewer.stagedCodes[0].annotationId).toBeNull();
  });
});
