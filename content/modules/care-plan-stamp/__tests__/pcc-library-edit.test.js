import { describe, it, expect } from 'vitest';
import { normText, parseItemLinkIds, findRowGroupHtml } from '../pcc-library-edit.js';

describe('normText', () => {
  it('collapses whitespace for match-by-text', () => {
    expect(normText('  a   b\nc ')).toBe('a b c');
  });
});

describe('parseItemLinkIds', () => {
  it('extracts any edit-call with numeric args except editNeed, deduped', () => {
    const html = `
      <a onclick="editGoal('929781','2073');">edit</a>
      <a onclick="editGoal('929781','2073');">pn</a>
      <a onclick="editTask(929790)">edit</a>
      <a onclick="editNeed('620074','620064')">focus link — ignored</a>`;
    expect(parseItemLinkIds(html)).toEqual([
      { fn: 'editGoal', ids: ['929781', '2073'] },
      { fn: 'editTask', ids: ['929790'] },
    ]);
  });
  it('ignores -1 sentinels and empty arg lists', () => {
    expect(parseItemLinkIds(`<a onclick="editGoal(-1)">x</a>`)).toEqual([]);
  });
});

describe('findRowGroupHtml', () => {
  it('climbs past nested-table inner rows until item links appear, stopping before another focus', () => {
    document.body.innerHTML = `
      <table><tr id="outer"><td>
        <table><tr><td><a id="f1" onclick="editNeed('623678','623620')">edit</a></td></tr></table>
        <table><tr><td><a onclick="editGoal('929781','2073')">edit</a></td></tr></table>
      </td></tr>
      <tr><td><a onclick="editNeed('999999','999998')">other focus</a></td></tr></table>`;
    const link = document.getElementById('f1');
    const html = findRowGroupHtml(link, ['623678', '623620']);
    expect(parseItemLinkIds(html)).toEqual([{ fn: 'editGoal', ids: ['929781', '2073'] }]);
  });
});
