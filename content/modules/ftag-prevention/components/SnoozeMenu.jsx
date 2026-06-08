import { useState, useEffect, useRef } from 'preact/hooks';

const OPTIONS = [3, 7, 30];

/** The clock/snooze icon used elsewhere in the extension (meddiag chips, QM). */
function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  );
}

/** SnoozeMenu — clock-icon button + dropdown of the three allowed windows (3/7/30 days). */
export function SnoozeMenu({ onSnooze, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="ftp-snooze" ref={ref}>
      <button type="button" className="ftp-btn ftp-btn--secondary ftp-btn--sm ftp-snooze__btn" disabled={disabled} onClick={() => setOpen((o) => !o)}> {/* NO_TRACK */}
        <ClockIcon /> Snooze <span className="ftp-snooze__caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ftp-snooze__menu">
          {OPTIONS.map((d) => (
            <button type="button" key={d} onClick={() => { setOpen(false); onSnooze(d); }}> {/* NO_TRACK */}
              {d} days
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
