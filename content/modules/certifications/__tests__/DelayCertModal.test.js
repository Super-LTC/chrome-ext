import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, h } from 'preact';

const { DelayCertModal } = await import('../components/DelayCertModal.jsx');

let root;
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };
const primary = () => [...root.querySelectorAll('.cm__btn')].find((b) => /Mark Delayed|Saving/.test(b.textContent));

beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });
afterEach(() => { render(null, root); root.remove(); });

describe('DelayCertModal', () => {
  it('is usable again after a successful save (was stuck on "Saving...")', async () => {
    let open = true;
    const props = () => ({ isOpen: open, onClose: () => { open = false; }, cert: { patientName: 'TEST, RESIDENT' }, onDelayed: () => Promise.resolve() });
    render(h(DelayCertModal, props()), root);
    const ta = root.querySelector('textarea');
    ta.value = 'Physician on leave';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(1);
    primary().click();
    await flush();
    // Reopen (the component stays mounted in CertsView between opens).
    open = true;
    render(h(DelayCertModal, props()), root);
    await flush(1);
    expect(primary().textContent).toBe('Mark Delayed');
  });
});
