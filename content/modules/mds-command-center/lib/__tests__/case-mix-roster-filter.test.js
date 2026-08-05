import { describe, it, expect } from 'vitest';
import {
  filterCaseMixRoster,
  describeCaseMixPopulation,
  isScoreable,
} from '../case-mix-roster-filter.js';

/**
 * A roster that exercises every axis at once. Deliberately built so the four
 * populations have DIFFERENT sizes — a fixture where they coincide cannot tell a
 * working filter from one that ignores its arguments.
 *
 *   a  assessed in quarter, payable
 *   b  assessed in quarter, Medicare A (scoreable, not payable)
 *   c  carried on an earlier record, payable
 *   d  carried, Medicaid application pending
 *   e  counted back from an admission after quarter end, payable
 *   f  on the census with no record at all
 */
const ROSTER = [
  { patientId: 'a', currentGroup: 'HBC2', status: 'locked', counts: true, pendingMedicaid: false },
  { patientId: 'b', currentGroup: 'ES2', status: 'locked', counts: false, pendingMedicaid: false },
  { patientId: 'c', currentGroup: 'PA1', status: 'carry', counts: true, pendingMedicaid: false },
  { patientId: 'd', currentGroup: 'HDE2', status: 'carry', counts: false, pendingMedicaid: true },
  { patientId: 'e', currentGroup: 'CDE2', status: 'backward', counts: true, pendingMedicaid: false },
  { patientId: 'f', currentGroup: null, status: 'none', counts: false, pendingMedicaid: false },
];

const ids = (r) => r.rows.map((x) => x.patientId);

describe('isScoreable', () => {
  it('is false without a record in effect', () => {
    expect(isScoreable({ currentGroup: null })).toBe(false);
    expect(isScoreable({ currentGroup: 'HBC2' })).toBe(true);
    expect(isScoreable(null)).toBe(false);
  });
});

describe('filterCaseMixRoster', () => {
  /**
   * THE ONE THAT MATTERS. A resident with no record in effect is in no average.
   * Letting them through would inflate every count on the drill and make it
   * disagree with the headline it drilled from.
   */
  it('never lets an unscoreable resident into any population', () => {
    for (const population of ['payable', 'capture']) {
      for (const measure of ['medicaidCmi', 'allCmi', 'medicaidWithPendingCmi']) {
        const out = filterCaseMixRoster(ROSTER, { population, measure });
        expect(ids(out), `${population}/${measure}`).not.toContain('f');
        expect(out.unscoreable).toBe(1);
      }
    }
  });

  /**
   * ⚠️ THE POPULATION GATE. Capture is `status === 'locked'` because that is the
   * same `recordTiming` verdict the score gated on. If this ever drifts to "has
   * a current ARD" or similar, carried residents leak in and the capture number
   * silently becomes the payable one.
   */
  it('capture keeps only residents assessed inside the quarter', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { population: 'capture', measure: 'allCmi' })))
      .toEqual(['a', 'b']);
    // Not the same set as payable — otherwise the toggle does nothing.
    expect(ids(filterCaseMixRoster(ROSTER, { population: 'payable', measure: 'allCmi' })))
      .toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('payable keeps carried and backward-attributed residents', () => {
    const out = filterCaseMixRoster(ROSTER, { population: 'payable', measure: 'allCmi' });
    expect(ids(out)).toContain('c'); // carry
    expect(ids(out)).toContain('e'); // backward
  });

  it('the Medicaid measure is the payer tree verdict, nothing else', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { population: 'payable', measure: 'medicaidCmi' })))
      .toEqual(['a', 'c', 'e']);
  });

  /** + pendings is payable ∪ pending — exactly what that mean averages over. */
  it('+ pendings adds the pending applications and only those', () => {
    const out = filterCaseMixRoster(ROSTER, {
      population: 'payable',
      measure: 'medicaidWithPendingCmi',
    });
    expect(ids(out)).toEqual(['a', 'c', 'd', 'e']);
    expect(ids(out)).not.toContain('b'); // Medicare A is not pending, it is not Medicaid
  });

  it('all-residents includes payers the Medicaid measure excludes', () => {
    const all = filterCaseMixRoster(ROSTER, { population: 'payable', measure: 'allCmi' });
    const medicaid = filterCaseMixRoster(ROSTER, { population: 'payable', measure: 'medicaidCmi' });
    expect(all.rows.length).toBeGreaterThan(medicaid.rows.length);
    expect(ids(all)).toContain('b');
    // PA1 is scoreable and payer-admitted; the state's exclusion is upstream of here.
    expect(ids(all)).toContain('c');
  });

  it('composes both axes rather than letting one win', () => {
    expect(ids(filterCaseMixRoster(ROSTER, { population: 'capture', measure: 'medicaidCmi' })))
      .toEqual(['a']);
  });

  it('reports the scoreable size of the population, not of the measure', () => {
    const out = filterCaseMixRoster(ROSTER, { population: 'capture', measure: 'medicaidCmi' });
    expect(out.rows.length).toBe(1); // just 'a'
    expect(out.scoreable).toBe(2); // 'a' and 'b' are both in the capture population
  });

  it('falls back to the payable Medicaid view for nonsense arguments', () => {
    const bogus = filterCaseMixRoster(ROSTER, { population: 'sideways', measure: 'vibes' });
    const canonical = filterCaseMixRoster(ROSTER, { population: 'payable', measure: 'medicaidCmi' });
    expect(ids(bogus)).toEqual(ids(canonical));
  });

  it('survives a non-array', () => {
    expect(filterCaseMixRoster(null).rows).toEqual([]);
    expect(filterCaseMixRoster(undefined).unscoreable).toBe(0);
  });
});

describe('describeCaseMixPopulation', () => {
  it('says which population AND which payers in one sentence', () => {
    const capture = describeCaseMixPopulation('capture', 'medicaidCmi');
    expect(capture).toMatch(/INSIDE this quarter/);
    expect(capture).toMatch(/not the score your state publishes/);

    const payable = describeCaseMixPopulation('payable', 'medicaidCmi', {
      boundaryLabel: 'Picture date',
    });
    expect(payable).toMatch(/picture date/);
    expect(payable).toMatch(/what the state pays on/);
  });

  /** Never name a state's rule for a state whose rule we have not read — the
   *  server sends the label it is allowed to use, and this must honour it. */
  it('falls back to neutral wording without a verified boundary label', () => {
    expect(describeCaseMixPopulation('payable', 'allCmi')).toMatch(/quarter end/);
    expect(describeCaseMixPopulation('payable', 'allCmi')).not.toMatch(/picture date/);
  });

  it('changes with the measure, not just the population', () => {
    const a = describeCaseMixPopulation('payable', 'medicaidCmi');
    const b = describeCaseMixPopulation('payable', 'allCmi');
    const c = describeCaseMixPopulation('payable', 'medicaidWithPendingCmi');
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
