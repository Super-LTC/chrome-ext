/**
 * The Tailwind output must never escape `.sltc-tw`.
 *
 * WHY THIS IS A TEST AND NOT A CODE REVIEW ITEM. There is no Shadow DOM here —
 * our stylesheet is injected as one global <style> into a PointClickCare page.
 * A single unscoped selector in the Tailwind output (`*`, `body`, `.flex`, a
 * preflight reset) restyles PCC itself for every user, on every page, and it
 * would not show up in any of our own screens — the only place it's visible is
 * the customer's EHR. That is not a failure mode to catch by reading diffs.
 *
 * The build is invoked directly rather than reading the committed artifact:
 * `tailwind.generated.css` is gitignored, so a clean checkout has no file to
 * assert against, and asserting on a stale one would be worse than not testing.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import postcss from 'postcss';
import { buildTailwind, SCOPE, KEYFRAME_PREFIX } from '../../../scripts/build-tailwind.mjs';

let css;
let root;

beforeAll(async () => {
  css = await buildTailwind({ quiet: true });
  root = postcss.parse(css);
}, 60_000);

describe('generated Tailwind is scoped', () => {
  /** Keyframe STEPS (`0%`, `to`) are rules but not selectors — never prefix them. */
  const inKeyframes = (rule) => {
    for (let p = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule' && /keyframes$/.test(p.name)) return true;
    }
    return false;
  };

  it('puts every style rule under the scope class', () => {
    const escaped = [];
    root.walkRules((rule) => {
      if (inKeyframes(rule)) return;
      for (const part of rule.selectors) {
        if (!part.includes(SCOPE)) escaped.push(part);
      }
    });
    // Named so a failure prints WHICH selector leaked, not just a count.
    expect(escaped).toEqual([]);
  });

  it('namespaces @keyframes, the one global selector scoping cannot reach', () => {
    // An animation NAME is global whatever selector uses it. Tailwind emits
    // `@keyframes pulse`; if PCC defines its own, the later stylesheet wins for
    // both — including ours overriding THEIRS, which the scoping promise forbids.
    const names = [];
    root.walkAtRules('keyframes', (r) => names.push(r.params.trim()));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => !n.startsWith(KEYFRAME_PREFIX))).toEqual([]);
  });

  it('leaves no dangling var() reference', () => {
    // Renaming a keyframe has to move the name inside the `--animate-*` VALUE,
    // not rewrite the `var(--animate-…)` reference. Getting that backwards
    // produces a variable nothing defines and the animation silently dies —
    // which is exactly what the first version of the namespacing did. Nothing
    // else in the pipeline would have caught it.
    const defined = new Set();
    root.walkDecls((d) => { if (d.prop.startsWith('--')) defined.add(d.prop); });

    const referenced = new Set();
    root.walkDecls((d) => {
      for (const m of d.value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) referenced.add(m[1]);
    });

    // Only check the vars WE generate; `--tw-*` are @property-registered and a
    // few theme vars are legitimately referenced with a fallback.
    const dangling = [...referenced].filter(
      (v) => v.startsWith('--animate-') && !defined.has(v)
    );
    expect(dangling).toEqual([]);
  });

  it('never emits a bare element reset that would hit the host page', () => {
    // Preflight's `*`, `html` and `body` rules are the dangerous ones: they are
    // the reason a scoping regression would reformat PCC rather than merely
    // recolour one widget.
    const bare = [];
    root.walkRules((rule) => {
      for (const part of rule.selectors) {
        if (/^\s*(\*|html|body)\b/.test(part)) bare.push(part);
      }
    });
    expect(bare).toEqual([]);
  });

  it('lands the theme custom properties ON the scope element, not a descendant', () => {
    // Tailwind emits its palette/spacing vars on `:root`. Rewritten to
    // `.sltc-tw *` instead of `.sltc-tw`, every var() inside would resolve to
    // nothing and the whole surface would render unstyled but not error.
    let found = false;
    root.walkRules((rule) => {
      const isScopeItself = rule.selectors.every((s) => s.trim() === SCOPE);
      if (isScopeItself && rule.nodes.some((d) => d.prop?.startsWith('--'))) found = true;
    });
    expect(found).toBe(true);
  });

  it('keeps @property registrations, which cannot be scoped', () => {
    // Tailwind v4 registers its --tw-* custom properties with @property. These
    // are global by nature (there is no scoped form) and are inert unless a
    // scoped rule references them — so they are safe, but they must survive:
    // dropping them breaks transforms, filters and shadows silently.
    const props = [];
    root.walkAtRules('property', (r) => props.push(r.params));
    expect(props.length).toBeGreaterThan(0);
    expect(props.every((p) => p.startsWith('--tw-'))).toBe(true);
  });

  it("carries the web's default border colour so a bare `border` is grey", () => {
    // Tailwind v4's bare `border` resolves to currentColor; the web app
    // overrides it in its base layer and the ported QIP components rely on that
    // 29 times. Without it those borders draw in the text colour.
    expect(css).toContain('border-color: hsl(214.3 31.8% 91.4%)');
  });
});
