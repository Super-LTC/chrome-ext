import { describe, it, expect } from 'vitest';
import { toRecommendedIcd10, normalizeSearchResults } from '../icd10-picker-util.js';

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
