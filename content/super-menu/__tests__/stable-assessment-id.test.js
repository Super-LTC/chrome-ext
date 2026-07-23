// Tests for resolveStableAssessmentId() — the assessment-id twin of
// resolveStableClientId() (client-id.js).
//
// PCC migrated ESOLassessid in URLs/links to ephemeral login-bound EID_ tokens.
// The numeric assessment id survives on flipped MDS section pages ONLY in the
// per-item `toggleToolsWindow(this, '<digits>', …)` onclick handlers. This
// resolver recovers it so the ext never sends an EID as externalAssessmentId.

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveStableAssessmentId } from '../client-id.js';

const NUMERIC = '3120458'; // shape of a real ESOLassessid
const EID = 'EID_0qdFxemS33H7GHe3';

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});

describe('resolveStableAssessmentId()', () => {
  it('returns a numeric ESOLassessid straight from the URL (legacy facilities)', () => {
    window.history.replaceState({}, '', `/mds3/section.xhtml?ESOLassessid=${NUMERIC}&sectioncode=N`);
    expect(resolveStableAssessmentId()).toBe(NUMERIC);
  });

  it('recovers the numeric id from a toggleToolsWindow onclick when the URL carries an EID', () => {
    window.history.replaceState({}, '', `/mds3/section.xhtml?ESOLassessid=${EID}&sectioncode=N`);
    document.body.innerHTML =
      `<a href="#" onclick="toggleToolsWindow(this, '${NUMERIC}', 'N0300');return false;">tools</a>`;
    expect(resolveStableAssessmentId()).toBe(NUMERIC);
  });

  it('recovers the numeric id from an inline script when the URL carries an EID', () => {
    window.history.replaceState({}, '', `/mds3/section.xhtml?ESOLassessid=${EID}`);
    document.body.innerHTML = `<script>function f(){ toggleToolsWindow(this, '${NUMERIC}', 'x'); }</script>`;
    expect(resolveStableAssessmentId()).toBe(NUMERIC);
  });

  it('never returns the EID token — returns null when no numeric id is on the page', () => {
    window.history.replaceState({}, '', `/mds3/section.xhtml?ESOLassessid=${EID}`);
    const out = resolveStableAssessmentId();
    expect(out).not.toBe(EID);
    expect(out).toBeNull();
  });

  it('prefers the numeric URL id over the DOM (fast path, no mismatch risk)', () => {
    window.history.replaceState({}, '', `/mds3/section.xhtml?ESOLassessid=${NUMERIC}`);
    document.body.innerHTML =
      `<a onclick="toggleToolsWindow(this, '9999999', 'N')">t</a>`; // different id in DOM
    expect(resolveStableAssessmentId()).toBe(NUMERIC);
  });

  it('returns null off MDS pages (no ESOLassessid, no toggleToolsWindow)', () => {
    window.history.replaceState({}, '', '/clinical/dashboard.xhtml');
    expect(resolveStableAssessmentId()).toBeNull();
  });

  it('accepts an explicit href argument', () => {
    expect(resolveStableAssessmentId(`https://pcc.example/mds3/section.xhtml?ESOLassessid=${NUMERIC}`)).toBe(NUMERIC);
  });

  it('tolerates flexible whitespace in the toggleToolsWindow call', () => {
    window.history.replaceState({}, '', `/mds3/section.xhtml?ESOLassessid=${EID}`);
    document.body.innerHTML = `<a onclick="toggleToolsWindow( this ,   '${NUMERIC}' , 'N')">t</a>`;
    expect(resolveStableAssessmentId()).toBe(NUMERIC);
  });
});
