import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { StayGroupCard } = await import('../components/StayGroupCard.jsx');

/**
 * Stay-level controls on the stay card: the Manual badge, the review banner
 * (payer check / discharged), and the stay ⋮ menu.
 */

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const text = () => root.textContent;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };
const btn = (label) => qa('button').find(b => b.textContent.trim() === label);
function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function cert(over = {}) {
  return {
    id: 'cert_1',
    type: 'initial',
    status: 'pending',
    dueDate: '2026-09-12',
    patientName: 'TEST, RESIDENT',
    payerType: 'managed_care',
    partAStayId: 'stay_1',
    partAStartDate: '2026-09-01',
    stayStatus: 'active',
    stayMode: 'auto',
    stayReviewKind: null,
    stayReviewReason: null,
    sends: [],
    urgency: 'pending',
    daysUntilDue: 5,
    ...over,
  };
}

const api = {
  resolveStayReview: vi.fn(),
  setStayMode: vi.fn(),
  endStay: vi.fn(),
  addStayCertification: vi.fn(),
};

function mount(c = cert(), props = {}) {
  render(
    h(StayGroupCard, {
      stayId: c.partAStayId || c.id,
      displayCerts: [c],
      historyCerts: [],
      allCerts: [c],
      onStayChanged: () => {},
      ...props,
    }),
    root
  );
}

async function openMenu() {
  q('[aria-label="Stay actions"]').click();
  await flush(1);
}
const menuItems = () => qa('.cert__stay-menu .cert__row-menu-item').map(b => b.textContent.trim());

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  for (const fn of Object.values(api)) fn.mockReset().mockResolvedValue({ success: true });
  global.window.CertAPI = { ...api };
  global.window.SuperToast = { success: vi.fn(), error: vi.fn() };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('Manual badge', () => {
  it('shows "Manual" with the explainer tooltip on a manual stay', () => {
    mount(cert({ stayMode: 'manual' }));
    const badge = q('.cert__manual-badge');
    expect(badge.textContent).toBe('Manual');
    expect(badge.getAttribute('title')).toBe("You manage this stay. The system won't start or end it from PCC.");
  });

  it('is absent on an automatic stay', () => {
    mount();
    expect(q('.cert__manual-badge')).toBeNull();
  });
});

describe('review banner — payer check', () => {
  const flagged = () => cert({
    stayReviewKind: 'payer_check',
    stayReviewReason: 'The census no longer shows a managed-care payer. Is this still a managed-care stay?',
    stayReviewSince: '2026-09-20T12:00:00Z',
  });

  it('shows the server reason', () => {
    mount(flagged());
    expect(q('.cert__stay-review').textContent).toContain('Is this still a managed-care stay?');
  });

  it('"Still managed care" confirms the review and refetches', async () => {
    const onStayChanged = vi.fn();
    mount(flagged(), { onStayChanged });
    btn('Still managed care').click();
    await flush();
    expect(api.resolveStayReview).toHaveBeenCalledWith('stay_1', { action: 'confirm' });
    expect(onStayChanged).toHaveBeenCalled();
  });

  it('"End stay" opens the date picker (no reason box), then ends via review', async () => {
    const onStayChanged = vi.fn();
    mount(flagged(), { onStayChanged });
    q('.cert__stay-review [data-action="end"]').click();
    await flush(1);
    expect(q('.cm__title').textContent).toBe('End stay');
    expect(q('[data-field="reason"]')).toBeNull();
    type(q('[data-field="endDate"]'), '2026-09-18');
    await flush(1);
    qa('.cm__btn').find(b => b.textContent === 'End stay').click();
    await flush();
    expect(api.resolveStayReview).toHaveBeenCalledWith('stay_1', { action: 'end', endDate: '2026-09-18' });
    expect(api.endStay).not.toHaveBeenCalled();
    expect(onStayChanged).toHaveBeenCalled();
  });

  it('a failed confirm toasts the server message', async () => {
    api.resolveStayReview.mockRejectedValue(new Error('Stay was changed by someone else.'));
    mount(flagged());
    btn('Still managed care').click();
    await flush();
    expect(window.SuperToast.error).toHaveBeenCalledWith('Stay was changed by someone else.');
  });
});

describe('review banner — discharged', () => {
  const flagged = () => cert({ stayReviewKind: 'discharged', stayReviewReason: 'Discharged on Sep 20. End the stay?' });

  it('"End stay" asks first — the date is pre-filled with the PCC discharge date — never one click', async () => {
    mount(cert({ stayReviewKind: 'discharged', stayReviewReason: 'Discharged on Sep 20.', patientDischargeDate: '2026-09-20' }));
    q('.cert__stay-review [data-action="end"]').click();
    await flush(1);
    expect(api.resolveStayReview).not.toHaveBeenCalled();
    expect(q('.cm__title').textContent).toBe('End stay');
    expect(q('[data-field="endDate"]').value).toBe('2026-09-20');
    expect(q('[data-field="reason"]')).toBeNull();
    qa('.cm__btn').find(b => b.textContent === 'End stay').click();
    await flush();
    expect(api.resolveStayReview).toHaveBeenCalledWith('stay_1', { action: 'end', endDate: '2026-09-20' });
  });

  it('"Keep open" confirms', async () => {
    mount(flagged());
    btn('Keep open').click();
    await flush();
    expect(api.resolveStayReview).toHaveBeenCalledWith('stay_1', { action: 'confirm' });
  });

  it('no banner when the stay is not flagged', () => {
    mount();
    expect(q('.cert__stay-review')).toBeNull();
  });
});

describe('stay menu', () => {
  it('automatic, open stay: Switch to manual / Add certification / End stay', async () => {
    mount();
    await openMenu();
    expect(menuItems()).toEqual(['Switch to manual', 'Add certification', 'End stay']);
  });

  it('manual stay offers "Back to automatic"', async () => {
    mount(cert({ stayMode: 'manual' }));
    await openMenu();
    expect(menuItems()[0]).toBe('Back to automatic');
  });

  it('ended stay has no "End stay"', async () => {
    mount(cert({ stayStatus: 'ended', stayEndDate: '2026-09-20' }));
    await openMenu();
    expect(menuItems()).not.toContain('End stay');
  });

  it('discharged tab (dischargeDate) has no "End stay"', async () => {
    mount(cert(), { dischargeDate: '2026-09-20' });
    await openMenu();
    expect(menuItems()).not.toContain('End stay');
  });

  it('no menu when the cert has no stay id', () => {
    mount(cert({ partAStayId: null }));
    expect(q('[aria-label="Stay actions"]')).toBeNull();
  });

  it('every stay-level button is tracked', async () => {
    mount(cert({ stayReviewKind: 'payer_check' }));
    await openMenu();
    const stayButtons = qa('.cert__stay-menu button, .cert__stay-review button');
    expect(stayButtons.length).toBeGreaterThan(0);
    for (const b of stayButtons) expect(b.getAttribute('data-track')).toBeTruthy();
  });

  it('Switch to manual asks for a reason, explains, and sets mode', async () => {
    const onStayChanged = vi.fn();
    mount(cert(), { onStayChanged });
    await openMenu();
    q('.cert__stay-menu [data-action="mode"]').click();
    await flush(1);
    expect(text()).toContain('The system will stop starting or ending this stay from PCC data. Recerts will still be created on schedule for you to send.');
    type(q('[data-field="reason"]'), 'Payer mismatch');
    await flush(1);
    qa('.cm__btn').find(b => b.textContent === 'Switch to manual').click();
    await flush();
    expect(api.setStayMode).toHaveBeenCalledWith('stay_1', 'manual', 'Payer mismatch');
    expect(onStayChanged).toHaveBeenCalled();
  });

  it('Back to automatic sets mode auto', async () => {
    mount(cert({ stayMode: 'manual' }));
    await openMenu();
    q('.cert__stay-menu [data-action="mode"]').click();
    await flush(1);
    type(q('[data-field="reason"]'), 'Census fixed');
    await flush(1);
    qa('.cm__btn').find(b => b.textContent === 'Back to automatic').click();
    await flush();
    expect(api.setStayMode).toHaveBeenCalledWith('stay_1', 'auto', 'Census fixed');
  });

  it('End stay (menu) requires a reason and calls endStay', async () => {
    mount();
    await openMenu();
    q('.cert__stay-menu [data-action="end"]').click();
    await flush(1);
    type(q('[data-field="endDate"]'), '2026-09-19');
    type(q('[data-field="reason"]'), 'Private pay now');
    await flush(1);
    qa('.cm__btn').find(b => b.textContent === 'End stay').click();
    await flush();
    expect(api.endStay).toHaveBeenCalledWith('stay_1', { endDate: '2026-09-19', reason: 'Private pay now' });
    expect(api.resolveStayReview).not.toHaveBeenCalled();
  });

  it('Add certification posts type + due date, defaulting to the first missing type', async () => {
    mount();
    await openMenu();
    q('.cert__stay-menu [data-action="addCert"]').click();
    await flush(1);
    expect(q('[data-field="type"]').value).toBe('day_14_recert'); // stay already has the initial
    type(q('[data-field="dueDate"]'), '2026-09-15');
    await flush(1);
    qa('.cm__btn').find(b => b.textContent === 'Add').click();
    await flush();
    expect(api.addStayCertification).toHaveBeenCalledWith('stay_1', { type: 'day_14_recert', dueDate: '2026-09-15' });
  });
});
