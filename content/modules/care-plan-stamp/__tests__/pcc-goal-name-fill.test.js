import { describe, it, expect } from 'vitest';
import {
  isFillableName,
  replaceNamePlaceholders,
  hasNamePlaceholder,
  parseGoalLinkIds,
} from '../pcc-goal-name-fill.js';

describe('isFillableName', () => {
  it('accepts a real PCC name', () => {
    expect(isFillableName('SMITH, JOHN (6106)')).toBe(true);
  });
  it('rejects empty and the JIT-stub pattern', () => {
    expect(isFillableName('')).toBe(false);
    expect(isFillableName('   ')).toBe(false);
    expect(isFillableName('Patient 840151')).toBe(false);
  });
});

describe('replaceNamePlaceholders', () => {
  it('fills (resident name) with the display name (paren part stripped)', () => {
    expect(replaceNamePlaceholders('(resident name) will be free from falls', 'SMITH, JOHN (6106)'))
      .toBe('SMITH, JOHN will be free from falls');
  });
  it("handles possessives and multiple placeholders", () => {
    expect(replaceNamePlaceholders("(resident name)'s dignity; (name) will improve", 'DOE, JANE'))
      .toBe("DOE, JANE's dignity; DOE, JANE will improve");
  });
  it('leaves text alone when no display name', () => {
    expect(replaceNamePlaceholders('(resident name) will improve', '')).toBe('(resident name) will improve');
  });
});

describe('hasNamePlaceholder', () => {
  it('detects resident/patient/name variants, repeatedly (no sticky lastIndex)', () => {
    expect(hasNamePlaceholder('(Resident Name) x')).toBe(true);
    expect(hasNamePlaceholder('(Resident Name) x')).toBe(true); // second call — global regex reset
    expect(hasNamePlaceholder("(patient's name) x")).toBe(true);
    expect(hasNamePlaceholder('no placeholder here')).toBe(false);
  });
});

describe('parseGoalLinkIds', () => {
  it('extracts ids from editGoal-style onclick calls, deduped', () => {
    const html = `
      <a onclick="editGoal('929781','2073');">edit</a>
      <a onclick="editGoal('929781','2073');">pn</a>
      <a onclick="editGoalCust(929790)">edit</a>
      <a onclick="editNeed('620074','620064')">focus link — ignored</a>`;
    expect(parseGoalLinkIds(html)).toEqual([
      { ids: ['929781', '2073'] },
      { ids: ['929790'] },
    ]);
  });
  it('ignores -1 sentinels and empty arg lists', () => {
    expect(parseGoalLinkIds(`<a onclick="editGoal(-1)">x</a>`)).toEqual([]);
  });
});
