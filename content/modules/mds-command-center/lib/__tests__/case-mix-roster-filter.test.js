import { describe, it, expect } from 'vitest';
import {
  filterCaseMixRoster,
  describeCaseMixCohort,
  isScoreable,
  RECORD_FILTERS,
  BASIS_FILTERS,
} from '../case-mix-roster-filter.js';

/**
 * A roster that exercises every axis at once, with DIFFERENT sizes per filter —
 * a fixture where the cohorts coincide cannot tell a working filter from one
 * that ignores its arguments.
 *
 *   101  assessed this quarter, payable, SCH
 *   102  assessed this quarter, Medicare A (scoreable, not payable), ES
 *   103  older record, payable, RPF
 *   104  older record, Medicaid application pending
 *   105  counted back from a late admission, payable
 *   106  PA1 — payer tree admitted, statute excluded
 *   107  payer we could not classify
 *   108  on the census, no record at all
 */
const ROSTER = [
  { patientId: '101', patientName: 'Alder, Ann', currentGroup: 'HBC2', currentCmi: 2.12, status: 'locked', counts: true, pendingMedicaid: false, excludedLowGroup: false, needsReview: false, nursingCategory: 'SCH' },
  { patientId: '102', patientName: 'Birch, Bob', currentGroup: 'ES2', currentCmi: 2.90, status: 'locked', counts: false, pendingMedicaid: false, excludedLowGroup: false, needsReview: false, nursingCategory: 'ES' },
  { patientId: '103', patientName: 'Cedar, Cal', currentGroup: 'PBC1', currentCmi: 1.10, status: 'carry', counts: true, pendingMedicaid: false, excludedLowGroup: false, needsReview: false, nursingCategory: 'RPF' },
  { patientId: '104', patientName: 'Dogwood, Dee', currentGroup: 'HDE2', currentCmi: 2.27, status: 'carry', counts: false, pendingMedicaid: true, excludedLowGroup: false, needsReview: false, nursingCategory: 'SCH' },
  { patientId: '105', patientName: 'Elm, Ed', currentGroup: 'CDE2', currentCmi: 1.50, status: 'backward', counts: true, pendingMedicaid: false, excludedLowGroup: false, needsReview: false, nursingCategory: 'CC' },
  { patientId: '106', patientName: 'Fir, Fay', currentGroup: 'PA1', currentCmi: 0.68, status: 'locked', counts: false, pendingMedicaid: false, excludedLowGroup: true, needsReview: false, nursingCategory: 'RPF' },
  { patientId: '107', patientName: 'Gum, Gil', currentGroup: 'CA1', currentCmi: 1.03, status: 'locked', counts: false, pendingMedicaid: false, excludedLowGroup: false, needsReview: true, nursingCategory: 'CC' },
  { patientId: '108', patientName: 'Hazel, Hal', currentGroup: null, currentCmi: null, status: 'none', counts: false, pendingMedicaid: false, excludedLowGroup: false, needsReview: false, nursingCategory: null },
];

const ids = (r) => r.rows.map((x) => x.patientId);

describe('isScoreable', () => {
  it('is false without a record in effect', () => {
    expect(isScoreable({ currentGroup: null })).toBe(false);
    expect(isScoreable({ currentGroup: 'HBC2' })).toBe(true);
    expect(isScoreable(null)).toBe(false);
  });
});

describe('record filter', () => {
  /**
   * ⚠️ THE ONE THAT REPLACED A HEADLINE. "Capture" was a second CMI over the
   * residents assessed inside the quarter. It is now this filter plus
   * `cohortCmi`. If this stops selecting on the same `status` the engine gated
   * on, the number silently becomes something else wearing the same label.
   */
  it('assessed-this-quarter selects the old capture population', () => {
    const out = filterCaseMixRoster(ROSTER, { record: 'assessed' });
    // 'locked' AND 'backward' — Ohio attributes a late admission back into the quarter.
    expect(ids(out)).toEqual(['101', '102', '105', '106', '107']);
  });

  it('older selects only carried records, and it is a different set', () => {
    const older = filterCaseMixRoster(ROSTER, { record: 'older' });
    expect(ids(older)).toEqual(['103', '104']);
    expect(ids(older)).not.toEqual(ids(filterCaseMixRoster(ROSTER, { record: 'assessed' })));
  });

  it('no-assessment-on-file finds the resident with no record', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { record: 'none' }))).toEqual(['108']);
  });

  it('any keeps everyone, including the unscoreable resident', () => {
    expect(filterCaseMixRoster(ROSTER, { record: 'any' }).rows).toHaveLength(8);
  });
});

describe('basis filter', () => {
  it('counts is the payer tree verdict, nothing else', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { basis: 'counts' }))).toEqual(['101', '103', '105']);
  });

  /**
   * "Doesn't count" must mean everyone the payable average excludes. PA1/PA2 and
   * needs-review are SUBSETS of it, not alternatives — a reader picking
   * "Doesn't count" and not seeing their PA1 residents would conclude the filter
   * is broken, and they'd be right.
   */
  it("doesn't-count is a superset of PA1/PA2 and needs-review", () => {
    const excluded = ids(filterCaseMixRoster(ROSTER, { basis: 'excluded' }));
    for (const id of ids(filterCaseMixRoster(ROSTER, { basis: 'lowgroup' }))) {
      expect(excluded).toContain(id);
    }
    for (const id of ids(filterCaseMixRoster(ROSTER, { basis: 'review' }))) {
      expect(excluded).toContain(id);
    }
  });

  it('PA1/PA2 and needs-review are distinct, narrower cohorts', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { basis: 'lowgroup' }))).toEqual(['106']);
    expect(ids(filterCaseMixRoster(ROSTER, { basis: 'review' }))).toEqual(['107']);
  });
});

describe('cohortCmi', () => {
  /**
   * THE POINT OF THE MODULE. Removing the Capture toggle only survives if the
   * number it used to show is still obtainable. Filter to assessed + counts and
   * you have it.
   */
  it('reproduces the capture score from a filter', () => {
    const capture = filterCaseMixRoster(ROSTER, { record: 'assessed', basis: 'counts' });
    // 101 (locked) and 105 (backward) — a late admission counted back into the
    // quarter IS work done for this period, so it belongs in the capture score.
    expect(ids(capture)).toEqual(['101', '105']);
    expect(capture.cohortCmi).toBeCloseTo((2.12 + 1.5) / 2, 4);
    expect(capture.cohortScored).toBe(2);
  });

  it('scores the payable population when only basis is set', () => {
    const payable = filterCaseMixRoster(ROSTER, { basis: 'counts' });
    // (2.12 + 1.10 + 1.50) / 3
    expect(payable.cohortCmi).toBeCloseTo(1.5733, 4);
    expect(payable.cohortScored).toBe(3);
  });

  /** A resident with no record is on the census and in NO average. Averaging
   *  them as zero would drag the cohort toward the floor. */
  it('keeps unscoreable residents in the list but out of the mean', () => {
    const out = filterCaseMixRoster(ROSTER, { record: 'none' });
    expect(out.rows).toHaveLength(1);
    expect(out.cohortScored).toBe(0);
    expect(out.cohortCmi).toBeNull();
    expect(out.unscoreable).toBe(1);
  });

  it('is null rather than NaN when nothing survives', () => {
    const out = filterCaseMixRoster(ROSTER, { search: 'nobody-by-that-name' });
    expect(out.rows).toEqual([]);
    expect(out.cohortCmi).toBeNull();
  });
});

describe('search and category', () => {
  it('matches name case-insensitively and by PCC id', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { search: 'cedar' }))).toEqual(['103']);
    expect(ids(filterCaseMixRoster(ROSTER, { search: '107' }))).toEqual(['107']);
    expect(ids(filterCaseMixRoster(ROSTER, { search: '  ELM ' }))).toEqual(['105']);
  });

  /** The clinical-mix drill passes a category — clicking "Special Care High"
   *  must show only SCH residents, or the count under the bar is a lie. */
  it('narrows to one clinical category', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { category: 'SCH' }))).toEqual(['101', '104']);
  });

  it('composes every axis rather than letting one win', () => {
    const out = filterCaseMixRoster(ROSTER, {
      category: 'SCH',
      record: 'assessed',
      basis: 'counts',
    });
    expect(ids(out)).toEqual(['101']);
  });
});

describe('robustness', () => {
  it('falls back to the unfiltered view for nonsense arguments', () => {
    const bogus = filterCaseMixRoster(ROSTER, { record: 'sideways', basis: 'vibes' });
    expect(bogus.rows).toHaveLength(8);
  });

  it('survives a non-array', () => {
    expect(filterCaseMixRoster(null).rows).toEqual([]);
    expect(filterCaseMixRoster(undefined).cohortCmi).toBeNull();
  });

  it('exposes filter definitions the UI can render without restating them', () => {
    expect(RECORD_FILTERS.map((f) => f.key)).toEqual(['any', 'assessed', 'older', 'none']);
    expect(BASIS_FILTERS).toHaveLength(5);
    // The wording that was called out as meaningless must be gone.
    const labels = [...RECORD_FILTERS, ...BASIS_FILTERS].map((f) => f.label).join(' ');
    expect(labels).not.toMatch(/riding an earlier record/i);
    expect(labels).not.toMatch(/never assessed/i);
  });
});

describe('describeCaseMixCohort', () => {
  it('is null when nothing is narrowed — no sentence for a default view', () => {
    expect(describeCaseMixCohort('any', 'all')).toBeNull();
  });

  it('names both axes when both are set', () => {
    expect(describeCaseMixCohort('assessed', 'counts')).toBe(
      'assessed this quarter · counts toward the rate'
    );
  });

  /** It replaced a two-sentence paragraph that was "way too much". Keep it short
   *  enough that the constraint is enforced, not merely intended. */
  it('stays short', () => {
    for (const r of RECORD_FILTERS) {
      for (const b of BASIS_FILTERS) {
        const s = describeCaseMixCohort(r.key, b.key);
        if (s) expect(s.length).toBeLessThan(70);
      }
    }
  });
});
