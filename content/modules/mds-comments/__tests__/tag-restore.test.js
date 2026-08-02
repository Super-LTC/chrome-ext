import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearRestore,
  hydrateTagRestore,
  readRestore,
  sectionCodeForItem,
  sectionUrlFor,
  writeRestore,
  _test,
} from '../tag-restore.js';

const { KEY, onTargetSectionPage } = _test;

const PAYLOAD = {
  stage: 'switch',
  assessmentId: 'asm_1',
  externalAssessmentId: '2266385',
  mdsItem: 'I0200',
  mdsColumn: '',
  sectionCode: 'I',
  facilityName: 'Autumnwood',
  pccFacilityName: 'Autumnwood Care Center',
};

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
  history.replaceState({}, '', '/');
});

describe('sectionCodeForItem', () => {
  it('takes the letters, not the first letter', () => {
    // GG is a two-letter section. Slicing one character sends the user to
    // section G, which does not exist.
    expect(sectionCodeForItem('GG0130B1')).toBe('GG');
    expect(sectionCodeForItem('I0200')).toBe('I');
    expect(sectionCodeForItem('M1200')).toBe('M');
  });

  it('is empty for junk rather than guessing', () => {
    expect(sectionCodeForItem('')).toBe('');
    expect(sectionCodeForItem(null)).toBe('');
    expect(sectionCodeForItem('0200')).toBe('');
  });
});

describe('sectionUrlFor', () => {
  it('builds PCC’s section entry on the current pod', () => {
    // The origin is never hardcoded — customers are on different PCC pods.
    expect(sectionUrlFor(PAYLOAD)).toBe(
      `${window.location.origin}/clinical/mds3/section.xhtml?ESOLassessid=2266385&sectioncode=I`
    );
  });

  it('derives the section when the payload did not carry one', () => {
    const { sectionCode, ...rest } = PAYLOAD;
    expect(sectionUrlFor(rest)).toContain('sectioncode=I');
  });
});

describe('payload lifecycle', () => {
  it('round-trips', () => {
    writeRestore(PAYLOAD);
    expect(readRestore()).toMatchObject(PAYLOAD);
  });

  it('refuses a payload that cannot identify an item', () => {
    expect(writeRestore({ stage: 'switch' })).toBe(false);
    expect(readRestore()).toBeNull();
  });

  it('ignores an expired payload', () => {
    writeRestore(PAYLOAD);
    const stored = JSON.parse(sessionStorage.getItem(KEY));
    sessionStorage.setItem(KEY, JSON.stringify({ ...stored, expiresAt: Date.now() - 1 }));
    expect(readRestore()).toBeNull();
  });

  it('ignores a payload written by a different version', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...PAYLOAD, version: 99, expiresAt: Date.now() + 1000 }));
    expect(readRestore()).toBeNull();
  });

  it('survives sessionStorage being unreadable', () => {
    sessionStorage.setItem(KEY, 'not json');
    expect(readRestore()).toBeNull();
    expect(() => clearRestore()).not.toThrow();
  });
});

describe('onTargetSectionPage', () => {
  it('matches on the assessment id when PCC gave us a real one', () => {
    history.replaceState({}, '', '/clinical/mds3/section.xhtml?ESOLassessid=2266385&sectioncode=I');
    expect(onTargetSectionPage(PAYLOAD)).toBe(true);
  });

  it('accepts an EID_ handle by falling back to the section code', () => {
    // PCC frequently renders `ESOLassessid=EID_…`, which will never equal the
    // numeric id we stored. Landing on the right section is enough — the
    // overlay resolves the assessment properly itself.
    history.replaceState({}, '', '/clinical/mds3/section.xhtml?ESOLassessid=EID_0qp9Dt46&sectioncode=I');
    expect(onTargetSectionPage(PAYLOAD)).toBe(true);
  });

  it('rejects a different section', () => {
    history.replaceState({}, '', '/clinical/mds3/section.xhtml?ESOLassessid=EID_x&sectioncode=N');
    expect(onTargetSectionPage(PAYLOAD)).toBe(false);
  });

  it('rejects a page that is not a section page at all', () => {
    history.replaceState({}, '', '/admin/client/cp_residentdashboard.jsp?ESOLclientid=1');
    expect(onTargetSectionPage(PAYLOAD)).toBe(false);
  });
});

describe('hydrateTagRestore', () => {
  let navigatedTo;

  beforeEach(() => {
    navigatedTo = null;
    // jsdom refuses real navigation; capture the intent instead.
    delete window.location;
    window.location = new URL(`${globalThis.location?.origin || 'http://pcc.test'}/`);
    Object.defineProperty(window.location, 'href', {
      set: (v) => {
        navigatedTo = v;
      },
      get: () => `${window.location.origin}/`,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when there is no payload', async () => {
    expect(await hydrateTagRestore()).toBeNull();
  });

  it('advances to the section stage once PCC reports the right building', async () => {
    document.body.innerHTML = '<a id="pccFacLink" title="Autumnwood Care Center"></a>';
    writeRestore(PAYLOAD);

    const result = await hydrateTagRestore();

    expect(result).toBeNull();
    // Crucially the payload SURVIVES the hop — the next page load finishes it.
    expect(readRestore()).toMatchObject({ stage: 'section' });
    expect(navigatedTo).toContain('section.xhtml?ESOLassessid=2266385');
  });

  it('holds the payload through a facility mismatch and finishes when it lands', async () => {
    // This is the whole reason this is not `hydrateTwentyFourHourRestore`.
    // There, a mismatch means the payload is stale and gets deleted. Here a
    // mismatch is the expected middle of the trip — PCC has not finished
    // switching yet — so the same rule would throw the payload away every
    // single time the feature was used.
    vi.useFakeTimers();
    document.body.innerHTML = '<a id="pccFacLink" title="Somewhere Else"></a>';
    writeRestore(PAYLOAD);

    const pending = hydrateTagRestore({ onFailure: () => {} });

    await vi.advanceTimersByTimeAsync(2000);
    expect(readRestore()).toMatchObject({ stage: 'switch' });
    expect(navigatedTo).toBeNull();

    // PCC's header catches up.
    document.body.innerHTML = '<a id="pccFacLink" title="Autumnwood Care Center"></a>';
    await vi.advanceTimersByTimeAsync(1000);
    await pending;

    expect(readRestore()).toMatchObject({ stage: 'section' });
    expect(navigatedTo).toContain('section.xhtml');
    vi.useRealTimers();
  });

  it('says so out loud when the switch never lands', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<a id="pccFacLink" title="Somewhere Else"></a>';
    writeRestore(PAYLOAD);
    const onFailure = vi.fn();

    const pending = hydrateTagRestore({ onFailure });
    await vi.advanceTimersByTimeAsync(7000);
    await pending;

    expect(onFailure).toHaveBeenCalledWith(expect.stringContaining('Autumnwood'));
    // Cleared only once it is genuinely dead, never silently mid-journey.
    expect(readRestore()).toBeNull();
    vi.useRealTimers();
  });
});
