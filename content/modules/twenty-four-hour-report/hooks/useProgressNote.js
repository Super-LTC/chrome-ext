import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { progressNoteUrl, openPccWindow } from '../../../utils/pcc-links.js';

/**
 * useProgressNote — open PCC's new-progress-note form for a resident, then wait
 * for the nurse to finish so we can offer to sign the finding off.
 *
 * Three steps, same shape as the F-Tag board's flow:
 *   idle    → nothing open
 *   writing → the popup is open; we poll it
 *   ready   → the popup closed; offer "note written, sign off"
 *
 * We poll `.closed` rather than listen for an event because the popup is a PCC
 * page we don't control — there is nothing to listen to. That is also why
 * openPccWindow deliberately omits `noopener`: without the handle we could not
 * tell when the nurse was done.
 *
 * The window MUST be opened synchronously from the click handler — any await
 * first and the browser treats it as a programmatic popup and blocks it.
 */
export function useProgressNote({ pccClientId, onOpened }) {
  const [state, setState] = useState('idle'); // 'idle' | 'writing' | 'ready'
  const [blocked, setBlocked] = useState(false);
  const winRef = useRef(null);
  const pollRef = useRef(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // A row can be collapsed or the whole panel closed mid-write; don't leak the
  // interval.
  useEffect(() => clearPoll, [clearPoll]);

  const open = useCallback(() => {
    const url = progressNoteUrl(pccClientId);
    if (!url) return false;

    const win = openPccWindow(url, 'super_24hr_progress_note');
    onOpened?.();

    if (!win) {
      // Popup blocked. Don't strand the nurse — let them chart however they like
      // and still sign off.
      setBlocked(true);
      setState('ready');
      return false;
    }

    setBlocked(false);
    winRef.current = win;
    setState('writing');
    clearPoll();
    pollRef.current = setInterval(() => {
      if (winRef.current && winRef.current.closed) {
        clearPoll();
        setState('ready');
      }
    }, 600);
    return true;
  }, [pccClientId, onOpened, clearPoll]);

  const cancel = useCallback(() => {
    clearPoll();
    winRef.current = null;
    setBlocked(false);
    setState('idle');
  }, [clearPoll]);

  return { state, blocked, open, cancel, reset: cancel };
}
