import { h } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import { FocusRationale } from './FocusCard.jsx';

/**
 * Read-only "what's already on the plan" overview — reached from the dashboard's
 * "Browse" affordance. Covered focuses need no editing, so this is intentionally
 * light: single-line rows in collapsible source groups (Baseline / Order / Dx),
 * each row expands inline to show the dx/order/assessment it accounts for.
 * Keeps the default visual load low while letting a nurse verify coverage.
 */
export const CoveredOverview = ({ audit, focusRowId }) => {
  useEffect(() => {
    window.SuperAnalytics?.track?.('care_plan_audit_covered_viewed', {
      n_on_plan: (audit.onPlan || []).length,
    });
  }, []);

  // Auto-expand + scroll to the focus the nurse clicked from the coverage grid.
  const [expanded, setExpanded] = useState(() => new Set(focusRowId ? [focusRowId] : []));
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const focusRef = useRef(null);
  useEffect(() => {
    if (focusRowId && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center' });
    }
  }, [focusRowId]);

  const groups = _groupBySource(audit);
  const total = (audit.onPlan || []).length;

  const toggleRow = (id) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (k) => setCollapsedGroups((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="cpco">
      <div className="cpco__head">
        <span className="cpco__title">On plan · {total} covered</span>
        <span className="cpco__hint">What the care plan already accounts for — click a row to see why.</span>
      </div>

      {groups.map((g) => {
        if (!g.items.length) return null;
        const open = !collapsedGroups.has(g.key);
        return (
          <div key={g.key} className="cpco__group">
            {/* NO_TRACK: local collapse */}
            <button type="button" className="cpco__group-head" onClick={() => toggleGroup(g.key)} aria-expanded={open}>
              <span className="cpco__caret">{open ? '▾' : '▸'}</span>
              <span className={`cpco__dot cpco__dot--${g.key}`} aria-hidden="true" />
              {g.label} · {g.items.length}
            </button>
            {open && (
              <ul className="cpco__list">
                {g.items.map((row) => {
                  const isOpen = expanded.has(row.rowId);
                  const hasEvidence = !!row.rationale;
                  const isFocused = row.rowId === focusRowId;
                  return (
                    <li key={row.rowId} ref={isFocused ? focusRef : null}>
                      {/* NO_TRACK: inline read-only expand */}
                      <button
                        type="button"
                        className={`cpco__row ${hasEvidence ? '' : 'cpco__row--flat'} ${isFocused ? 'is-focused' : ''}`}
                        onClick={hasEvidence ? () => toggleRow(row.rowId) : undefined}
                        aria-expanded={hasEvidence ? isOpen : undefined}
                      >
                        <span className="cpco__check" aria-hidden="true">✓</span>
                        <span className="cpco__row-title">{row.title}</span>
                        {row.caaLabel && <span className="cpco__tag">{row.caaLabel}</span>}
                        {hasEvidence && <span className="cpco__row-cta">{isOpen ? 'Hide' : 'Why'}</span>}
                      </button>
                      {hasEvidence && isOpen && (
                        <div className="cpco__expand">
                          <FocusRationale rationale={{ ...row.rationale, basisLabel: row.rationale.basisLabel ? `Covered · ${row.rationale.basisLabel}` : 'Covered' }} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Group on-plan focuses by clinical source via ruleId prefix; unmatched →
// Baseline (catch-all) so nothing disappears, mirroring the dashboard's tiles.
function _groupBySource(audit) {
  const mk = (key, label) => ({ key, label, items: [] });
  const baseline = mk('baseline', 'Baseline (universal)');
  const order = mk('order', 'Order-driven');
  const dx = mk('dx', 'Diagnosis-driven');
  (audit.onPlan || []).forEach((it) => {
    const row = {
      rowId: it._rowId,
      title: _truncate(it.focusText || it.description || it.focus?.description, 70) || 'Focus',
      caaLabel: _caaLabel(audit, it),
      rationale: it.rationale
        || (Array.isArray(it.evidence) && it.evidence.length ? { evidence: it.evidence } : null),
    };
    const id = it.ruleId || '';
    if (id.startsWith('order.')) order.items.push(row);
    else if (id.startsWith('dx.')) dx.items.push(row);
    else baseline.items.push(row);
  });
  return [baseline, order, dx];
}

function _caaLabel(audit, item) {
  if (item.caaName) return item.caaName;
  const byRule = audit?._ruleIdToCAA?.get?.(item.ruleId);
  if (byRule) return byRule;
  const byFocus = audit?._focusIdToCAA?.get?.(item.focusId);
  if (byFocus) return byFocus;
  if (item.caa) return String(item.caa).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return '';
}

function _truncate(s, n) {
  if (!s) return s;
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}
