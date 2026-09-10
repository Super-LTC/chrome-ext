// content/__tests__/survey-mode-contract.test.js
//
// The wire contract with the backend. These are two repos that ship
// separately, so nothing but a test stops one side renaming a string the other
// side matches on — and that failure would be silent in the worst possible
// way: the overlay falls through to its normal error path and renders
// "Super LTC couldn't load: Facility not found" on a surveyor's screen, which
// is exactly what survey mode exists to prevent.
//
// Backend side of the contract (superapp):
//   core/utils/survey-mode.ts              SURVEY_MODE_CODE = 'SURVEY_MODE'
//   web/lib/extension-facility-access.ts   404 { success:false, error, code }
//   web/lib/surveyor-block.ts              403 { success:false, error, code }
//   web/lib/surveyor-block.ts              'x-pcc-username', 'x-pcc-identity-pending'
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pccIdentityHeaders,
  PCC_USERNAME_HEADER,
  PCC_PENDING_HEADER,
} from '../../background/pcc-identity-headers.js';

const overlaySrc = readFileSync(join(process.cwd(), 'content/mds-overlay.js'), 'utf8');

describe('survey-mode wire contract', () => {
  it('matches on the exact body code the backend sends', () => {
    expect(overlaySrc).toContain("error?.body?.code === 'SURVEY_MODE'");
  });

  // The overlay only sees `code` because fetchSectionData copies `body` off the
  // background's error envelope. Call sites that do a bare
  // `throw new Error(response.error)` lose it — which is why the check lives in
  // the section-fetch catch and nowhere else.
  it('the section fetch preserves the error body the check depends on', () => {
    expect(overlaySrc).toContain('err.body = response.body;');
  });

  it('renders nothing before any other fallback can draw', () => {
    const surveyAt = overlaySrc.indexOf("=== 'SURVEY_MODE'");
    const branches = [
      ['running', overlaySrc.indexOf('runningState?.(error)')],
      ['run-it', overlaySrc.indexOf('runnableCode?.(error)')],
      ['notice', overlaySrc.indexOf('SuperLoadingStatus.showNotice(`Super LTC')],
    ];
    expect(surveyAt).toBeGreaterThan(-1);
    for (const [name, at] of branches) {
      expect(at, `${name} branch missing`).toBeGreaterThan(-1);
      expect(surveyAt, `SURVEY_MODE must be checked before the ${name} branch`).toBeLessThan(at);
    }
  });
});

describe('header names the backend reads', () => {
  // The backend reads these lowercase through Headers.get, which is
  // case-insensitive — but the NAME itself has to match.
  it('sends the headers the backend looks for', () => {
    expect(PCC_USERNAME_HEADER.toLowerCase()).toBe('x-pcc-username');
    expect(PCC_PENDING_HEADER.toLowerCase()).toBe('x-pcc-identity-pending');
  });

  it('actually emits that header on a matching identity', () => {
    const h = pccIdentityHeaders({ pccUsername: 'epsurveyor2', esolUserId: '1' }, { esolUserId: '1' });
    expect(Object.keys(h).map((k) => k.toLowerCase())).toEqual(['x-pcc-username']);
  });
});
