import { describe, it, expect } from 'vitest';
import {
  pccDateToIso,
  isoToPccDate,
  deriveDescription,
  deriveA0310g,
  buildCoverageQuery,
} from './coverage-query.js';

describe('pccDateToIso', () => {
  it('converts M/D/YYYY to YYYY-MM-DD', () => {
    expect(pccDateToIso('6/14/2026')).toBe('2026-06-14');
  });
  it('converts MM/DD/YYYY to YYYY-MM-DD', () => {
    expect(pccDateToIso('06/04/2026')).toBe('2026-06-04');
  });
  it('returns null for invalid input', () => {
    expect(pccDateToIso('')).toBe(null);
    expect(pccDateToIso('garbage')).toBe(null);
  });
});

describe('isoToPccDate', () => {
  it('strips leading zeros to M/D/YYYY', () => {
    expect(isoToPccDate('2026-06-04')).toBe('6/4/2026');
    expect(isoToPccDate('2026-12-15')).toBe('12/15/2026');
  });
  it('returns null for invalid input', () => {
    expect(isoToPccDate('')).toBe(null);
    expect(isoToPccDate('6/4/2026')).toBe(null);
  });
});

describe('deriveDescription', () => {
  it('5-Day PPS when A0310B=01', () => {
    expect(deriveDescription({ a0310b: '01' })).toBe('Medicare - 5 Day');
  });
  it('IPA when A0310B=08', () => {
    expect(deriveDescription({ a0310b: '08' })).toBe('Medicare - IPA');
  });
  it('OBRA reason wins when no PPS (Quarterly)', () => {
    expect(deriveDescription({ a0310a: '02', a0310b: '99' })).toBe('Quarterly');
  });
  it('Annual', () => {
    expect(deriveDescription({ a0310a: '03', a0310b: '99' })).toBe('Annual');
  });
  it('Admission', () => {
    expect(deriveDescription({ a0310a: '01', a0310b: '99' })).toBe('Admission');
  });
  it('Discharge return not anticipated', () => {
    expect(deriveDescription({ a0310a: '99', a0310b: '99', a0310f: '10' })).toBe('Discharge - return not anticipated');
  });
  it('empty when nothing meaningful chosen', () => {
    expect(deriveDescription({ a0310a: '99', a0310b: '99', a0310f: '99' })).toBe('');
  });
});

describe('deriveA0310g', () => {
  it('maps planned/unplanned codes to handoff format', () => {
    expect(deriveA0310g('1')).toBe('1. Planned');
    expect(deriveA0310g('2')).toBe('2. Unplanned');
  });
  it('returns undefined when unset / placeholder', () => {
    expect(deriveA0310g('')).toBe(undefined);
    expect(deriveA0310g('-1')).toBe(undefined);
    expect(deriveA0310g('^')).toBe(undefined);
  });
});

describe('buildCoverageQuery', () => {
  const form = {
    patientId: '840913', facilityName: 'BURLINGTON HEALTH', orgSlug: 'champ',
    ard: '6/24/2026', a0310a: '02', a0310b: '99', a0310c: '', a0310f: '99', a0310g: '',
  };
  it('builds the documented params', () => {
    const q = buildCoverageQuery(form);
    expect(q).toMatchObject({
      patientExternalId: '840913',
      facilityName: 'BURLINGTON HEALTH',
      orgSlug: 'champ',
      ardDate: '2026-06-24',
      description: 'Quarterly',
    });
    expect(q.a0310g).toBeUndefined();
    expect(q.a0310a).toBe('02');
  });
  it('includes a0310g when planned/unplanned set', () => {
    const q = buildCoverageQuery({ ...form, a0310f: '10', a0310g: '1' });
    expect(q.a0310g).toBe('1. Planned');
  });
  it('returns null when ARD is unparseable (nothing to query yet)', () => {
    expect(buildCoverageQuery({ ...form, ard: '' })).toBe(null);
  });
});
