/**
 * Full-library ICD-10 search in the evidence panel's code dropdown (SUP-264).
 *
 * The dropdown used to filter only the codes Comprehend returned for the
 * current diagnosis group, so searching "diabetes" on an I69 group said
 * "No matches". These cover the library path, the ordering guarantee, and the
 * staging hazard that comes with picking a code no annotation backs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The module assigns to window on import.
import '../icd10-evidence-panel.js';

const panel = window.ICD10EvidencePanel;

/** Mount the panel with a group whose evidence-backed codes are all I69.*. */
function mountI69Group() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  panel.init(container, () => {}, () => {}, () => {}, () => {});
  panel.updateItems(
    [
      {
        id: 'ann-1',
        icd10Code: 'I69.320',
        description: 'Aphasia following cerebral infarction',
        documentId: 'doc-1',
        documentName: 'H&P',
        pageNumber: 2,
        options: [
          { code: 'I69.354', description: 'Hemiplegia following cerebral infarction', evidenceKind: 'primary' },
          { code: 'I69.391', description: 'Dysphagia following cerebral infarction', evidenceKind: 'primary' },
          { code: 'I69.398', description: 'Other sequelae', evidenceKind: 'alternate' },
        ],
      },
    ],
    true,
    { groupCode: 'I69', groupName: 'Sequelae of cerebrovascular disease' }
  );
  return container;
}

/** Type into the dropdown's search box and flush the debounce. */
async function typeSearch(container, text) {
  const input = container.querySelector('[data-action="code-search"]');
  input.value = text;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await vi.runAllTimersAsync();
  // Let the awaited searchIcd10 promise settle and repaint.
  await Promise.resolve();
  await Promise.resolve();
}

function rowCodes(container) {
  return Array.from(container.querySelectorAll('[data-select-code]'))
    .map(el => el.dataset.selectCode);
}

describe('evidence panel — full-library code search', () => {
  let container;

  beforeEach(() => {
    vi.useFakeTimers();
    window.QueryAPI = { searchIcd10: vi.fn(async () => ({ results: [] })) };
    container = mountI69Group();
  });

  afterEach(() => {
    vi.useRealTimers();
    container?.remove();
    delete window.QueryAPI;
    panel.clear();
  });

  it('opens the dropdown even when the group yielded a single code', () => {
    // The whole point of the dropdown is now library access, so a sparse
    // group must not hide the chevron.
    panel.updateItems(
      [{ id: 'a', icd10Code: 'E11.9', description: 'Type 2 diabetes', options: [] }],
      true,
      { groupCode: 'E11.9', groupName: 'Type 2 diabetes' }
    );
    panel._toggleCodeDropdown();
    expect(panel.codeDropdownOpen).toBe(true);
    expect(container.querySelector('.icd10-evidence-panel__code-dropdown')).toBeTruthy();
  });

  it('queries the library and shows codes the group never extracted', async () => {
    window.QueryAPI.searchIcd10 = vi.fn(async () => ({
      results: [
        { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
        { code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia' },
      ],
    }));

    panel._toggleCodeDropdown();
    await typeSearch(container, 'diabetes');

    expect(window.QueryAPI.searchIcd10).toHaveBeenCalledWith('diabetes');
    const codes = rowCodes(container);
    expect(codes).toContain('E11.9');
    expect(codes).toContain('E11.65');
    // The old behaviour — the reason this ticket exists.
    expect(container.textContent).not.toMatch(/No matches/);
  });

  it('ranks evidence-backed codes above library results', async () => {
    // "cerebral" hits both the group's own codes and the library.
    window.QueryAPI.searchIcd10 = vi.fn(async () => ({
      results: [{ code: 'G93.1', description: 'Anoxic brain damage, cerebral' }],
    }));

    panel._toggleCodeDropdown();
    await typeSearch(container, 'cerebral');

    const codes = rowCodes(container);
    expect(codes).toContain('G93.1');
    // Every I69.* evidence row must come before the library row.
    expect(codes.indexOf('I69.320')).toBeLessThan(codes.indexOf('G93.1'));
  });

  it('does not repeat a library code that is already an evidence row', async () => {
    window.QueryAPI.searchIcd10 = vi.fn(async () => ({
      results: [
        { code: 'I69.320', description: 'Aphasia following cerebral infarction' },
        { code: 'I69.90', description: 'Unspecified sequelae' },
      ],
    }));

    panel._toggleCodeDropdown();
    await typeSearch(container, 'I69');

    const codes = rowCodes(container);
    expect(codes.filter(c => c === 'I69.320')).toHaveLength(1);
    expect(codes).toContain('I69.90');
  });

  it('does not call the endpoint below the 2-char floor', async () => {
    panel._toggleCodeDropdown();
    await typeSearch(container, 'd');
    expect(window.QueryAPI.searchIcd10).not.toHaveBeenCalled();
  });

  it('drops stale results when the query has moved on', async () => {
    window.QueryAPI.searchIcd10 = vi.fn(async () => ({
      results: [{ code: 'E11.9', description: 'Type 2 diabetes' }],
    }));

    panel._toggleCodeDropdown();
    await typeSearch(container, 'diabetes');
    expect(rowCodes(container)).toContain('E11.9');

    // Backspacing under the floor must clear the diabetes rows, not leave them
    // sitting under an unrelated query.
    await typeSearch(container, 'd');
    expect(rowCodes(container)).not.toContain('E11.9');
  });

  it('surfaces a reachable message when the library call fails', async () => {
    window.QueryAPI.searchIcd10 = vi.fn(async () => { throw new Error('offline'); });
    panel._toggleCodeDropdown();
    await typeSearch(container, 'diabetes');
    expect(container.textContent).toMatch(/Couldn't reach the ICD-10 library/);
  });
});

describe('evidence panel — staging a library-picked code', () => {
  let container;

  beforeEach(() => {
    vi.useFakeTimers();
    window.QueryAPI = { searchIcd10: vi.fn(async () => ({ results: [] })) };
    container = mountI69Group();
  });

  afterEach(() => {
    vi.useRealTimers();
    container?.remove();
    delete window.QueryAPI;
    panel.clear();
  });

  it('marks a code as library-sourced only when the group does not have it', () => {
    panel._selectCode('I69.354', 'Hemiplegia following cerebral infarction');
    expect(panel.selectedCodeFromLibrary).toBe(false);

    panel._selectCode('E11.9', 'Type 2 diabetes mellitus without complications');
    expect(panel.selectedCodeFromLibrary).toBe(true);
  });

  it('stages a library code with no annotation id', async () => {
    // Regression guard: the approve payload used to inherit items[0] wholesale,
    // so the viewer would splice ann-1 out of the sidebar when the coder staged
    // an unrelated code they had searched for.
    const onApprove = vi.fn(async () => {});
    panel.onApprove = onApprove;

    panel._selectCode('E11.9', 'Type 2 diabetes mellitus without complications');
    await panel._handleApprove();

    expect(onApprove).toHaveBeenCalledTimes(1);
    const staged = onApprove.mock.calls[0][0];
    expect(staged.icd10Code).toBe('E11.9');
    expect(staged.id).toBeNull();
    expect(staged.fromLibrary).toBe(true);
  });

  it('still carries the annotation id for an evidence-backed code', async () => {
    const onApprove = vi.fn(async () => {});
    panel.onApprove = onApprove;

    panel._selectCode('I69.320', 'Aphasia following cerebral infarction');
    await panel._handleApprove();

    const staged = onApprove.mock.calls[0][0];
    expect(staged.icd10Code).toBe('I69.320');
    expect(staged.id).toBe('ann-1');
    expect(staged.fromLibrary).toBe(false);
  });
});
