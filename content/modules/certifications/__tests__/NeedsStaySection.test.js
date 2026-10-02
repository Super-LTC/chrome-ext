import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { NeedsStaySection } = await import('../components/NeedsStaySection.jsx');

/**
 * "N residents may need a cert stay" — the census shows a skilled payer but no
 * cert stay was started. Each row: Start stay (prefilled modal) / Not needed.
 */

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const text = () => root.textContent;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };
const btn = (label, scope = root) => [...scope.querySelectorAll('button')].find(b => b.textContent.trim() === label);
function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const ITEMS = [
  {
    patientId: 'p1', patientName: 'TEST, RESIDENT ONE', patientExternalId: 'X1', patientStatus: 'active',
    payerType: 'medicare_a', payer: 'Medicare A', startDate: '2026-09-03', endDate: null,
  },
  {
    patientId: 'p2', patientName: 'TEST, RESIDENT TWO', patientExternalId: 'X2', patientStatus: 'discharged',
    payerType: 'managed_care', payer: 'Sample Health Plan', startDate: '2026-08-20', endDate: '2026-09-01',
  },
];

const dismissNeedsStay = vi.fn();
const fetchCertResidents = vi.fn();
const startManualStay = vi.fn();

function mount(props = {}) {
  render(
    h(NeedsStaySection, {
      items: ITEMS,
      facilityName: 'Test Facility',
      orgSlug: 'test-org',
      managedCareEnabled: true,
      onChanged: () => {},
      ...props,
    }),
    root
  );
}

async function expand() {
  q('.cert__needs-stay-head').click();
  await flush(1);
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  dismissNeedsStay.mockReset().mockResolvedValue({ success: true });
  fetchCertResidents.mockReset().mockResolvedValue([]);
  startManualStay.mockReset().mockResolvedValue({ stayId: 's1' });
  global.window.CertAPI = { dismissNeedsStay, fetchCertResidents, startManualStay };
  global.window.SuperToast = { success: vi.fn(), error: vi.fn() };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('collapsed header', () => {
  it('renders nothing when the list is empty', () => {
    mount({ items: [] });
    expect(root.innerHTML).toBe('');
  });

  it('shows the count and the explainer, rows hidden', () => {
    mount();
    expect(text()).toContain('2 residents may need a cert stay');
    expect(text()).toContain('The census shows a skilled payer but no certification stay was started.');
    expect(q('.cert__needs-stay-row')).toBeNull();
  });

  it('singular for one resident', () => {
    mount({ items: [ITEMS[0]] });
    expect(text()).toContain('1 resident may need a cert stay');
  });

  it('every button is tracked', async () => {
    mount();
    await expand();
    for (const b of qa('button')) expect(b.getAttribute('data-track')).toBeTruthy();
  });
});

describe('rows', () => {
  it('one row per resident with payer pill, payer name and dates', async () => {
    mount();
    await expand();
    const rows = qa('.cert__needs-stay-row');
    expect(rows).toHaveLength(2);

    expect(rows[0].textContent).toContain('TEST, RESIDENT ONE');
    expect(rows[0].querySelector('.cert__stay-type-badge').textContent).toBe('Med A');
    expect(rows[0].textContent).toContain('Since Sep 3');
    expect(rows[0].textContent).not.toContain('Discharged');

    expect(rows[1].querySelector('.cert__stay-type-badge').textContent).toBe('Managed');
    expect(rows[1].textContent).toContain('Sample Health Plan');
    expect(rows[1].textContent).toContain('Aug 20 – Sep 1');
    expect(rows[1].textContent).toContain('Discharged');
  });
});

describe('Start stay', () => {
  it('opens the start modal prefilled with the row', async () => {
    mount();
    await expand();
    btn('Start stay', qa('.cert__needs-stay-row')[1]).click();
    await flush();

    expect(q('.cm__title').textContent).toBe('Start cert stay');
    expect(q('.cm__subtitle').textContent).toBe('TEST, RESIDENT TWO');
    expect(q('[data-field="residentSearch"]')).toBeNull(); // resident fixed
    expect(q('input[name="startStayPayer"][value="managed_care"]').checked).toBe(true);
    expect(q('[data-field="startDate"]').value).toBe('2026-08-20');
    expect(q('[data-field="hasLeft"]').checked).toBe(true);
    expect(q('[data-field="endDate"]').value).toBe('2026-09-01');
    expect(fetchCertResidents).not.toHaveBeenCalled();
  });

  it('submits for that resident and refetches', async () => {
    const onChanged = vi.fn();
    mount({ onChanged });
    await expand();
    btn('Start stay', qa('.cert__needs-stay-row')[0]).click();
    await flush();
    type(q('[data-field="reason"]'), 'Census entered late');
    await flush(1);
    [...root.querySelectorAll('.cm__btn')].find(b => b.textContent === 'Start stay').click();
    await flush();

    expect(startManualStay).toHaveBeenCalledWith('Test Facility', 'test-org', {
      patientId: 'p1', payerType: 'medicare_a', startDate: '2026-09-03', endDate: null, reason: 'Census entered late',
    });
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('Not needed', () => {
  it('asks for a reason, then dismisses that row and refetches', async () => {
    const onChanged = vi.fn();
    mount({ onChanged });
    await expand();
    btn('Not needed', qa('.cert__needs-stay-row')[1]).click();
    await flush(1);

    expect(q('.cm__title').textContent).toBe('No cert stay needed');
    const submit = [...root.querySelectorAll('.cm__btn')].find(b => b.textContent === 'Not needed');
    expect(submit.disabled).toBe(true);

    type(q('[data-field="reason"]'), 'Payer entered in error');
    await flush(1);
    expect(submit.disabled).toBe(false);
    submit.click();
    await flush();

    expect(dismissNeedsStay).toHaveBeenCalledWith('Test Facility', 'test-org', {
      patientId: 'p2', payerType: 'managed_care', startDate: '2026-08-20', reason: 'Payer entered in error',
    });
    expect(window.SuperToast.success).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
    expect(q('.cm__title')).toBeNull(); // closed
  });

  it('keeps the modal open with the server message on failure', async () => {
    dismissNeedsStay.mockRejectedValue(new Error('Already dismissed.'));
    mount();
    await expand();
    btn('Not needed', qa('.cert__needs-stay-row')[0]).click();
    await flush(1);
    type(q('[data-field="reason"]'), 'x');
    await flush(1);
    [...root.querySelectorAll('.cm__btn')].find(b => b.textContent === 'Not needed').click();
    await flush();
    expect(q('.cm-error').textContent).toBe('Already dismissed.');
  });
});
