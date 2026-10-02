import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { StartStayModal } = await import('../components/StartStayModal.jsx');
const { todayISO } = await import('../stay-dates.js');

/**
 * Starting a cert stay by hand: resident picker, payer, dates, reason.
 * The submit button must stay disabled until every required field is in, and
 * the body must be exactly what POST /stays expects.
 */

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const text = () => root.textContent;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };

const RESIDENTS = [
  { patientId: 'p1', patientName: 'TEST, RESIDENT ONE', patientExternalId: 'X1', status: 'active', currentPayer: 'Medicare A', hasOpenStay: false },
  { patientId: 'p2', patientName: 'TEST, RESIDENT TWO', patientExternalId: 'X2', status: 'active', currentPayer: 'Medicare A', hasOpenStay: true },
  { patientId: 'p3', patientName: 'SAMPLE, PERSON', patientExternalId: 'X3', status: 'discharged', currentPayer: 'Managed plan', hasOpenStay: false },
];

const fetchCertResidents = vi.fn();
const startManualStay = vi.fn();

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const field = (name) => q(`[data-field="${name}"]`);
const submitBtn = () => qa('.cm__btn').find(b => /Start stay|Starting/.test(b.textContent));

function mount(props = {}) {
  render(
    h(StartStayModal, {
      isOpen: true,
      onClose: () => {},
      facilityName: 'Test Facility',
      orgSlug: 'test-org',
      managedCareEnabled: true,
      ...props,
    }),
    root
  );
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  fetchCertResidents.mockReset().mockResolvedValue(RESIDENTS);
  startManualStay.mockReset().mockResolvedValue({ stayId: 's1', initialCertId: 'c1' });
  global.window.CertAPI = { fetchCertResidents, startManualStay };
  global.window.SuperToast = { success: vi.fn(), error: vi.fn() };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('resident picker', () => {
  it('loads residents for the facility and lists them', async () => {
    mount();
    await flush();
    expect(fetchCertResidents).toHaveBeenCalledWith('Test Facility', 'test-org');
    expect(text()).toContain('TEST, RESIDENT ONE');
    expect(text()).toContain('SAMPLE, PERSON');
  });

  it('shows residents who already have a stay as disabled, with a note', async () => {
    mount();
    await flush();
    const row = q('[data-patient-id="p2"]');
    expect(row.querySelector('input').disabled).toBe(true);
    expect(row.textContent).toContain('already has a stay');
    expect(q('[data-patient-id="p1"] input').disabled).toBe(false);
  });

  it('filters by search text', async () => {
    mount();
    await flush();
    type(field('residentSearch'), 'sample');
    await flush(1);
    expect(q('[data-patient-id="p3"]')).toBeTruthy();
    expect(q('[data-patient-id="p1"]')).toBeNull();
  });

  it('does not fetch or show the picker when a resident is prefilled', async () => {
    mount({ prefill: { patientId: 'p9', patientName: 'TEST, RESIDENT', payerType: 'medicare_a', startDate: '2026-09-01', endDate: null } });
    await flush();
    expect(fetchCertResidents).not.toHaveBeenCalled();
    expect(field('residentSearch')).toBeNull();
    expect(q('.cm__subtitle').textContent).toBe('TEST, RESIDENT');
  });
});

describe('validation', () => {
  async function fillAll() {
    mount();
    await flush();
    q('[data-patient-id="p1"] input').click();
    type(field('startDate'), '2026-09-01');
    type(field('reason'), 'Census entered late');
    await flush(1);
  }

  it('submit is disabled with nothing filled in', async () => {
    mount();
    await flush();
    expect(submitBtn().disabled).toBe(true);
  });

  it('needs a resident', async () => {
    mount();
    await flush();
    type(field('startDate'), '2026-09-01');
    type(field('reason'), 'r');
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
  });

  it('needs a start date', async () => {
    mount();
    await flush();
    q('[data-patient-id="p1"] input').click();
    type(field('reason'), 'r');
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
  });

  it('needs a reason', async () => {
    mount();
    await flush();
    q('[data-patient-id="p1"] input').click();
    type(field('startDate'), '2026-09-01');
    type(field('reason'), '   ');
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
  });

  it('enables once resident, start date and reason are in', async () => {
    await fillAll();
    expect(submitBtn().disabled).toBe(false);
  });

  it('rejects a start date in the future', async () => {
    await fillAll();
    type(field('startDate'), '2999-01-01');
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
    expect(text()).toContain("can't be in the future");
  });

  it('start date input is capped at today', async () => {
    mount();
    await flush();
    expect(field('startDate').getAttribute('max')).toBe(todayISO());
  });

  it('"Resident has already left" requires an end date on/after the start', async () => {
    await fillAll();
    field('hasLeft').click();
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
    type(field('endDate'), '2026-08-01');
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
    type(field('endDate'), '2026-09-05');
    await flush(1);
    expect(submitBtn().disabled).toBe(false);
  });
});

describe('payer type', () => {
  const payerLabels = () => qa('input[name="startStayPayer"]').map(i => i.value);

  it('offers Medicare A and Managed care when managed care is on', async () => {
    mount({ managedCareEnabled: true });
    await flush();
    expect(payerLabels()).toEqual(['medicare_a', 'managed_care']);
  });

  it('hides Managed care when the facility has it off', async () => {
    mount({ managedCareEnabled: false });
    await flush();
    expect(payerLabels()).toEqual(['medicare_a']);
    expect(text()).not.toContain('Managed care');
  });

  it('defaults to Medicare A', async () => {
    mount();
    await flush();
    expect(q('input[name="startStayPayer"][value="medicare_a"]').checked).toBe(true);
  });
});

describe('submit', () => {
  it('posts the stay and toasts, then closes and refetches', async () => {
    const onClose = vi.fn();
    const onStarted = vi.fn();
    mount({ onClose, onStarted });
    await flush();
    q('[data-patient-id="p3"] input').click();
    q('input[name="startStayPayer"][value="managed_care"]').click();
    type(field('startDate'), '2026-09-01');
    field('hasLeft').click();
    await flush(1);
    type(field('endDate'), '2026-09-12');
    type(field('reason'), '  Auth arrived late  ');
    await flush(1);

    submitBtn().click();
    await flush();

    expect(startManualStay).toHaveBeenCalledWith('Test Facility', 'test-org', {
      patientId: 'p3',
      payerType: 'managed_care',
      startDate: '2026-09-01',
      endDate: '2026-09-12',
      reason: 'Auth arrived late',
    });
    expect(window.SuperToast.success).toHaveBeenCalledWith('Cert stay started');
    expect(onClose).toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalled();
  });

  it('sends endDate null when the resident has not left', async () => {
    mount({ prefill: { patientId: 'p9', patientName: 'TEST, RESIDENT', payerType: 'medicare_a', startDate: '2026-09-01', endDate: null } });
    await flush();
    type(field('reason'), 'r');
    await flush(1);
    submitBtn().click();
    await flush();
    expect(startManualStay.mock.calls[0][2]).toEqual({
      patientId: 'p9', payerType: 'medicare_a', startDate: '2026-09-01', endDate: null, reason: 'r',
    });
  });

  it('shows the server error and stays open on failure', async () => {
    startManualStay.mockRejectedValue(new Error('This resident already has an open stay.'));
    const onClose = vi.fn();
    mount({ onClose, prefill: { patientId: 'p9', patientName: 'TEST, RESIDENT', payerType: 'medicare_a', startDate: '2026-09-01', endDate: null } });
    await flush();
    type(field('reason'), 'r');
    await flush(1);
    submitBtn().click();
    await flush();
    expect(q('.cm-error').textContent).toContain('already has an open stay');
    expect(onClose).not.toHaveBeenCalled();
    expect(submitBtn().disabled).toBe(false);
  });

  it('tells the nurse the initial cert is a draft', async () => {
    mount();
    await flush();
    expect(text()).toContain('The initial certification is created as a draft');
  });
});
