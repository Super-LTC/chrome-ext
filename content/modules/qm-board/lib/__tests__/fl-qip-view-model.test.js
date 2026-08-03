import { describe, it, expect } from 'vitest';
import { inputsToForm, withInputs, toMeasureDetailQip } from '../fl-qip-view-model.js';

const base = (over = {}) => ({
  floor: 16.5,
  cmsOverallStar: 4,
  projectedMdsPoints: 14,
  officialMdsPoints: 12,
  rnTurnoverPctRn: 30,
  rnTurnoverPctTotal: 60,
  insufficientData: false,
  coding: { prognosis: [], flu: [] },
  measures: [],
  inputs: {},
  ...over,
});

const form = (over = {}) => ({
  hasAccreditation: false,
  directCareStaffingTier: null,
  socialWorkActivityStaffingTier: null,
  hospitalizationsPer1000: null,
  rnTurnoverSource: 'rn',
  ...over,
});

describe('inputsToForm', () => {
  it('resolves every field so the form is never undefined-driven', () => {
    expect(inputsToForm({})).toEqual({
      hasAccreditation: false,
      directCareStaffingTier: null,
      socialWorkActivityStaffingTier: null,
      hospitalizationsPer1000: null,
      rnTurnoverSource: 'rn',
    });
  });

  it('keeps a saved value, including a falsy one', () => {
    // `0` and `false` are real answers and must survive the ?? defaults.
    const f = inputsToForm({ hasAccreditation: false, hospitalizationsPer1000: 0 });
    expect(f.hasAccreditation).toBe(false);
    expect(f.hospitalizationsPer1000).toBe(0);
  });

  it('defaults the turnover source to RN', () => {
    expect(inputsToForm({}).rnTurnoverSource).toBe('rn');
    expect(inputsToForm({ rnTurnoverSource: 'total' }).rnTurnoverSource).toBe('total');
  });
});

describe('withInputs', () => {
  it('re-scores the non-MDS half and both totals', () => {
    const v = withInputs(base(), form({ hasAccreditation: true, directCareStaffingTier: 3 }));
    // 4★ = 3, accreditation = 5, tier 3 = 3, RN 30% → band 2 = 2 → 13
    expect(v.nonMds.total).toBe(13);
    expect(v.projectedTotalPoints).toBe(14 + 13);
    expect(v.officialTotalPoints).toBe(12 + 13);
  });

  it('switches the turnover figure with the source toggle', () => {
    // RN 30% lands in a better band than total 60%.
    const rn = withInputs(base(), form({ rnTurnoverSource: 'rn' }));
    const total = withInputs(base(), form({ rnTurnoverSource: 'total' }));
    expect(rn.rnTurnoverPct).toBe(30);
    expect(total.rnTurnoverPct).toBe(60);
    expect(rn.nonMds.rnTurnover).toBeGreaterThan(total.nonMds.rnTurnover);
  });

  // The guard that matters most on this path.
  it('never lets a no-MDS building flip to qualifying on a keystroke', () => {
    // Without mirroring the server's guard, typing a staffing tier pushes the
    // total past the floor and the card silently says "Qualifying" for a
    // building that has nothing to score.
    const v = withInputs(
      base({ insufficientData: true, projectedMdsPoints: 24 }),
      form({ hasAccreditation: true, directCareStaffingTier: 3, socialWorkActivityStaffingTier: 3 })
    );
    expect(v.projectedTotalPoints).toBeGreaterThan(v.floor);
    expect(v.projectedQualifying).toBe(false);
  });

  it('still lets the OFFICIAL track qualify — the guard is projection-only', () => {
    // Official is CMS's own published score; our MDS coverage doesn't bear on it.
    const v = withInputs(base({ insufficientData: true }), form({ hasAccreditation: true }));
    expect(v.officialQualifying).toBe(v.officialTotalPoints >= v.floor);
  });

  it('never reports a negative distance to the floor', () => {
    const v = withInputs(base({ projectedMdsPoints: 40 }), form({ hasAccreditation: true }));
    expect(v.projectedPointsToQualify).toBe(0);
  });

  it('reports the shortfall when under the floor', () => {
    // Nothing scores at all: no MDS points, no star, and no turnover figure —
    // a null turnover must not band, or the "nothing" fixture quietly earns 2.
    const v = withInputs(
      base({
        projectedMdsPoints: 0, officialMdsPoints: 0,
        cmsOverallStar: null, rnTurnoverPctRn: null, rnTurnoverPctTotal: null,
      }),
      form()
    );
    expect(v.nonMds.total).toBe(0);
    expect(v.projectedPointsToQualify).toBeCloseTo(16.5);
  });

  it('carries the coding harvest through untouched', () => {
    // Non-MDS edits do not affect coding, and dropping it here would blank the
    // panel every time someone types.
    const b = base({ coding: { prognosis: [{ patientId: 'p1' }], flu: [] } });
    expect(withInputs(b, form()).coding).toBe(b.coding);
  });

  it('writes the working form back onto inputs so a re-open shows the edit', () => {
    const f = form({ directCareStaffingTier: 2 });
    expect(withInputs(base(), f).inputs).toEqual(f);
    // A copy, not the same reference — later edits must not mutate what we stored.
    expect(withInputs(base(), f).inputs).not.toBe(f);
  });

  it('does not mutate the payload it was given', () => {
    const b = base();
    withInputs(b, form({ hasAccreditation: true }));
    expect(b.projectedTotalPoints).toBeUndefined();
    expect(b.nonMds).toBeUndefined();
  });
});

describe('toMeasureDetailQip', () => {
  const whatIf = {
    measureId: 'uti',
    projectedNum: 4,
    projectedDen: 80,
    lockedNum: 2,
    currentPoints: 2,
    improvementPct: 12,
    baseTotalPoints: 27,
    floor: 16.5,
    adjusted: false,
  };

  it('maps num and den without transposing them', () => {
    // The whole reason this is a function: a swap here inverts the rate and
    // nothing downstream notices.
    const q = toMeasureDetailQip(whatIf);
    expect(q.num).toBe(4);
    expect(q.den).toBe(80);
    expect(q.locked).toBe(2);
  });

  it('renames `adjusted` to `deferred`', () => {
    // MeasureDetail suppresses the point estimate on `deferred`. Lose this and a
    // measure CMS scores starts offering a what-if it has no right to.
    expect(toMeasureDetailQip({ ...whatIf, adjusted: true }).deferred).toBe(true);
    expect(toMeasureDetailQip(whatIf).deferred).toBe(false);
  });

  it('carries the improvement percent so the 0.5 rule survives the recompute', () => {
    expect(toMeasureDetailQip(whatIf).improvementPct).toBe(12);
  });

  it('leaves priorYearRate/direction absent so MeasureDetail falls back', () => {
    // They are an optional refinement the server shape does not carry; undefined
    // makes flQipImprovementPct return null and the supplied percent is used.
    const q = toMeasureDetailQip(whatIf);
    expect(q.priorYearRate).toBeUndefined();
    expect(q.direction).toBeUndefined();
  });

  it('passes through a missing what-if rather than fabricating one', () => {
    expect(toMeasureDetailQip(undefined)).toBeUndefined();
    expect(toMeasureDetailQip(null)).toBeUndefined();
  });
});
