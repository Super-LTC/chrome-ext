// content/modules/care-plan-stamp/__tests__/pcc-stamp.test.js
//
// orchestrateStamp routing (SUP-54). A LIBRARY focus (carries libraryStdId) is added
// through PCC's native wizard — neededit(create+save) → goalwizard → interwizard — with
// the library std ids checked as `chkbox`, so the focus AND its goals/interventions are
// real library items, not custom. Goals/interventions are BATCHED (one wizard POST each),
// so counts come from the batch, not per-item POSTs. A non-library focus still custom-stamps.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { orchestrateStamp } from '../pcc-stamp.js';

/**
 * A care-plan detail page showing `focusText` with `goals`/`interventions` hanging
 * off focus id `gen`. The stamp now READS THIS BACK to confirm PCC really attached
 * what we asked for, so the mock has to answer for the chart as well as the writes —
 * otherwise every stamp correctly reports "nothing landed".
 */
function planPage({ gen, need, focusText, goals = 0, interventions = 0 }) {
  const goalRows = Array.from({ length: goals }, (_, i) =>
    `<tr><td><a href="javascript:editGoal(${900 + i},7,${gen},1,2)">g</a></td></tr>`).join('');
  const interRows = Array.from({ length: interventions }, (_, i) =>
    `<tr><td><a href="javascript:editIntervention(${800 + i},8,7,${gen},${800 + i})">i</a></td></tr>`).join('');
  return `<html><body><table>` +
    `<tr><td><a href="javascript:editNeed(${gen},${need})">edit</a></td>` +
    `<td><span class="text1">${focusText}</span></td></tr>` +
    goalRows + interRows +
    `</table></body></html>`;
}

/**
 * Mock PCC: record every request; hand back a draft id for the neededit create GET,
 * and serve a care plan that reflects a fully successful stamp.
 */
function installFetchSpy(plan = null) {
  const calls = [];
  global.fetch = vi.fn(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method || 'GET', body: opts?.body ? String(opts.body) : '' });
    const u = String(url);
    let html = '<html>ok</html>';
    if (u.includes('careplandetail_rev.jsp')) {
      // Only page 1 has rows; the walk stops when a page adds nothing new.
      html = /ESOLrow=1(&|$)/.test(u) ? (plan ?? '<html><body><table></table></body></html>') : '<html></html>';
    } else if (u.includes('ESOLnewFocus=true')) html = '<input name="ESOLgenneedid" value="620044">'; // library draft id
    else if (u.includes('neededitcust_rev.jsp')) html = 'ow.document.needs.ESOLlastneed.value = "555";'; // custom focus id
    return { ok: true, status: 200, url: u, text: async () => html };
  });
  return calls;
}

const LIBRARY_PLAN_OK = planPage({
  gen: '620044', need: '620040',
  focusText: 'FALLS: resident is at risk for falls',
  goals: 2, interventions: 2,
});

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
    const calls = installFetchSpy(LIBRARY_PLAN_OK);
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
    const calls = installFetchSpy(LIBRARY_PLAN_OK);
    await orchestrateStamp({ proposal: libraryProposal(), careplanId: '27133', miniToken: 'tok', deptNames: {} });
    const goalPost = calls.find((c) => c.url.includes('goalwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(goalPost.body).getAll('chkbox')).toEqual(['4647', '4648']);
    const interPost = calls.find((c) => c.url.includes('interwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(interPost.body).getAll('chkbox')).toEqual(['17570', '17672']);
  });

  it('does NOT count goals PCC refuses ("related focus has been deleted") + records the error', async () => {
    // The chart backs the refusal up: the focus and its interventions are there,
    // the goals are not — so read-back agrees with the refusal we detected.
    const refusedPlan = planPage({
      gen: '620044', need: '620040',
      focusText: 'FALLS: resident is at risk for falls',
      goals: 0, interventions: 2,
    });
    global.fetch = vi.fn(async (url, opts) => {
      const u = String(url);
      let html = '<html>ok</html>';
      if (u.includes('careplandetail_rev.jsp')) html = /ESOLrow=1(&|$)/.test(u) ? refusedPlan : '<html></html>';
      else if (u.includes('ESOLnewFocus=true')) html = '<input name="ESOLgenneedid" value="620044">';
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

  it('personalized items STILL chkbox-add (library linkage kept) and owe a post-add edit', async () => {
    const calls = installFetchSpy(LIBRARY_PLAN_OK);
    const proposal = libraryProposal();
    const f = proposal.focuses[0];
    // Server fill changed this goal's text — library add stays, edit pass owes the swap.
    f.goals[0].textDiffersFromLibrary = true;
    f.goals[0].libraryText = '(resident name) will be free from falls over 90 days';
    f.goals[0].description = 'SMITH, JOHN will be free from falls over 90 days';
    // Ext-side token fill changed this intervention vs the payload text.
    f.interventions[0]._payloadDescription = 'ensure call light in reach (specify)';
    const result = await orchestrateStamp({ proposal, careplanId: '27133', miniToken: 'tok', deptNames: {} });
    // ALL std-id items ride the wizard chkbox — personalization never unlinks them.
    const goalPost = calls.find((c) => c.url.includes('goalwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(goalPost.body).getAll('chkbox')).toEqual(['4647', '4648']);
    const interPost = calls.find((c) => c.url.includes('interwizard_rev.jsp') && c.method === 'POST');
    expect(new URLSearchParams(interPost.body).getAll('chkbox')).toEqual(['17570', '17672']);
    // The edit pass ran (walked the plan detail); mock plan has no editNeed rows,
    // so the owed edits surface as a personalize warning — never a stamp failure.
    expect(calls.some((c) => c.url.includes('careplandetail_rev.jsp'))).toBe(true);
    expect(result.errors.some((e) => e.phase === 'personalize')).toBe(true);
    expect(result.focusesStamped).toBe(1);
    expect(result.goalsStamped).toBe(2);
    expect(result.interventionsStamped).toBe(2);
  });

  it('untouched items owe NO personalization edits', async () => {
    const calls = installFetchSpy(LIBRARY_PLAN_OK);
    const result = await orchestrateStamp({ proposal: libraryProposal(), careplanId: '27133', miniToken: 'tok', deptNames: {} });
    // The personalization pass opens each stamped item's own editor; none should run.
    // (The care-plan detail page IS fetched now — that's the stamp verification walk,
    // which happens on every stamp regardless of personalization.)
    expect(calls.some((c) => c.url.includes('goaledit_rev.jsp'))).toBe(false);
    expect(calls.some((c) => c.url.includes('interedit'))).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('a NON-library focus still custom-stamps focus + goals + interventions', async () => {
    const calls = installFetchSpy(planPage({
      gen: '555', need: '555', focusText: 'CUSTOM focus', goals: 1, interventions: 1,
    }));
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

describe('orchestrateStamp — read-back verification (the reported data loss)', () => {
  it('reports failure when PCC keeps the focus but silently attaches nothing', async () => {
    // A nurse's report: "The focus saved, but the goal and the interventions did
    // not." Every PCC write here answers 200, so the old optimistic counting
    // called this a complete success and the UI said "Added to care plan".
    const emptyFocusPlan = planPage({
      gen: '620044', need: '620040',
      focusText: 'FALLS: resident is at risk for falls',
      goals: 0, interventions: 0,
    });
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      let html = '<html>ok</html>';
      if (u.includes('careplandetail_rev.jsp')) html = /ESOLrow=1(&|$)/.test(u) ? emptyFocusPlan : '<html></html>';
      else if (u.includes('ESOLnewFocus=true')) html = '<input name="ESOLgenneedid" value="620044">';
      return { ok: true, status: 200, url: u, text: async () => html };
    });

    const result = await orchestrateStamp({ proposal: libraryProposal(), careplanId: '27133', miniToken: 'tok', deptNames: {} });

    expect(result.ok).toBe(false);
    expect(result.goalsStamped).toBe(0);
    expect(result.interventionsStamped).toBe(0);
    expect(result.verified[0]).toMatchObject({
      found: true, complete: false, goalsRequested: 2, goalsAttached: 0,
    });
  });

  it('retries against the id on the plan and recovers when that was the problem', async () => {
    // PCC re-keys the focus on save but returns no committed id, so the first
    // attach targets a retired draft and lands nothing. The retry uses the id the
    // chart actually shows.
    let attachAttempts = 0;
    global.fetch = vi.fn(async (url, opts) => {
      const u = String(url);
      const isAttachPost = (u.includes('goalwizard') || u.includes('interwizard')) && opts?.method === 'POST';
      if (isAttachPost) attachAttempts += 1;
      let html = '<html>ok</html>';
      if (u.includes('careplandetail_rev.jsp')) {
        html = /ESOLrow=1(&|$)/.test(u)
          ? planPage({
            gen: '620044', need: '620040',
            focusText: 'FALLS: resident is at risk for falls',
            // Nothing lands until the retry fires (2 attach POSTs = goals + interventions).
            goals: attachAttempts > 2 ? 2 : 0,
            interventions: attachAttempts > 2 ? 2 : 0,
          })
          : '<html></html>';
      } else if (u.includes('ESOLnewFocus=true')) html = '<input name="ESOLgenneedid" value="620044">';
      return { ok: true, status: 200, url: u, text: async () => html };
    });

    const result = await orchestrateStamp({ proposal: libraryProposal(), careplanId: '27133', miniToken: 'tok', deptNames: {} });

    expect(result.goalsStamped).toBe(2);
    expect(result.interventionsStamped).toBe(2);
    expect(result.verified[0]).toMatchObject({ complete: true });
    expect(result.ok).toBe(true);
  });
});
