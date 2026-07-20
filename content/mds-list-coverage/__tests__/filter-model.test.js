import { describe, it, expect } from 'vitest';
import {
  DISCIPLINE_SECTIONS,
  INTERVIEW_OPTIONS,
  sectionsForDiscipline,
  disciplineForSections,
  disciplineActive,
  toggleDiscipline,
  disciplineButtonLabel,
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
  neededInterviewTypes: [],
  ...over,
});

describe('sectionsForDiscipline / disciplineForSections', () => {
  it('SSD owns B,C,D,E,Q (the user definition)', () => {
    expect(sectionsForDiscipline('ssd')).toEqual(['B', 'C', 'D', 'E', 'Q']);
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

describe('disciplineActive / toggleDiscipline (multi-select presets)', () => {
  it('a preset is active only when ALL its sections are selected', () => {
    expect(disciplineActive(['B', 'C', 'D', 'E', 'Q'], 'ssd')).toBe(true);
    expect(disciplineActive(['B', 'C'], 'ssd')).toBe(false);
    expect(disciplineActive(['K'], 'dietary')).toBe(true);
  });
  it('toggles a discipline set in, then back out, preserving section order', () => {
    const on = toggleDiscipline([], 'ssd');
    expect(on).toEqual(['B', 'C', 'D', 'E', 'Q']);
    expect(toggleDiscipline(on, 'ssd')).toEqual([]);
  });
  it('supports combining two presets (SSD + Dietary both active)', () => {
    const combined = toggleDiscipline(sectionsForDiscipline('ssd'), 'dietary');
    expect(disciplineActive(combined, 'ssd')).toBe(true);
    expect(disciplineActive(combined, 'dietary')).toBe(true);
    expect(combined).toEqual(['B', 'C', 'D', 'E', 'K', 'Q']); // canonical order
  });
});

describe('disciplineButtonLabel', () => {
  it('labels empty / single-discipline / custom selections', () => {
    expect(disciplineButtonLabel([])).toBe('Discipline');
    expect(disciplineButtonLabel(['B', 'C', 'D', 'E', 'Q'])).toBe('SSD');
    expect(disciplineButtonLabel(['B', 'K'])).toBe('2 sections');
    expect(disciplineButtonLabel(['B'])).toBe('1 section');
  });
});

describe('INTERVIEW_OPTIONS', () => {
  it('are the four interviews in display order', () => {
    expect(INTERVIEW_OPTIONS.map((o) => o.key)).toEqual(['bims', 'phq', 'gg', 'pain']);
    expect(INTERVIEW_OPTIONS.find((o) => o.key === 'phq').label).toBe('PHQ-9');
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
    expect(isEmptyFilters({ ...emptyFilters(), missingInterviews: ['phq'] })).toBe(false);
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
    expect(rowMatchesFilters(row(), { ...emptyFilters(), sections: sectionsForDiscipline('ssd') })).toBe(true);
    expect(rowMatchesFilters(row(), { ...emptyFilters(), sections: ['K'] })).toBe(true);
    expect(rowMatchesFilters(row({ unsignedSections: ['A'] }), { ...emptyFilters(), sections: ['B'] })).toBe(false);
  });

  it('type filter is an exact match', () => {
    expect(rowMatchesFilters(row(), { ...emptyFilters(), type: 'NQ' })).toBe(true);
    expect(rowMatchesFilters(row(), { ...emptyFilters(), type: 'NC' })).toBe(false);
  });

  it('due=overdue needs tone overdue; due=soon needs tone urgent', () => {
    expect(rowMatchesFilters(row({ tone: 'overdue' }), { ...emptyFilters(), due: 'overdue' })).toBe(true);
    expect(rowMatchesFilters(row({ tone: 'ok' }), { ...emptyFilters(), due: 'overdue' })).toBe(false);
    expect(rowMatchesFilters(row({ tone: 'urgent' }), { ...emptyFilters(), due: 'soon' })).toBe(true);
    expect(rowMatchesFilters(row({ tone: 'approaching' }), { ...emptyFilters(), due: 'soon' })).toBe(false);
  });

  it('missingInterviews passes when the row is missing any selected interview', () => {
    const r = row({ neededInterviewTypes: ['phq', 'gg'] });
    expect(rowMatchesFilters(r, { ...emptyFilters(), missingInterviews: ['phq'] })).toBe(true);
    expect(rowMatchesFilters(r, { ...emptyFilters(), missingInterviews: ['bims'] })).toBe(false);
    expect(rowMatchesFilters(r, { ...emptyFilters(), missingInterviews: ['bims', 'gg'] })).toBe(true);
    // row missing nothing → excluded when a missing filter is set
    expect(rowMatchesFilters(row(), { ...emptyFilters(), missingInterviews: ['phq'] })).toBe(false);
  });

  it('filters combine with AND', () => {
    const f = { ...emptyFilters(), search: 'gibson', sections: ['K'], type: 'NQ', due: 'overdue', missingInterviews: ['gg'] };
    expect(rowMatchesFilters(row({ tone: 'overdue', neededInterviewTypes: ['gg'] }), f)).toBe(true);
    expect(rowMatchesFilters(row({ tone: 'ok', neededInterviewTypes: ['gg'] }), f)).toBe(false);
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
