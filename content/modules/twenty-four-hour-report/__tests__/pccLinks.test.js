import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import {
  progressNoteUrl,
  patientDashboardUrl,
  existingProgressNoteUrl,
  noteOrChartUrl,
} from '../../../utils/pcc-links.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('pcc-links', () => {
  it('builds the new-progress-note URL against the current PCC origin', () => {
    // Never hardcode a domain — customers sit on different PCC pods.
    expect(progressNoteUrl('12345')).toBe(
      `${window.location.origin}/care/chart/ipn/newipn.jsp?ESOLclientid=12345&res_pn=Y&ESOLpnid=-1`
    );
  });

  it('encodes the client id', () => {
    expect(progressNoteUrl('a b/c')).toContain('ESOLclientid=a%20b%2Fc');
  });

  it('returns null without an id, so callers cannot open a note on nobody', () => {
    expect(progressNoteUrl(null)).toBeNull();
    expect(progressNoteUrl(undefined)).toBeNull();
    expect(progressNoteUrl('')).toBeNull();
    expect(patientDashboardUrl(null)).toBeNull();
  });
});

/** Mount a hook and expose its latest return value. */
function mountHook(hookFn) {
  const box = { current: null };
  function Probe() {
    box.current = hookFn();
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(h(Probe), host);
  return { box, host, unmount: () => render(null, host) };
}


