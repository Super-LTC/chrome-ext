import { describe, it, expect } from 'vitest';
import {
  buildWorklistModel,
  touchesForItem,
  addAllReady,
  totalTouches,
} from './worklistModel.js';

const auditFx = {
  engineVersion: 'v2',
  toAdd: [
    {
      ruleId: 'dx.pain', _rowId: 'add-0', score: 90, caaName: 'Pain',
      focus: {
        description: 'Resident has ___ pain',
        descriptionSegments: [
          { kind: 'text', value: 'Resident has ' },
          { kind: 'token', tokenKey: 'acuity', needsFilling: true, value: '___', options: ['acute', 'chronic'] },
          { kind: 'text', value: ' pain' },
        ],
      },
    },
    {
      ruleId: 'dx.chf', _rowId: 'add-1', score: 80, caaName: 'Cardiac',
      focus: { description: 'Resident has heart failure', descriptionSegments: [] },
    },
  ],
  toRemove: [{ focusId: 'f1', _rowId: 'rem-0', caaName: 'Infection', focusText: 'infection r/t sepsis', reason: 'Resolved.' }],
  toCheck: [{ focusId: 'f2', _rowId: 'chk-0', caaName: 'GI', focusText: 'hx C. diff', detail: 'Your call.' }],
  onPlan: [{ ruleId: 'dx.dm', _rowId: 'op-0', caaName: 'Diabetes', focusText: 'DM2' }],
  dropped: [{ ruleId: 'dx.ms', description: 'MS focus', reason: 'over-fired' }],
};

describe('buildWorklistModel', () => {
  it('groups rows by kind: add, remove, check', () => {
    const m = buildWorklistModel(auditFx);
    expect(m.groups.map((g) => g.kind)).toEqual(['add', 'remove', 'check']);
    expect(m.groups[0].items.map((i) => i._rowId)).toEqual(['add-0', 'add-1']);
  });
  it('sorts add rows by score desc', () => {
    const m = buildWorklistModel(auditFx);
    expect(m.groups[0].items[0].ruleId).toBe('dx.pain'); // 90 before 80
  });
  it('omits empty kind groups', () => {
    const m = buildWorklistModel({ engineVersion: 'v2', toAdd: auditFx.toAdd });
    expect(m.groups.map((g) => g.kind)).toEqual(['add']);
  });
  it('surfaces covered + dropped', () => {
    const m = buildWorklistModel(auditFx);
    expect(m.covered).toHaveLength(1);
    expect(m.dropped).toHaveLength(1);
  });
  it('counts total add rows', () => {
    expect(buildWorklistModel(auditFx).totalAdds).toBe(2);
  });
  it('returns an empty model for a null audit', () => {
    const m = buildWorklistModel(null);
    expect(m.groups).toEqual([]);
    expect(m.totalAdds).toBe(0);
  });
});

// Stand-in for the modal's private _focusUnfilledTokenKeys — the model injects
// these so it stays DOM/Preact-free and independently testable.
const unfilled = (focus, tv) => {
  const keys = new Set();
  (focus.descriptionSegments || []).forEach((s) => {
    if (s.kind === 'token' && s.needsFilling && !(tv[s.tokenKey])) keys.add(s.tokenKey);
  });
  return [...keys];
};

describe('touchesForItem', () => {
  it('counts unfilled token slots', () => {
    expect(touchesForItem(auditFx.toAdd[0], {}, unfilled, () => false)).toBe(1);
  });
  it('is 0 once the slot is filled', () => {
    expect(touchesForItem(auditFx.toAdd[0], { acuity: 'chronic' }, unfilled, () => false)).toBe(0);
  });
  it('counts a flat ___ focus with no tokens as 1', () => {
    const item = { focus: { description: 'foo ___', descriptionSegments: [] } };
    expect(touchesForItem(item, {}, () => [], () => true)).toBe(1);
  });
  it('is 0 for an item with no focus', () => {
    expect(touchesForItem({}, {}, unfilled, () => true)).toBe(0);
  });
});

describe('addAllReady', () => {
  it('false while any add has touches, true when all cleared', () => {
    const m = buildWorklistModel(auditFx);
    expect(addAllReady(m, new Map([['add-0', 1], ['add-1', 0]]), new Set(), new Set())).toBe(false);
    expect(addAllReady(m, new Map([['add-0', 0], ['add-1', 0]]), new Set(), new Set())).toBe(true);
  });
  it('ignores stamped adds when computing readiness', () => {
    const m = buildWorklistModel(auditFx);
    // add-0 still has a touch, but it is stamped → not counted → ready
    expect(addAllReady(m, new Map([['add-0', 1], ['add-1', 0]]), new Set(['dx.pain']), new Set())).toBe(true);
  });
  it('false when there are zero open adds (nothing to add)', () => {
    const m = buildWorklistModel(auditFx);
    expect(addAllReady(m, new Map(), new Set(['dx.pain', 'dx.chf']), new Set())).toBe(false);
  });
});

describe('totalTouches', () => {
  it('sums touches across open add rows', () => {
    const m = buildWorklistModel(auditFx);
    expect(totalTouches(m, new Map([['add-0', 2], ['add-1', 1]]), new Set(), new Set())).toBe(3);
  });
  it('excludes stamped/skipped rows from the sum', () => {
    const m = buildWorklistModel(auditFx);
    expect(totalTouches(m, new Map([['add-0', 2], ['add-1', 1]]), new Set(['dx.pain']), new Set(['dx.chf']))).toBe(0);
  });
});
