import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { EndStayModal } = await import('../components/EndStayModal.jsx');
const { todayISO } = await import('../stay-dates.js');

let root;
const q = (sel) => root.querySelector(sel);
const text = () => root.textContent;
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };
const submitBtn = () => [...root.querySelectorAll('.cm__btn')].find(b => /End stay|Ending/.test(b.textContent));
function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function mount(props = {}) {
  render(
    h(EndStayModal, {
      isOpen: true,
      onClose: () => {},
      patientName: 'TEST, RESIDENT',
      startDate: '2026-09-01',
      onSubmit: vi.fn().mockResolvedValue({}),
      ...props,
    }),
    root
  );
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('EndStayModal', () => {
  it('defaults the end date to today, capped at today, floored at the start', () => {
    mount();
    const d = q('[data-field="endDate"]');
    expect(d.value).toBe(todayISO());
    expect(d.getAttribute('max')).toBe(todayISO());
    expect(d.getAttribute('min')).toBe('2026-09-01');
  });

  it('requires a reason by default', async () => {
    mount();
    expect(submitBtn().disabled).toBe(true);
    type(q('[data-field="reason"]'), 'Payer changed');
    await flush(1);
    expect(submitBtn().disabled).toBe(false);
  });

  it('submits {endDate, reason}, then closes', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    const onClose = vi.fn();
    mount({ onSubmit, onClose });
    type(q('[data-field="endDate"]'), '2026-09-15');
    type(q('[data-field="reason"]'), '  Payer changed  ');
    await flush(1);
    submitBtn().click();
    await flush();
    expect(onSubmit).toHaveBeenCalledWith({ endDate: '2026-09-15', reason: 'Payer changed' });
    expect(onClose).toHaveBeenCalled();
  });

  it('without askReason there is no reason box and it submits on the date alone', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    mount({ onSubmit, askReason: false });
    expect(q('[data-field="reason"]')).toBeNull();
    expect(submitBtn().disabled).toBe(false);
    submitBtn().click();
    await flush();
    expect(onSubmit).toHaveBeenCalledWith({ endDate: todayISO(), reason: undefined });
  });

  it('blocks an end date before the stay started or in the future', async () => {
    mount({ askReason: false });
    type(q('[data-field="endDate"]'), '2026-08-01');
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
    expect(text()).toContain("can't be before the stay started");
    type(q('[data-field="endDate"]'), '2999-01-01');
    await flush(1);
    expect(submitBtn().disabled).toBe(true);
    expect(text()).toContain("can't be in the future");
  });

  it('shows the server error and stays open', async () => {
    const onClose = vi.fn();
    mount({ askReason: false, onClose, onSubmit: vi.fn().mockRejectedValue(new Error('Stay already ended.')) });
    submitBtn().click();
    await flush();
    expect(q('.cm-error').textContent).toBe('Stay already ended.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
