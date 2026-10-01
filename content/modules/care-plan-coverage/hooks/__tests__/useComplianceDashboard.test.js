import { describe, it, expect } from 'vitest';
import { isCarePlanDisabledResponse } from '../useComplianceDashboard.js';

/**
 * Only the server's explicit "care plans are off here" hides the Care Plan +
 * Rounding tabs. Every other failure keeps the tab and its error box, so a 5xx
 * or a network blip never makes the feature vanish for a building that has it.
 */
describe('isCarePlanDisabledResponse', () => {
  it('403 + CARE_PLAN_DISABLED → disabled', () => {
    expect(
      isCarePlanDisabledResponse({ success: false, status: 403, body: { code: 'CARE_PLAN_DISABLED' } })
    ).toBe(true);
  });

  it('a 403 without the code (per-user grant) is not "disabled"', () => {
    expect(isCarePlanDisabledResponse({ success: false, status: 403, body: { error: 'Forbidden' } })).toBe(false);
    expect(isCarePlanDisabledResponse({ success: false, status: 403, body: null })).toBe(false);
  });

  it('5xx, transport errors and successes are not "disabled"', () => {
    expect(isCarePlanDisabledResponse({ success: false, status: 500, body: { code: 'CARE_PLAN_DISABLED' } })).toBe(false);
    expect(isCarePlanDisabledResponse({ success: false, error: 'Could not establish connection' })).toBe(false);
    expect(isCarePlanDisabledResponse({ success: true, data: { patients: [] } })).toBe(false);
    expect(isCarePlanDisabledResponse(undefined)).toBe(false);
  });
});
