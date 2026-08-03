/**
 * The QM / Five-Star surface's navigation state, as a route OBJECT.
 *
 * Ported from superltc `web/components/quality-measures/use-qm-route.ts`, which
 * reads the same object out of the URL (SUP-241). We port the OBJECT and back it
 * with an in-memory stack instead, for two reasons:
 *
 *   1. A content script has no address bar to own. The host page's URL belongs to
 *      PointClickCare — writing our view state into it would fight PCC's own
 *      navigation and survive into their server logs.
 *   2. Keeping the shape identical is what makes the port cheap. Every ported
 *      component and view-model reads `route.measure`, `route.quarter`,
 *      `route.scope`… unchanged; only the thing supplying them differs.
 *
 * So: `parseQmRoute` / `serializeQmRoute` / `normalizeQmRoute` are copied
 * verbatim in behaviour (their test suite is ported too), and `createQmHistory`
 * replaces `useQmRoute`'s next/navigation body.
 *
 * WHY SERIALIZE AT ALL, with no URL to write to? Because it's how we tell "the
 * same view" from "a new view". `go()` serializes the next route and compares it
 * to the current one; identical strings mean the user landed where they already
 * were, and we don't spend a history entry on it. Defaults being OMITTED (not
 * written) is what makes two different paths to one view compare equal — the same
 * property the web relies on to stop Back stepping through near-identical URLs.
 *
 * WHAT LIVES HERE vs WHAT DOESN'T. Only what identifies a VIEW. Fetched payloads,
 * loading flags and derived what-if context stay in component state — a route is
 * an address, not a cache. The resident drill-in is addressed by `patient` +
 * `measure` and the row is re-resolved from the already-loaded board, so no
 * patient record is ever serialized.
 *
 * @typedef {'coordinator'|'regional'|'qip'|'cna'} QmMode
 * @typedef {'overview'|'measure'|'quarter-roster'|'signals'|'simulator'|'dfs'|'resident'} QmViewKind
 * @typedef {'board'|'facility'} QmScopeKind
 * @typedef {'both'|'five_star'|'qip'} QmLens
 *
 * @typedef {object} QmRoute
 * @property {QmMode} mode
 * @property {QmViewKind} view
 * @property {string} [measure]   Measure being examined (detail, resident drill, QIP drill).
 * @property {number} quarter     Quarters back from the open quarter: 0 = current … 3 = oldest.
 * @property {string} [patient]   Resident addressed by id — never by serialised record.
 * @property {QmScopeKind} scope  Five-Star world: all-buildings board, or one building.
 * @property {string} [scopeId]
 * @property {'rollup'|'facility'} qipScope  QIP world: the multi-facility rollup, or one building.
 * @property {string} [qipScopeId]
 * @property {QmLens} lens
 */

/**
 * @type {QmMode[]}
 *
 * `functional` is EXTENSION-ONLY. On the web, Functional Decline is its own Next
 * page (`/facilities/:id/functional-decline`) that the QM surface links out to,
 * so it never needed to be a mode. We have no router to link out to — it's a
 * destination inside the same overlay — and the agreed top bar lists it beside
 * the others. Adding it here rather than as a `view` keeps that grammar: modes
 * are destinations you pick from the bar, views are places you drill into.
 */
const MODES = ['coordinator', 'regional', 'qip', 'cna', 'functional'];
/** @type {QmViewKind[]} */
const VIEWS = ['overview', 'measure', 'quarter-roster', 'signals', 'simulator', 'dfs', 'resident'];
/** @type {QmLens[]} */
const LENSES = ['both', 'five_star', 'qip'];

/**
 * Measure ids are shape-validated, not checked against the evaluator registry —
 * that registry is server-side. An unknown-but-well-shaped id degrades to an
 * empty measure view, which is what a since-removed measure should do anyway.
 */
const MEASURE_RE = /^[a-z][a-z0-9_]{2,40}$/;
/** Our ids are cuid-ish; this only rejects obvious junk so a typo can't inject. */
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

const oneOf = (v, allowed, fallback) => (v && allowed.includes(v) ? v : fallback);

/** Param names are spelled out rather than abbreviated — kept identical to web. */
export const QM_PARAMS = {
  mode: 'qm',
  view: 'view',
  measure: 'measure',
  quarter: 'quarter',
  patient: 'patient',
  scope: 'scope',
  scopeId: 'building',
  qipScope: 'qipScope',
  qipScopeId: 'qipBuilding',
  lens: 'lens',
};

/**
 * Normalizations that must hold however the route was produced.
 *
 * Discharge Function is a real Five-Star measure (`ss_dfs`, short-stay, 150 pts,
 * risk-adjusted), so the measure grid renders it as a row and emits
 * `{view:'measure', measure:'discharge_function'}` → MeasureDetail. That
 * component has ZERO DFS handling, because DFS is computed per STAY, not per
 * resident-quarter: different service, different shape. DfsPage is the real
 * destination and already exists.
 *
 * Fixed here rather than at the ~4 call sites that emit `onOpenMeasure(id)`, so
 * a route arriving from anywhere lands on something that renders.
 *
 * @param {QmRoute} route
 * @returns {QmRoute}
 */
export function normalizeQmRoute(route) {
  if (route.view === 'measure' && route.measure === 'discharge_function') {
    // `measure` is dropped, not kept: DfsPage doesn't read it, and leaving it
    // would round-trip back through this rule on every subsequent navigate.
    return { ...route, view: 'dfs', measure: undefined };
  }
  return route;
}

/**
 * @param {URLSearchParams} params
 * @param {{mode?: QmMode, scope?: QmScopeKind, measure?: string}} [defaults]
 * @returns {QmRoute}
 */
export function parseQmRoute(params, defaults = {}) {
  const rawMeasure = params.get(QM_PARAMS.measure) ?? defaults.measure ?? null;
  const measure = rawMeasure && MEASURE_RE.test(rawMeasure) ? rawMeasure : undefined;

  const rawPatient = params.get(QM_PARAMS.patient);
  const patient = rawPatient && ID_RE.test(rawPatient) ? rawPatient : undefined;

  const rawQuarter = Number(params.get(QM_PARAMS.quarter));
  // Clamped, not just validated: the 4Q CMS window is the only meaningful range,
  // and an out-of-range value should land somewhere real rather than blank.
  const quarter =
    Number.isInteger(rawQuarter) && rawQuarter >= 0 && rawQuarter <= 3 ? rawQuarter : 0;

  const rawScopeId = params.get(QM_PARAMS.scopeId);
  const rawQipScopeId = params.get(QM_PARAMS.qipScopeId);

  const mode = oneOf(params.get(QM_PARAMS.mode), MODES, defaults.mode ?? 'coordinator');

  let view = oneOf(params.get(QM_PARAMS.view), VIEWS, 'overview');
  // A view that needs a measure but has none is not reachable; degrade rather
  // than render an empty shell that looks broken.
  if ((view === 'measure' || view === 'resident') && !measure) view = 'overview';
  if (view === 'resident' && !patient) view = measure ? 'measure' : 'overview';

  return normalizeQmRoute({
    mode,
    view,
    measure,
    quarter,
    patient,
    scope: oneOf(params.get(QM_PARAMS.scope), ['board', 'facility'], defaults.scope ?? 'board'),
    scopeId: rawScopeId && ID_RE.test(rawScopeId) ? rawScopeId : undefined,
    qipScope: oneOf(params.get(QM_PARAMS.qipScope), ['rollup', 'facility'], 'rollup'),
    qipScopeId: rawQipScopeId && ID_RE.test(rawQipScopeId) ? rawQipScopeId : undefined,
    lens: oneOf(params.get(QM_PARAMS.lens), LENSES, 'both'),
  });
}

/**
 * Serialise a route onto an existing param set, preserving params this surface
 * doesn't own.
 *
 * Defaults are OMITTED rather than written, so two ways of arriving at the same
 * view produce the same string — see the file header for why that matters here.
 *
 * @param {QmRoute} route
 * @param {URLSearchParams} base
 * @returns {URLSearchParams}
 */
export function serializeQmRoute(route, base) {
  const p = new URLSearchParams(base);
  const set = (key, value, omitWhen) => {
    if (!value || value === omitWhen) p.delete(key);
    else p.set(key, value);
  };

  set(QM_PARAMS.mode, route.mode, 'coordinator');
  set(QM_PARAMS.view, route.view, 'overview');
  set(QM_PARAMS.measure, route.measure);
  set(QM_PARAMS.quarter, route.quarter ? String(route.quarter) : undefined);
  set(QM_PARAMS.patient, route.patient);
  set(QM_PARAMS.scope, route.scope, 'board');
  set(QM_PARAMS.scopeId, route.scope === 'facility' ? route.scopeId : undefined);
  set(QM_PARAMS.qipScope, route.qipScope, 'rollup');
  set(QM_PARAMS.qipScopeId, route.qipScope === 'facility' ? route.qipScopeId : undefined);
  set(QM_PARAMS.lens, route.lens, 'both');
  return p;
}

/** The canonical string for a route — identical strings mean the same view. */
const keyOf = (route) => serializeQmRoute(route, new URLSearchParams()).toString();

/**
 * The in-memory backing store. This is the piece that replaces next/navigation:
 * a stack of routes plus a subscription, framework-free so it can be unit-tested
 * without rendering anything.
 *
 * `go` / `set` / `back` keep the web's semantics:
 *   go(patch)    — a new view. Pushes, so back() returns here.
 *   set(patch)   — a lateral adjustment (lens, quarter). Replaces in place, so
 *                  Back skips past it rather than stepping through every
 *                  intermediate setting.
 *   back(fallback) — pops if we have somewhere to pop to, else replaces with
 *                  `fallback`. The fallback is what stops a "‹ Back" on an entry
 *                  view from dead-ending, which in an overlay would mean a button
 *                  that visibly does nothing.
 *
 * @param {{mode?: QmMode, scope?: QmScopeKind, measure?: string}} [defaults]
 */
export function createQmHistory(defaults = {}) {
  let stack = [parseQmRoute(new URLSearchParams(), defaults)];
  const listeners = new Set();

  const emit = () => { listeners.forEach((fn) => fn()); };
  const current = () => stack[stack.length - 1];

  return {
    route: current,
    canGoBack: () => stack.length > 1,

    go(patch) {
      const next = normalizeQmRoute({ ...current(), ...patch });
      // Landing on the view already showing shouldn't cost a history entry —
      // otherwise a double-click on a tile takes two Backs to undo.
      if (keyOf(next) === keyOf(current())) { stack[stack.length - 1] = next; emit(); return; }
      stack = [...stack, next];
      emit();
    },

    set(patch) {
      stack = [...stack.slice(0, -1), normalizeQmRoute({ ...current(), ...patch })];
      emit();
    },

    back(fallback = {}) {
      if (stack.length > 1) stack = stack.slice(0, -1);
      else stack = [normalizeQmRoute({ ...current(), ...fallback })];
      emit();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
