// content/mds-list-coverage/FilterBar.jsx
// Super-branded filter toolbar injected above the MDS "In Progress" list.
//
// CONTROLLED component: all filter state lives in the vanilla controller
// (mds-list-coverage.js) and arrives via `filters`; every change is raised through
// `onChange(nextFilters)`. The only local state is the sections-popover open flag.
// This keeps the island safe to re-render whenever PCC repaints the table.

import { useState, useRef, useEffect } from 'preact/hooks';
import {
  DISCIPLINES,
  ALL_SECTIONS,
  sectionsForDiscipline,
  disciplineForSections,
  emptyFilters,
  isEmptyFilters,
} from './filter-model.js';

const DUE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'soon', label: 'Due soon' },
];

export function FilterBar({ filters, types = [], count = { shown: 0, total: 0 }, onChange }) {
  const f = filters || emptyFilters();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const popRef = useRef(null);

  // Close the sections popover on outside click / Escape.
  useEffect(() => {
    if (!sectionsOpen) return undefined;
    const onDoc = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setSectionsOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setSectionsOpen(false); };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [sectionsOpen]);

  const set = (patch) => onChange?.({ ...f, ...patch });
  const activeDiscipline = disciplineForSections(f.sections);
  const noSections = (f.sections || []).length === 0;

  const pickDiscipline = (key) => {
    // Toggle: clicking the active discipline clears it back to "All".
    set({ sections: activeDiscipline === key ? [] : sectionsForDiscipline(key) });
  };

  const toggleSection = (letter) => {
    const cur = new Set(f.sections || []);
    if (cur.has(letter)) cur.delete(letter); else cur.add(letter);
    set({ sections: [...cur] });
  };

  const pickDue = (key) => set({ due: f.due === key ? 'all' : key });

  return (
    <div className="super-mlf-bar" role="region" aria-label="Super MDS filters">
      <div className="super-mlf-brand" title="Filters by Super — not part of PointClickCare">
        <span className="super-mlf-brand__mark" aria-hidden="true">✦</span>
        <span className="super-mlf-brand__word">Super</span>
        <span className="super-mlf-brand__sub">filters</span>
      </div>

      <div className="super-mlf-controls">
        <input
          type="search"
          className="super-mlf-search"
          placeholder="Search name or MRN…"
          value={f.search || ''}
          onInput={(e) => set({ search: e.currentTarget.value })}
          aria-label="Search by resident name or MRN"
        />

        <div className="super-mlf-group" role="group" aria-label="Discipline">
          <button
            type="button"
            className={`super-mlf-chip${noSections ? ' is-active' : ''}`}
            onClick={() => set({ sections: [] })}
          >All</button>
          {DISCIPLINES.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`super-mlf-chip${activeDiscipline === d.key ? ' is-active' : ''}`}
              onClick={() => pickDiscipline(d.key)}
            >{d.label}</button>
          ))}

          <div className="super-mlf-pop-anchor" ref={popRef}>
            <button
              type="button"
              className={`super-mlf-chip super-mlf-chip--ghost${activeDiscipline === 'custom' ? ' is-active' : ''}`}
              aria-expanded={sectionsOpen}
              onClick={() => setSectionsOpen((v) => !v)}
            >Sections{(f.sections || []).length ? ` (${f.sections.length})` : ''} ▾</button>
            {sectionsOpen && (
              <div className="super-mlf-pop" role="menu">
                <div className="super-mlf-pop__grid">
                  {ALL_SECTIONS.map((s) => {
                    const on = (f.sections || []).includes(s);
                    return (
                      <label key={s} className={`super-mlf-sec${on ? ' is-on' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleSection(s)} />
                        <span>{s}</span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="super-mlf-pop__clear"
                  onClick={() => set({ sections: [] })}
                  disabled={noSections}
                >Clear sections</button>
              </div>
            )}
          </div>
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

        <div className="super-mlf-group" role="group" aria-label="Due">
          {DUE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`super-mlf-chip super-mlf-chip--due-${o.key}${(f.due || 'all') === o.key ? ' is-active' : ''}`}
              onClick={() => (o.key === 'all' ? set({ due: 'all' }) : pickDue(o.key))}
            >{o.label}</button>
          ))}
        </div>

        <button
          type="button"
          className={`super-mlf-chip super-mlf-chip--toggle${f.missingOnly ? ' is-active' : ''}`}
          onClick={() => set({ missingOnly: !f.missingOnly })}
          title="Only rows with an interview UDA still needed"
        >Missing interview</button>
      </div>

      <div className="super-mlf-meta">
        {count.total > 0 && count.shown === 0
          ? <span className="super-mlf-empty">No MDS match these filters</span>
          : <span className="super-mlf-count">Showing <strong>{count.shown}</strong> of {count.total}</span>}
        {!isEmptyFilters(f) && (
          // NO_TRACK — all filter changes (incl. clear) report via mds_list_filter_changed centrally
          <button type="button" className="super-mlf-clear" onClick={() => onChange?.(emptyFilters())}>Clear</button>
        )}
      </div>
    </div>
  );
}
