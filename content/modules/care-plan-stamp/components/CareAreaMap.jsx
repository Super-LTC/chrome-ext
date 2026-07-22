import { h, Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { areaLabel } from '../careArea.js';

/**
 * CareAreaMap — the comprehensive review's HOME screen (v2 orgs).
 *
 * One glance answers "how is this care plan doing?": a summary strip with the
 * work counts + two CTAs, then every care area as a clickable cell:
 *
 *   + amber  gap        → toAdd item (click opens its Add card in the worklist)
 *   − red    removal    → toRemove / reviewer-dropped (click opens the confirm card)
 *   ? teal   verify     → toCheck partial_coverage (an actionable "does this cover it?")
 *   ✓ green  covered    → onPlan + folded-in area_covered, covering focus on hover
 *   ⊘ gray   skipped    → previously skipped proposals (click → worklist to reopen)
 *   · dashed not indic. → assessment linkages that are negative/absent (why-nothing rows)
 *
 * Every clickable cell routes into the existing worklist via onOpen({kind,key})
 * — the map is a menu over the same rows, not a new state machine. Data is 100%
 * what the audit response already ships (toAdd/toRemove/toCheck/onPlan/skipped/
 * dropped/assessmentLinkages).
 */

const _clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const _whyForAdd = (it) => {
  const r = it?.focus?.rationale || it?.rationale;
  if (r?.evidence?.length) return _clip(r.evidence[0], 44);
  if (r?.summary) return _clip(r.summary, 44);
  return 'trigger fires · no matching focus';
};

const LINKAGE_DIM_LABEL = { not_indicated: 'not indicated', no_assessment: 'no assessment on file' };

export function buildMapCells(audit, { stampedAddIds, skippedAddIds, acknowledgedDropped } = {}) {
  const stamped = stampedAddIds || new Set();
  const skippedIds = skippedAddIds || new Set();
  const acked = acknowledgedDropped || new Set();
  const cells = [];
  const seenCovered = new Set();

  for (const it of audit?.toAdd || []) {
    if (stamped.has(it._rowId) || skippedIds.has(it._rowId)) continue;
    cells.push({
      state: 'gap', label: areaLabel(audit, it), why: _whyForAdd(it),
      act: 'Add focus →', target: { kind: 'add', key: it._rowId },
    });
  }
  for (const it of audit?.toRemove || []) {
    cells.push({
      state: 'remove', label: areaLabel(audit, it) || _clip(it.focusText, 24),
      why: _clip(it.reason, 44), act: 'Review removal →', target: { kind: 'remove', key: it._rowId },
    });
  }
  // Reviewer-held-back proposals are not surfaced (see worklistModel.js).
  for (const it of audit?.toCheck || []) {
    if (it.kind === 'area_covered') {
      // "Already covered by X" is assurance, not work — it renders as a badged
      // chip inside the covered fold, never as a grid cell.
      cells.push({
        state: 'glance', label: areaLabel(audit, it) || _clip(it.detail, 24),
        why: `covered by "${_clip(it.matchedFocusText, 60)}"`,
      });
      continue;
    }
    if (it.kind === 'partial_coverage') continue; // not surfaced (see worklistModel.actionableChecks)
    cells.push({
      state: 'verify', label: areaLabel(audit, it) || _clip(it.detail, 24),
      why: _clip(it.reason || it.matchedFocusText, 44), act: 'Verify →',
      target: { kind: 'check', key: it._rowId },
    });
  }
  for (const it of audit?.onPlan || []) {
    const label = areaLabel(audit, it);
    const key = `${label}::${it.matchedFocusText || ''}`;
    if (seenCovered.has(key)) continue;
    seenCovered.add(key);
    cells.push({
      state: 'covered', label, why: _clip(it.matchedFocusText, 44),
      target: { kind: 'on_plan', key: it._rowId },
    });
  }
  for (const it of audit?.skipped || []) {
    const m = it.skipMeta;
    const when = m?.skippedAt ? new Date(m.skippedAt).toLocaleDateString() : null;
    const who = m?.skippedByName || null;
    const parts = [
      who || when ? `skipped${who ? ` by ${who}` : ''}${when ? ` ${when}` : ''}` : 'previously skipped',
      m?.reason ? `— ${m.reason}` : null,
    ].filter(Boolean);
    cells.push({
      state: 'skipped', label: areaLabel(audit, it) || _clip(it.focus?.description || it.description, 24),
      why: _clip(parts.join(' '), 60), act: 'Reopen →', target: { kind: 'skipped', key: it._rowId },
    });
  }
  for (const l of audit?.assessmentLinkages || []) {
    if (l.status !== 'not_indicated' && l.status !== 'no_assessment') continue;
    cells.push({
      state: 'dim', label: l.label || l.concept,
      why: l.sourceLabel ? _clip(l.sourceLabel, 40) : LINKAGE_DIM_LABEL[l.status],
    });
  }

  // area_covered "glances" are assurance, not work. Fold each into a plain ✓
  // covered chip (one glyph for "covered", no `✓?`), and DROP any whose care
  // area is already shown by a real cell — a covered focus, a gap, a verify —
  // so an already-covered area never appears twice (the "Special Considerations"
  // solid-✓ + dashed-✓? double the nurse kept hitting). The covering focus rides
  // along as the chip's `why` (hover), which is all a glance ever offered.
  const shownLabels = new Set(cells.filter((c) => c.state !== 'glance').map((c) => c.label));
  const out = [];
  for (const c of cells) {
    if (c.state !== 'glance') { out.push(c); continue; }
    if (shownLabels.has(c.label)) continue;      // already represented → drop the dupe
    shownLabels.add(c.label);                    // …and dedupe glance-vs-glance too
    out.push({ ...c, state: 'covered' });         // survivors become plain covered chips
  }
  return out;
}

const STATE_ORDER = { gap: 0, remove: 1, verify: 2, held: 3, covered: 4, skipped: 5, dim: 6 };
const STATE_ICON = { gap: '+', remove: '−', verify: '?', held: '⊝', covered: '✓', skipped: '⊘', dim: '·' };

export const CareAreaMap = ({
  audit,
  stampedAddIds,
  skippedAddIds,
  acknowledgedDropped,
  onOpen,          // ({kind, key}) → open that row in the worklist
  onStartReview,   // () → enter the worklist at the first open item
  onInitialWizard, // () → switch modal to initial-admit mode
}) => {
  const cells = useMemo(
    () => buildMapCells(audit, { stampedAddIds, skippedAddIds, acknowledgedDropped })
      .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]),
    [audit, stampedAddIds, skippedAddIds, acknowledgedDropped],
  );
  // The grid answers "what needs me?" — covered and not-indicated are assurance,
  // not work, so they collapse into folds below the grid instead of competing
  // with the work cells at full size.
  const FOLDED = new Set(['covered', 'dim']);
  const workCells = cells.filter((c) => !FOLDED.has(c.state));
  const coveredCells = cells.filter((c) => c.state === 'covered');
  const dimCells = cells.filter((c) => c.state === 'dim');
  const [coveredOpen, setCoveredOpen] = useState(true);
  const [dimOpen, setDimOpen] = useState(false);
  const n = (s) => cells.filter((c) => c.state === s).length;
  const gaps = n('gap');
  const removals = n('remove');
  const verifies = n('verify');
  const todo = gaps + removals + verifies;

  return (
    <div className="cpam">
      <div className="cpam__strip">
        <div className="cpam__counts">
          <div className="cpam__count is-gap"><div className="cpam__n">{gaps}</div><div className="cpam__l">gaps to add</div></div>
          <div className="cpam__count is-rem"><div className="cpam__n">{removals}</div><div className="cpam__l">to remove</div></div>
          <div className="cpam__count is-cov"><div className="cpam__n">{coveredCells.length}</div><div className="cpam__l">covered</div></div>
          {n('skipped') > 0 && (
            <div className="cpam__count is-skip"><div className="cpam__n">{n('skipped')}</div><div className="cpam__l">skipped</div></div>
          )}
        </div>
        <div className="cpam__ctas">
          {onInitialWizard && (
            // NO_TRACK: parent handler fires care_plan_audit_scope_toggled
            <button type="button" className="cpam__cta is-ghost" onClick={onInitialWizard}>Initial admit wizard</button>
          )}
          {/* NO_TRACK: parent handler fires care_plan_map_start_review */}
          <button type="button" className="cpam__cta is-primary" onClick={onStartReview}>
            {todo > 0 ? `Start review → ${todo} item${todo === 1 ? '' : 's'}` : 'Open worklist'}
          </button>
        </div>
      </div>

      <div className="cpam__grid-title">Care area map — click any area</div>
      {workCells.length > 0 ? (
        <div className="cpam__grid">
          {workCells.map((c, i) => (
            <div
              key={i}
              className={`cpam__cell is-${c.state} ${c.target ? 'is-clickable' : ''}`}
              onClick={c.target && onOpen ? () => onOpen(c.target) : undefined}
              role={c.target ? 'button' : undefined}
            >
              <div className="cpam__cell-name"><span className="cpam__cell-icon" aria-hidden="true">{STATE_ICON[c.state]}</span>{c.label}</div>
              {c.why && <div className="cpam__cell-why" title={c.why}>{c.why}</div>}
              {c.act && <div className="cpam__cell-act">{c.act}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="cpam__all-clear">✓ Nothing needs you — every triggered area is covered.</div>
      )}

      {coveredCells.length > 0 && (
        <div className="cpam__fold">
          {/* NO_TRACK: pure-UI fold toggle */}
          <button type="button" className="cpam__fold-head is-cov" onClick={() => setCoveredOpen((o) => !o)}>
            <span className="cpam__fold-caret">{coveredOpen ? '▾' : '▸'}</span>
            ✓ {coveredCells.length} covered
          </button>
          {coveredOpen && (
            <div className="cpam__fold-chips">
              {coveredCells.map((c, i) => (
                <span
                  key={i}
                  className={`cpam__chip is-cov ${c.target ? 'is-clickable' : ''}`}
                  title={c.why}
                  onClick={c.target && onOpen ? () => onOpen(c.target) : undefined}
                  role={c.target ? 'button' : undefined}
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {dimCells.length > 0 && (
        <div className="cpam__fold">
          {/* NO_TRACK: pure-UI fold toggle */}
          <button type="button" className="cpam__fold-head is-dim" onClick={() => setDimOpen((o) => !o)}>
            <span className="cpam__fold-caret">{dimOpen ? '▾' : '▸'}</span>
            · not indicated ({dimCells.length})
          </button>
          {dimOpen && (
            <div className="cpam__fold-chips">
              {dimCells.map((c, i) => (
                <span key={i} className="cpam__chip is-dim" title={c.why}>{c.label}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cpam__legend">
        <span><b className="is-gap">+</b> gap</span>
        <span><b className="is-rem">−</b> removal</span>
        <span><b className="is-ver">?</b> verify</span>
        <span><b className="is-cov">✓</b> covered</span>
        <span><b className="is-skip">⊘</b> skipped</span>
        <span><b className="is-dim">·</b> not indicated</span>
      </div>
    </div>
  );
};
