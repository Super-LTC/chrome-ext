import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { ScheduledSendsModal } = await import('../components/ScheduledSendsModal.jsx');

/**
 * The facility-wide "what is about to go out" list, with inline edit and cancel.
 */

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const text = () => root.textContent;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };

const updateScheduledSend = vi.fn().mockResolvedValue({});
const cancelScheduledSend = vi.fn().mockResolvedValue({});

function futureDate(days = 20) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SCHEDULE = {
  id: 'sch_1',
  certificationId: 'cert_1',
  patientName: 'Ada Lovelace',
  certType: 'day_14_recert',
  certDueDate: '2026-09-26',
  scheduledLocalDate: futureDate(20),
  scheduledLocalTime: '06:00',
  displayLabel: 'Wed 9/23 at 6:00 AM',
  practitionerIds: ['pr_1', 'pr_2'],
  practitionerNames: ['Ada Chen, MD', 'Bo Reyes, NP'],
};

function mount(props = {}) {
  render(
    h(ScheduledSendsModal, {
      isOpen: true,
      onClose: () => {},
      schedules: [SCHEDULE],
      loading: false,
      error: null,
      onRefetch: () => {},
      ...props,
    }),
    root
  );
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  updateScheduledSend.mockClear();
  cancelScheduledSend.mockClear();
  global.window.CertAPI = { updateScheduledSend, cancelScheduledSend };
  global.window.SuperToast = { success: vi.fn(), error: vi.fn() };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('list states', () => {
  it('shows a spinner while loading', () => {
    mount({ loading: true, schedules: [] });
    expect(q('.cm-loading')).toBeTruthy();
  });

  it('shows the error when the fetch failed', () => {
    mount({ loading: false, error: 'Failed to load scheduled sends', schedules: [] });
    expect(text()).toContain('Failed to load scheduled sends');
  });

  it('explains how to schedule when nothing is queued', () => {
    mount({ schedules: [] });
    expect(text()).toContain('Nothing scheduled');
    expect(text()).toMatch(/hourglass/i);
  });

  it('counts what is queued in the subtitle', () => {
    mount();
    expect(text()).toMatch(/1 certification queued/);
  });

  it('pluralises the count', () => {
    mount({ schedules: [SCHEDULE, { ...SCHEDULE, id: 'sch_2' }] });
    expect(text()).toMatch(/2 certifications queued/);
  });
});

describe('a queued row', () => {
  it('names the patient, the time and the recipients', () => {
    mount();
    expect(text()).toContain('Ada Lovelace');
    expect(text()).toContain('Wed 9/23 at 6:00 AM');
    expect(text()).toContain('Ada Chen, MD & Bo Reyes, NP');
  });

  it('collapses a long recipient list', () => {
    mount({
      schedules: [{ ...SCHEDULE, practitionerNames: ['A B, MD', 'C D, NP', 'E F, MD'] }],
    });
    expect(text()).toContain('3 practitioners');
  });

  it('shows the cert due date alongside the send time', () => {
    // Nurses reason about the due date; the send time is our scheduling detail.
    mount();
    expect(text()).toMatch(/Due/);
  });

  it('cancels via the API and refetches', async () => {
    const onRefetch = vi.fn();
    mount({ onRefetch });
    qa('.cert-sched__btn--danger')[0].click();
    await flush();

    expect(cancelScheduledSend).toHaveBeenCalledWith('sch_1');
    expect(onRefetch).toHaveBeenCalled();
  });

  it('surfaces a cancel failure rather than pretending it worked', async () => {
    cancelScheduledSend.mockRejectedValueOnce(new Error('gone'));
    mount();
    qa('.cert-sched__btn--danger')[0].click();
    await flush();

    expect(window.SuperToast.error).toHaveBeenCalled();
  });
});

describe('inline edit', () => {
  const openEditor = async () => {
    const edit = qa('.cert-sched__btn').find((b) => /edit/i.test(b.textContent));
    edit.click();
    await flush();
  };

  it('is closed until asked for', () => {
    mount();
    expect(q('.cert-sched__editor')).toBeNull();
  });

  it('opens on the queued time, not on defaults', async () => {
    mount();
    await openEditor();
    expect(q('.cert-sched__editor')).toBeTruthy();
    expect(q('.cm-input--date').value).toBe(SCHEDULE.scheduledLocalDate);
    expect(q('.cm-input--time').value).toBe('06:00');
  });

  it('saves a new local date and time', async () => {
    const onRefetch = vi.fn();
    mount({ onRefetch });
    await openEditor();

    const newDate = futureDate(25);
    const dateInput = q('.cm-input--date');
    dateInput.value = newDate;
    dateInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();

    q('.cert-sched__btn--primary').click();
    await flush();

    expect(updateScheduledSend).toHaveBeenCalledWith('sch_1', {
      scheduledLocalDate: newDate,
      scheduledLocalTime: '06:00',
    });
    expect(onRefetch).toHaveBeenCalled();
  });

  it('refuses to save a slot in the past', async () => {
    mount();
    await openEditor();

    const dateInput = q('.cm-input--date');
    dateInput.value = '2020-01-01';
    dateInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();

    expect(q('.cert-sched__btn--primary').disabled).toBe(true);
    q('.cert-sched__btn--primary').click();
    await flush();
    expect(updateScheduledSend).not.toHaveBeenCalled();
  });

  it('surfaces a save failure', async () => {
    updateScheduledSend.mockRejectedValueOnce(new Error('Scheduled time must be in the future'));
    mount();
    await openEditor();
    q('.cert-sched__btn--primary').click();
    await flush();

    expect(window.SuperToast.error).toHaveBeenCalledWith(
      expect.stringContaining('future')
    );
  });
});
