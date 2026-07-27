// content/modules/pcc-identity/__tests__/index.test.js
//
// Orchestration for PCC identity capture. Network and chrome.storage are
// injected so the control flow can be exercised for real.
//
// The rule that shapes most of this: capture is fire-and-forget — nothing
// user-facing depends on it — so every failure path must be silent AND must
// leave the cache untouched, so the next boot retries. A failure that writes
// the cache anyway would suppress retries for a week.
import { describe, it, expect, vi } from 'vitest';
import { getEsolUserId } from '../capture.js';
import { captureIdentity } from '../index.js';

const PROFILE_HTML =
  '<td class="data">eac.<input name="login_name" readonly value="jcameron"></td>';

function makeDeps(overrides = {}) {
  return {
    esolUserId: '149836',
    superUserId: 'super-1',
    orgSlug: 'eac',
    now: 1_700_000_000_000,
    loadCache: vi.fn(async () => null),
    saveCache: vi.fn(async () => {}),
    fetchProfile: vi.fn(async () => PROFILE_HTML),
    postUsername: vi.fn(async () => ({ success: true, changed: true })),
    ...overrides,
  };
}

describe('getEsolUserId', () => {
  it('reads the id from the Edit Profile link in the user menu', () => {
    // Verbatim shape from a live PCC page.
    document.body.innerHTML =
      '<ul><li><a href="javascript:editUserProfile(\'/home/editmyprofile.jsp?ESOLuserid=418636&retURL=/home/home.jsp\');">Edit Profile</a></li></ul>';
    expect(getEsolUserId(document)).toBe('418636');
  });

  it('falls back to the inline userId global when the menu is absent', () => {
    document.body.innerHTML = '<script>var cfg = { userId: 418636, foo: 1 };</script>';
    expect(getEsolUserId(document)).toBe('418636');
  });

  it('ignores the blank userId form PCC also emits', () => {
    // Real pages carry `userId: ''.trim()` alongside the populated one.
    document.body.innerHTML = "<script>var cfg = { userId: ''.trim() };</script>";
    expect(getEsolUserId(document)).toBeNull();
  });

  it('returns null on a page with no user chrome', () => {
    document.body.innerHTML = '<div>no user menu here</div>';
    expect(getEsolUserId(document)).toBeNull();
  });
});

describe('captureIdentity', () => {
  it('posts the username verbatim and caches the binding', async () => {
    const deps = makeDeps();
    const result = await captureIdentity(deps);

    expect(deps.postUsername).toHaveBeenCalledWith({ pccUsername: 'jcameron', orgSlug: 'eac' });
    expect(deps.saveCache).toHaveBeenCalledWith({
      superUserId: 'super-1',
      esolUserId: '149836',
      orgSlug: 'eac',
      pccUsername: 'jcameron',
      postedAt: deps.now,
    });
    expect(result.posted).toBe(true);
  });

  it('does not fetch when a fresh binding is already cached', async () => {
    const deps = makeDeps({
      loadCache: vi.fn(async () => ({
        superUserId: 'super-1',
        esolUserId: '149836',
        orgSlug: 'eac',
        pccUsername: 'jcameron',
        postedAt: 1_700_000_000_000 - 1000,
      })),
    });
    const result = await captureIdentity(deps);

    expect(deps.fetchProfile).not.toHaveBeenCalled();
    expect(deps.postUsername).not.toHaveBeenCalled();
    expect(result.posted).toBe(false);
  });

  it('does nothing on a page with no user chrome', async () => {
    const deps = makeDeps({ esolUserId: null });
    await captureIdentity(deps);

    expect(deps.fetchProfile).not.toHaveBeenCalled();
    expect(deps.postUsername).not.toHaveBeenCalled();
    expect(deps.saveCache).not.toHaveBeenCalled();
  });

  it('refuses to post a value that fails the shape guard', async () => {
    // If the parse ever drifts onto the adjacent display-name field, binding
    // "Jonathan Cameron" would be worse than binding nothing.
    const deps = makeDeps({
      fetchProfile: vi.fn(async () => '<input name="login_name" value="Jonathan Cameron">'),
    });
    await captureIdentity(deps);

    expect(deps.postUsername).not.toHaveBeenCalled();
    expect(deps.saveCache).not.toHaveBeenCalled();
  });

  it('refuses to post when the field is missing entirely', async () => {
    const deps = makeDeps({ fetchProfile: vi.fn(async () => '<div>redesigned page</div>') });
    await captureIdentity(deps);

    expect(deps.postUsername).not.toHaveBeenCalled();
    expect(deps.saveCache).not.toHaveBeenCalled();
  });

  it('leaves the cache alone when the POST fails, so the next boot retries', async () => {
    const deps = makeDeps({
      postUsername: vi.fn(async () => { throw new Error('Session expired'); }),
    });
    const result = await captureIdentity(deps);

    expect(deps.saveCache).not.toHaveBeenCalled();
    expect(result.posted).toBe(false);
  });

  it('swallows a PCC session-expired fetch failure', async () => {
    const deps = makeDeps({
      fetchProfile: vi.fn(async () => { throw new Error('PCC session expired'); }),
    });

    await expect(captureIdentity(deps)).resolves.toBeTruthy();
    expect(deps.saveCache).not.toHaveBeenCalled();
  });

  it('posts without orgSlug rather than not at all', async () => {
    // orgSlug is optional per the contract — the backend falls back to the
    // user's selected org. A missing CORE.org_code shouldn't cost us a binding.
    const deps = makeDeps({ orgSlug: '' });
    await captureIdentity(deps);

    expect(deps.postUsername).toHaveBeenCalledWith({ pccUsername: 'jcameron' });
  });
});
