import { describe, it, expect } from 'vitest';
import {
  withStableTokenKeys,
  tokenKeyOf,
  TOKEN_OMIT,
  groupEvidenceMenus,
  isMenuChecked,
  trimComposedConnector,
} from '../segmentTokens.js';

const tok = (opts = {}) => ({ kind: 'token', tokenKey: 'inline', needsFilling: true, value: '[select]', ...opts });
const txt = (value) => ({ kind: 'text', value });

describe('withStableTokenKeys — unique keys for goal/intervention tokens', () => {
  it('gives two same-tokenKey tokens in one intervention distinct _ukeys (the Bathing bug)', () => {
    const focus = {
      goals: [{ description: 'g' }],
      interventions: [
        {
          description: 'Bathing: Provide [select] assistance of [select] person(s)',
          descriptionSegments: [txt('Bathing: Provide '), tok(), txt(' assistance of '), tok(), txt(' person(s)')],
        },
      ],
    };
    const out = withStableTokenKeys(focus);
    const tokens = out.interventions[0].descriptionSegments.filter((s) => s.kind === 'token');
    expect(tokens).toHaveLength(2);
    expect(tokenKeyOf(tokens[0])).not.toBe(tokenKeyOf(tokens[1]));
  });

  it('keys are stable across repeated calls (render and compose must agree)', () => {
    const focus = { interventions: [{ descriptionSegments: [txt('a '), tok(), txt(' b'), tok()] }] };
    const a = withStableTokenKeys(focus).interventions[0].descriptionSegments.filter((s) => s.kind === 'token').map(tokenKeyOf);
    const b = withStableTokenKeys(focus).interventions[0].descriptionSegments.filter((s) => s.kind === 'token').map(tokenKeyOf);
    expect(a).toEqual(b);
  });

  it('goal tokens and intervention tokens never collide', () => {
    const focus = {
      goals: [{ descriptionSegments: [txt('goal '), tok()] }],
      interventions: [{ descriptionSegments: [txt('iv '), tok()] }],
    };
    const out = withStableTokenKeys(focus);
    const gk = tokenKeyOf(out.goals[0].descriptionSegments[1]);
    const ik = tokenKeyOf(out.interventions[0].descriptionSegments[1]);
    expect(gk).not.toBe(ik);
  });

  it('gives FOCUS-level same-tokenKey tokens distinct keys (the "AEB [select] [select]" / ×3-multiselect bug)', () => {
    // Live regression (Gomez psychosocial focus): two inline pickers + three
    // multiselect bullets in one focus statement — keyed by tokenKey alone,
    // picking one option filled BOTH pickers and one × struck all three chips.
    const focus = {
      descriptionSegments: [
        txt('…and social isolation AEB '), tok(), txt(' '), tok(),
        txt('\n'), tok({ tokenKey: 'multiselect', value: 'Difficulty to engage' }),
        txt('\n'), tok({ tokenKey: 'multiselect', value: 'Prefers self directed activities' }),
      ],
      interventions: [],
    };
    const out = withStableTokenKeys(focus);
    const keys = out.descriptionSegments.filter((s) => s.kind === 'token').map(tokenKeyOf);
    expect(new Set(keys).size).toBe(keys.length);
    // tokenKey itself is preserved (labels/type dispatch still read it).
    expect(out.descriptionSegments[1].tokenKey).toBe('inline');
  });

  it('is a no-op passthrough for a focus with no token segments anywhere', () => {
    const focus = { description: 'x' };
    expect(withStableTokenKeys(focus)).toBe(focus);
  });
});

describe('tokenKeyOf', () => {
  it('prefers _ukey, falls back to tokenKey', () => {
    expect(tokenKeyOf({ _ukey: 'iv0_1', tokenKey: 'inline' })).toBe('iv0_1');
    expect(tokenKeyOf({ tokenKey: 'inline' })).toBe('inline');
  });
});

const ms = (value, opts = {}) =>
  ({ kind: 'token', tokenKey: 'multiselect', needsFilling: true, value, ...opts });

describe('groupEvidenceMenus — consecutive multiselect bullets become ONE control', () => {
  it('groups adjacent multiselect tokens (whitespace-only text between) into an msgroup', () => {
    const segs = [
      txt('…social isolation AEB '),
      ms('Little interest or pleasure in doing things', { _ukey: 'f_1' }),
      txt('\n'),
      ms('Prefers self directed activities', { _ukey: 'f_3' }),
      txt(' noted by staff'),
    ];
    const plan = groupEvidenceMenus(segs);
    expect(plan.map((p) => p.kind)).toEqual(['seg', 'msgroup', 'seg']);
    expect(plan[1].tokens.map((t) => t.seg.value)).toEqual([
      'Little interest or pleasure in doing things',
      'Prefers self directed activities',
    ]);
  });

  it('non-whitespace text between menus splits them into separate groups', () => {
    const segs = [ms('a'), txt(' and also '), ms('b')];
    const plan = groupEvidenceMenus(segs);
    expect(plan.map((p) => p.kind)).toEqual(['msgroup', 'seg', 'msgroup']);
  });

  it('passes through segments with no multiselect tokens untouched', () => {
    const segs = [txt('plain '), tok(), txt(' text')];
    expect(groupEvidenceMenus(segs).every((p) => p.kind === 'seg')).toBe(true);
  });
});

describe('isMenuChecked — evidence-backed pre-check, nurse override wins', () => {
  it('defaults: pre-checked (needsFilling:false) → checked; nurse pick (needsFilling:true) → unchecked', () => {
    expect(isMenuChecked(ms('a', { needsFilling: false, receipt: 'PHQ-9 Q1 = 2' }), {})).toBe(true);
    expect(isMenuChecked(ms('a'), {})).toBe(false);
  });
  it('an explicit nurse action always wins over the default', () => {
    const pre = ms('a', { needsFilling: false, _ukey: 'f_1' });
    const pick = ms('b', { _ukey: 'f_2' });
    expect(isMenuChecked(pre, { f_1: TOKEN_OMIT })).toBe(false); // unchecked a pre-check
    expect(isMenuChecked(pick, { f_2: 'b' })).toBe(true); // checked a nurse-pick
  });
});

describe('trimComposedConnector — no dangling "AEB" when nothing is checked', () => {
  it('strips a trailing connector left by an all-unchecked menu group', () => {
    expect(trimComposedConnector('…has a potential for social isolation AEB')).toBe(
      '…has a potential for social isolation',
    );
    expect(trimComposedConnector('…potential for dehydration as evidenced by ')).toBe(
      '…potential for dehydration',
    );
  });
  it('leaves a connector followed by real content alone', () => {
    const s = '…social isolation AEB Little interest in doing things';
    expect(trimComposedConnector(s)).toBe(s);
  });
});
