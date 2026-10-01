import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { CERT_FORM } from './cert-form-fixture.js';

const { SendCertModal } = await import('../components/SendCertModal.jsx');
const { EditClinicalReasonModal } = await import('../components/EditClinicalReasonModal.jsx');

/**
 * The checkbox cert form inside the send and edit modals.
 *
 * Orgs with a `certForm` fill a recert by checking boxes from their paper form
 * instead of writing a clinical reason. Orgs without one must see exactly what
 * they saw before — the textarea, the same PUT body — so half of this file pins
 * the standard path.
 */

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };

const PRACTITIONERS = [{ id: 'pr_1', firstName: 'Ada', lastName: 'Chen', title: 'MD' }];

let sendCert, saveClinicalReason, scheduleCertSend, generateClinicalReason;

function futureDate(days = 30) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recert(over = {}) {
  return {
    id: 'cert_1',
    type: 'day_14_recert',
    status: 'pending',
    dueDate: futureDate(7),
    patientName: 'Test Resident',
    isDelayed: false,
    sends: [],
    clinicalReason: '',
    reasonCodes: null,
    reasonOther: null,
    estimatedDays: 21,
    planForDischarge: 'Office Care',
    ...over,
  };
}

async function mount(cert, props = {}) {
  render(
    h(SendCertModal, {
      isOpen: true,
      onClose: () => {},
      cert,
      facilityName: 'Test Facility',
      orgSlug: 'test-org',
      ...props,
    }),
    root
  );
  await flush();
}

const primaryBtn = () => qa('.cm__btn--primary')[0];
const pickPractitioner = async () => {
  qa('.cm-pract input[type=checkbox]')[1].click();
  await flush();
};
const reasonRow = (label) =>
  qa('.cm-reason').find((el) => el.querySelector('.cm-reason__label')?.textContent === label);
const genBtn = () => q('.cm-gen-btn');
/** The checklist opens collapsed once reasons exist; open the full grid. */
const openGrid = async () => {
  const t = qa('.cm-reasons-toggle').find((b) => b.textContent.includes('Edit'));
  if (t) {
    t.click();
    await flush();
  }
};

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  sendCert = vi.fn().mockResolvedValue({});
  saveClinicalReason = vi.fn().mockResolvedValue({});
  scheduleCertSend = vi.fn().mockResolvedValue({});
  generateClinicalReason = vi.fn();
  global.window.CertAPI = {
    fetchPractitioners: vi.fn().mockResolvedValue(PRACTITIONERS),
    sendCert,
    saveClinicalReason,
    scheduleCertSend,
    cancelCertSchedule: vi.fn().mockResolvedValue({}),
    generateClinicalReason,
  };
  global.window.SuperToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  global.window.SuperAnalytics = { track: vi.fn(), toErrorCode: () => 'x' };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('standard orgs (no certForm) are unchanged', () => {
  it('a recert still shows the textarea and no checklist, at normal width', async () => {
    await mount(recert({ clinicalReason: 'Skilled wound care.', planForDischarge: 'Home Health Agency' }));
    expect(q('textarea.cm-input--textarea')).toBeTruthy();
    expect(q('.cm-reasons')).toBeNull();
    expect(q('.cm').classList.contains('cm--wide')).toBe(false);
  });

  it('saves the same body as before', async () => {
    await mount(recert({ clinicalReason: 'Skilled wound care.', planForDischarge: 'Home Health Agency' }));
    await pickPractitioner();
    primaryBtn().click();
    await flush();
    expect(saveClinicalReason).toHaveBeenCalledWith('cert_1', {
      clinicalReason: 'Skilled wound care.',
      estimatedDays: 21,
      planForDischarge: 'Home Health Agency',
    });
    expect(sendCert).toHaveBeenCalled();
  });

  it('a null certForm behaves the same', async () => {
    await mount(recert({ clinicalReason: 'x', planForDischarge: 'Facility Care' }), { certForm: null });
    expect(q('textarea.cm-input--textarea')).toBeTruthy();
    expect(q('.cm-reasons')).toBeNull();
  });
});

describe('checkbox form in the send modal', () => {
  it('renders the checklist in a wide modal for a recert', async () => {
    await mount(recert(), { certForm: CERT_FORM });
    expect(qa('.cm-reason')).toHaveLength(36);
    expect(q('textarea.cm-input--textarea')).toBeNull();
    expect(q('.cm').classList.contains('cm--wide')).toBe(true);
    expect(genBtn().textContent).toContain('Re-check from chart');
  });

  it('an initial cert shows no checklist even with certForm', async () => {
    await mount(recert({ type: 'initial' }), { certForm: CERT_FORM });
    expect(q('.cm-reasons')).toBeNull();
    expect(q('.cm').classList.contains('cm--wide')).toBe(false);
  });

  it('seeds the boxes and Other from the cert', async () => {
    await mount(
      recert({
        reasonCodes: [{ code: 'pneumonia', auto: true, evidence: 'CXR infiltrate' }],
        reasonOther: 'Trach care',
      }),
      { certForm: CERT_FORM }
    );
    // Opens on the summary: the checked reason + Other as chips.
    expect(qa('.cm-reason-chip').map((c) => (c.querySelector('.cm-reason-chip__label') ?? c).textContent.trim())).toEqual(['Pneumonia', 'Other: Trach care']);
    await openGrid();
    expect(reasonRow('Pneumonia').querySelector('input').checked).toBe(true);
    expect(q('.cm-reasons-other input').value).toBe('Trach care');
  });

  it('offers the form\'s own discharge options', async () => {
    await mount(recert(), { certForm: CERT_FORM });
    const labels = qa('.cm-discharge__label').map((el) => el.textContent);
    expect(labels).toEqual([...CERT_FORM.dischargeOptions, 'Other']);
    const checked = q('.cm-discharge__radio:checked');
    expect(checked.closest('label').textContent).toContain('Office Care');
  });

  it('blocks sending with nothing checked and Other blank', async () => {
    await mount(recert(), { certForm: CERT_FORM });
    await pickPractitioner();
    expect(primaryBtn().disabled).toBe(true);
    expect(root.textContent).toContain('Check at least one reason or fill in Other');
    primaryBtn().click();
    await flush();
    expect(saveClinicalReason).not.toHaveBeenCalled();
    expect(sendCert).not.toHaveBeenCalled();
  });

  it('blocks scheduling the same way', async () => {
    await mount(recert(), { certForm: CERT_FORM, startInScheduleMode: true });
    await pickPractitioner();
    expect(primaryBtn().disabled).toBe(true);
  });

  // The primary button is disabled in these states; re-enabling it in the DOM
  // stands in for a click that slips through before the disabled render lands.
  const forceClickPrimary = async () => {
    primaryBtn().disabled = false;
    primaryBtn().click();
    await flush();
  };

  it('schedule with no practitioner and no reason does not lead with the reason toast', async () => {
    await mount(recert(), { certForm: CERT_FORM, startInScheduleMode: true });
    await forceClickPrimary();
    expect(window.SuperToast.error).not.toHaveBeenCalled();
    expect(saveClinicalReason).not.toHaveBeenCalled();
    expect(scheduleCertSend).not.toHaveBeenCalled();
  });

  it('schedule with a practitioner but no reason toasts the reason message', async () => {
    await mount(recert(), { certForm: CERT_FORM, startInScheduleMode: true });
    await pickPractitioner();
    await forceClickPrimary();
    expect(window.SuperToast.error).toHaveBeenCalledWith('Check at least one reason or fill in Other');
    expect(scheduleCertSend).not.toHaveBeenCalled();
  });

  it('Other text alone is enough', async () => {
    await mount(recert({ reasonOther: 'Trach care' }), { certForm: CERT_FORM });
    await pickPractitioner();
    expect(primaryBtn().disabled).toBe(false);
  });

  it('sends reasonCodes + reasonOther and no clinicalReason', async () => {
    await mount(recert({ reasonCodes: [{ code: 'o2_therapy', auto: true, evidence: 'O2 2L NC' }] }), {
      certForm: CERT_FORM,
    });
    await openGrid();
    reasonRow('Labs').querySelector('input').click();
    await flush();
    const other = q('.cm-reasons-other input');
    other.value = 'Trach care';
    other.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    await pickPractitioner();
    primaryBtn().click();
    await flush();

    expect(saveClinicalReason).toHaveBeenCalledWith('cert_1', {
      reasonCodes: [
        { code: 'labs', auto: false, evidence: null },
        { code: 'o2_therapy', auto: true, evidence: 'O2 2L NC' },
      ],
      reasonOther: 'Trach care',
      estimatedDays: 21,
      planForDischarge: 'Office Care',
    });
    expect(saveClinicalReason.mock.calls[0][1]).not.toHaveProperty('clinicalReason');
    expect(sendCert).toHaveBeenCalled();
  });

  it('schedule mode saves the boxes before scheduling', async () => {
    const order = [];
    saveClinicalReason.mockImplementation(async () => { order.push('save'); });
    scheduleCertSend.mockImplementation(async () => { order.push('schedule'); });
    await mount(recert({ reasonCodes: [{ code: 'labs', auto: false, evidence: null }] }), {
      certForm: CERT_FORM,
      startInScheduleMode: true,
    });
    await pickPractitioner();
    primaryBtn().click();
    await flush();
    expect(order).toEqual(['save', 'schedule']);
    expect(saveClinicalReason.mock.calls[0][1].reasonCodes).toEqual([{ code: 'labs', auto: false, evidence: null }]);
  });

  it('Re-check from chart merges: manual boxes kept, old AI boxes replaced', async () => {
    generateClinicalReason.mockResolvedValue({
      clinicalReason: '',
      source: 'ai',
      reasonCodes: [{ code: 'pt_ot', auto: true, evidence: 'PT 5x/week' }],
    });
    await mount(
      recert({
        reasonCodes: [
          { code: 'pneumonia', auto: true, evidence: 'old' },
          { code: 'labs', auto: false, evidence: null },
        ],
      }),
      { certForm: CERT_FORM }
    );
    genBtn().click();
    await flush();
    await openGrid();

    expect(generateClinicalReason).toHaveBeenCalledWith('cert_1');
    expect(reasonRow('Labs').querySelector('input').checked).toBe(true);
    expect(reasonRow('PT/OT').querySelector('input').checked).toBe(true);
    expect(reasonRow('PT/OT').querySelector('.cm-reason__spark')).toBeTruthy();
    expect(reasonRow('Pneumonia').querySelector('input').checked).toBe(false);
    expect(window.SuperAnalytics.track).toHaveBeenCalledWith(
      'cert_reason_generated',
      expect.objectContaining({ form: 'checkbox', surface: 'send' })
    );
  });
});

describe('checkbox form in the edit modal', () => {
  async function mountEdit(cert, props = {}) {
    const onSaved = vi.fn().mockResolvedValue({});
    render(h(EditClinicalReasonModal, { isOpen: true, onClose: () => {}, cert, onSaved, ...props }), root);
    await flush();
    return onSaved;
  }

  it('standard orgs keep the textarea and the same payload', async () => {
    const onSaved = await mountEdit(recert({ clinicalReason: 'Skilled care.', planForDischarge: 'Facility Care' }));
    expect(q('textarea.cm-input--textarea')).toBeTruthy();
    expect(q('.cm-reasons')).toBeNull();
    primaryBtn().click();
    await flush();
    expect(onSaved).toHaveBeenCalledWith({
      clinicalReason: 'Skilled care.',
      estimatedDays: 21,
      planForDischarge: 'Facility Care',
    });
  });

  it('opens on the summary at normal width, widens with the grid, and saves the boxes', async () => {
    const onSaved = await mountEdit(
      recert({ reasonCodes: [{ code: 'gi', auto: false, evidence: null }], planForDischarge: 'Long Term Care' }),
      { certForm: CERT_FORM }
    );
    expect(qa('.cm-reason')).toHaveLength(0);
    expect(qa('.cm-reason-chip')).toHaveLength(1);
    await act(() => openGrid());
    expect(qa('.cm-reason')).toHaveLength(36);
    expect(q('.cm').classList.contains('cm--wide')).toBe(true);
    primaryBtn().click();
    await flush();
    expect(onSaved).toHaveBeenCalledWith({
      reasonCodes: [{ code: 'gi', auto: false, evidence: null }],
      reasonOther: null,
      estimatedDays: 21,
      planForDischarge: 'Long Term Care',
    });
  });

  it('blocks saving with nothing checked and Other blank', async () => {
    const onSaved = await mountEdit(recert(), { certForm: CERT_FORM });
    expect(primaryBtn().disabled).toBe(true);
    expect(root.textContent).toContain('Check at least one reason or fill in Other');
    primaryBtn().click();
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
