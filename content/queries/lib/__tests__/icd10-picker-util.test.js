import { describe, it, expect } from 'vitest';
import { toRecommendedIcd10, normalizeSearchResults, buildSuggestedList } from '../icd10-picker-util.js';

describe('toRecommendedIcd10', () => {
  it('returns [] when nothing is selected (codeless query)', () => {
    expect(toRecommendedIcd10(null)).toEqual([]);
    expect(toRecommendedIcd10(undefined)).toEqual([]);
    expect(toRecommendedIcd10({})).toEqual([]);
    expect(toRecommendedIcd10({ description: 'no code here' })).toEqual([]);
  });

  it('returns a single-entry array with code + description when selected', () => {
    expect(toRecommendedIcd10({ code: 'E43', description: 'Severe malnutrition' }))
      .toEqual([{ code: 'E43', description: 'Severe malnutrition' }]);
  });

  it('coerces a missing description to empty string (never undefined)', () => {
    expect(toRecommendedIcd10({ code: 'E43' }))
      .toEqual([{ code: 'E43', description: '' }]);
  });

  it('includes reason only when present', () => {
    expect(toRecommendedIcd10({ code: 'E43', description: 'x', reason: 'per note' }))
      .toEqual([{ code: 'E43', description: 'x', reason: 'per note' }]);
    expect(toRecommendedIcd10({ code: 'E43', description: 'x' })[0]).not.toHaveProperty('reason');
  });
});

describe('normalizeSearchResults', () => {
  it('unwraps the { results } envelope', () => {
    expect(normalizeSearchResults({ results: [{ code: 'E43', description: 'Severe malnutrition' }] }))
      .toEqual([{ code: 'E43', description: 'Severe malnutrition' }]);
  });

  it('tolerates a bare array', () => {
    expect(normalizeSearchResults([{ code: 'E43', description: 'x' }]))
      .toEqual([{ code: 'E43', description: 'x' }]);
  });

  it('drops entries without a code and dedupes', () => {
    const out = normalizeSearchResults({
      results: [{ code: 'E43' }, { description: 'no code' }, null, { code: 'E43', description: 'dup' }]
    });
    expect(out).toEqual([{ code: 'E43', description: '' }]);
  });

  it('returns [] for garbage input', () => {
    expect(normalizeSearchResults(null)).toEqual([]);
    expect(normalizeSearchResults(undefined)).toEqual([]);
    expect(normalizeSearchResults({})).toEqual([]);
  });
});

describe('buildSuggestedList', () => {
  it('returns [] when there is no preferred and no options', () => {
    expect(buildSuggestedList({ preferred: null, options: [] })).toEqual([]);
    expect(buildSuggestedList({})).toEqual([]);
  });

  it('puts preferred first and flags it recommended', () => {
    const out = buildSuggestedList({
      preferred: { code: 'D50', description: 'Iron deficiency anemia' },
      options: [
        { code: 'D50', description: 'Iron deficiency anemia' },
        { code: 'D51', description: 'Vitamin B12 deficiency anemia' },
      ],
    });
    expect(out).toEqual([
      { code: 'D50', description: 'Iron deficiency anemia', recommended: true },
      { code: 'D51', description: 'Vitamin B12 deficiency anemia', recommended: false },
    ]);
  });

  it('adds preferred even when it is absent from options', () => {
    const out = buildSuggestedList({
      preferred: { code: 'D50', description: 'Iron deficiency anemia' },
      options: [{ code: 'D51', description: 'B12' }],
    });
    expect(out.map(r => r.code)).toEqual(['D50', 'D51']);
    expect(out[0].recommended).toBe(true);
    expect(out[1].recommended).toBe(false);
  });

  it('lists options with none recommended when preferred is null', () => {
    const out = buildSuggestedList({
      preferred: null,
      options: [{ code: 'D51', description: 'B12' }, { code: 'D52', description: 'Folate' }],
    });
    expect(out).toEqual([
      { code: 'D51', description: 'B12', recommended: false },
      { code: 'D52', description: 'Folate', recommended: false },
    ]);
  });

  it('dedupes by code and drops entries without a code, preserving option order', () => {
    const out = buildSuggestedList({
      preferred: { code: 'D50', description: 'Iron' },
      options: [{ code: 'D50', description: 'dup' }, {}, null, { description: 'no code' }, { code: 'D51', description: 'B12' }],
    });
    expect(out.map(r => r.code)).toEqual(['D50', 'D51']);
  });

  it('coerces missing descriptions to empty string', () => {
    const out = buildSuggestedList({ preferred: { code: 'D50' }, options: [] });
    expect(out).toEqual([{ code: 'D50', description: '', recommended: true }]);
  });
});
