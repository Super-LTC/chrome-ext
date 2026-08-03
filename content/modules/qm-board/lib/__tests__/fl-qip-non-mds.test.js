/**
 * The non-MDS half of the FL QIP score.
 *
 * This is the one place in the whole port where the browser recomputes a
 * customer-visible NUMBER rather than rendering one the server produced. The
 * bands and the tier mapping are Florida's, not ours, so these tests pin the
 * ported values against the source rather than against how the UI happens to
 * behave — inferring band logic from the screen is how a projection quietly
 * stops matching the state's.
 */
import { describe, it, expect } from 'vitest';
import {
  scoreFlNonMds,
  scoreFiveStar,
  scoreAccreditation,
  scoreStaffingTier,
  FL_HOSPITALIZATIONS_BAND,
  FL_RN_TURNOVER_BAND,
} from '../fl-qip-non-mds.js';
import {
  FL_QIP_PROGNOSIS_KIND,
  FL_QIP_FLU_KIND,
  FL_QIP_DISMISSAL_KINDS,
} from '../fl-qip-coding-kinds.js';

const inputs = (over = {}) => ({
  cmsOverallStar: null,
  hasAccreditation: false,
  directCareStaffingTier: null,
  socialWorkActivityStaffingTier: null,
  hospitalizationsPer1000: null,
  rnTurnoverPct: null,
  ...over,
});

describe('scoreFiveStar', () => {
  it('maps stars to FL points — 3★=1, 4★=3, 5★=5', () => {
    expect(scoreFiveStar(5)).toBe(5);
    expect(scoreFiveStar(4)).toBe(3);
    expect(scoreFiveStar(3)).toBe(1);
  });

  it('scores nothing below 3★', () => {
    expect(scoreFiveStar(2)).toBe(0);
    expect(scoreFiveStar(1)).toBe(0);
  });

  it('treats an unknown star as 0, not as a failure', () => {
    expect(scoreFiveStar(null)).toBe(0);
  });
});

describe('scoreAccreditation / scoreStaffingTier', () => {
  it('gives a flat 5 for any qualifying accreditation', () => {
    expect(scoreAccreditation(true)).toBe(5);
    expect(scoreAccreditation(false)).toBe(0);
  });

  it('maps a staffing tier straight to its point value', () => {
    expect(scoreStaffingTier(3)).toBe(3);
    expect(scoreStaffingTier(2)).toBe(2);
    expect(scoreStaffingTier(1)).toBe(1);
    expect(scoreStaffingTier(null)).toBe(0);
  });
});

describe('band thresholds match the frozen SFY2028 table', () => {
  // Pinned as VALUES, because a silent edit here moves every facility's
  // projection with nothing else going red.
  it('hospitalizations, lower-better', () => {
    expect(FL_HOSPITALIZATIONS_BAND).toEqual({ t3: 1.27, t2: 1.71, t1: 2.18, direction: 'lower_better' });
  });

  it('RN turnover, lower-better', () => {
    expect(FL_RN_TURNOVER_BAND).toEqual({ t3: 27.8, t2: 39.55, t1: 52.4, direction: 'lower_better' });
  });
});

describe('scoreFlNonMds', () => {
  it('scores a facility with nothing known as 0, and lists what is missing', () => {
    const r = scoreFlNonMds(inputs());
    expect(r.total).toBe(0);
    // Accreditation is deliberately NOT "missing": false is a real answer, and
    // prompting for it would imply we don't know when we do.
    expect(r.missing).toEqual([
      'cms_5_star',
      'direct_care_staffing',
      'social_work_activity_staffing',
      'hospitalizations',
      'rn_turnover',
    ]);
  });

  it('sums every component', () => {
    const r = scoreFlNonMds(inputs({
      cmsOverallStar: 5,                    // 5
      hasAccreditation: true,               // 5
      directCareStaffingTier: 3,            // 3
      socialWorkActivityStaffingTier: 2,    // 2
      hospitalizationsPer1000: 1.0,         // ≤1.27 → 3
      rnTurnoverPct: 20,                    // ≤27.8 → 3
    }));
    expect(r).toMatchObject({
      fiveStar: 5, accreditation: 5, directCareStaffing: 3,
      socialWorkActivityStaffing: 2, hospitalizations: 3, rnTurnover: 3,
    });
    expect(r.total).toBe(21);
    expect(r.missing).toEqual([]);
  });

  it('bands hospitalizations lower-better across all four tiers', () => {
    const at = (v) => scoreFlNonMds(inputs({ hospitalizationsPer1000: v })).hospitalizations;
    expect(at(1.27)).toBe(3);   // on the best threshold — inclusive
    expect(at(1.71)).toBe(2);
    expect(at(2.18)).toBe(1);
    expect(at(2.19)).toBe(0);   // past entry
  });

  it('bands RN turnover lower-better', () => {
    const at = (v) => scoreFlNonMds(inputs({ rnTurnoverPct: v })).rnTurnover;
    expect(at(27.8)).toBe(3);
    expect(at(39.55)).toBe(2);
    expect(at(52.4)).toBe(1);
    expect(at(60)).toBe(0);
  });

  it('scores a missing band input as 0 without banding null', () => {
    // A null must not fall through to the lower-better comparison, where it
    // would coerce to 0 and score the BEST band for having no data at all.
    const r = scoreFlNonMds(inputs({ hospitalizationsPer1000: null, rnTurnoverPct: null }));
    expect(r.hospitalizations).toBe(0);
    expect(r.rnTurnover).toBe(0);
  });
});

describe('dismissal kinds are the wire format', () => {
  it('uses the exact namespaced strings the POST validates against', () => {
    // The endpoint 400s on anything else — including a plausible
    // `fl_qip_prognosis` or `flQip:prognosis`.
    expect(FL_QIP_PROGNOSIS_KIND).toBe('fl_qip:prognosis');
    expect(FL_QIP_FLU_KIND).toBe('fl_qip:flu');
  });

  it('keeps the set in sync with the two constants', () => {
    expect([...FL_QIP_DISMISSAL_KINDS].sort()).toEqual(['fl_qip:flu', 'fl_qip:prognosis']);
  });
});
