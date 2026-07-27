// content/modules/pcc-identity/__tests__/capture.test.js
//
// Captures the logged-in PCC login name so mds_assessments.created_by (a PCC
// username like `kmcdonald5`) can be joined to a Super user. It joins at 0%
// today; the extension is the only place both identities are visible at once.
//
// Two ways this silently corrupts the join, both pinned below:
//   1. PCC renders the org code as loose text OUTSIDE the input:
//        Login Name: eac.<input name="login_name" value="jcameron">
//      Sending `eac.jcameron` matches nothing. Send the input value only.
//   2. Dots inside the value are NOT a prefix — 22 of 895 prod usernames
//      contain one (`jennifer.russell1`, `Shawnia.Bennett.rn`). Zero orgs share
//      a leading token, so they're name separators and credential suffixes.
//      Normalizing them away would collide distinct people. Send verbatim.
import { describe, it, expect } from 'vitest';
import {
  parseEsolUserIdFromHref,
  parseLoginName,
  isValidPccUsername,
  shouldCapture,
} from '../capture.js';

describe('parseEsolUserIdFromHref', () => {
  // Present in the user menu on every PCC page — lets us detect an account
  // switch without paying for the profile fetch.
  it('pulls the id out of the editUserProfile href', () => {
    expect(
      parseEsolUserIdFromHref('/home/editmyprofile.jsp?ESOLuserid=418636&retURL=/home/home.jsp')
    ).toBe('418636');
  });

  it('tolerates the entity-escaped ampersand PCC emits in markup', () => {
    expect(
      parseEsolUserIdFromHref('/home/editmyprofile.jsp?ESOLuserid=149836&amp;retURL=/home/home.jsp')
    ).toBe('149836');
  });

  it('returns null when there is no id', () => {
    expect(parseEsolUserIdFromHref('/home/home.jsp')).toBeNull();
    expect(parseEsolUserIdFromHref('')).toBeNull();
    expect(parseEsolUserIdFromHref(null)).toBeNull();
  });
});

describe('parseLoginName', () => {
  // Verbatim from a real /home/editmyprofile.jsp response.
  const REAL_ROW = `
    <tr><td class="leftindex"><label id="longUsername-label">Long Username:</label></td>
    <td colspan="3" class="data"><input type="text" name="long_username" value="Jonathan Cameron" maxlength="50" readonly="readonly"></td></tr>
    <tr><td class="leftindex"><label id="loginname-label">Login Name:</label></td>
    <td colspan="3" class="data">eac.<input type="text" maxlength="10" size="10" name="login_name" id="id-login_name" readonly="readonly" value="jcameron"></td></tr>
    <tr><td class="leftindex"><label id="email-label">Email:</label></td>
    <td colspan="3" class="data"><input type="text" name="email" value="" size="30"></td></tr>
  `;

  it('reads the login name off the input', () => {
    expect(parseLoginName(REAL_ROW)).toBe('jcameron');
  });

  it('does NOT pick up the org-code text node sitting before the input', () => {
    // `eac.` is UI chrome. Prepending it breaks the join against created_by.
    expect(parseLoginName(REAL_ROW)).not.toContain('eac');
  });

  it('does not confuse the display name for the login name', () => {
    expect(parseLoginName(REAL_ROW)).not.toBe('Jonathan Cameron');
  });

  it('preserves dots inside the value', () => {
    // Real Millennial / Garden Springs values. Stripping the dot would merge
    // distinct nurses into one binding.
    const html = '<input name="login_name" value="jennifer.russell1">';
    expect(parseLoginName(html)).toBe('jennifer.russell1');
    const suffixed = '<input name="login_name" value="Shawnia.Bennett.rn">';
    expect(parseLoginName(suffixed)).toBe('Shawnia.Bennett.rn');
  });

  it('returns null when the field is absent or blank', () => {
    expect(parseLoginName('<input name="email" value="a@b.c">')).toBeNull();
    expect(parseLoginName('<input name="login_name" value="">')).toBeNull();
    expect(parseLoginName('<input name="login_name" value="   ">')).toBeNull();
    expect(parseLoginName('')).toBeNull();
  });
});

describe('isValidPccUsername', () => {
  // Fire-and-forget means a bad parse binds garbage silently, so guard the POST.
  it('accepts real prod shapes', () => {
    for (const u of ['jcameron', 'kmcdonald5', 'jkennedyBRNC', 'jennifer.russell1', 'Shawnia.Bennett.rn', 's.walker']) {
      expect(isValidPccUsername(u)).toBe(true);
    }
  });

  it('rejects anything with whitespace', () => {
    // The display-name field is the likeliest mis-parse; it always has a space.
    expect(isValidPccUsername('Jonathan Cameron')).toBe(false);
    expect(isValidPccUsername('jcameron ')).toBe(false);
  });

  it('rejects empty, over-long, and non-strings', () => {
    expect(isValidPccUsername('')).toBe(false);
    expect(isValidPccUsername('a')).toBe(false);
    expect(isValidPccUsername('x'.repeat(65))).toBe(false); // backend caps at 64
    expect(isValidPccUsername(null)).toBe(false);
    expect(isValidPccUsername(undefined)).toBe(false);
  });
});

describe('shouldCapture', () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const NOW = 1_700_000_000_000;
  const cached = {
    superUserId: 'super-1',
    esolUserId: '149836',
    orgSlug: 'eac',
    pccUsername: 'jcameron',
    postedAt: NOW - 1000,
  };
  const current = { superUserId: 'super-1', esolUserId: '149836', orgSlug: 'eac' };

  it('captures when nothing is cached', () => {
    expect(shouldCapture(null, current, NOW)).toBe(true);
    expect(shouldCapture(undefined, current, NOW)).toBe(true);
  });

  it('skips a fresh exact match', () => {
    expect(shouldCapture(cached, current, NOW)).toBe(false);
  });

  it('re-captures when a different PCC account is logged in', () => {
    // The gate has to key on esolUserId, which is free on the page — keying on
    // pccUsername would mean fetching the profile to discover the change,
    // which is the fetch the cache exists to avoid.
    expect(shouldCapture(cached, { ...current, esolUserId: '999999' }, NOW)).toBe(true);
  });

  it('re-captures when a different Super user is logged in', () => {
    // chrome.storage.local is per browser profile, not per Super user. Without
    // this, user A binds, logs out, user B logs in on the same machine and is
    // never bound at all.
    expect(shouldCapture(cached, { ...current, superUserId: 'super-2' }, NOW)).toBe(true);
  });

  it('re-captures after an org switch', () => {
    // The binding row is per user+org, so each org needs its own capture.
    expect(shouldCapture(cached, { ...current, orgSlug: 'gardensprings' }, NOW)).toBe(true);
  });

  it('re-captures once the cache goes stale', () => {
    // Keeps lastSeenAt a real liveness signal and picks up staff renames.
    expect(shouldCapture({ ...cached, postedAt: NOW - WEEK - 1 }, current, NOW)).toBe(true);
    expect(shouldCapture({ ...cached, postedAt: NOW - WEEK + 1000 }, current, NOW)).toBe(false);
  });

  it('captures when the cache is missing a timestamp', () => {
    expect(shouldCapture({ ...cached, postedAt: undefined }, current, NOW)).toBe(true);
  });

  it('does not capture without an esolUserId to key on', () => {
    // Chrome-less PCC iframes have no user menu; better to no-op than to bind
    // against a key we can't compare next time.
    expect(shouldCapture(null, { ...current, esolUserId: null }, NOW)).toBe(false);
  });
});
