import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { CertListRow } = await import('../components/CertListRow.jsx');

/**
 * The hourglass on a cert row, and the automated-reminder line beside it.
 *
 * The defect this file exists to prevent: offering "schedule" where the fire
 * pass is guaranteed to cancel it. A discharged resident's stay has ended, so a
 * scheduled send would be accepted from the nurse and then silently dropped at
 * 6 AM — worse than not offering it.
 */

let root;
const q = (sel) => root.querySelector(sel);
const text = () => root.textContent;

function baseCert(over = {}) {
  return {
    id: 'cert_1',
    type: 'initial',
    status: 'sent',
    dueDate: '2026-09-12',
    patientName: 'Ada Lovelace',
    stayStatus: 'active',
    sends: [],
    urgency: 'awaiting_signature',
    daysUntilDue: 2,
    ...over,
  };
}

function mount(cert, props = {}) {
  render(h(CertListRow, { cert, ...props }), root);
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('hourglass visibility', () => {
  it('shows on a cert awaiting a signature', () => {
    mount(baseCert());
    expect(q('.cert__row-hourglass')).toBeTruthy();
  });

  it('shows on a pending cert nobody has sent yet', () => {
    mount(baseCert({ status: 'pending', urgency: 'pending' }));
    expect(q('.cert__row-hourglass')).toBeTruthy();
  });

  it('shows on an already-sent cert', () => {
    // Initials auto-send at admission; a nurse may still queue a send to an
    // additional physician.
    mount(baseCert({ status: 'sent' }));
    expect(q('.cert__row-hourglass')).toBeTruthy();
  });

  it('THE DEFECT: hidden once the stay has ended', () => {
    // Discharged tab, and the active list during the post-discharge grace
    // window. decideScheduledSend cancels any schedule on an ended stay, so
    // offering it would take input and drop it silently.
    mount(baseCert({ stayStatus: 'ended', stayEndDate: '2026-09-20' }));
    expect(q('.cert__row-hourglass')).toBeNull();
  });

  it('hidden on a signed cert', () => {
    mount(baseCert({ status: 'signed', urgency: 'signed', signedAt: '2026-09-13' }));
    expect(q('.cert__row-hourglass')).toBeNull();
  });

  it('hidden on a skipped cert', () => {
    mount(baseCert({ status: 'skipped', urgency: 'skipped' }));
    expect(q('.cert__row-hourglass')).toBeNull();
  });

  it('hidden on a revoked cert', () => {
    mount(baseCert({ status: 'revoked', urgency: 'revoked' }));
    expect(q('.cert__row-hourglass')).toBeNull();
  });
});

describe('hourglass state', () => {
  const scheduled = {
    scheduleId: 'sch_1',
    scheduledLocalDate: '2026-09-23',
    scheduledLocalTime: '06:00',
    displayLabel: 'Wed 9/23 at 6:00 AM',
    practitionerIds: ['pr_1'],
  };

  it('is unfilled and invites scheduling when nothing is queued', () => {
    mount(baseCert());
    const btn = q('.cert__row-hourglass');
    expect(btn.classList.contains('cert__row-hourglass--scheduled')).toBe(false);
    expect(btn.getAttribute('title')).toMatch(/schedule/i);
  });

  it('goes amber and names the time when a send is queued', () => {
    mount(baseCert({ scheduledSend: scheduled }));
    const btn = q('.cert__row-hourglass');
    expect(btn.classList.contains('cert__row-hourglass--scheduled')).toBe(true);
    expect(btn.getAttribute('title')).toContain('Wed 9/23 at 6:00 AM');
  });

  it('spells the schedule out in words too, not just the icon', () => {
    // An overdue row is exactly where a nurse needs certainty rather than a hint.
    mount(baseCert({ scheduledSend: scheduled }));
    expect(text()).toContain('Sends Wed 9/23 at 6:00 AM');
  });

  it('carries an accessible label naming the time', () => {
    mount(baseCert({ scheduledSend: scheduled }));
    expect(q('.cert__row-hourglass').getAttribute('aria-label')).toContain('Wed 9/23');
  });

  it('calls onSchedule with the cert when clicked', () => {
    const onSchedule = vi.fn();
    const cert = baseCert();
    mount(cert, { onSchedule });
    q('.cert__row-hourglass').click();
    expect(onSchedule).toHaveBeenCalledWith(cert);
  });

  it('does not also trigger the row primary action', () => {
    const onSchedule = vi.fn();
    const onSend = vi.fn();
    mount(baseCert(), { onSchedule, onSend });
    q('.cert__row-hourglass').click();
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('automated reminder line', () => {
  it('says nothing before any reminder has gone out', () => {
    mount(baseCert({ autoReminders: { count: 0, lastOnDate: null, remindersStopped: false } }));
    expect(text()).not.toMatch(/Reminded/);
    expect(text()).not.toMatch(/Reminders stopped/);
  });

  it('reports how many times and when, while reminders are running', () => {
    mount(
      baseCert({
        autoReminders: { count: 4, lastOnDate: '2026-09-15', remindersStopped: false },
      })
    );
    expect(text()).toMatch(/Reminded 4/);
    expect(text()).not.toMatch(/Reminders stopped/);
  });

  it('escalates to "needs a call" once reminders have stopped', () => {
    mount(
      baseCert({
        autoReminders: { count: 7, lastOnDate: '2026-09-18', remindersStopped: true },
      })
    );
    expect(text()).toContain('Reminders stopped');
    expect(text()).toMatch(/needs a call/i);
  });

  it('never implies the certification is dead', () => {
    // A delayed cert signed late is still valid; an unsigned one is what gets
    // the claim denied. The wording has to leave the nurse wanting the signature.
    mount(
      baseCert({
        autoReminders: { count: 9, lastOnDate: '2026-09-20', remindersStopped: true },
      })
    );
    expect(text()).not.toMatch(/expired|closed|abandoned|gave up|too late/i);
  });

  it('survives a cert with no reminder data at all', () => {
    // Older cached payloads, and the discharged endpoint.
    mount(baseCert({ autoReminders: undefined }));
    expect(q('.cert__row')).toBeTruthy();
  });
});
