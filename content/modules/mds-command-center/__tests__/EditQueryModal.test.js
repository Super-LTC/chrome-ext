import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from 'preact';
import { EditQueryModal } from '../EditQueryModal.jsx';

/**
 * Covers the SUP-147 ICD-10 edit path: the picker prefills from the code already
 * attached to the query, a swap is PATCHed as a non-empty `recommendedIcd10`,
 * and clearing the code is surfaced rather than sent (the backend 400s on []).
 */

let root;
// The modal hydrates from getQuery() and the picker re-searches on removal, so
// settle over several ticks rather than a single microtask flush.
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 10)); };
const qa = (sel) => [...root.querySelectorAll(sel)];
const q = (sel) => root.querySelector(sel);
const btnByText = (t) => qa('button').find((b) => b.textContent.trim() === t);
const resultByCode = (code) =>
  qa('.super-icd10-picker__result').find((b) => b.textContent.includes(code));

const QUERY = { id: 'q1', patientName: 'Ada L.', mdsItem: 'I2100', mdsItemName: 'Pneumonia', status: 'sent' };

const FULL = {
  ...QUERY,
  nurseEditedNote: 'Please confirm.',
  recommendedIcd10: [{ code: 'J18.9', description: 'Pneumonia, unspecified organism' }],
  timing: null,
};

function mount(props = {}) {
  render(
    h(EditQueryModal, {
      isOpen: true,
      query: QUERY,
      onClose: () => {},
      onSaved: () => Promise.resolve(),
      ...props,
    }),
    root
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  root = document.getElementById('host');
  window.QueryAPI = {
    getQuery: vi.fn().mockResolvedValue(FULL),
    searchIcd10: vi.fn().mockResolvedValue({
      results: [{ code: 'J15.9', description: 'Unspecified bacterial pneumonia' }],
    }),
  };
});

describe('EditQueryModal — ICD-10 edit', () => {
  it('prefills the picker with the code already attached to the query', async () => {
    mount();
    await flush();
    expect(q('.super-icd10-picker')).toBeTruthy();
    expect(q('.super-icd10-picker__chip-code').textContent).toBe('J18.9');
    // Nothing edited yet, so Save stays inert.
    expect(btnByText('Save').disabled).toBe(true);
  });

  it('PATCHes a swapped code as a non-empty recommendedIcd10 array', async () => {
    const onSaved = vi.fn().mockResolvedValue();
    mount({ onSaved });
    await flush();

    // Drop the attached code, then pick a different one from the re-seeded list.
    q('.super-icd10-picker__chip-remove').click();
    await flush();
    const swap = resultByCode('J15.9');
    expect(swap).toBeTruthy();
    swap.click();
    await flush();

    const save = btnByText('Save');
    expect(save.disabled).toBe(false);
    save.click();
    await flush();

    expect(onSaved).toHaveBeenCalledTimes(1);
    const [queryId, changes] = onSaved.mock.calls[0];
    expect(queryId).toBe('q1');
    expect(changes.recommendedIcd10).toEqual([
      { code: 'J15.9', description: 'Unspecified bacterial pneumonia' },
    ]);
    // An untouched note/date must not ride along.
    expect(changes.nurseEditedNote).toBeUndefined();
    expect(changes.effectiveDate).toBeUndefined();
  });

  it('warns and stays inert when the nurse clears the code without replacing it', async () => {
    const onSaved = vi.fn().mockResolvedValue();
    mount({ onSaved });
    await flush();

    q('.super-icd10-picker__chip-remove').click();
    await flush();

    expect(root.textContent).toContain("can't be removed once sent");
    // Clearing alone is not an expressible change, so Save must not fire a PATCH.
    expect(btnByText('Save').disabled).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('flags that swapping the code renames an I8000 direct-code query', async () => {
    const direct = { ...QUERY, mdsItem: 'I8000:J43.2', mdsItemName: 'Emphysema' };
    window.QueryAPI.getQuery.mockResolvedValue({ ...FULL, ...direct });
    mount({ query: direct });
    await flush();
    expect(root.textContent).toContain('renames this query');
  });
});
