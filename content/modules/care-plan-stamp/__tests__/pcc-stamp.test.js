// content/modules/care-plan-stamp/__tests__/pcc-stamp.test.js
//
// orchestrateStamp routing (SUP-54). A LIBRARY focus (carries libraryStdId) is added
// through PCC's native wizard — neededit(create+save) → goalwizard → interwizard — with
// the library std ids checked as `chkbox`, so the focus AND its goals/interventions are
// real library items, not custom. Goals/interventions are BATCHED (one wizard POST each),
// so counts come from the batch, not per-item POSTs. A non-library focus still custom-stamps.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { orchestrateStamp } from '../pcc-stamp.js';

/** Mock PCC: record every request; hand back a draft id for the neededit create GET. */
function installFetchSpy() {
  const calls = [];
  global.fetch = vi.fn(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method || 'GET', body: opts?.body ? String(opts.body) : '' });
    const u = String(url);
    let html = '<html>ok</html>';
    if (u.includes('ESOLnewFocus=true')) html = '<input name="ESOLgenneedid" value="620044">'; // library draft id
    else if (u.includes('neededitcust_rev.jsp')) html = 'ow.document.needs.ESOLlastneed.value = "555";'; // custom focus id
    return { ok: true, status: 200, url: u, text: async () => html };
  });
  return calls;
}

const libraryProposal = () => ({
  patientId: '840072',
  focuses: [
    {
      ruleId: 'universal.fall_risk',
      description: 'FALLS: resident is at risk for falls',
      libraryStdId: '2072',
      reviewDepartments: [9042],
      // textDiffersFromLibrary:false = the fill didn't change these texts →
      // they stay library-linked chkbox adds. The diff-routing default when
      // the flag is absent/true is CUSTOM (fidelity first).
      goals: [
        { description: 'will be free from falls over 90 days', libraryStdId: '4647', textDiffersFromLibrary: false },
        { description: 'dignity maintained', libraryStdId: '4648', textDiffersFromLibrary: false },
      ],
      interventions: [
        { description: 'ensure call light in reach', libraryStdId: '17570', textDiffersFromLibrary: false },
        { description: 'assure lighting adequate', libraryStdId: '17672', textDiffersFromLibrary: false },
      ],
    },
  ],
});

afterEach(() => vi.restoreAllMocks());

describe('orchestrateStamp — library focus via the PCC wizard', () => {
  it('adds focus + goals + interventions through the wizard (neededit → goalwizard → interwizard)', async () => {
    const calls = installFetchSpy();
    const result = await orchestrateStamp({ proposal: libraryProposal(), careplanId: '27133', miniToken: 'tok', deptNames: {} });
    const urls = calls.map((c) => c.url);

    // Focus: wizard create (GET) + save (POST).
    expect(urls.filter((u) => u.includes('neededit_rev.jsp')).length).toBe(2);
    // Goals: wizard prime (GET) + ONE batch save (POST) — NOT the custom goaledit endpoint.
    expect(urls.filter((u) => u.includes('goalwizard_rev.jsp')).length).toBe(2);
    expect(urls.some((u) => u.includes('goaledit_rev.jsp'))).toBe(false);
    // Interventions: wizard prime (GET) + ONE batch save (POST) — NOT the custom intereditcust.
    expect(urls.filter((u) => u.includes('interwizard_rev.jsp')).length).toBe(2);
    expect(urls.some((u) => u.includes('intereditcust_rev.jsp'))).toBe(false);

    // Counts come from the batch (2 goals, 2 interventions in one POST each).
    expect(result.focusesStamped).toBe(1);
    expect(result.goalsStamped).toBe(2);
    expect(result.interventionsStamped).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('checks the library std ids as chkbox in the goal + intervention wizard POSTs', async () => {
    const calls = installFetchSpy();
    await orchestrateStamp({ proposal: libraryProposal(), careplanId: '27133', miniToken: 'tok', deptNames: {} });
    const goalPost = calls.find((c) => c.url.includes('goalwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(goalPost.body).getAll('chkbox')).toEqual(['4647', '4648']);
    const interPost = calls.find((c) => c.url.includes('interwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(interPost.body).getAll('chkbox')).toEqual(['17570', '17672']);
  });

  it('does NOT count goals PCC refuses ("related focus has been deleted") + records the error', async () => {
    global.fetch = vi.fn(async (url, opts) => {
      const u = String(url);
      let html = '<html>ok</html>';
      if (u.includes('ESOLnewFocus=true')) html = '<input name="ESOLgenneedid" value="620044">';
      else if (u.includes('goalwizard') && opts?.method === 'POST') html = '***The related focus has been deleted.  Goal/Intervention will not be saved';
      return { ok: true, status: 200, url: u, text: async () => html };
    });
    const result = await orchestrateStamp({ proposal: libraryProposal(), careplanId: '27133', miniToken: 'tok', deptNames: {} });
    expect(result.goalsStamped).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /not be saved|has been deleted/i.test(e.error))).toBe(true);
    // The focus itself still stamped, and interventions still ran.
    expect(result.focusesStamped).toBe(1);
    expect(result.interventionsStamped).toBe(2);
  });

  it('diff-routing: fill-changed / ext-edited / kardex-opted items custom-stamp on the SAME library focus', async () => {
    const calls = installFetchSpy();
    const proposal = libraryProposal();
    const f = proposal.focuses[0];
    // Server fill changed this goal's text → must NOT chkbox (library text would stamp).
    f.goals[0].textDiffersFromLibrary = true;
    // Nurse/token changed this intervention after payload → custom.
    f.interventions[0]._payloadDescription = 'ensure call light in reach (specify)';
    // Kardex opt-in flips an otherwise-unchanged intervention to custom (chkbox can't carry kardex).
    f.interventions[1].kardexCategory = 123;
    const result = await orchestrateStamp({ proposal, careplanId: '27133', miniToken: 'tok', deptNames: {} });
    const goalPost = calls.find((c) => c.url.includes('goalwizard_rev.jsp') && c.method === 'POST');
    // Only the unchanged goal rides the wizard chkbox; the changed one goes custom.
    expect(new URLSearchParams(goalPost.body).getAll('chkbox')).toEqual(['4648']);
    expect(calls.some((c) => c.url.includes('goaledit_rev.jsp'))).toBe(true);
    // Both interventions diverge → no interwizard POST chkboxes, both custom.
    expect(calls.some((c) => c.url.includes('intereditcust_rev.jsp'))).toBe(true);
    expect(calls.filter((c) => c.url.includes('interwizard_rev.jsp')).length).toBe(0);
    expect(result.focusesStamped).toBe(1);
    expect(result.goalsStamped).toBe(2);
    expect(result.interventionsStamped).toBe(2);
  });

  it('a NON-library focus still custom-stamps focus + goals + interventions', async () => {
    const calls = installFetchSpy();
    const proposal = {
      patientId: '12345',
      focuses: [
        {
          ruleId: 'custom.something',
          description: 'CUSTOM focus',
          reviewDepartments: [9042],
          goals: [{ description: 'a goal' }],
          interventions: [{ description: 'an intervention', positionOne: 9042 }],
        },
      ],
    };
    const result = await orchestrateStamp({ proposal, careplanId: '999', miniToken: 'tok', deptNames: {} });
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u.includes('neededitcust_rev.jsp'))).toBe(true); // custom focus endpoint
    expect(urls.some((u) => u.includes('goaledit_rev.jsp'))).toBe(true); // custom goal endpoint
    expect(urls.some((u) => u.includes('intereditcust_rev.jsp'))).toBe(true); // custom intervention endpoint
    expect(urls.some((u) => u.includes('interwizard_rev.jsp'))).toBe(false); // NOT the library wizard
    expect(result.focusesStamped).toBe(1);
    expect(result.goalsStamped).toBe(1);
    expect(result.interventionsStamped).toBe(1);
  });
});
