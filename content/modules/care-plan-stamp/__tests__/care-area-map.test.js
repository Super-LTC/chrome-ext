import { describe, it, expect } from 'vitest';
import { buildMapCells } from '../components/CareAreaMap.jsx';

const AUDIT = {
  toAdd: [
    { _rowId: 'add-0-a', ruleId: 'universal.skin_integrity', caa: 'pressure_ulcer',
      focus: { rationale: { evidence: ['Braden 13 (2026-02-18) — Skin integrity'] } } },
    { _rowId: 'add-1-b', ruleId: 'universal.hydration', caa: 'hydration', rationale: { summary: 'Active order' } },
  ],
  toRemove: [],
  dropped: [{ _rowId: 'dropped-0-x', description: 'CVA: has a history of CVA', reason: 'no CVA on chart' }],
  toCheck: [
    { _rowId: 'verify-0-y', kind: 'area_covered', detail: 'elimination', caa: 'elimination',
      reason: '"at risk for constipation…" already covers elimination', matchedFocusText: 'at risk for constipation' },
    { _rowId: 'verify-1-z', kind: 'partial_coverage', detail: 'N18.4', caa: 'renal',
      reason: 'CKD focus exists but stage not addressed', matchedFocusText: 'renal insufficiency' },
  ],
  onPlan: [
    { _rowId: 'onplan-0', ruleId: 'universal.pain', caa: 'pain', matchedFocusText: 'has chronic pain due to OA' },
    { _rowId: 'onplan-1', ruleId: 'dx.pain2', caa: 'pain', matchedFocusText: 'has chronic pain due to OA' }, // dup → collapse
  ],
  skipped: [{ _rowId: 'skip-0', caa: 'dental', focus: { description: 'DENTAL CARE: …' } }],
  assessmentLinkages: [
    { concept: 'restraints', label: 'Physical restraint use / reduction', status: 'not_indicated', sourceLabel: 'P0100A: 0. Not used' },
    { concept: 'braden', label: 'Braden', status: 'gap', sourceLabel: 'Braden 13' }, // gap → NOT a dim cell
  ],
};

describe('buildMapCells', () => {
  it('builds one cell per state, folding area_covered into ✓ covered and collapsing dup covered rows', () => {
    const cells = buildMapCells(AUDIT);
    const by = (s) => cells.filter((c) => c.state === s);
    expect(by('gap')).toHaveLength(2);
    expect(by('gap')[0].why).toContain('Braden 13');
    // Reviewer-held-back proposals AND partial_coverage verify cells are NOT
    // rendered (killed Jul 2026 — the AI coverage-link pairing kept marrying
    // a dx to the wrong focus). area_covered ("already covered by X") is NOT
    // its own glyph — it folds into a plain ✓ covered chip.
    expect(by('remove')).toHaveLength(0);
    expect(by('held')).toHaveLength(0);
    // No '✓?' glance state survives — the whole concept is gone from the map.
    expect(by('glance')).toHaveLength(0);
    expect(by('verify')).toHaveLength(0);
    // covered = the dup-collapsed pain focus (1) + the flattened `elimination`
    // area_covered (1). The flattened glance keeps its "covered by" why and stays
    // non-clickable (there is no worklist row behind it to open).
    const covered = by('covered');
    expect(covered).toHaveLength(2);
    const elim = covered.find((c) => /constipation/.test(c.why || ''));
    expect(elim).toBeTruthy();
    expect(elim.target).toBeUndefined();
    expect(by('skipped')).toHaveLength(1);
    expect(by('dim')).toHaveLength(1); // only the not_indicated linkage
    expect(by('dim')[0].target).toBeUndefined();
  });

  it('drops an area_covered glance whose area is already covered by a real focus (the Special Considerations double)', () => {
    // The bug: an on-plan focus covers an area AND an area_covered glance points
    // at the SAME area → the map showed it twice (solid ✓ + dashed ✓?). It must
    // appear exactly once, as the real covered focus.
    const audit = {
      toAdd: [], toRemove: [], dropped: [], skipped: [], assessmentLinkages: [],
      onPlan: [
        { _rowId: 'op-sc', ruleId: 'x.special', caa: 'pain', matchedFocusText: 'Debra has anxiety, monitored' },
      ],
      toCheck: [
        { _rowId: 'ac-sc', kind: 'area_covered', caa: 'pain',
          matchedFocusText: 'Debra has Edema +2 to both lower extremity' },
      ],
    };
    const cells = buildMapCells(audit);
    const covered = cells.filter((c) => c.state === 'covered');
    expect(covered).toHaveLength(1);
    expect(covered[0].why).toContain('anxiety'); // the real focus wins, not the glance
    expect(cells.some((c) => c.state === 'glance')).toBe(false);
  });

  it('excludes stamped/skipped adds and acknowledged drops', () => {
    const cells = buildMapCells(AUDIT, {
      stampedAddIds: new Set(['add-0-a']),
      skippedAddIds: new Set(['add-1-b']),
      acknowledgedDropped: new Set(['dropped-0-x']),
    });
    expect(cells.filter((c) => c.state === 'gap')).toHaveLength(0);
    expect(cells.filter((c) => c.state === 'remove')).toHaveLength(0);
  });

  it('tolerates a missing/empty audit', () => {
    expect(buildMapCells(null)).toEqual([]);
    expect(buildMapCells({})).toEqual([]);
  });
});
