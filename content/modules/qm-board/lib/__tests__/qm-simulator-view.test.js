/**
 * Ported from superltc `qm-simulator-view.test.ts`.
 *
 * `groupLever` was in the bundle with no test on this side — the what-if
 * simulator's whole arithmetic, unpinned. Porting the suite doubles as a drift
 * check: if our implementation had diverged, these would say so.
 */
import { describe, it, expect } from 'vitest';
import { groupLever } from '../qm-simulator-view.js';

// Linear scorer: lower rate = more points (QM measures are lower-is-better).
const pointsAt = (rate) => (1 - rate) * 100;

describe('groupLever', () => {
  it('counts movable switches and the points freed by clearing them all', () => {
    const g = groupLever({ numNow: 4, denNow: 20, movableCurrent: 3, crossersTotal: 0, crossersPreventable: 0, pointsAt });
    // worst 4/20=20%→80pts, best 1/20=5%→95pts → +15
    expect(g.movableCount).toBe(3);
    expect(g.potentialPts).toBe(15);
  });

  it('folds preventable crossers into both the count and the potential', () => {
    const g = groupLever({ numNow: 4, denNow: 20, movableCurrent: 3, crossersTotal: 2, crossersPreventable: 1, pointsAt });
    // den 22; worst (4+2)/22→72.7; best (max(0,1)+1)/22=2/22→90.9 → +18
    expect(g.movableCount).toBe(4); // 3 movable + 1 preventable crosser
    expect(g.potentialPts).toBe(18);
  });

  it('never goes negative when movable exceeds current triggers', () => {
    const g = groupLever({ numNow: 2, denNow: 10, movableCurrent: 5, crossersTotal: 0, crossersPreventable: 0, pointsAt });
    // best clamps numerator at 0 → 100pts; worst 2/10=20%→80 → +20
    expect(g.potentialPts).toBe(20);
    expect(g.movableCount).toBe(5);
  });

  it('zero denominator → zero potential, count still reflects switches', () => {
    const g = groupLever({ numNow: 0, denNow: 0, movableCurrent: 0, crossersTotal: 0, crossersPreventable: 2, pointsAt });
    expect(g.potentialPts).toBe(0);
    expect(g.movableCount).toBe(2);
  });
});
