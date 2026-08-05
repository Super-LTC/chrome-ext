// content/modules/care-plan-stamp/__tests__/pcc-verify.test.js
//
// Read-back verification of what PCC ACTUALLY attached to a care plan.
//
// Every assertion here runs against `demo/clinical-care-plan-detail.html` — a real
// captured PCC care-plan detail page — so the parser is pinned to PCC's true markup
// rather than to our idea of it. The page's own row-action JS is the contract:
//
//   editNeed(genneedid, needid)                              ← a focus
//   editGoal(goalid, stdneedid, genneedid, ...)              ← 3rd arg = parent focus
//   editIntervention(interid, stdinterid, stdneedid, genneedid, ...)  ← 4th arg = parent focus
//
// A focus whose genneedid EQUALS its needid was added custom; when they differ it came
// from the library (PCC re-keys library focuses on save). That distinction is PCC's own,
// which is why we read it back instead of trusting our routing.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePlanPage, countsByFocus, findFocusByText, scanCarePlan, verifyStampedFocus } from '../pcc-verify.js';

// vitest runs from the repo root; jsdom's import.meta.url isn't a file: URL.
const CAPTURE = readFileSync(
  resolve(process.cwd(), 'demo/clinical-care-plan-detail.html'),
  'utf8',
);

describe('parsePlanPage', () => {
  it('reads every focus with its committed id, need id and library/custom kind', () => {
    const { focuses } = parsePlanPage(CAPTURE);
    const byId = Object.fromEntries(focuses.map((f) => [f.genNeedId, f]));

    expect(Object.keys(byId).sort()).toEqual(
      ['595385', '595387', '595423', '595543', '853610'],
    );
    // Library adds get re-keyed by PCC on save, so gen !== need. Custom adds don't.
    expect(byId['595385']).toMatchObject({ needId: '591321', kind: 'library' });
    expect(byId['595423']).toMatchObject({ needId: '591311', kind: 'library' });
    expect(byId['595543']).toMatchObject({ needId: '591302', kind: 'library' });
    expect(byId['595387']).toMatchObject({ needId: '595387', kind: 'custom' });
    expect(byId['853610']).toMatchObject({ needId: '853610', kind: 'custom' });
  });
});

describe('countsByFocus', () => {
  it('counts the goals and interventions actually hanging off each focus', () => {
    const counts = countsByFocus(parsePlanPage(CAPTURE));

    expect(counts).toEqual({
      '595385': { goals: 3, interventions: 10 },
      '595387': { goals: 1, interventions: 1 },
      '595423': { goals: 2, interventions: 7 },
      '595543': { goals: 2, interventions: 6 },
      '853610': { goals: 1, interventions: 15 },
    });
  });

  it('attributes every goal and intervention on the page to some focus', () => {
    const parsed = parsePlanPage(CAPTURE);
    const counts = countsByFocus(parsed);
    const summed = Object.values(counts).reduce(
      (a, c) => ({ goals: a.goals + c.goals, interventions: a.interventions + c.interventions }),
      { goals: 0, interventions: 0 },
    );

    // No orphans: if PCC ever changes an argument position, these diverge and
    // the counter starts under-reporting — which would silently read as data loss.
    expect(summed.goals).toBe(parsed.goals.length);
    expect(summed.interventions).toBe(parsed.interventions.length);
    expect(parsed.goals.length).toBe(9);
    expect(parsed.interventions.length).toBe(39);
  });
});

describe('findFocusByText', () => {
  // PCC's save response hands back an id that isn't always the one holding the
  // focus on the plan (pcc-discover.js:314 calls it a phantom). The text we just
  // wrote IS reliable, so it's the key we look up by.
  it('resolves the committed focus id from the focus statement we wrote', () => {
    const { focuses } = parsePlanPage(CAPTURE);

    const hit = findFocusByText(
      focuses,
      "Self-care deficit r/t weakness, morbid obesity, Alzheimer's dementia, depression.",
    );

    expect(hit).toMatchObject({ genNeedId: '595423', needId: '591311' });
  });

  it('ignores whitespace and case differences in the statement', () => {
    const { focuses } = parsePlanPage(CAPTURE);

    const hit = findFocusByText(focuses, '  self-care DEFICIT r/t weakness,   morbid obesity, ' +
      "Alzheimer's dementia, depression.  ");

    expect(hit?.genNeedId).toBe('595423');
  });

  it('returns null when no focus on the plan carries that text', () => {
    const { focuses } = parsePlanPage(CAPTURE);

    expect(findFocusByText(focuses, 'Nutrition deficit r/t poor intake')).toBeNull();
  });
});

describe('scanCarePlan', () => {
  const focusRow = (gen, need, text) =>
    `<tr><td><a href="javascript:editNeed(${gen},${need})">edit</a></td>` +
    `<td><span class="text1">${text}</span></td></tr>`;

  afterEach(() => { delete global.fetch; });

  it('walks every page and merges what it finds, stopping when PCC repeats itself', async () => {
    const wrap = (rows) => `<html><body><table>${rows}</table></body></html>`;
    const pages = {
      1: wrap(focusRow(100, 90, 'Falls risk') + '<tr><td><a href="javascript:editGoal(11,7,100,1,2)">g</a></td></tr>'),
      6: wrap(focusRow(200, 200, 'Pain') +
         '<tr><td><a href="javascript:editIntervention(21,8,7,200,21)">i</a>' +
         '<a href="javascript:editIntervention(22,8,7,200,22)">i</a></td></tr>'),
      // PCC clamps past the end and re-serves the last page — that's the stop signal.
      11: wrap(focusRow(200, 200, 'Pain')),
    };
    const urls = [];
    global.fetch = vi.fn(async (url) => {
      urls.push(String(url));
      const row = Number(String(url).match(/ESOLrow=(\d+)/)[1]);
      return { ok: true, status: 200, url: String(url), text: async () => pages[row] ?? '' };
    });

    const scan = await scanCarePlan('840072');

    expect(scan.counts).toEqual({
      '100': { goals: 1, interventions: 0 },
      '200': { goals: 0, interventions: 2 },
    });
    expect(scan.pages).toBe(3);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('ESOLclientid=840072');
    expect(urls[0]).toContain('showresolved=N');
  });

  it('surfaces an expired PCC session rather than reporting an empty plan', async () => {
    global.fetch = vi.fn(async (url) => ({
      ok: true, status: 200, url: String(url),
      text: async () => '<html><title>Login</title></html>',
    }));

    // An empty scan would read as "nothing attached" and wrongly accuse PCC of
    // dropping the nurse's work, so this has to fail loudly.
    await expect(scanCarePlan('840072')).rejects.toThrow(/session expired/i);
  });
});

describe('verifyStampedFocus', () => {
  // The <table> wrapper matters: the HTML parser discards a bare <tr>, and the
  // focus statement is read via the row it sits in.
  const plan = (rows) => `<html><body><table>${rows}</table></body></html>`;
  const focusRow = (gen, need, text) =>
    `<tr><td><a href="javascript:editNeed(${gen},${need})">edit</a></td>` +
    `<td><span class="text1">${text}</span></td></tr>`;

  function servePlan(html) {
    global.fetch = vi.fn(async (url) => {
      const row = Number(String(url).match(/ESOLrow=(\d+)/)[1]);
      return { ok: true, status: 200, url: String(url), text: async () => (row === 1 ? html : '') };
    });
  }

  afterEach(() => { delete global.fetch; });

  it('reports the shortfall when PCC kept the focus but dropped its goals', async () => {
    // The exact failure a nurse reported: focus on the chart, goals and
    // interventions missing, and the extension previously called this success.
    servePlan(plan(focusRow(620074, 620064, 'Falls risk r/t weakness')));

    const v = await verifyStampedFocus({
      patientId: '840072',
      focusText: 'Falls risk r/t weakness',
      requested: { goals: 2, interventions: 5 },
    });

    expect(v.found).toBe(true);
    expect(v.focusId).toBe('620074');
    expect(v.goalsAttached).toBe(0);
    expect(v.interventionsAttached).toBe(0);
    expect(v.complete).toBe(false);
  });

  it('reports complete when everything the nurse approved actually landed', async () => {
    servePlan(plan(
      focusRow(620074, 620064, 'Falls risk r/t weakness') +
      '<a href="javascript:editGoal(1,7,620074,1,2)">g</a>' +
      '<a href="javascript:editIntervention(9,8,7,620074,9)">i</a>',
    ));

    const v = await verifyStampedFocus({
      patientId: '840072',
      focusText: 'Falls risk r/t weakness',
      requested: { goals: 1, interventions: 1 },
    });

    expect(v).toMatchObject({
      found: true, complete: true, goalsAttached: 1, interventionsAttached: 1, route: 'library',
    });
  });

  it('prefers the id on the plan over the phantom id from the save response', async () => {
    servePlan(plan(focusRow(620074, 620064, 'Falls risk r/t weakness')));

    const v = await verifyStampedFocus({
      patientId: '840072',
      focusText: 'Falls risk r/t weakness',
      requested: { goals: 0, interventions: 0 },
      saveResponseFocusId: '620064', // the draft PCC retired on save
    });

    expect(v.focusId).toBe('620074');
    expect(v.idSource).toBe('plan_lookup');
    expect(v.idMatchedSaveResponse).toBe(false);
  });

  it('reports found:false when the focus never made it onto the plan', async () => {
    servePlan(plan(focusRow(1, 1, 'Some other focus')));

    const v = await verifyStampedFocus({
      patientId: '840072',
      focusText: 'Falls risk r/t weakness',
      requested: { goals: 1, interventions: 1 },
    });

    expect(v).toMatchObject({ found: false, focusId: null, complete: false });
  });
});
