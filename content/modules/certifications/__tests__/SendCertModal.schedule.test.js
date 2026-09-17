import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { SendCertModal } = await import('../components/SendCertModal.jsx');

/**
 * Schedule mode inside the send modal.
 *
 * The reason this is a mode and not a second modal is that a scheduled send must
 * satisfy the SAME preconditions as an immediate one — a recert queued without
 * its clinical reason would fail unattended at 6 AM with nobody watching. So the
 * assertions that matter most here are the ones proving the Schedule button is
 * gated by exactly the same rules as Send.
 */

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const text = () => root.textContent;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };

const PRACTITIONERS = [
  { id: 'pr_1', firstName: 'Ada', lastName: 'Chen', title: 'MD' },
  { id: 'pr_2', firstName: 'Bo', lastName: 'Reyes', title: 'NP' },
];

const scheduleCertSend = vi.fn().mockResolvedValue({});
const cancelCertSchedule = vi.fn().mockResolvedValue({});
const sendCert = vi.fn().mockResolvedValue({});
const saveClinicalReason = vi.fn().mockResolvedValue({});

function futureDate(days = 30) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function baseCert(over = {}) {
  return {
    id: 'cert_1',
    type: 'initial',
    status: 'pending',
    dueDate: futureDate(7),
    patientName: 'Ada Lovelace',
    isDelayed: false,
    sends: [],
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

/** The footer button that commits (Send now, or Schedule for ...). */
const primaryBtn = () => qa('.cm__btn--primary')[0];
/** The footer toggle between send-now and schedule. */
const toggleBtn = () => qa('.cm__btn--ghost')[0];

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  scheduleCertSend.mockClear();
  cancelCertSchedule.mockClear();
  sendCert.mockClear();
  saveClinicalReason.mockClear();
  global.window.CertAPI = {
    fetchPractitioners: vi.fn().mockResolvedValue(PRACTITIONERS),
    scheduleCertSend,
    cancelCertSchedule,
    sendCert,
    saveClinicalReason,
  };
  global.window.SuperToast = { success: vi.fn(), error: vi.fn() };
  global.window.SuperAnalytics = { track: vi.fn(), toErrorCode: () => 'x' };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('entering schedule mode', () => {
  it('opens in send mode by default', async () => {
    await mount(baseCert());
    expect(text()).toContain('Send Certification');
    expect(q('.cm-section--schedule')).toBeNull();
  });

  it('opens straight into schedule mode for the row hourglass', async () => {
    await mount(baseCert(), { startInScheduleMode: true });
    expect(text()).toContain('Schedule Certification');
    expect(q('.cm-section--schedule')).toBeTruthy();
  });

  it('the footer toggle reveals the picker', async () => {
    await mount(baseCert());
    expect(q('.cm-section--schedule')).toBeNull();
    toggleBtn().click();
    await flush();
    expect(q('.cm-section--schedule')).toBeTruthy();
  });

  it('offers a way back to sending now, not a dead end', async () => {
    await mount(baseCert(), { startInScheduleMode: true });
    expect(toggleBtn().textContent).toMatch(/send now/i);
    toggleBtn().click();
    await flush();
    expect(q('.cm-section--schedule')).toBeNull();
  });

  it('defaults the picker to the due date at 6:00 AM', async () => {
    const due = futureDate(9);
    await mount(baseCert({ dueDate: due }), { startInScheduleMode: true });
    expect(q('.cm-input--date').value).toBe(due);
    expect(q('.cm-input--time').value).toBe('06:00');
  });
});

describe('the Schedule button is gated exactly like Send', () => {
  it('disabled until a practitioner is picked', async () => {
    await mount(baseCert(), { startInScheduleMode: true });
    expect(primaryBtn().disabled).toBe(true);

    qa('.cm-pract input[type=checkbox]')[1].click(); // first real practitioner
    await flush();
    expect(primaryBtn().disabled).toBe(false);
  });

  it('BLOCKS a recert with no clinical reason — the prescheduling trap', async () => {
    // Left open, this queues a send that fails unattended at 6 AM.
    await mount(
      baseCert({ type: 'day_14_recert', clinicalReason: '', planForDischarge: 'Home' }),
      { startInScheduleMode: true }
    );
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    expect(primaryBtn().disabled).toBe(true);
  });

  it('BLOCKS a recert with no plan for discharge', async () => {
    await mount(
      baseCert({ type: 'day_14_recert', clinicalReason: 'Continued skilled care.', planForDischarge: '' }),
      { startInScheduleMode: true }
    );
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    expect(primaryBtn().disabled).toBe(true);
  });

  it('allows a complete recert', async () => {
    await mount(
      baseCert({
        type: 'day_14_recert',
        clinicalReason: 'Continued skilled nursing for wound care.',
        planForDischarge: 'Home with home health',
      }),
      { startInScheduleMode: true }
    );
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    expect(primaryBtn().disabled).toBe(false);
  });

  it('BLOCKS an overdue cert with no delay reason', async () => {
    await mount(baseCert({ isDelayed: true, delayReason: '' }), { startInScheduleMode: true });
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    expect(primaryBtn().disabled).toBe(true);
  });

  it('allows an overdue cert once a delay reason is present', async () => {
    await mount(
      baseCert({ isDelayed: true, delayReason: 'Physician on leave.' }),
      { startInScheduleMode: true }
    );
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    expect(primaryBtn().disabled).toBe(false);
  });

  it('BLOCKS a slot in the past', async () => {
    await mount(baseCert(), { startInScheduleMode: true });
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();

    const dateInput = q('.cm-input--date');
    dateInput.value = '2020-01-01';
    dateInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();

    expect(primaryBtn().disabled).toBe(true);
    expect(text()).toMatch(/future/i);
  });
});

describe('committing a schedule', () => {
  it('sends the local date and time, not an instant', async () => {
    const due = futureDate(11);
    await mount(baseCert({ dueDate: due }), { startInScheduleMode: true });
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    primaryBtn().click();
    await flush();

    expect(scheduleCertSend).toHaveBeenCalledWith('cert_1', {
      practitionerIds: ['pr_1'],
      scheduledLocalDate: due,
      scheduledLocalTime: '06:00',
      delayReason: undefined,
    });
  });

  it('saves the clinical reason before scheduling a recert', async () => {
    await mount(
      baseCert({
        type: 'day_14_recert',
        clinicalReason: 'Continued skilled nursing.',
        planForDischarge: 'Home with home health',
      }),
      { startInScheduleMode: true }
    );
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    primaryBtn().click();
    await flush();

    expect(saveClinicalReason).toHaveBeenCalled();
    expect(scheduleCertSend).toHaveBeenCalled();
  });

  it('carries the delay reason through', async () => {
    await mount(
      baseCert({ isDelayed: true, delayReason: 'Physician on leave.' }),
      { startInScheduleMode: true }
    );
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    primaryBtn().click();
    await flush();

    expect(scheduleCertSend.mock.calls[0][1].delayReason).toBe('Physician on leave.');
  });

  it('does NOT send immediately when scheduling', async () => {
    await mount(baseCert(), { startInScheduleMode: true });
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    primaryBtn().click();
    await flush();

    expect(sendCert).not.toHaveBeenCalled();
  });

  it('surfaces a backend refusal instead of silently failing', async () => {
    // e.g. the discharged-resident guard.
    scheduleCertSend.mockRejectedValueOnce(new Error('This resident has been discharged'));
    await mount(baseCert(), { startInScheduleMode: true });
    qa('.cm-pract input[type=checkbox]')[1].click();
    await flush();
    primaryBtn().click();
    await flush();

    expect(window.SuperToast.error).toHaveBeenCalledWith(
      expect.stringContaining('discharged')
    );
  });
});

describe('an already-scheduled cert', () => {
  const scheduled = {
    scheduleId: 'sch_1',
    scheduledLocalDate: futureDate(14),
    scheduledLocalTime: '08:30',
    displayLabel: 'Wed 9/30 at 8:30 AM',
    practitionerIds: ['pr_2'],
  };

  it('opens in schedule mode without being asked', async () => {
    await mount(baseCert({ scheduledSend: scheduled }));
    expect(q('.cm-section--schedule')).toBeTruthy();
  });

  it('shows a banner naming when it goes out', async () => {
    await mount(baseCert({ scheduledSend: scheduled }));
    expect(q('.cm-scheduled-banner')).toBeTruthy();
    expect(text()).toContain('Wed 9/30 at 8:30 AM');
  });

  it('seeds the picker and recipients from what is queued, not the defaults', async () => {
    await mount(baseCert({ scheduledSend: scheduled }));
    expect(q('.cm-input--date').value).toBe(scheduled.scheduledLocalDate);
    expect(q('.cm-input--time').value).toBe('08:30');
    const checked = qa('.cm-pract input[type=checkbox]:checked');
    expect(checked).toHaveLength(1);
    expect(primaryBtn().textContent).toMatch(/update schedule/i);
  });

  it('cancels the queued send from the banner', async () => {
    const onScheduleChanged = vi.fn();
    await mount(baseCert({ scheduledSend: scheduled }), { onScheduleChanged });
    q('.cm-scheduled-banner__cancel').click();
    await flush();

    expect(cancelCertSchedule).toHaveBeenCalledWith('cert_1');
    expect(onScheduleChanged).toHaveBeenCalled();
  });

  it('warns that sending now replaces the schedule', async () => {
    await mount(baseCert({ scheduledSend: scheduled }));
    expect(text()).toMatch(/replace/i);
  });
});
