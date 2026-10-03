import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from 'preact';
import medicare from './fixtures/drawer-medicare-5day.json';
import texas from './fixtures/drawer-texas-quarterly.json';
import ohio from './fixtures/drawer-ohio-quarterly.json';
import notPriced from './fixtures/drawer-not-priced.json';

vi.mock('../../../utils/analytics.js', () => ({ track: vi.fn() }));

const { PdpmDrawer } = await import('../components/PdpmDrawer.jsx');

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const flush = () => new Promise((r) => setTimeout(r, 0));
const mount = (drawer, props = {}) => render(h(PdpmDrawer, { drawer, assessmentId: '123', onOpenItem: () => {}, ...props }), root);
const tab = (label) => qa('.pdpm-dr__tab').find((b) => b.textContent.startsWith(label));
const rowByName = (name) => qa('.pdpm-dr__it').find((r) => r.querySelector('.pdpm-dr__nm')?.textContent.startsWith(name));

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  root = document.getElementById('host');
  globalThis.chrome = { runtime: { sendMessage: vi.fn(async () => ({ success: true })) }, storage: { local: { set: vi.fn() } } };
  globalThis.getOrg = () => ({ org: 'demo' });
  window.getChatFacilityInfo = () => 'Demo Facility';
  window.navigateToMDSItem = vi.fn();
  window.scrollToMdsItem = undefined;
});

describe('PdpmDrawer — Medicare 5-Day', () => {
  it('shows the HIPPS move and the $/day card for the current ARD', () => {
    mount(medicare);
    const codes = qa('.pdpm-dr__code').map((e) => e.textContent);
    expect(codes[0]).toBe(medicare.current.hipps);
    expect(q('.pdpm-dr__rev-k').textContent).toContain('Medicare per day');
    expect(q('.pdpm-dr__rev-d').textContent).toMatch(/^\+\$\d+\/day$/);
  });

  it('draws one bar per day, with the current ARD marked and review striped on top', () => {
    mount(medicare);
    expect(qa('.pdpm-dr__day')).toHaveLength(7);
    expect(qa('.pdpm-dr__day--cur')).toHaveLength(1);
    expect(qa('.pdpm-dr__seg-rev').length).toBeGreaterThan(0);
  });

  it('opens on Nursing with the landing category expanded and the others collapsed', () => {
    mount(medicare);
    expect(q('.pdpm-dr__tab--on').textContent).toMatch(/^Nursing/);
    const open = qa('.pdpm-dr__acc--open .pdpm-dr__an').map((e) => e.textContent);
    expect(open).toEqual(['Special Care High']); // ARD 10/3: isolation is out of its window
    expect(qa('.pdpm-dr__acc').length).toBe(3);
  });

  it('collapses and expands a category', async () => {
    mount(medicare);
    const es = qa('.pdpm-dr__acc-h').find((b) => b.textContent.includes('Extensive Services'));
    es.click();
    await flush();
    expect(qa('.pdpm-dr__acc--open .pdpm-dr__an').map((e) => e.textContent)).toContain('Extensive Services');
  });

  it('picking an earlier day re-scores and moves the landing category', async () => {
    mount(medicare);
    qa('.pdpm-dr__day')[2].click(); // 9/30
    await flush();
    expect(q('.pdpm-dr__acc--land .pdpm-dr__an').textContent).toBe('Extensive Services');
  });

  it('NTA tab lists points, marks review rows, dims items outside the day\'s look-back', async () => {
    mount(medicare);
    tab('NTA').click();
    await flush();
    expect(q('.pdpm-dr__ntam')).toBeTruthy();
    const iv = rowByName('IV Medications');
    expect(iv.querySelector('.pdpm-dr__val').textContent).toBe('+5 pts');
    expect(iv.querySelector('.pdpm-dr__rw').textContent).toBe('Review');
    qa('.pdpm-dr__day')[0].click(); // 9/28 — IV meds not in its window yet
    await flush();
    expect(rowByName('IV Medications').classList.contains('pdpm-dr__it--dim')).toBe(true);
    expect(rowByName('IV Medications').textContent).toContain('Not in the look-back for 9/28');
  });

  it('dismissed items are struck through with their reason and an Undo', async () => {
    mount(medicare);
    tab('NTA').click();
    await flush();
    const off = qa('.pdpm-dr__it--off')[0];
    expect(off.textContent).toContain('Morbid obesity');
    expect(off.textContent).toContain('Not supported — BMI 31');
    expect(off.querySelector('.pdpm-dr__undo')).toBeTruthy();
  });

  it('Dismiss needs a reason, "Other" needs a note, and it posts both', async () => {
    mount(medicare);
    tab('NTA').click();
    await flush();
    rowByName('Diabetes').querySelector('.pdpm-dr__ib--x').click();
    await flush();
    const submit = () => q('.pdpm-dr__primary');
    expect(submit().disabled).toBe(true);
    qa('.pdpm-dr__pill').find((p) => p.textContent === 'Other').click();
    await flush();
    expect(submit().disabled).toBe(true);
    const note = q('.pdpm-dr__dismiss-note');
    note.value = 'Resolved before admission';
    note.dispatchEvent(new Event('input'));
    await flush();
    expect(submit().disabled).toBe(false);
    submit().click();
    await flush();
    await flush();
    const call = chrome.runtime.sendMessage.mock.calls[0][0];
    expect(call.endpoint).toBe('/api/extension/mds/items/I2900/decision');
    expect(JSON.parse(call.options.body)).toMatchObject({ decision: 'disagree', reason: 'other', note: 'Resolved before admission', externalAssessmentId: '123' });
    expect(rowByName('Diabetes').classList.contains('pdpm-dr__it--off')).toBe(true);
  });

  it('Undo sends DELETE for the I8000 category and restores the row', async () => {
    mount(medicare);
    tab('NTA').click();
    await flush();
    q('.pdpm-dr__undo').click();
    await flush();
    await flush();
    const call = chrome.runtime.sendMessage.mock.calls[0][0];
    expect(call.options.method).toBe('DELETE');
    expect(call.endpoint).toBe('/api/extension/mds/items/I8000/decision');
    expect(JSON.parse(call.options.body).mdsColumn).toBe('NTA:26');
    expect(rowByName('Morbid obesity').classList.contains('pdpm-dr__it--off')).toBe(false);
  });

  it('a row click opens the evidence view; the ↗ icon goes to the MDS instead', async () => {
    const onOpenItem = vi.fn();
    mount(medicare, { onOpenItem });
    rowByName('Short of breath').click();
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ mdsItem: 'J1100C' }));
    rowByName('Short of breath').querySelector('.pdpm-dr__ib:not(.pdpm-dr__ib--x)').click();
    expect(window.navigateToMDSItem).toHaveBeenCalledWith('J1100C', '123');
    expect(onOpenItem).toHaveBeenCalledTimes(1);
  });

  it('Go to MDS scrolls in place when the item is on this page', () => {
    window.scrollToMdsItem = vi.fn(() => true);
    mount(medicare);
    rowByName('Short of breath').querySelector('.pdpm-dr__ib:not(.pdpm-dr__ib--x)').click();
    expect(window.scrollToMdsItem).toHaveBeenCalledWith('J1100C', '');
    expect(window.navigateToMDSItem).not.toHaveBeenCalled();
  });
});

describe('PdpmDrawer — other payers', () => {
  it('Texas: shows the TX group codes, dollars to the cent, Nursing + NTA tabs only', () => {
    mount(texas);
    expect(qa('.pdpm-dr__code').map((e) => e.textContent)[0]).toBe('P3X');
    expect(q('.pdpm-dr__rev-k').textContent).toContain('Texas Medicaid per day');
    expect(qa('.pdpm-dr__tab').map((t) => t.textContent.replace(/\d+$/, ''))).toEqual(['Nursing', 'NTA']);
    expect(q('.pdpm-dr__ard-hint').textContent).toContain('10/8');
    expect(q('.pdpm-an__card-badge').textContent).toBe('Due 10/12');
  });

  it('Texas NTA meter uses Groups 3/2/1', async () => {
    mount(texas);
    tab('NTA').click();
    await flush();
    expect(qa('.pdpm-dr__ntam-ticks span').map((s) => s.textContent)).toEqual(['Group 2', 'Group 1']);
  });

  it('Ohio: a case-mix weight, no dollars, nursing only (no tab strip for one tab)', () => {
    mount(ohio);
    expect(q('.pdpm-dr__rev-k').textContent).toContain('Ohio Medicaid case mix');
    expect(q('.pdpm-dr__rev-v').textContent).not.toContain('$');
    expect(q('.pdpm-dr__tabs')).toBeNull();
    expect(qa('.pdpm-dr__acc').length).toBe(1);
  });

  it('not priced: no revenue card, no bars, says why', () => {
    mount(notPriced);
    expect(q('.pdpm-dr__rev')).toBeNull();
    expect(q('.pdpm-dr__bars')).toBeNull();
    expect(q('.pdpm-dr__note').textContent).toContain('not on Medicaid');
  });
});
