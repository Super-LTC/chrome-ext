import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { CERT_FORM, REASON_LABELS } from './cert-form-fixture.js';

const { ReasonChecklist } = await import('../components/ReasonChecklist.jsx');

/**
 * The checkbox cert form: all 36 boxes of the paper form in one grid, in the
 * paper's order, with a sparkle on the boxes the AI checked and its one-line
 * evidence on hover. The order matters — nurses read it against the printed
 * form — and the sparkle must never toggle the box it sits on.
 */

let root;
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const flush = () => new Promise((r) => setTimeout(r, 0));

const reasonRow = (label) =>
  qa('.cm-reason').find((el) => el.querySelector('.cm-reason__label')?.textContent === label);

async function mount(props = {}) {
  const onChange = vi.fn();
  const onOtherChange = vi.fn();
  render(
    h(ReasonChecklist, {
      form: CERT_FORM,
      value: [],
      other: '',
      onChange,
      onOtherChange,
      ...props,
    }),
    root
  );
  await flush();
  return { onChange, onOtherChange };
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('the grid', () => {
  it('renders all 36 boxes in paper order', async () => {
    await mount();
    const rows = qa('.cm-reason');
    expect(rows).toHaveLength(36);
    expect(rows.every((r) => r.tagName === 'LABEL')).toBe(true);
    expect(rows.map((r) => r.querySelector('.cm-reason__label').textContent)).toEqual(REASON_LABELS);
    expect(qa('.cm-reasons input[type="checkbox"].cm-check')).toHaveLength(36);
  });

  it('checks exactly the boxes in value and tints them', async () => {
    await mount({
      value: [
        { code: 'pneumonia', auto: false, evidence: null },
        { code: 'o2_therapy', auto: true, evidence: 'O2 2L NC' },
      ],
    });
    const checked = qa('.cm-reason input:checked').map(
      (i) => i.closest('.cm-reason').querySelector('.cm-reason__label').textContent
    );
    expect(checked).toEqual(['Pneumonia', 'O2 Therapy']);
    expect(reasonRow('Pneumonia').classList.contains('cm-reason--selected')).toBe(true);
    expect(reasonRow('Labs').classList.contains('cm-reason--selected')).toBe(false);
  });

  it('shows how many are checked', async () => {
    await mount({
      value: [
        { code: 'pneumonia', auto: false, evidence: null },
        { code: 'labs', auto: false, evidence: null },
      ],
    });
    expect(root.textContent).toContain('2 checked');
  });

  it('shows no count when nothing is checked', async () => {
    await mount({ value: [] });
    expect(q('.cm-reasons__count')).toBeNull();
    expect(root.textContent).not.toContain('checked');
  });

  it('shows no "0 checked" when only Other is filled in', async () => {
    await mount({ value: [], other: 'Trach care' });
    expect(q('.cm-reasons__count')).toBeNull();
    expect(root.textContent).not.toContain('0 checked');
  });
});

describe('toggling', () => {
  it('checking a box calls onChange with it added, in paper order', async () => {
    const { onChange } = await mount({
      value: [{ code: 'cva_hemiplegia', auto: false, evidence: null }],
    });
    reasonRow('Labs').querySelector('input').click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      { code: 'labs', auto: false, evidence: null },
      { code: 'cva_hemiplegia', auto: false, evidence: null },
    ]);
  });

  it('unchecking an AI box calls onChange with it removed', async () => {
    const { onChange } = await mount({
      value: [
        { code: 'pt_ot', auto: true, evidence: 'PT 5x/week' },
        { code: 'st', auto: false, evidence: null },
      ],
    });
    reasonRow('PT/OT').querySelector('input').click();
    expect(onChange.mock.calls[0][0]).toEqual([{ code: 'st', auto: false, evidence: null }]);
  });
});

describe('the AI sparkle', () => {
  const VALUE = [
    { code: 'pt_ot', auto: true, evidence: 'Therapy note: PT/OT 5x/week for gait training' },
    { code: 'pneumonia', auto: false, evidence: null },
  ];

  it('appears only on boxes the AI checked', async () => {
    await mount({ value: VALUE });
    expect(qa('.cm-reason__spark')).toHaveLength(1);
    expect(reasonRow('PT/OT').querySelector('.cm-reason__spark')).toBeTruthy();
    expect(reasonRow('Pneumonia').querySelector('.cm-reason__spark')).toBeNull();
  });

  it('carries the evidence in its tooltip and is keyboard-focusable', async () => {
    await mount({ value: VALUE });
    const spark = reasonRow('PT/OT').querySelector('.cm-reason__spark');
    expect(spark.getAttribute('tabindex')).toBe('0');
    expect(spark.querySelector('.cm-reason__why').textContent).toBe(
      'Therapy note: PT/OT 5x/week for gait training'
    );
  });

  it('is announced as an image labelled "Checked by AI", described by its tooltip', async () => {
    await mount({ value: VALUE });
    const spark = reasonRow('PT/OT').querySelector('.cm-reason__spark');
    expect(spark.getAttribute('role')).toBe('img');
    expect(spark.getAttribute('aria-label')).toBe('Checked by AI');
    const tip = spark.querySelector('.cm-reason__why');
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(spark.getAttribute('aria-describedby')).toBe(tip.id);
  });

  it('carries the full evidence in a title, since the tooltip clamps long text', async () => {
    const long =
      'Therapy note: PT/OT 5x/week for gait training, transfers, and ADL retraining after a ' +
      'left hip ORIF; requires skilled cueing for weight-bearing precautions on every session.';
    await mount({ value: [{ code: 'pt_ot', auto: true, evidence: long }] });
    expect(reasonRow('PT/OT').querySelector('.cm-reason__spark').getAttribute('title')).toBe(long);
  });

  it('clicking the sparkle does not toggle the box', async () => {
    const { onChange } = await mount({ value: VALUE });
    const row = reasonRow('PT/OT');
    // Click the icon itself, as a mouse would. jsdom skips label activation for
    // a tabindex'd target (Chrome does not), so the onChange check alone passes
    // even without the guard — defaultPrevented is the assertion that can fail.
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    row.querySelector('.cm-reason__spark svg').dispatchEvent(click);
    await flush();
    expect(click.defaultPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(row.querySelector('input').checked).toBe(true);
  });
});

describe('Other', () => {
  it('shows the current text and reports typing', async () => {
    const { onOtherChange } = await mount({ other: 'Trach care' });
    const input = q('.cm-reasons-other input.cm-input');
    expect(input.value).toBe('Trach care');

    input.value = 'Trach care and suctioning';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onOtherChange).toHaveBeenCalledWith('Trach care and suctioning');
  });

  it('renders empty when other is null', async () => {
    await mount({ other: null });
    expect(q('.cm-reasons-other input').value).toBe('');
  });
});
