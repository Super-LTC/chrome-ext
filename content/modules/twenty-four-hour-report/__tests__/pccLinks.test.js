import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import {
  progressNoteUrl,
  patientDashboardUrl,
  existingProgressNoteUrl,
  noteOrChartUrl,
} from '../../../utils/pcc-links.js';
import { useProgressNote } from '../hooks/useProgressNote.js';

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

describe('useProgressNote', () => {
  let openSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    openSpy = vi.fn();
    window.open = openSpy;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the note window and waits for the nurse to close it', async () => {
    const fakeWin = { closed: false };
    openSpy.mockReturnValue(fakeWin);

    const { box } = mountHook(() => useProgressNote({ pccClientId: '999' }));
    expect(box.current.state).toBe('idle');

    box.current.open();
    await Promise.resolve();
    expect(openSpy).toHaveBeenCalledOnce();
    expect(openSpy.mock.calls[0][0]).toContain('newipn.jsp');
    expect(box.current.state).toBe('writing');

    // Still open → still waiting.
    vi.advanceTimersByTime(1200);
    await Promise.resolve();
    expect(box.current.state).toBe('writing');

    // Nurse closes it → we can offer the sign-off. Preact batches the re-render,
    // so drain microtasks before reading the hook's latest value.
    fakeWin.closed = true;
    vi.advanceTimersByTime(700);
    await Promise.resolve();
    await Promise.resolve();
    expect(box.current.state).toBe('ready');
  });

  it('goes straight to ready when the popup is blocked, rather than stranding the nurse', async () => {
    // A blocked popup used to look identical to "nothing happened". The nurse
    // can still chart in PCC directly, so let them sign off either way.
    openSpy.mockReturnValue(null);

    const { box } = mountHook(() => useProgressNote({ pccClientId: '999' }));
    box.current.open();
    await Promise.resolve();

    expect(box.current.state).toBe('ready');
    expect(box.current.blocked).toBe(true);
  });

  it('does nothing without a resolved client id', async () => {
    const { box } = mountHook(() => useProgressNote({ pccClientId: null }));
    const result = box.current.open();
    await Promise.resolve();

    expect(result).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(box.current.state).toBe('idle');
  });

  it('cancel stops the poll and returns to idle', async () => {
    const fakeWin = { closed: false };
    openSpy.mockReturnValue(fakeWin);

    const { box } = mountHook(() => useProgressNote({ pccClientId: '999' }));
    box.current.open();
    await Promise.resolve();
    box.current.cancel();
    await Promise.resolve();

    expect(box.current.state).toBe('idle');
    // Poll is dead: closing the window later must not resurrect the flow.
    fakeWin.closed = true;
    vi.advanceTimersByTime(2000);
    expect(box.current.state).toBe('idle');
  });

  it('reports the open attempt even when the popup is blocked', async () => {
    openSpy.mockReturnValue(null);
    const onOpened = vi.fn();

    const { box } = mountHook(() => useProgressNote({ pccClientId: '999', onOpened }));
    box.current.open();
    await Promise.resolve();

    expect(onOpened).toHaveBeenCalledOnce();
  });
});

describe('existingProgressNoteUrl / noteOrChartUrl', () => {
  it('builds a note deep-link from BOTH ids', () => {
    expect(existingProgressNoteUrl('12345', '987')).toBe(
      `${window.location.origin}/care/chart/ipn/newipn.jsp?ESOLclientid=12345&res_pn=Y&ESOLpnid=987`
    );
  });

  it('falls back to the chart when the note id is missing', () => {
    // Detection can land without a PCC note id (practitioner note, odd external
    // id). The chart is where this button goes today, so this is not a
    // regression — but a dead ESOLpnid would be.
    expect(noteOrChartUrl('12345', null)).toBe(patientDashboardUrl('12345'));
    expect(noteOrChartUrl('12345', undefined)).toBe(patientDashboardUrl('12345'));
  });

  it('returns null when there is no client id at all', () => {
    expect(noteOrChartUrl(null, '987')).toBeNull();
  });

  it('encodes ids rather than splicing them raw into the query', () => {
    expect(existingProgressNoteUrl('a b', 'c&d')).toContain('ESOLclientid=a%20b');
    expect(existingProgressNoteUrl('a b', 'c&d')).toContain('ESOLpnid=c%26d');
  });
});
