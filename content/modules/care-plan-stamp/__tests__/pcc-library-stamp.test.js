// content/modules/care-plan-stamp/__tests__/pcc-library-stamp.test.js
//
// LIBRARY-add path via PCC's native WIZARD flow (SUP-54), reverse-engineered from real
// captures (cp_final.har / cp_test.har, org eac / lib 49 / std focus 2072 & 3785):
//
//   1. GET  neededit_rev.jsp?ESOLnewFocus=true&ESOLwizard=Y   → returns the DRAFT focus id
//   2. POST neededit_rev.jsp  (ESOLwizard=Y, ESOLsave=Y, our cp_description + review depts)
//        → 302 redirect to goalwizard_rev.jsp?ESOLgenneedid=<COMMITTED>&ESOLneedid=<draft>
//          PCC re-keys the focus on save: the goals/interventions must use the COMMITTED
//          genneedid; the draft id gets "deleted". fetch follows the 302, so the committed
//          id is in res.url.
//   3. GET  goalwizard_rev.jsp    (prime the goal picker for the committed focus)
//   4. POST goalwizard_rev.jsp    (chkbox=<library std goal id>, ESOLgenneedid=<committed>)
//   5. GET  interwizard_rev.jsp   (prime the intervention picker)
//   6. POST interwizard_rev.jsp   (chkbox=<library std intervention id>, ESOLgenneedid=<committed>)
//
// ESOLgenneedid = committed id (post-save); ESOLneedid = the original draft/need id.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildFocusCreateUrl,
  buildFocusSaveBody,
  buildGoalWizardUrl,
  buildGoalWizardBody,
  buildInterWizardUrl,
  buildInterWizardBody,
  parseNewFocusId,
  parseWizardIds,
  isLibraryFocus,
  stampLibraryFocus,
} from '../pcc-library-stamp.js';

afterEach(() => vi.restoreAllMocks());

const DATES = { date: '07/08/2026', dateDummy: '7/8/2026', focusDate: '2026-07-08 00:00:00' };

describe('buildFocusCreateUrl (neededit GET — create the draft library focus)', () => {
  const url = buildFocusCreateUrl({ stdNeedId: '2072', clientId: '840072', careplanId: '27133' });
  it('is a neededit_rev.jsp GET marked as a new wizard focus', () => {
    expect(url).toContain('/care/chart/cp/neededit_rev.jsp?');
    expect(url).toContain('ESOLnewFocus=true');
    expect(url).toContain('ESOLwizard=Y');
    expect(url).toContain('ESOLgenneedid=-1');
    expect(url).toContain('ESOLneedid=-1');
  });
  it('carries the library std focus id + patient + care plan', () => {
    expect(url).toContain('ESOLstdneedid=2072');
    expect(url).toContain('ESOLclientid=840072');
    expect(url).toContain('ESOLcareplanid=27133');
  });
});

describe('buildFocusSaveBody (neededit POST — commit our wording under the draft)', () => {
  const body = buildFocusSaveBody({
    genNeedId: '620064', stdNeedId: '3785',
    description: 'FALLS: resident is at risk for falls',
    reviewDepartments: ['9042'],
    clientId: '840072', careplanId: '27143', miniToken: 'tcjh6XIKq5', dates: DATES,
  });
  it('saves in WIZARD mode against the draft id (the fix — not custom ESOLwizard=N)', () => {
    expect(body.get('ESOLwizard')).toBe('Y');
    expect(body.get('ESOLsave')).toBe('Y');
    expect(body.get('ESOLgenneedid')).toBe('620064');
    expect(body.get('ESOLstdneedid')).toBe('3785');
  });
  it('uses the REAL care plan id (not the -1 the custom flow sent)', () => {
    expect(body.get('ESOLcareplanid')).toBe('27143');
  });
  it('carries our wording + review departments', () => {
    expect(body.get('cp_description')).toBe('FALLS: resident is at risk for falls');
    expect(body.get('position_id_one')).toBe('9042');
    expect(body.get('position_id_two')).toBe(''); // unused slots empty
  });
});

describe('parseWizardIds (pull the committed id from the save 302 redirect)', () => {
  it('splits genneedid (committed) from needid (draft) in the redirect url', () => {
    const ids = parseWizardIds('/care/chart/cp/goalwizard_rev.jsp?ESOLgenneedid=620074&ESOLneedid=620064&ESOLwizard=Y');
    expect(ids.genNeedId).toBe('620074');
    expect(ids.needId).toBe('620064');
  });
  it('returns nulls when the url has no wizard ids (no redirect happened)', () => {
    const ids = parseWizardIds('/care/chart/cp/neededit_rev.jsp');
    expect(ids.genNeedId).toBeNull();
    expect(ids.needId).toBeNull();
  });
});

describe('buildGoalWizardUrl + buildGoalWizardBody (library GOALS via the wizard)', () => {
  it('primes the goal picker with committed genneedid + draft needid (GET)', () => {
    const url = buildGoalWizardUrl({ genNeedId: '620074', needId: '620064', stdNeedId: '3785', clientId: '840072', careplanId: '27143' });
    expect(url).toContain('/care/chart/cp/goalwizard_rev.jsp?');
    expect(url).toContain('ESOLgenneedid=620074');
    expect(url).toContain('ESOLneedid=620064');
    expect(url).toContain('ESOLwizard=Y');
  });
  it('checks ONE chkbox per library goal std id against the committed id (POST)', () => {
    const body = buildGoalWizardBody({
      genNeedId: '620074', needId: '620064', stdNeedId: '3785', clientId: '840072', careplanId: '27143',
      miniToken: 'tcjh6XIKq5', goalStdIds: ['8112', '8102'], focusDescription: 'FALLS: resident is at risk',
    });
    expect(body.getAll('chkbox')).toEqual(['8112', '8102']);
    expect(body.get('ESOLgenneedid')).toBe('620074'); // committed
    expect(body.get('ESOLneedid')).toBe('620064'); // draft
    expect(body.get('ESOLwizard')).toBe('Y');
    expect(body.get('ESOLsave')).toBe('Y');
    expect(body.get('focus')).toBe('FALLS: resident is at risk');
  });
});

describe('buildInterWizardUrl + buildInterWizardBody (library INTERVENTIONS via the wizard)', () => {
  it('primes the intervention picker with committed genneedid + draft needid (GET)', () => {
    const url = buildInterWizardUrl({ genNeedId: '620074', needId: '620064', stdNeedId: '3785', clientId: '840072', careplanId: '27143' });
    expect(url).toContain('/care/chart/cp/interwizard_rev.jsp?');
    expect(url).toContain('ESOLgenneedid=620074');
    expect(url).toContain('ESOLneedid=620064');
    expect(url).toContain('ESOLwizard=Y');
  });
  it('checks ONE chkbox per library intervention std id against the committed id (POST)', () => {
    const body = buildInterWizardBody({
      genNeedId: '620074', needId: '620064', stdNeedId: '3785', clientId: '840072', careplanId: '27143',
      miniToken: 'tcjh6XIKq5', interventionStdIds: ['27111', '27242'], dates: DATES,
    });
    expect(body.getAll('chkbox')).toEqual(['27111', '27242']);
    expect(body.get('ESOLgenneedid')).toBe('620074'); // committed
    expect(body.get('ESOLneedid')).toBe('620064'); // draft
    expect(body.get('ESOLwizard')).toBe('Y');
    expect(body.get('ESOLisstdTask')).toBe('N');
    expect(body.get('initDate')).toBe('07/08/2026');
  });
});

describe('parseNewFocusId (recover the draft id from the create GET response)', () => {
  it('reads a hidden ESOLgenneedid form field (create-form shape)', () => {
    expect(parseNewFocusId('<input type="hidden" name="ESOLgenneedid" value="620064">', '')).toBe('620064');
  });
  it('reads it regardless of attribute order', () => {
    expect(parseNewFocusId('<input value="620064" name="ESOLgenneedid">', '')).toBe('620064');
  });
  it('falls back to ESOLlastneed JS (save-response shape)', () => {
    expect(parseNewFocusId('ow.document.needs.ESOLlastneed.value = "620064";', '')).toBe('620064');
  });
  it('ignores the -1 sentinel and returns null when no real id is present', () => {
    expect(parseNewFocusId('<input name="ESOLgenneedid" value="-1">', 'neededit_rev.jsp?ESOLgenneedid=-1')).toBeNull();
  });
});

describe('isLibraryFocus (route to library-add vs custom stamp)', () => {
  it('true when the focus carries a usable libraryStdId', () => {
    expect(isLibraryFocus({ libraryStdId: '2072' })).toBe(true);
  });
  it('false for built-in / AI-authored focuses (no id, empty, or -1)', () => {
    expect(isLibraryFocus({})).toBe(false);
    expect(isLibraryFocus({ libraryStdId: '' })).toBe(false);
    expect(isLibraryFocus({ libraryStdId: '-1' })).toBe(false);
    expect(isLibraryFocus(null)).toBe(false);
  });
});

describe('stampLibraryFocus — full wizard flow, committed-id from the save redirect', () => {
  /**
   * Mock PCC faithfully: create GET → draft 620064; save POST → fetch follows the 302
   * so res.url is the goalwizard redirect carrying the COMMITTED id 620074 + draft 620064.
   */
  function installFetch() {
    const calls = [];
    global.fetch = vi.fn(async (url, opts) => {
      const u = String(url);
      const method = opts?.method || 'GET';
      calls.push({ url: u, method, body: opts?.body ? String(opts.body) : '' });
      if (u.includes('ESOLnewFocus=true')) {
        return { ok: true, status: 200, url: u, text: async () => '<input name="ESOLgenneedid" value="620064">' };
      }
      if (u.includes('neededit_rev.jsp') && method === 'POST') {
        // fetch transparently followed 302 → goalwizard?genneedid=620074&needid=620064
        return { ok: true, status: 200, url: '/care/chart/cp/goalwizard_rev.jsp?ESOLgenneedid=620074&ESOLneedid=620064&ESOLwizard=Y', text: async () => '<html>ok</html>' };
      }
      return { ok: true, status: 200, url: u, text: async () => '<html>ok</html>' };
    });
    return calls;
  }

  it('POSTs goals + interventions against the COMMITTED id (620074), not the draft (620064)', async () => {
    const calls = installFetch();
    const r = await stampLibraryFocus({
      patientId: '840072', careplanId: '27143', miniToken: 'tok', stdNeedId: '3785',
      description: 'FALLS: resident is at risk', reviewDepartments: ['9042'],
      goalStdIds: ['8112', '8102'], interventionStdIds: ['27111', '27242'],
    });
    expect(r.focusId).toBe('620074'); // report the committed focus id
    expect(r.goalsStamped).toBe(2);
    expect(r.interventionsStamped).toBe(2);
    expect(r.errors).toEqual([]);

    const goalPost = calls.find((c) => c.url.includes('goalwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(goalPost.body).get('ESOLgenneedid')).toBe('620074'); // committed, the fix
    expect(new URLSearchParams(goalPost.body).get('ESOLneedid')).toBe('620064'); // draft
    const interPost = calls.find((c) => c.url.includes('interwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(interPost.body).get('ESOLgenneedid')).toBe('620074');
    // The goal + intervention priming GETs also target the committed id.
    const goalGet = calls.find((c) => c.url.includes('goalwizard_rev.jsp') && c.method === 'GET');
    expect(goalGet.url).toContain('ESOLgenneedid=620074');
  });

  it('falls back to the draft id when the save did not redirect (no committed id surfaced)', async () => {
    const calls = [];
    global.fetch = vi.fn(async (url, opts) => {
      const u = String(url);
      calls.push({ url: u, method: opts?.method || 'GET', body: opts?.body ? String(opts.body) : '' });
      const html = u.includes('ESOLnewFocus=true') ? '<input name="ESOLgenneedid" value="620064">' : '<html>ok</html>';
      return { ok: true, status: 200, url: u, text: async () => html }; // res.url == request url, no redirect
    });
    const r = await stampLibraryFocus({
      patientId: '1', careplanId: '2', miniToken: 't', stdNeedId: '3',
      description: 'x', reviewDepartments: [], goalStdIds: ['9'], interventionStdIds: [],
    });
    expect(r.focusId).toBe('620064');
    const goalPost = calls.find((c) => c.url.includes('goalwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(goalPost.body).get('ESOLgenneedid')).toBe('620064');
  });

  it('throws when PCC returns no draft id (focus create failed)', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, url: 'x', text: async () => '<html>no id</html>' }));
    await expect(stampLibraryFocus({
      patientId: '1', careplanId: '2', miniToken: 't', stdNeedId: '3',
      description: 'x', reviewDepartments: [], goalStdIds: [], interventionStdIds: [],
    })).rejects.toThrow(/draft id/i);
  });

  it('records a goal error (not throw) when PCC refuses the goal save — interventions still run', async () => {
    global.fetch = vi.fn(async (url, opts) => {
      const u = String(url);
      const method = opts?.method || 'GET';
      let html = '<html>ok</html>';
      let resUrl = u;
      if (u.includes('ESOLnewFocus=true')) html = '<input name="ESOLgenneedid" value="620064">';
      else if (u.includes('neededit_rev.jsp') && method === 'POST') resUrl = '/care/chart/cp/goalwizard_rev.jsp?ESOLgenneedid=620074&ESOLneedid=620064';
      else if (u.includes('goalwizard') && method === 'POST') html = '***The related focus has been deleted. Goal/Intervention will not be saved';
      return { ok: true, status: 200, url: resUrl, text: async () => html };
    });
    const r = await stampLibraryFocus({
      patientId: '840072', careplanId: '27143', miniToken: 'tok', stdNeedId: '3785',
      description: 'x', reviewDepartments: [], goalStdIds: ['8112'], interventionStdIds: ['27111'],
    });
    expect(r.focusId).toBe('620074');
    expect(r.goalsStamped).toBe(0);
    expect(r.errors.some((e) => /not be saved|deleted/i.test(e.error))).toBe(true);
    expect(r.interventionsStamped).toBe(1); // a goal refusal doesn't block interventions
  });
});
