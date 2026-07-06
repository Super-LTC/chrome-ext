import { describe, it, expect } from 'vitest';
import {
  directionLabel, verdictOf, categoryLabel, trendVerdict, fmtDate, gradeTone,
} from '../aide-scoring.js';

// deviation = peerAverage − aideScore:
//   < 0 → scored ABOVE peers → "less dep." (needs less help)
//   > 0 → scored BELOW peers → "more dep." (needs more help)

describe('directionLabel (roster row, dependence framing)', () => {
  it('no data / on-track / less-dep / more-dep — never a bare number or high/low', () => {
    expect(directionLabel(null)).toBe('no data');
    expect(directionLabel({ assessmentCount: 0 })).toBe('no data');
    expect(directionLabel({ assessmentCount: 5, isSignificant: false })).toBe('on track');
    expect(directionLabel({ assessmentCount: 5, isSignificant: true, direction: 'above' })).toBe('less dep.');
    expect(directionLabel({ assessmentCount: 5, isSignificant: true, direction: 'below' })).toBe('more dep.');
  });
});

describe('verdictOf (one-line plain verdict + dot tone)', () => {
  it('slate when there is nothing to say yet', () => {
    expect(verdictOf(null)).toEqual({ line: 'Not enough scored assessments yet.', tone: 'slate' });
    expect(verdictOf({ assessmentCount: 0 }).tone).toBe('slate');
  });
  it('amber for inconsistent, before direction is even considered', () => {
    const v = verdictOf({ assessmentCount: 9, isHighVariance: true, isSignificant: true, direction: 'above' });
    expect(v.tone).toBe('amber');
    expect(v.line).toMatch(/inconsistent/i);
  });
  it('emerald when in line with the team', () => {
    expect(verdictOf({ assessmentCount: 9, isSignificant: false }).tone).toBe('emerald');
  });
  it('sky = less dependent, rose = more dependent', () => {
    expect(verdictOf({ assessmentCount: 9, isSignificant: true, direction: 'above' }).tone).toBe('sky');
    expect(verdictOf({ assessmentCount: 9, isSignificant: true, direction: 'below' }).tone).toBe('rose');
  });
});

describe('categoryLabel (magnitude spoken in the word)', () => {
  it('on track when not significant', () => {
    expect(categoryLabel(2.0, false)).toEqual({ word: 'on track', tone: 'emerald' });
  });
  it('less dep. (sky) when scored above peers; magnitude prefix by size', () => {
    expect(categoryLabel(-1.0, true)).toEqual({ word: 'a bit less dep.', tone: 'sky' }); // <1.3
    expect(categoryLabel(-2.0, true)).toEqual({ word: 'less dep.', tone: 'sky' });        // 1.3–2.3
    expect(categoryLabel(-3.0, true)).toEqual({ word: 'way less dep.', tone: 'sky' });     // >2.3
  });
  it('more dep. (rose) when scored below peers', () => {
    expect(categoryLabel(1.0, true)).toEqual({ word: 'a bit more dep.', tone: 'rose' });
    expect(categoryLabel(3.0, true)).toEqual({ word: 'way more dep.', tone: 'rose' });
  });
});

describe('trendVerdict (early vs late accuracy)', () => {
  const wk = (d) => ({ weekStart: '2026-06-01', averageDeviation: d });
  it('improving when later weeks are closer to the team', () => {
    // early |dev| high (2), late |dev| low (0.2) → delta +1.8
    expect(trendVerdict([wk(2), wk(2), wk(0.2), wk(0.2)]).word).toBe('Yes, improving');
  });
  it('drifting when later weeks are further from the team', () => {
    expect(trendVerdict([wk(0.2), wk(0.2), wk(2), wk(2)]).word).toBe('Drifting further');
  });
  it('holding steady within the ±0.3 band', () => {
    expect(trendVerdict([wk(1), wk(1), wk(1), wk(1)]).word).toBe('Holding steady');
  });
});

describe('fmtDate (UTC-safe, no timezone drift)', () => {
  it('formats a YYYY-MM-DD to "Mon D"', () => {
    expect(fmtDate('2026-06-28')).toBe('Jun 28');
    expect(fmtDate('2026-01-01T00:00:00Z')).toBe('Jan 1');
  });
  it('returns the input unchanged when unparseable', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date');
  });
});

describe('gradeTone', () => {
  it('maps A–F to the report-card palette', () => {
    expect(gradeTone('A')).toBe('emerald');
    expect(gradeTone('B+')).toBe('teal');
    expect(gradeTone('C')).toBe('amber');
    expect(gradeTone('D-')).toBe('orange');
    expect(gradeTone('F')).toBe('rose');
  });
});
