// content/modules/care-plan-stamp/wizardModel.test.js
import { describe, it, expect } from 'vitest';
import { areaStatus, skippedItems, buildWizardModel, reviewedCount } from './wizardModel.js';
import fixture from './__fixtures__/mock-audit-v2.js';

const EMPTY = { groups: [], coveredAreas: [], total: 0, orderedItems: [] };

describe('areaStatus', () => {
  it('toAdd + onPlan → partial', () => expect(areaStatus({ toAdd: 2, onPlan: 1 })).toBe('partial'));
  it('toAdd only → gap', () => expect(areaStatus({ toAdd: 3, onPlan: 0 })).toBe('gap'));
  it('onPlan only → covered', () => expect(areaStatus({ toAdd: 0, onPlan: 1 })).toBe('covered'));
  it('neither → resolved', () => expect(areaStatus({ toAdd: 0, onPlan: 0 })).toBe('resolved'));
  it('defaults missing counts to 0 → resolved', () => expect(areaStatus({})).toBe('resolved'));
});

describe('skippedItems', () => {
  it('returns [] when missing', () => {
    expect(skippedItems(null)).toEqual([]);
    expect(skippedItems({})).toEqual([]);
  });
  it('returns the array when present', () => {
    expect(skippedItems(fixture.audit)).toBe(fixture.audit.skipped);
    expect(skippedItems(fixture.audit).length).toBe(2);
  });
});

describe('reviewedCount — a skip counts as reviewed, same as a stamp', () => {
  const items = [{ ruleId: 'a' }, { ruleId: 'b' }, { ruleId: 'c' }];

  it('counts stamped items', () => {
    expect(reviewedCount(items, new Set(['a']), new Set())).toBe(1);
  });
  it('counts skipped items as reviewed (the dismissed-but-still-counted fix)', () => {
    expect(reviewedCount(items, new Set(), new Set(['b']))).toBe(1);
  });
  it('counts stamped + skipped together', () => {
    expect(reviewedCount(items, new Set(['a']), new Set(['b']))).toBe(2);
  });
  it('an item in BOTH sets counts once (never exceeds total)', () => {
    expect(reviewedCount(items, new Set(['a']), new Set(['a']))).toBe(1);
  });
  it('none handled → 0', () => {
    expect(reviewedCount(items, new Set(), new Set())).toBe(0);
  });
  it('null-safe (bad inputs → 0)', () => {
    expect(reviewedCount(null, new Set(['a']), new Set())).toBe(0);
    expect(reviewedCount(items, null, null)).toBe(0);
  });
});

describe('buildWizardModel — fixture shape', () => {
  const model = buildWizardModel(fixture.audit);

  it('totals 19 toAdd items', () => expect(model.total).toBe(19));
  it('has 13 groups', () => expect(model.groups.length).toBe(13));
  it('has 8 covered areas', () => expect(model.coveredAreas.length).toBe(8));
  it('covered areas include Renal and Hydration', () => {
    expect(model.coveredAreas).toContain('Renal');
    expect(model.coveredAreas).toContain('Hydration');
  });
});

describe('buildWizardModel — ordering', () => {
  const model = buildWizardModel(fixture.audit);

  it('all gap groups sort before all partial groups', () => {
    const statuses = model.groups.map((g) => g.status);
    const lastGap = statuses.lastIndexOf('gap');
    const firstPartial = statuses.indexOf('partial');
    expect(lastGap).toBeLessThan(firstPartial);
  });

  it('orderedItems length === total and first item belongs to first group', () => {
    expect(model.orderedItems.length).toBe(model.total);
    expect(model.orderedItems[0]).toBe(model.groups[0].items[0]);
  });
});

describe('buildWizardModel — within-group score ordering', () => {
  it('higher score comes first', () => {
    const audit = {
      toAdd: [
        { caaName: 'Cardiac', score: 3, ruleId: 'low' },
        { caaName: 'Cardiac', score: 9, ruleId: 'high' },
      ],
      onPlan: [],
    };
    const model = buildWizardModel(audit);
    expect(model.groups.length).toBe(1);
    expect(model.groups[0].items[0].ruleId).toBe('high');
    expect(model.groups[0].items[1].ruleId).toBe('low');
  });
});

describe('buildWizardModel — status correctness on fixture', () => {
  const model = buildWizardModel(fixture.audit);
  const byArea = Object.fromEntries(model.groups.map((g) => [g.area, g]));

  it('Cardiac is partial (has onPlan)', () => expect(byArea['Cardiac'].status).toBe('partial'));
  it('Cognition / Dementia is gap', () => expect(byArea['Cognition / Dementia'].status).toBe('gap'));
});

describe('buildWizardModel — null-safety', () => {
  it('null → empty model', () => expect(buildWizardModel(null)).toEqual(EMPTY));
  it('{} → empty model', () => expect(buildWizardModel({})).toEqual(EMPTY));
});
