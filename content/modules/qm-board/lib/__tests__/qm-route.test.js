/**
 * Ported from superltc `web/components/quality-measures/use-qm-route.test.ts`.
 *
 * The parse/serialize pair is the SAME contract as the web's, deliberately: the
 * whole point of porting the route OBJECT (rather than the URL) is that every
 * view-model and component that reads a route keeps working untouched. Where the
 * web backs it with the address bar, we back it with an in-memory stack — but the
 * shape, the defaults and the degradation ladder have to match or ported
 * components start disagreeing with their own props.
 *
 * Serialization is kept even though an extension has no address bar: it's how two
 * paths to the same view collapse to one history entry (see `go` in qm-route.js).
 */
import { describe, it, expect } from 'vitest';
import { parseQmRoute, serializeQmRoute, createQmHistory } from '../qm-route.js';

const parse = (qs, defaults = {}) => parseQmRoute(new URLSearchParams(qs), defaults);
const serialize = (route, base = '') =>
  serializeQmRoute(route, new URLSearchParams(base)).toString();

describe('parseQmRoute', () => {
  it('defaults to the coordinator overview on an empty query string', () => {
    expect(parse('')).toMatchObject({
      mode: 'coordinator',
      view: 'overview',
      quarter: 0,
      scope: 'board',
      qipScope: 'rollup',
      lens: 'both',
    });
  });

  it('honours host-supplied defaults', () => {
    expect(parse('', { mode: 'regional', scope: 'facility' })).toMatchObject({
      mode: 'regional',
      scope: 'facility',
    });
  });

  it('reads a full deep link', () => {
    const r = parse('qm=regional&view=measure&measure=falls_major_injury&quarter=2&lens=five_star');
    expect(r).toMatchObject({
      mode: 'regional',
      view: 'measure',
      measure: 'falls_major_injury',
      quarter: 2,
      lens: 'five_star',
    });
  });

  describe('hostile / stale input degrades, never crashes', () => {
    it('falls back on an unknown mode, view or lens', () => {
      const r = parse('qm=wat&view=nope&lens=purple');
      expect(r.mode).toBe('coordinator');
      expect(r.view).toBe('overview');
      expect(r.lens).toBe('both');
    });

    it('clamps an out-of-range quarter into the 4Q window', () => {
      expect(parse('quarter=9').quarter).toBe(0);
      expect(parse('quarter=-1').quarter).toBe(0);
      expect(parse('quarter=abc').quarter).toBe(0);
      expect(parse('quarter=3').quarter).toBe(3);
    });

    it('rejects a malformed measure id rather than rendering an empty shell', () => {
      expect(parse('measure=Falls%20Major').measure).toBeUndefined();
      expect(parse('measure=<script>').measure).toBeUndefined();
      expect(parse('measure=uti').measure).toBe('uti');
    });

    it('rejects a malformed patient id', () => {
      expect(parse('patient=%3Cscript%3E').patient).toBeUndefined();
      expect(parse('patient=ab').patient).toBeUndefined();
      expect(parse('patient=gxxwzrblx759').patient).toBe('gxxwzrblx759');
    });

    it('degrades a measure view with no measure to the overview', () => {
      expect(parse('view=measure').view).toBe('overview');
    });

    it('degrades a resident view with no patient to the measure it came from', () => {
      expect(parse('view=resident&measure=uti').view).toBe('measure');
      expect(parse('view=resident').view).toBe('overview');
    });

    // discharge_function IS a Five-Star measure (ss_dfs, short-stay, 150 pts), so
    // the measure grid renders it a row and emits view=measure&measure=discharge_function
    // — but MeasureDetail has no DFS handling at all, because DFS is computed per
    // STAY, not per resident-quarter. DfsPage is the real destination.
    it('sends the discharge_function measure view to the DFS page', () => {
      const r = parse('view=measure&measure=discharge_function');
      expect(r.view).toBe('dfs');
      expect(r.measure).toBeUndefined();
    });

    it('leaves every other measure on the measure view', () => {
      expect(parse('view=measure&measure=uti').view).toBe('measure');
      expect(parse('view=measure&measure=falls_major_injury').view).toBe('measure');
    });

    it('does not disturb an explicit dfs view or a resident view', () => {
      expect(parse('view=dfs').view).toBe('dfs');
      expect(parse('view=resident&measure=discharge_function&patient=gxxwzrblx759').view)
        .toBe('resident');
    });
  });
});

describe('serializeQmRoute', () => {
  const base = parse('');

  it('writes nothing for a default route', () => {
    expect(serialize(base)).toBe('');
  });

  it('omits defaults so two paths to one view produce the same string', () => {
    const viaA = serialize({ ...base, mode: 'regional', lens: 'both', quarter: 0 });
    const viaB = serialize({ ...base, mode: 'regional' });
    expect(viaA).toBe(viaB);
    expect(viaA).toBe('qm=regional');
  });

  it('preserves params this surface does not own', () => {
    const qs = serialize({ ...base, mode: 'qip' }, 'tab=quality-measures&locationId=loc1');
    const p = new URLSearchParams(qs);
    expect(p.get('tab')).toBe('quality-measures');
    expect(p.get('locationId')).toBe('loc1');
    expect(p.get('qm')).toBe('qip');
  });

  it('drops a scope id when the scope is not a building', () => {
    expect(new URLSearchParams(serialize({ ...base, scope: 'board', scopeId: 'loc1' })).get('building'))
      .toBeNull();
    expect(new URLSearchParams(serialize({ ...base, scope: 'facility', scopeId: 'loc1' })).get('building'))
      .toBe('loc1');
  });

  it('drops a qip scope id when the qip scope is not a building', () => {
    expect(new URLSearchParams(serialize({ ...base, qipScope: 'rollup', qipScopeId: 'loc1' })).get('qipBuilding'))
      .toBeNull();
    expect(new URLSearchParams(serialize({ ...base, qipScope: 'facility', qipScopeId: 'loc1' })).get('qipBuilding'))
      .toBe('loc1');
  });

  it('round-trips a deep link unchanged', () => {
    const route = {
      ...base,
      mode: 'regional',
      view: 'resident',
      measure: 'adl_decline',
      patient: 'gxxwzrblx759',
      quarter: 1,
      scope: 'facility',
      scopeId: 'hwy2kde1ahsw',
      lens: 'five_star',
    };
    expect(parse(serialize(route))).toMatchObject({
      mode: 'regional',
      view: 'resident',
      measure: 'adl_decline',
      patient: 'gxxwzrblx759',
      quarter: 1,
      scope: 'facility',
      scopeId: 'hwy2kde1ahsw',
      lens: 'five_star',
    });
  });

  it('never puts a resident NAME in the serialized route — only an id', () => {
    const route = { ...base, view: 'resident', measure: 'uti', patient: 'pat123456' };
    const qs = serialize(route);
    expect(qs).toContain('patient=pat123456');
    expect(qs).not.toMatch(/[A-Z][a-z]+%20[A-Z][a-z]+/); // no "First Last"
  });
});

// ── The in-memory backing (this is what replaces next/navigation) ────────────

describe('createQmHistory', () => {
  it('starts on a route built from the supplied defaults', () => {
    const h = createQmHistory({ mode: 'regional', scope: 'board' });
    expect(h.route()).toMatchObject({ mode: 'regional', view: 'overview', scope: 'board' });
    expect(h.canGoBack()).toBe(false);
  });

  it('go() pushes an entry that back() returns from', () => {
    const h = createQmHistory({ mode: 'regional' });
    h.go({ view: 'measure', measure: 'uti' });
    expect(h.route()).toMatchObject({ view: 'measure', measure: 'uti' });
    expect(h.canGoBack()).toBe(true);

    h.back({ view: 'overview' });
    expect(h.route()).toMatchObject({ view: 'overview' });
    expect(h.canGoBack()).toBe(false);
  });

  it('set() changes the view in place, leaving no entry to step back through', () => {
    const h = createQmHistory();
    h.go({ view: 'measure', measure: 'uti' });
    h.set({ quarter: 2 });
    h.set({ quarter: 3 });
    expect(h.route()).toMatchObject({ view: 'measure', measure: 'uti', quarter: 3 });

    // One back, not three: the lens/quarter fiddling collapsed into the entry.
    h.back({ view: 'overview' });
    expect(h.route()).toMatchObject({ view: 'overview' });
  });

  it('back() falls back to the given route when there is nothing to pop', () => {
    // The extension equivalent of a pasted deep link: back must not close the
    // surface, it must land somewhere real.
    const h = createQmHistory({ mode: 'qip' });
    h.back({ view: 'overview', qipScope: 'rollup' });
    expect(h.route()).toMatchObject({ mode: 'qip', view: 'overview', qipScope: 'rollup' });
  });

  it('normalizes on the way out, not just on the way in', () => {
    const h = createQmHistory();
    h.go({ view: 'measure', measure: 'discharge_function' });
    expect(h.route()).toMatchObject({ view: 'dfs', measure: undefined });
  });

  it('collapses a go() that lands on the route already showing', () => {
    // Two clicks on the same tile shouldn't cost two Backs.
    const h = createQmHistory({ mode: 'regional' });
    h.go({ view: 'measure', measure: 'uti' });
    h.go({ view: 'measure', measure: 'uti' });
    h.back({ view: 'overview' });
    expect(h.route()).toMatchObject({ view: 'overview' });
  });

  it('notifies subscribers on every change', () => {
    const h = createQmHistory();
    let n = 0;
    const off = h.subscribe(() => { n += 1; });
    h.go({ view: 'signals' });
    h.set({ lens: 'five_star' });
    h.back({ view: 'overview' });
    expect(n).toBe(3);
    off();
    h.go({ view: 'simulator' });
    expect(n).toBe(3);
  });
});
