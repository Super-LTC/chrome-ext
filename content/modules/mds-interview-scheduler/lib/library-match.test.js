import { describe, it, expect } from 'vitest';
import { matchLibraryToInterviews } from './library-match.js';

const OPTIONS = [
  { id: '11231', label: 'HCG- BRIEF INTERVIEW FOR MENTAL STATUS (3.0 BIMS)' },
  { id: '11259', label: 'HCG- PHQ-9 (MDS 3.0)' },
  { id: '27347', label: 'HCG Functional Abilities IDT' },
  { id: '12348', label: 'HCG-Pain Assessment (3.0)' },
  { id: '10072', label: 'HCG Nutritional Risk Assessment' },
];

describe('matchLibraryToInterviews', () => {
  it('matches each interview type to its best library option', () => {
    const m = matchLibraryToInterviews(OPTIONS);
    expect(m.bims?.id).toBe('11231');
    expect(m.phq?.id).toBe('11259');
    expect(m.gg?.id).toBe('27347');     // "Functional" → GG
    expect(m.pain?.id).toBe('12348');
  });
  it('leaves a type null when no option matches', () => {
    const m = matchLibraryToInterviews([{ id: '1', label: 'Random Note' }]);
    expect(m.bims).toBe(null);
    expect(m.gg).toBe(null);
  });
  it('prefers an explicit GG label over a generic functional one', () => {
    const m = matchLibraryToInterviews([
      { id: 'a', label: 'HCG Functional Abilities IDT' },
      { id: 'b', label: 'Nursing GG Evaluation' },
    ]);
    expect(m.gg?.id).toBe('b'); // "gg" keyword outranks "functional"
  });
  it('tolerates empty / null input', () => {
    expect(matchLibraryToInterviews([])).toEqual({ bims: null, phq: null, gg: null, pain: null });
    expect(matchLibraryToInterviews(null)).toEqual({ bims: null, phq: null, gg: null, pain: null });
  });
});
