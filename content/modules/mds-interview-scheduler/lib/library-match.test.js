import { describe, it, expect } from 'vitest';
import { matchLibraryToInterviews } from './library-match.js';

// Trimmed-but-representative slices of three REAL facility libraries, including
// the decoys that matter (Staff Assessment variants, Pain Evaluation vs Pain
// Interview, the per-type Functional/GG variants). Full lists in the 2026-06-14
// scheduler design discussion.

const FACILITY_A_GSHC = [
  { id: '12537', label: 'Functional Abilities and Goals - Admission - V 3' },
  { id: '12538', label: 'Functional Abilities and Goals - Discharge - V 3' },
  { id: '12539', label: 'Functional Abilities and Goals - Interim - V 3' },
  { id: '23760', label: 'GSHC Brief Interview for Mental Status (BIMS) Evaluation - V 3 (SPN)' },
  { id: '23227', label: 'GSHC PHQ-2 to 9 Evaluation  - V 1 (SPN)' },
  { id: '12507', label: 'GSHC Section GG/Functional Assessment Licensed Nurse' },
  { id: '16330', label: 'Pain Assessment (3.0) - V 3' },
  { id: '11150', label: 'GSHC Oral Assessment' },
];

const FACILITY_B = [
  { id: '18242', label: 'BIMS (MDS 3.0)' },
  { id: '20529', label: 'BIMS (Staff Assessment)' },
  { id: '12401', label: 'PHQ-9' },
  { id: '16660', label: 'PHQ-9-OV (Staff Assessment)' },
  { id: '35855', label: 'Functional Abilities - IDT Determination: Admission' },
  { id: '37835', label: 'Functional Abilities - IDT Determination: Discharge' },
  { id: '36925', label: 'Functional Abilities - IDT Determination: OBRA/IPA' },
  { id: '18432', label: 'Pain Evaluation' },
  { id: '24337', label: 'Pain Interview (MDS 3.0) - V 2' },
  { id: '40588', label: 'MDS Data Collection - V 2' },
];

const FACILITY_C = [
  { id: '64521', label: 'BRIEF INTERVIEW FOR MENTAL STATUS (3.0 BIMS) - V 2' },
  { id: '65993', label: 'Social Service - PHQ9 - V 3' },
  { id: '72450', label: 'Usual Performance Functional Abilities' },
  { id: '66239', label: 'NSG - Pain Evaluation - V 3' },
  { id: '71399', label: 'Interview questions MDS 3.0 - V 2' },
  { id: '10448', label: 'NSG - Morse Fall Scale' },
];

describe('matchLibraryToInterviews — Facility A (GSHC)', () => {
  const m = matchLibraryToInterviews(FACILITY_A_GSHC, { a0310a: '02' });
  it('BIMS', () => expect(m.bims?.id).toBe('23760'));
  it('PHQ (PHQ-2 to 9)', () => expect(m.phq?.id).toBe('23227'));
  it('GG (explicit Section GG beats generic Functional Abilities)', () => expect(m.gg?.id).toBe('12507'));
  it('Pain', () => expect(m.pain?.id).toBe('16330'));
});

describe('matchLibraryToInterviews — Facility B (staff-assessment + interview collisions)', () => {
  const m = matchLibraryToInterviews(FACILITY_B, { a0310a: '02' }); // quarterly → OBRA
  it('BIMS picks resident interview, not Staff Assessment', () => expect(m.bims?.id).toBe('18242'));
  it('PHQ picks resident interview, not Staff Assessment', () => expect(m.phq?.id).toBe('12401'));
  it('Pain picks "Pain Interview (MDS 3.0)", not "Pain Evaluation"', () => expect(m.pain?.id).toBe('24337'));
  it('GG picks the OBRA/IPA functional variant for a quarterly', () => expect(m.gg?.id).toBe('36925'));
});

describe('matchLibraryToInterviews — Facility B GG variant follows assessment type', () => {
  it('admission → Admission variant', () => {
    const m = matchLibraryToInterviews(FACILITY_B, { a0310a: '01' });
    expect(m.gg?.id).toBe('35855');
  });
  it('discharge → Discharge variant', () => {
    const m = matchLibraryToInterviews(FACILITY_B, { a0310a: '99', a0310f: '11' });
    expect(m.gg?.id).toBe('37835');
  });
});

describe('matchLibraryToInterviews — Facility C (non-obvious names)', () => {
  const m = matchLibraryToInterviews(FACILITY_C, { a0310a: '02' });
  it('BIMS', () => expect(m.bims?.id).toBe('64521'));
  it('PHQ (PHQ9, no hyphen, inside Social Service form)', () => expect(m.phq?.id).toBe('65993'));
  it('GG (Usual Performance Functional Abilities)', () => expect(m.gg?.id).toBe('72450'));
  it('Pain (only a Pain Evaluation exists)', () => expect(m.pain?.id).toBe('66239'));
});

describe('matchLibraryToInterviews — robustness', () => {
  it('no false-positive from a bare "gg" substring inside a word', () => {
    const m = matchLibraryToInterviews([{ id: '1', label: 'Luggage Inventory' }, { id: '2', label: 'Triggering Events Log' }]);
    expect(m.gg).toBe(null);
  });
  it('returns nulls for empty / null input', () => {
    expect(matchLibraryToInterviews([])).toEqual({ bims: null, phq: null, gg: null, pain: null });
    expect(matchLibraryToInterviews(null)).toEqual({ bims: null, phq: null, gg: null, pain: null });
  });
});
