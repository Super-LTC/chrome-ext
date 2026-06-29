import { describe, test, expect } from 'vitest';
import { sectionIBadgeLabel } from '../mds-badge.js';

describe('sectionIBadgeLabel', () => {
  test('code status → "Code it"', () => {
    expect(sectionIBadgeLabel({ status: 'code' })).toBe('Code it');
  });

  test('needs_physician_query → "Query needed" (treatment found, diagnosis undocumented)', () => {
    expect(
      sectionIBadgeLabel({ status: 'needs_physician_query', diagnosisPassed: false, activeStatusPassed: true })
    ).toBe('Query needed');
  });

  test('needs_review with treatment present but no diagnosis → "Diagnosis needed"', () => {
    expect(
      sectionIBadgeLabel({ status: 'needs_review', diagnosisPassed: false, activeStatusPassed: true })
    ).toBe('Diagnosis needed');
  });

  test('needs_review with diagnosis present but no treatment → "Treatment needed"', () => {
    expect(
      sectionIBadgeLabel({ status: 'needs_review', diagnosisPassed: true, activeStatusPassed: false })
    ).toBe('Treatment needed');
  });

  test('needs_review with neither diagnosis nor treatment → "Evidence needed"', () => {
    expect(
      sectionIBadgeLabel({ status: 'needs_review', diagnosisPassed: false, activeStatusPassed: false })
    ).toBe('Evidence needed');
  });

  test('needs_review with unknown gates → generic "Needs review"', () => {
    expect(
      sectionIBadgeLabel({ status: 'needs_review', diagnosisPassed: null, activeStatusPassed: null })
    ).toBe('Needs review');
  });

  test('dont_code → null (caller shows plain No)', () => {
    expect(sectionIBadgeLabel({ status: 'dont_code' })).toBeNull();
  });

  test('unknown / missing status → null', () => {
    expect(sectionIBadgeLabel({})).toBeNull();
    expect(sectionIBadgeLabel({ status: 'error' })).toBeNull();
  });

  test('tolerates being called with no argument', () => {
    expect(sectionIBadgeLabel()).toBeNull();
  });
});
