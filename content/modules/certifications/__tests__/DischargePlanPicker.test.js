import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { CERT_FORM } from './cert-form-fixture.js';

const {
  DischargePlanPicker,
  parseDischargePlan,
  composeDischargePlan,
  isDischargePlanValid,
} = await import('../components/DischargePlanPicker.jsx');

/**
 * Plan for Discharge is stored as a plain string: the option's own text, or
 * "Other: <text>". Standard orgs pick from Home Health Agency / Facility Care;
 * the checkbox-form org passes its paper form's three options instead. Either
 * way a stored value must parse back to the radio it came from.
 */

const CHAMPION = CERT_FORM.dischargeOptions;
const roundTrip = (stored, options) => {
  const { option, otherText } = parseDischargePlan(stored, options);
  return composeDischargePlan(option, otherText);
};

describe('default options (standard orgs)', () => {
  it('round-trips each option and Other', () => {
    expect(roundTrip('Home Health Agency')).toBe('Home Health Agency');
    expect(roundTrip('Facility Care')).toBe('Facility Care');
    expect(roundTrip('Other: Hospice')).toBe('Other: Hospice');
  });

  it('parses empty to no selection', () => {
    expect(parseDischargePlan('')).toEqual({ option: '', otherText: '' });
    expect(parseDischargePlan(null)).toEqual({ option: '', otherText: '' });
    expect(composeDischargePlan('', '')).toBe('');
  });

  it('treats legacy free text as Other', () => {
    expect(parseDischargePlan('Home with family')).toEqual({ option: 'other', otherText: 'Home with family' });
    expect(roundTrip('Home with family')).toBe('Other: Home with family');
  });

  it('validates: a pick is required, Other needs text', () => {
    expect(isDischargePlanValid('', '')).toBe(false);
    expect(isDischargePlanValid(parseDischargePlan('Facility Care').option, '')).toBe(true);
    expect(isDischargePlanValid('other', '  ')).toBe(false);
    expect(isDischargePlanValid('other', 'Hospice')).toBe(true);
  });
});

describe('checkbox-form options', () => {
  it('round-trips each of its options', () => {
    for (const opt of CHAMPION) expect(roundTrip(opt, CHAMPION)).toBe(opt);
    expect(roundTrip('Other: Assisted living', CHAMPION)).toBe('Other: Assisted living');
  });

  it('a value from the other set falls back to Other text', () => {
    // A plan saved before the org switched forms keeps its words.
    expect(parseDischargePlan('Facility Care', CHAMPION)).toEqual({ option: 'other', otherText: 'Facility Care' });
  });

  it('validates its options as picks', () => {
    for (const opt of CHAMPION) {
      expect(isDischargePlanValid(parseDischargePlan(opt, CHAMPION).option, '')).toBe(true);
    }
  });
});

describe('the picker', () => {
  let root;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    render(null, root);
    root.remove();
  });

  const labels = () => [...root.querySelectorAll('.cm-discharge__label')].map((el) => el.textContent);

  it('shows the standard options by default', () => {
    render(h(DischargePlanPicker, { option: '', otherText: '', onOptionChange: () => {}, onOtherTextChange: () => {} }), root);
    expect(labels()).toEqual(['Home Health Agency', 'Facility Care', 'Other']);
  });

  it('shows the passed options, then Other', () => {
    render(h(DischargePlanPicker, { options: CHAMPION, option: '', otherText: '', onOptionChange: () => {}, onOtherTextChange: () => {} }), root);
    expect(labels()).toEqual([...CHAMPION, 'Other']);
  });

  it('picking an option reports a value that composes to its text', () => {
    const onOptionChange = vi.fn();
    render(h(DischargePlanPicker, { options: CHAMPION, option: '', otherText: '', onOptionChange, onOtherTextChange: () => {} }), root);
    root.querySelectorAll('.cm-discharge__radio')[2].click();
    expect(composeDischargePlan(onOptionChange.mock.calls[0][0], '')).toBe('Long Term Care');
  });

  it('checks the radio matching a parsed stored value', () => {
    const { option } = parseDischargePlan('Office Care', CHAMPION);
    render(h(DischargePlanPicker, { options: CHAMPION, option, otherText: '', onOptionChange: () => {}, onOtherTextChange: () => {} }), root);
    const checked = root.querySelector('.cm-discharge__radio:checked');
    expect(checked.closest('label').querySelector('.cm-discharge__label').textContent).toBe('Office Care');
  });
});
