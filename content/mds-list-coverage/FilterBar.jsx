// content/mds-list-coverage/FilterBar.jsx
// Flat, Super-branded filter toolbar above the MDS "In Progress" list.
//
// CONTROLLED component: all filter state lives in the vanilla controller
// (mds-list-coverage.js) and arrives via `filters`; every change is raised through
// `onChange(nextFilters)`. The only local state is which dropdown menu is open.
//
// Styling is deliberately flat (solid brand color, square-ish corners, no
// gradients/pills) so it reads as a real enterprise filter bar, not an "AI" widget.

import { useState, useEffect } from 'preact/hooks';
import {
  DISCIPLINES,
  ALL_SECTIONS,
  INTERVIEW_OPTIONS,
  emptyFilters,
  isEmptyFilters,
  disciplineActive,
  toggleDiscipline,
  disciplineButtonLabel,
} from './filter-model.js';

const DUE_OPTIONS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'soon', label: 'Due soon' },
];

export function FilterBar({ filters, types = [], count = { shown: 0, total: 0 }, onChange }) {
  const f = filters || emptyFilters();
  const [openMenu, setOpenMenu] = useState(null); // 'discipline' | 'missing' | null

  // Close the open menu on outside click / Escape. A click that lands inside ANY
  // dropdown is left alone (so multi-select and switching menus both work).
  useEffect(() => {
    if (!openMenu) return undefined;
    const onDoc = (e) => { if (!e.target?.closest?.('.super-mlf-dd')) setOpenMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [openMenu]);

  const set = (patch) => onChange?.({ ...f, ...patch });
  const sections = f.sections || [];
  const missing = f.missingInterviews || [];
  const toggle = (menu) => setOpenMenu((cur) => (cur === menu ? null : menu));

  const toggleSection = (letter) => {
    const cur = new Set(sections);
    if (cur.has(letter)) cur.delete(letter); else cur.add(letter);
    set({ sections: ALL_SECTIONS.filter((s) => cur.has(s)) });
  };
  const toggleMissing = (key) => {
    const cur = new Set(missing);
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    set({ missingInterviews: INTERVIEW_OPTIONS.filter((o) => cur.has(o.key)).map((o) => o.key) });
  };

  const missingLabel = missing.length === 0 ? 'Missing'
    : missing.length === 1 ? `Missing: ${INTERVIEW_OPTIONS.find((o) => o.key === missing[0])?.label || ''}`
      : `Missing (${missing.length})`;

  return (
    <div className="super-mlf-bar" role="region" aria-label="Super MDS filters">
      <div className="super-mlf-brand" title="Filters by Super">
        <span className="super-mlf-brand__mark" aria-hidden="true">S</span>
        <span className="super-mlf-brand__word">Filters</span>
      </div>

      <input
        type="search"
        className="super-mlf-search"
        placeholder="Search name or MRN…"
        value={f.search || ''}
        onInput={(e) => set({ search: e.currentTarget.value })}
        aria-label="Search by resident name or MRN"
      />

      {/* Discipline — presets + individual sections in one multi-select menu */}
      <div className="super-mlf-dd">
        <button
          type="button"
          className={`super-mlf-trigger${sections.length ? ' is-set' : ''}`}
          aria-expanded={openMenu === 'discipline'}
          onClick={() => toggle('discipline')}
        >{disciplineButtonLabel(sections)}<span className="super-mlf-caret" aria-hidden="true">▾</span></button>
        {openMenu === 'discipline' && (
          <div className="super-mlf-menu" role="menu">
            <div className="super-mlf-menu__label">Disciplines</div>
            {DISCIPLINES.map((d) => {
              const on = disciplineActive(sections, d.key);
              return (
                <label key={d.key} className={`super-mlf-opt${on ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => set({ sections: toggleDiscipline(sections, d.key) })} />
                  <span>{d.label}</span>
                </label>
              );
            })}
            <div className="super-mlf-menu__label">Sections</div>
            <div className="super-mlf-menu__grid">
              {ALL_SECTIONS.map((s) => {
                const on = sections.includes(s);
                return (
                  <label key={s} className={`super-mlf-sec${on ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleSection(s)} />
                    <span>{s}</span>
                  </label>
                );
              })}
            </div>
            {sections.length > 0 && (
              // NO_TRACK — reported via mds_list_filter_changed centrally
              <button type="button" className="super-mlf-menu__clear" onClick={() => set({ sections: [] })}>Clear discipline</button>
            )}
          </div>
        )}
      </div>

      <select
        className="super-mlf-select"
        value={f.type || 'all'}
        onChange={(e) => set({ type: e.currentTarget.value })}
        aria-label="Assessment type"
      >
        <option value="all">All types</option>
        {types.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <div className="super-mlf-chips" role="group" aria-label="Due">
        {DUE_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`super-mlf-chip super-mlf-chip--${o.key}${(f.due || 'all') === o.key ? ' is-active' : ''}`}
            onClick={() => set({ due: f.due === o.key ? 'all' : o.key })}
          >{o.label}</button>
        ))}
      </div>

      {/* Missing interview — multi-select by interview type */}
      <div className="super-mlf-dd">
        <button
          type="button"
          className={`super-mlf-trigger${missing.length ? ' is-set' : ''}`}
          aria-expanded={openMenu === 'missing'}
          onClick={() => toggle('missing')}
        >{missingLabel}<span className="super-mlf-caret" aria-hidden="true">▾</span></button>
        {openMenu === 'missing' && (
          <div className="super-mlf-menu" role="menu">
            <div className="super-mlf-menu__label">Missing interview</div>
            {INTERVIEW_OPTIONS.map((o) => {
              const on = missing.includes(o.key);
              return (
                <label key={o.key} className={`super-mlf-opt${on ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleMissing(o.key)} />
                  <span>{o.label}</span>
                </label>
              );
            })}
            {missing.length > 0 && (
              // NO_TRACK — reported via mds_list_filter_changed centrally
              <button type="button" className="super-mlf-menu__clear" onClick={() => set({ missingInterviews: [] })}>Clear missing</button>
            )}
          </div>
        )}
      </div>

      <div className="super-mlf-meta">
        {count.total > 0 && count.shown === 0
          ? <span className="super-mlf-empty">No MDS match these filters</span>
          : <span className="super-mlf-count">Showing <strong>{count.shown}</strong> of {count.total}</span>}
        {!isEmptyFilters(f) && (
          // NO_TRACK — all filter changes report via mds_list_filter_changed centrally
          <button type="button" className="super-mlf-clear" onClick={() => onChange?.(emptyFilters())}>Clear</button>
        )}
      </div>
    </div>
  );
}
