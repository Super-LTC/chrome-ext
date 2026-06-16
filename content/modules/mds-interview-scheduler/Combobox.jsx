import { useState, useRef, useEffect } from 'preact/hooks';

/**
 * Searchable combobox for the facility library (50–80 options). Self-contained
 * inline styles so it works in the bare newmds.xhtml popup. Expands in-flow (not
 * absolutely positioned) so it never gets clipped by the modal's scroll area.
 *
 * Props:
 *   options: [{ id, label }]
 *   value: id | ''
 *   onChange: (id) => void
 *   disabled: bool
 *   placeholder: string
 */
const NONE_ID = '';
const NONE_LABEL = "— none / schedule manually —";

const C = {
  wrap: 'position:relative;width:100%;',
  control: 'display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;cursor:pointer;font-size:12.5px;color:#0f172a;text-align:left;',
  controlOpen: 'border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15);',
  controlText: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
  placeholder: 'color:#94a3b8;',
  chevron: 'flex-shrink:0;color:#64748b;transition:transform .15s;',
  panel: 'margin-top:5px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,.16);overflow:hidden;',
  search: 'width:100%;box-sizing:border-box;padding:8px 10px;border:none;border-bottom:1px solid #eef2f6;font-size:12.5px;color:#0f172a;outline:none;',
  list: 'max-height:190px;overflow-y:auto;padding:4px;',
  opt: 'padding:7px 9px;border-radius:6px;font-size:12.5px;line-height:1.35;color:#1e293b;cursor:pointer;white-space:normal;',
  optActive: 'background:#eef2ff;color:#3730a3;',
  optNone: 'color:#64748b;font-style:italic;',
  empty: 'padding:10px;text-align:center;color:#94a3b8;font-size:12px;',
};

function _highlight(label, query) {
  if (!query) return label;
  const i = label.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return label;
  return [
    label.slice(0, i),
    <strong style="color:#4f46e5;">{label.slice(i, i + query.length)}</strong>,
    label.slice(i + query.length),
  ];
}

export function Combobox({ options, value, onChange, disabled, placeholder = 'Pick an assessment…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const selectedLabel = options.find((o) => o.id === value)?.label || '';
  const pool = [{ id: NONE_ID, label: NONE_LABEL }, ...options];
  const filtered = query
    ? pool.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : pool;

  useEffect(() => {
    if (!open) return undefined;
    setActive(0);
    setTimeout(() => searchRef.current?.focus(), 0);
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [open]);

  const choose = (o) => { onChange(o.id); setOpen(false); setQuery(''); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div style={C.wrap} ref={rootRef}>
      <div
        style={C.control + (open ? C.controlOpen : '') + (disabled ? 'opacity:.55;cursor:default;' : '')}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span style={C.controlText + (selectedLabel ? '' : C.placeholder)}>
          {selectedLabel || placeholder}
        </span>
        <svg style={C.chevron + (open ? 'transform:rotate(180deg);' : '')} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </div>

      {open && (
        <div style={C.panel}>
          <input
            ref={searchRef}
            style={C.search}
            type="text"
            placeholder="Type to filter…"
            value={query}
            onInput={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKey}
          />
          <div style={C.list}>
            {filtered.length === 0 && <div style={C.empty}>No matches</div>}
            {filtered.map((o, idx) => (
              <div
                key={o.id || 'none'}
                style={C.opt + (idx === active ? C.optActive : '') + (o.id === NONE_ID ? C.optNone : '')}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              >
                {o.id === NONE_ID ? o.label : _highlight(o.label, query)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
