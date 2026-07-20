import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from 'preact';
import { FilterBar } from '../FilterBar.jsx';
import { emptyFilters } from '../filter-model.js';

let root;
const mount = (props) => render(h(FilterBar, props), root);
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const chipByText = (t) => qa('.super-mlf-chip').find((b) => b.textContent.trim() === t);

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  root = document.getElementById('host');
});

describe('FilterBar', () => {
  it('renders All + every discipline chip + due chips + search + type', () => {
    mount({ filters: emptyFilters(), types: ['NQ', 'NC'], count: { shown: 3, total: 3 }, onChange: () => {} });
    ['All', 'SSD', 'Nursing', 'Dietary', 'Therapy', 'MDS/Admin', 'Overdue', 'Due soon', 'Missing interview']
      .forEach((label) => expect(chipByText(label), label).toBeTruthy());
    expect(q('.super-mlf-search')).toBeTruthy();
    // type dropdown gets an option per distinct type + the "All types" default
    expect(qa('.super-mlf-select option').map((o) => o.value)).toEqual(['all', 'NQ', 'NC']);
  });

  it('clicking SSD raises onChange with the SSD section set', () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    chipByText('SSD').click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sections: ['B', 'C', 'D', 'E', 'Q'] }));
  });

  it('SSD chip is active when its set is selected, and toggles back to empty', () => {
    const onChange = vi.fn();
    mount({ filters: { ...emptyFilters(), sections: ['B', 'C', 'D', 'E', 'Q'] }, types: [], count: { shown: 1, total: 2 }, onChange });
    expect(chipByText('SSD').classList.contains('is-active')).toBe(true);
    chipByText('SSD').click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sections: [] }));
  });

  it('search input raises onChange with the typed text', () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    const input = q('.super-mlf-search');
    input.value = 'gibson';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'gibson' }));
  });

  it('Overdue and Missing toggles raise the right change', () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    chipByText('Overdue').click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ due: 'overdue' }));
    chipByText('Missing interview').click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ missingOnly: true }));
  });

  it('shows the count, a Clear button only when filtered, and an empty note', () => {
    // no filters → count shown, no Clear
    mount({ filters: emptyFilters(), types: [], count: { shown: 5, total: 5 }, onChange: () => {} });
    expect(q('.super-mlf-count').textContent).toContain('Showing');
    expect(q('.super-mlf-clear')).toBeNull();

    // active filter + zero matches → Clear + empty note
    const onChange = vi.fn();
    mount({ filters: { ...emptyFilters(), search: 'zzz' }, types: [], count: { shown: 0, total: 5 }, onChange });
    expect(q('.super-mlf-empty')).toBeTruthy();
    const clear = q('.super-mlf-clear');
    expect(clear).toBeTruthy();
    clear.click();
    expect(onChange).toHaveBeenCalledWith(emptyFilters());
  });

  it('opens the sections popover and toggles an individual letter', async () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    expect(q('.super-mlf-pop')).toBeNull();
    qa('.super-mlf-chip--ghost')[0].click(); // "Sections ▾" (local state → async re-render)
    await new Promise((r) => setTimeout(r, 0)); // flush Preact re-render
    expect(q('.super-mlf-pop')).toBeTruthy();
    // toggle section "K"
    const kBox = qa('.super-mlf-sec').find((l) => l.textContent.trim() === 'K').querySelector('input');
    kBox.click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sections: ['K'] }));
  });
});
