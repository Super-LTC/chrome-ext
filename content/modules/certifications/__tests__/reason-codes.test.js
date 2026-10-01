import { describe, it, expect } from 'vitest';
import { toggleReason, mergeRegenerated, hasAnyReason } from '../reason-codes.js';
import { CERT_FORM, REASON_CODES } from './cert-form-fixture.js';

const codes = (list) => list.map((r) => r.code);

describe('the fixture', () => {
  it('is the 36-box paper form', () => {
    expect(CERT_FORM.reasons).toHaveLength(36);
    expect(new Set(REASON_CODES).size).toBe(36);
  });
});

describe('toggleReason', () => {
  it('checking a box adds a manual entry', () => {
    expect(toggleReason([], 'pneumonia', CERT_FORM)).toEqual([
      { code: 'pneumonia', auto: false, evidence: null },
    ]);
  });

  it('unchecking removes it, including an AI-checked one', () => {
    const list = [
      { code: 'pt_ot', auto: true, evidence: 'PT 5x/week' },
      { code: 'labs', auto: false, evidence: null },
    ];
    expect(toggleReason(list, 'pt_ot', CERT_FORM)).toEqual([
      { code: 'labs', auto: false, evidence: null },
    ]);
  });

  it('keeps the result in paper order, not click order', () => {
    let list = [];
    for (const code of ['cva_hemiplegia', 'observation_assessment', 'labs', 'pneumonia']) {
      list = toggleReason(list, code, CERT_FORM);
    }
    expect(codes(list)).toEqual(['observation_assessment', 'pneumonia', 'labs', 'cva_hemiplegia']);
  });

  it('does not mutate its input', () => {
    const list = [{ code: 'labs', auto: false, evidence: null }];
    toggleReason(list, 'pneumonia', CERT_FORM);
    expect(list).toEqual([{ code: 'labs', auto: false, evidence: null }]);
  });

  it('treats a null list as empty', () => {
    expect(codes(toggleReason(null, 'st', CERT_FORM))).toEqual(['st']);
  });
});

describe('mergeRegenerated', () => {
  it('keeps the nurse\'s own boxes, replaces the old AI boxes with the new suggestions', () => {
    const current = [
      { code: 'teaching_training', auto: false, evidence: null },
      { code: 'cardiac', auto: true, evidence: 'old AI pick' },
    ];
    const suggested = [{ code: 'o2_therapy', auto: true, evidence: 'O2 2L NC' }];

    expect(mergeRegenerated(current, suggested, CERT_FORM)).toEqual([
      { code: 'teaching_training', auto: false, evidence: null },
      { code: 'o2_therapy', auto: true, evidence: 'O2 2L NC' },
    ]);
  });

  it('a suggestion wins for its code, so a manual box the AI also picked gains its evidence', () => {
    const current = [{ code: 'pneumonia', auto: false, evidence: null }];
    const suggested = [{ code: 'pneumonia', auto: true, evidence: 'CXR: RLL infiltrate' }];

    expect(mergeRegenerated(current, suggested, CERT_FORM)).toEqual([
      { code: 'pneumonia', auto: true, evidence: 'CXR: RLL infiltrate' },
    ]);
  });

  it('orders the merge by the paper form', () => {
    const current = [{ code: 'fractures', auto: false, evidence: null }];
    const suggested = [
      { code: 'cva_hemiplegia', auto: true, evidence: 'a' },
      { code: 'pain_management', auto: true, evidence: 'b' },
    ];
    expect(codes(mergeRegenerated(current, suggested, CERT_FORM))).toEqual([
      'pain_management',
      'fractures',
      'cva_hemiplegia',
    ]);
  });

  it('drops codes the form does not know', () => {
    const suggested = [{ code: 'not_on_form', auto: true, evidence: 'x' }];
    expect(mergeRegenerated([], suggested, CERT_FORM)).toEqual([]);
  });

  it('handles null inputs', () => {
    expect(mergeRegenerated(null, null, CERT_FORM)).toEqual([]);
  });
});

describe('hasAnyReason', () => {
  it('is false with no boxes and no other text', () => {
    expect(hasAnyReason([], '')).toBe(false);
    expect(hasAnyReason(null, null)).toBe(false);
  });

  it('is false when other is only whitespace', () => {
    expect(hasAnyReason([], '   \n')).toBe(false);
  });

  it('is true with one box', () => {
    expect(hasAnyReason([{ code: 'st', auto: false, evidence: null }], '')).toBe(true);
  });

  it('is true with only other text', () => {
    expect(hasAnyReason([], 'Trach care')).toBe(true);
  });
});
