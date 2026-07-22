import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from 'preact';
import { FilterBar } from '../FilterBar.jsx';
import { emptyFilters } from '../filter-model.js';

let root;
const mount = (props) => render(h(FilterBar, props), root);
const q = (sel) => root.querySelector(sel);
const qa = (sel) => [...root.querySelectorAll(sel)];
const flush = () => new Promise((r) => setTimeout(r, 0)); // let Preact re-render local state
const triggerByText = (t) => qa('.super-mlf-trigger').find((b) => b.textContent.includes(t));
const chipByText = (t) => qa('.super-mlf-chip').find((b) => b.textContent.trim() === t);
const optByText = (t) => qa('.super-mlf-opt').find((l) => l.textContent.trim() === t);

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  root = document.getElementById('host');
});

describe('FilterBar (flat + dropdowns)', () => {
  it('renders brand mark, search, Discipline/Missing triggers, Type, Due chips', () => {
    mount({ filters: emptyFilters(), types: ['NQ', 'NC'], count: { shown: 3, total: 3 }, onChange: () => {} });
    expect(q('.super-mlf-brand__mark').textContent).toBe('S');
    expect(q('.super-mlf-search')).toBeTruthy();
    expect(triggerByText('Discipline')).toBeTruthy();
    expect(triggerByText('Missing')).toBeTruthy();
    expect(chipByText('Overdue')).toBeTruthy();
    expect(chipByText('Due soon')).toBeTruthy();
    expect(qa('.super-mlf-select option').map((o) => o.value)).toEqual(['all', 'NQ', 'NC']);
    // no gradient/sparkle brand pill anymore
    expect(root.textContent).not.toContain('✦');
  });

  it('opening the Discipline menu and checking SSD raises the SSD section set', async () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    expect(q('.super-mlf-menu')).toBeNull();
    triggerByText('Discipline').click();
    await flush();
    expect(q('.super-mlf-menu')).toBeTruthy();
    optByText('SSD').querySelector('input').click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sections: ['B', 'C', 'D', 'E', 'Q'] }));
  });

  it('toggles an individual section letter from the Discipline menu', async () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    triggerByText('Discipline').click();
    await flush();
    const k = qa('.super-mlf-sec').find((l) => l.textContent.trim() === 'K').querySelector('input');
    k.click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sections: ['K'] }));
  });

  it('trigger label reflects the selection (SSD)', () => {
    mount({ filters: { ...emptyFilters(), sections: ['B', 'C', 'D', 'E', 'Q'] }, types: [], count: { shown: 1, total: 2 }, onChange: () => {} });
    expect(triggerByText('SSD')).toBeTruthy();
  });

  it('opening the Missing menu and checking PHQ-9 raises missingInterviews', async () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    triggerByText('Missing').click();
    await flush();
    optByText('PHQ-9').querySelector('input').click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ missingInterviews: ['phq'] }));
  });

  it('Due chips toggle the due bucket', () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    chipByText('Overdue').click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ due: 'overdue' }));
  });

  it('search input raises onChange with the typed text', () => {
    const onChange = vi.fn();
    mount({ filters: emptyFilters(), types: [], count: { shown: 0, total: 0 }, onChange });
    const input = q('.super-mlf-search');
    input.value = 'gibson';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'gibson' }));
  });

  it('shows count, Clear only when filtered, and an empty note', () => {
    mount({ filters: emptyFilters(), types: [], count: { shown: 5, total: 5 }, onChange: () => {} });
    expect(q('.super-mlf-count').textContent).toContain('Showing');
    expect(q('.super-mlf-clear')).toBeNull();

    const onChange = vi.fn();
    mount({ filters: { ...emptyFilters(), search: 'zzz' }, types: [], count: { shown: 0, total: 5 }, onChange });
    expect(q('.super-mlf-empty')).toBeTruthy();
    q('.super-mlf-clear').click();
    expect(onChange).toHaveBeenCalledWith(emptyFilters());
  });
});
