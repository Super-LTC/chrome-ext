import { describe, it, expect } from 'vitest';
import {
  DISCIPLINE_SECTIONS,
  sectionsForDiscipline,
  disciplineForSections,
  emptyFilters,
  isEmptyFilters,
  rowMatchesFilters,
  matchedSections,
} from '../filter-model.js';

const row = (over = {}) => ({
  name: 'Gibson, Larry',
  mrn: '178122',
  unsignedSections: ['B', 'C', 'GG', 'K'],
  type: 'NQ',
  tone: 'ok',
  hasNeededInterview: false,
  ...over,
});

describe('sectionsForDiscipline / disciplineForSections', () => {
  it('SSD owns B,C,D,E,Q (the user definition)', () => {
    expect(sectionsForDiscipline('ssd')).toEqual(['B', 'C', 'D', 'E', 'Q']);
  });
  it('unknown discipline → empty', () => {
    expect(sectionsForDiscipline('nope')).toEqual([]);
  });
  it('round-trips a discipline set back to its key (order-insensitive)', () => {
    expect(disciplineForSections(['Q', 'E', 'D', 'C', 'B'])).toBe('ssd');
    expect(disciplineForSections(DISCIPLINE_SECTIONS.nursing)).toBe('nursing');
  });
  it('non-matching non-empty set → custom; empty → ""', () => {
    expect(disciplineForSections(['B', 'K'])).toBe('custom');
    expect(disciplineForSections([])).toBe('');
  });
});

describe('emptyFilters / isEmptyFilters', () => {
  it('empty filters are recognized as empty', () => {
    expect(isEmptyFilters(emptyFilters())).toBe(true);
    expect(isEmptyFilters(null)).toBe(true);
  });
  it('any active dimension is not empty', () => {
    expect(isEmptyFilters({ ...emptyFilters(), search: 'x' })).toBe(false);
    expect(isEmptyFilters({ ...emptyFilters(), sections: ['B'] })).toBe(false);
    expect(isEmptyFilters({ ...emptyFilters(), due: 'overdue' })).toBe(false);
    expect(isEmptyFilters({ ...emptyFilters(), type: 'NQ' })).toBe(false);
    expect(isEmptyFilters({ ...emptyFilters(), missingOnly: true })).toBe(false);
  });
});

describe('rowMatchesFilters', () => {
  it('no filters → everything passes', () => {
    expect(rowMatchesFilters(row(), emptyFilters())).toBe(true);
  });

  it('search matches name or MRN, case-insensitive; misses otherwise', () => {
    expect(rowMatchesFilters(row(), { ...emptyFilters(), search: 'gibson' })).toBe(true);
    expect(rowMatchesFilters(row(), { ...emptyFilters(), search: '178122' })).toBe(true);
    expect(rowMatchesFilters(row(), { ...emptyFilters(), search: 'smith' })).toBe(false);
  });

  it('section filter passes when unsigned intersects selection', () => {
    // SSD = B,C,D,E,Q; row has B,C unsigned → match.
    expect(rowMatchesFilters(row(), { ...emptyFilters(), sections: sectionsForDiscipline('ssd') })).toBe(true);
    // Dietary = K; row has K → match.
    expect(rowMatchesFilters(row(), { ...emptyFilters(), sections: ['K'] })).toBe(true);
    // Row without any selected section → no match.
    expect(rowMatchesFilters(row({ unsignedSections: ['A'] }), { ...emptyFilters(), sections: ['B'] })).toBe(false);
  });

  it('type filter is an exact match', () => {
    expect(rowMatchesFilters(row(), { ...emptyFilters(), type: 'NQ' })).toBe(true);
    expect(rowMatchesFilters(row(), { ...emptyFilters(), type: 'NC' })).toBe(false);
    expect(rowMatchesFilters(row(), { ...emptyFilters(), type: 'all' })).toBe(true);
  });

  it('due=overdue needs tone overdue; due=soon needs tone urgent', () => {
    expect(rowMatchesFilters(row({ tone: 'overdue' }), { ...emptyFilters(), due: 'overdue' })).toBe(true);
    expect(rowMatchesFilters(row({ tone: 'ok' }), { ...emptyFilters(), due: 'overdue' })).toBe(false);
    expect(rowMatchesFilters(row({ tone: 'urgent' }), { ...emptyFilters(), due: 'soon' })).toBe(true);
    expect(rowMatchesFilters(row({ tone: 'approaching' }), { ...emptyFilters(), due: 'soon' })).toBe(false);
  });

  it('missingOnly requires a needed interview', () => {
    expect(rowMatchesFilters(row({ hasNeededInterview: true }), { ...emptyFilters(), missingOnly: true })).toBe(true);
    expect(rowMatchesFilters(row({ hasNeededInterview: false }), { ...emptyFilters(), missingOnly: true })).toBe(false);
  });

  it('filters combine with AND', () => {
    const f = { ...emptyFilters(), search: 'gibson', sections: ['K'], type: 'NQ', due: 'overdue', missingOnly: true };
    expect(rowMatchesFilters(row({ tone: 'overdue', hasNeededInterview: true }), f)).toBe(true);
    // flip one dimension → fails
    expect(rowMatchesFilters(row({ tone: 'ok', hasNeededInterview: true }), f)).toBe(false);
  });
});

describe('matchedSections', () => {
  it('returns the intersection for highlighting', () => {
    const hit = matchedSections(row(), { ...emptyFilters(), sections: sectionsForDiscipline('ssd') });
    expect([...hit].sort()).toEqual(['B', 'C']);
  });
  it('empty selection → nothing highlighted', () => {
    expect(matchedSections(row(), emptyFilters()).size).toBe(0);
  });
});
