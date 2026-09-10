// background/__tests__/pcc-identity-headers.test.js
//
// Every extension API call reports which PointClickCare account is driving it,
// so the backend can refuse survey logins (Euclid, 2026-09-09: state surveyors
// read the MDS overlay off a workstation the extension was signed into).
//
// The subtle rule is the staleness comparison. `chrome.storage.local` is per
// browser PROFILE, so the cached username belongs to whoever used PCC last.
// Sending it unconditionally would label a surveyor's session with the nurse's
// name — the exact misattribution the block exists to catch.
import { describe, it, expect } from 'vitest';
import {
  pccIdentityHeaders,
  PCC_USERNAME_HEADER,
  PCC_PENDING_HEADER,
} from '../pcc-identity-headers.js';

const identity = (pccUsername, esolUserId) => ({ pccUsername, esolUserId });

describe('pccIdentityHeaders', () => {
  it('sends the username when the binding matches the PCC session on screen', () => {
    expect(pccIdentityHeaders(identity('rbierbaum', '418636'), { esolUserId: '418636' })).toEqual({
      [PCC_USERNAME_HEADER]: 'rbierbaum',
    });
  });

  it('sends a surveyor username so the backend can refuse it', () => {
    expect(pccIdentityHeaders(identity('epsurveyor2', '99'), { esolUserId: '99' })).toEqual({
      [PCC_USERNAME_HEADER]: 'epsurveyor2',
    });
  });

  // 🔥 The core safety property. A surveyor signs into PCC on the nurse's
  // machine: the cached binding still says the nurse. Sending it would both
  // misattribute the session AND let the surveyor through on her clean name.
  it('never sends a username belonging to a DIFFERENT PCC account', () => {
    const headers = pccIdentityHeaders(identity('dpyatt', '418636'), { esolUserId: '777777' });
    expect(headers[PCC_USERNAME_HEADER]).toBeUndefined();
    expect(headers).toEqual({ [PCC_PENDING_HEADER]: '1' });
  });

  it('says nothing at all when no binding has been captured yet', () => {
    expect(pccIdentityHeaders(null, { esolUserId: '418636' })).toEqual({});
    expect(pccIdentityHeaders(undefined, { esolUserId: '418636' })).toEqual({});
    expect(pccIdentityHeaders({ esolUserId: '418636' }, { esolUserId: '418636' })).toEqual({});
  });

  // Chrome-less PCC iframes have no user menu, so no esolUserId is published.
  // Freshness is unknowable there — say nothing rather than guess.
  it('says nothing when the page published no PCC account id', () => {
    expect(pccIdentityHeaders(identity('rbierbaum', '418636'), null)).toEqual({});
    expect(pccIdentityHeaders(identity('rbierbaum', '418636'), {})).toEqual({});
  });

  it('compares ids exactly — no coercion across string/number', () => {
    expect(pccIdentityHeaders(identity('x', '418636'), { esolUserId: 418636 })).toEqual({
      [PCC_PENDING_HEADER]: '1',
    });
  });
});

describe('rollback compatibility', () => {
  // Either side can ship or revert alone. The headers are additive: an older
  // backend ignores them, and a newer backend treats "no username" as no
  // opinion and allows the request.
  it('produces only additive headers, never a directive', () => {
    const all = [
      pccIdentityHeaders(identity('rbierbaum', '1'), { esolUserId: '1' }),
      pccIdentityHeaders(identity('dpyatt', '1'), { esolUserId: '2' }),
      pccIdentityHeaders(null, null),
    ];
    for (const h of all) {
      for (const k of Object.keys(h)) expect(k.startsWith('X-PCC-')).toBe(true);
    }
  });

  it('an extension with no captured identity behaves exactly like the old build', () => {
    expect(pccIdentityHeaders(null, null)).toEqual({});
  });
});
