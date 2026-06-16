import { describe, it, expect, afterEach } from 'vitest';
import { scrapeNumericClientIdFromDOM, resolveStableClientId } from './client-id.js';

// Minimal mock Document implementing only what the resolver touches, so these
// tests need no DOM library.
function mockDoc({ hidden, needsVal, anchors = [], scripts = [], bodyHtml = '', clientIdSpan, bodyText = '' } = {}) {
  return {
    querySelector(sel) {
      if (sel === 'input[name="ESOLclientid"]') {
        return hidden === undefined ? null : { value: hidden };
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === 'a[href*="ESOLclientid="]') return anchors.map((href) => ({ getAttribute: () => href }));
      if (sel === 'script:not([src])') return scripts.map((textContent) => ({ textContent }));
      if (sel.includes('Client ID:')) {
        return clientIdSpan === undefined ? [] : [{ getAttribute: () => clientIdSpan }];
      }
      return [];
    },
    needs: needsVal === undefined ? undefined : { ESOLclientid: { value: needsVal } },
    body: { innerHTML: bodyHtml, innerText: bodyText },
  };
}

describe('scrapeNumericClientIdFromDOM', () => {
  it('prefers the numeric hidden ESOLclientid input (newmds.xhtml case)', () => {
    expect(scrapeNumericClientIdFromDOM(mockDoc({ hidden: '2745953' }))).toBe('2745953');
  });
  it('ignores a non-numeric (EID_) hidden value and falls through to anchors', () => {
    const doc = mockDoc({ hidden: 'EID_0qp9Dt46t1IKFj6k', anchors: ['/admin/client/cp_mds.jsp?ESOLclientid=841062&x=1'] });
    expect(scrapeNumericClientIdFromDOM(doc)).toBe('841062');
  });
  it('reads from document.needs when present', () => {
    expect(scrapeNumericClientIdFromDOM(mockDoc({ needsVal: '12345' }))).toBe('12345');
  });
  it('reads from inline scripts when no input/anchor', () => {
    expect(scrapeNumericClientIdFromDOM(mockDoc({ scripts: ['var u="x?ESOLclientid=555&y";'] }))).toBe('555');
  });
  it('last-resorts to any numeric id in the body html', () => {
    expect(scrapeNumericClientIdFromDOM(mockDoc({ bodyHtml: '<i>ESOLclientid=999</i>' }))).toBe('999');
  });
  it('reads the resident-header "Client ID: NNN" span (chart pages w/ no ESOLclientid= link)', () => {
    expect(scrapeNumericClientIdFromDOM(mockDoc({ clientIdSpan: 'Client ID: 2745953' }))).toBe('2745953');
  });
  it('reads "Client ID: NNN" from body text as a fallback', () => {
    expect(scrapeNumericClientIdFromDOM(mockDoc({ bodyText: 'Resident: Aldridge, Ronald  Client ID: 2745953  DOB ...' }))).toBe('2745953');
  });
  it('returns null when nothing numeric is present (EID-only page)', () => {
    expect(scrapeNumericClientIdFromDOM(mockDoc({ hidden: 'EID_abc' }))).toBeNull();
  });
});

describe('resolveStableClientId', () => {
  const origDoc = globalThis.document;
  afterEach(() => { globalThis.document = origDoc; });

  it('returns a numeric URL id as-is (un-migrated facility)', () => {
    expect(resolveStableClientId('https://x.pointclickcare.com/p.jsp?ESOLclientid=2745953')).toBe('2745953');
  });
  it('recovers the numeric id from the DOM when the URL carries an EID_ token', () => {
    globalThis.document = mockDoc({ hidden: '2745953' });
    expect(resolveStableClientId('https://x.pointclickcare.com/newmds.xhtml?ESOLclientid=EID_0qp9Dt46t1IKFj6k')).toBe('2745953');
  });
  it('falls back to the raw EID_ token only when no numeric id is anywhere', () => {
    globalThis.document = mockDoc({});
    expect(resolveStableClientId('https://x/p?ESOLclientid=EID_zzz')).toBe('EID_zzz');
  });
  it('returns null when the URL has no ESOLclientid (does not guess from a list page DOM)', () => {
    globalThis.document = mockDoc({ anchors: ['?ESOLclientid=841062'] });
    expect(resolveStableClientId('https://x/clientlist.jsp')).toBeNull();
  });
});
