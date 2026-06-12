import { useEffect } from 'preact/hooks';

/**
 * Super Verify modal. STUB for Task 5 — proves the button opens a full-screen
 * overlay. Task 6 replaces this with the real scrape → verify flow + results.
 */
export const SuperVerifyModal = ({ assessId, patientId, onClose }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sv-overlay" onClick={onClose}>
      <div className="sv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sv-header">
          <h2 className="sv-title">Super Verify</h2>
          {/* NO_TRACK — modal close affordance, not an analytics action */}
          <button className="sv-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="sv-body">
          <p>
            Wiring up the scrape + verify flow next. Assessment <code>{assessId}</code>
            {patientId ? <> · resident <code>{patientId}</code></> : null}.
          </p>
        </div>
      </div>
    </div>
  );
};
