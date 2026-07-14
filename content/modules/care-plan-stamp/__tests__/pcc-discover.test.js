// content/modules/care-plan-stamp/__tests__/pcc-discover.test.js
//
// The REAL focus id is the SECOND arg of editNeed(<instanceId>, <needId>). Verified
// against the backend care-plan API: writing goals/interventions to the first arg returns
// an id but silently no-ops; the second arg is the focus they persist under.
import { describe, it, expect } from 'vitest';
import { parseEditNeedFocusId } from '../pcc-discover.js';

describe('parseEditNeedFocusId — second arg is the real focus id', () => {
  it('grabs the SECOND arg (the persisting focus id)', () => {
    expect(parseEditNeedFocusId('javascript:editNeed(619956,619955)')).toBe('619955');
    expect(parseEditNeedFocusId('javascript:editNeed(619786, 619974)')).toBe('619974');
  });
  it('tolerates quotes and whitespace', () => {
    expect(parseEditNeedFocusId("editNeed( '111' , '222' )")).toBe('222');
  });
  it('falls back to the only arg when there is one', () => {
    expect(parseEditNeedFocusId('editNeed(12345)')).toBe('12345');
  });
  it('returns null when there is no editNeed', () => {
    expect(parseEditNeedFocusId('editGoal(9)')).toBeNull();
    expect(parseEditNeedFocusId('')).toBeNull();
    expect(parseEditNeedFocusId(null)).toBeNull();
  });
});
