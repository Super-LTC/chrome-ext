/**
 * Is every destination in this surface still REACHABLE?
 *
 * ── Why this test exists ────────────────────────────────────────────────────
 * Twice during this port a working feature was silently orphaned by a wiring
 * change, and neither time did anything go red:
 *
 *   1. Replacing the old scorecard removed the only entry point to the what-if
 *      simulator. `WhatIfSimulator` still rendered correctly; nothing navigated
 *      to it.
 *   2. Wiring `QipDestination` dropped `onOpenMeasure`'s second argument, which
 *      is the QIP what-if context. `MeasureDetail` still implemented the whole
 *      feature; nothing reached it with the data.
 *
 * Feature tests cannot catch this class, because the feature genuinely works —
 * what broke is the path to it. So this checks the property those tests can't:
 * for every `view` and `mode` the router can hold, SOMETHING navigates there.
 *
 * It is deliberately a source scan, not a render test. A render test would need
 * to drive the whole surface through every state, which is both slow and exactly
 * the kind of harness that quietly stops covering things (see the skeleton
 * incident in QipMeasureDrill's tests). Grepping for navigation intent is crude,
 * but it fails loudly the moment a destination has no caller — which is the one
 * signal we actually needed and did not have.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every .js/.jsx under the qm-board module, tests excluded. */
function sourceFiles(dir = MODULE_ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') sourceFiles(full, out);
    } else if (/\.jsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

let source;
beforeAll(() => {
  source = sourceFiles().map((f) => readFileSync(f, 'utf-8')).join('\n');
});

/**
 * The views the route object can hold, and what a navigation to each looks like.
 * `quarter-roster` and `resident` are intentionally absent: neither is
 * implemented in the extension yet (the resident drill-in is a modal driven by
 * component state, not a route view). Listing them here would assert a
 * destination we never built.
 */
const ROUTED_VIEWS = ['overview', 'measure', 'signals', 'simulator', 'dfs'];

const DESTINATIONS = ['coordinator', 'regional', 'qip', 'cna', 'functional'];

describe('every routed destination has a way in', () => {
  it.each(ROUTED_VIEWS)('something navigates to view "%s"', (view) => {
    // Either an explicit `view: 'x'` in a nav call, or a `back({view:'x'})`
    // fallback — both put the surface there.
    const navigatesThere = new RegExp(`view:\\s*'${view}'`).test(source);
    expect(navigatesThere, `no navigation sets view='${view}' — is it orphaned?`).toBe(true);
  });

  it.each(DESTINATIONS)('the top bar can reach mode "%s"', (mode) => {
    const reachable = new RegExp(`mode:\\s*'${mode}'`).test(source);
    expect(reachable, `nothing navigates to mode='${mode}'`).toBe(true);
  });
});

describe('components that own a feature are actually mounted', () => {
  /**
   * A component nothing imports is the P1 failure exactly: it renders fine, it
   * has tests, and no user can get to it. Checked by import rather than by
   * render because the question is about wiring, not behaviour.
   */
  const FEATURE_COMPONENTS = [
    'WhatIfSimulator',      // lost its only entry point once already
    'MeasureDetail',
    'ResidentDrillIn',
    'ClinicalSignalsView',
    'DfsPage',
    'FunctionalDeclineView',
    'AideScoringView',
    'QmInhouse',
    'FiveStarLanding',
    'FacilityScope',
    'FacilityFiveStar',
    'QipDestination',
    'QipRollup',
    'QipMeasureDrill',
    'FlQipFacilityView',
    'CodingAccuracyPanel',
    'DenominatorPanel',
  ];

  it.each(FEATURE_COMPONENTS)('%s is imported by something', (name) => {
    // Its own definition doesn't count — look for an import of it elsewhere.
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(source);
    expect(imported, `${name} is defined but never imported — orphaned?`).toBe(true);
  });
});

/**
 * Hooks and libs get the same check as components, for a reason discovered the
 * hard way: while auditing this surface I reported `qm-evidence-view.js` as an
 * orphan on the strength of one grep, then found it imported two lines later —
 * the search had failed on shell quoting, not on absence. A missing hit and a
 * missing thing look identical from the outside. So the question gets asked by a
 * test that can't mis-quote itself rather than by a shell one-liner.
 */
describe('no orphaned hooks or libs', () => {
  /**
   * Matches an IMPORT SPECIFIER (`from '.../useThing.js'`), never a bare
   * identifier.
   *
   * The first version of this checked for the name anywhere in another file, and
   * it was VACUOUS — verified by mutation: replacing
   * `import { useQipRollup } from '...'` with a local
   * `const useQipRollup = () => …` left the identifier present in the same file,
   * so the orphan detector still reported a consumer and 31/31 passed. Matching
   * the module path is the thing that can actually fail.
   */
  const importedSomewhere = (moduleFile, files) => files.some(
    (f) => !f.path.endsWith(`/${moduleFile}`) && f.text.includes(`/${moduleFile}`)
  );

  const filesWithText = () =>
    sourceFiles().map((f) => ({ path: f, text: readFileSync(f, 'utf-8') }));

  it('every hook is imported by something', () => {
    const files = filesWithText();
    const hooks = files
      .filter((f) => /\/hooks\/use[A-Za-z]+\.js$/.test(f.path))
      .map((f) => path.basename(f.path));
    expect(hooks.length).toBeGreaterThan(5);
    const orphans = hooks.filter((h) => !importedSomewhere(h, files));
    expect(orphans, 'hooks nothing imports').toEqual([]);
  });

  it('every lib module is imported by something', () => {
    const files = filesWithText();
    const libs = files
      .filter((f) => /\/lib\/[a-z0-9-]+\.js$/.test(f.path))
      .map((f) => path.basename(f.path));
    expect(libs.length).toBeGreaterThan(5);
    const orphans = libs.filter((l) => !importedSomewhere(l, files));
    expect(orphans, 'lib modules nothing imports').toEqual([]);
  });
});

describe('the QIP what-if context survives the trip to the measure view', () => {
  it('passes a what-if to the measure open, not just a measure id', () => {
    // The exact regression: `onOpenMeasure={(measureId) => nav.go(...)}` dropped
    // the second argument, leaving MeasureDetail's QIP scoring unreachable.
    expect(source).toMatch(/onOpenMeasure=\{\(measureId,\s*whatIf\)/);
    expect(source).toContain('toMeasureDetailQip(whatIf)');
  });

  it('sets the fl_qip score context that unlocks that scoring path', () => {
    // Without `scoreContext === 'fl_qip'` MeasureDetail ignores `qip` entirely,
    // so passing the object alone would still render nothing.
    expect(source).toContain("scoreContext: 'fl_qip'");
  });
});
