import { useEffect } from 'preact/hooks';
import { useSuperVerify } from './hooks/useSuperVerify.js';

/**
 * Super Verify modal — full-screen overlay that scrapes the live MDS, POSTs to
 * the verify endpoint, and renders the results.
 *
 * Task 6 ships the shell + scrape/verify flow with a temporary "done"
 * placeholder; Tasks 7–8 replace it with <VerifyResults> (PDPM + QM).
 */
export const SuperVerifyModal = ({ assessId, patientId, onClose }) => {
  const { phase, sections, progress, completed, data, error, retry } = useSuperVerify({
    assessId,
    patientId,
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = (typeof window !== 'undefined' && window.getPCCAssessmentMetaFromDOM?.()) || {};
  const residentName = (typeof window !== 'undefined' && window.getPatientNameFromPage?.()) || '';
  const subtitle = [residentName, meta.ardDate && `ARD ${meta.ardDate}`, meta.assessmentType]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div className="sv-overlay" onClick={onClose}>
      <div className="sv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sv-header">
          <div>
            <h2 className="sv-title">Super Verify</h2>
            {subtitle ? <div className="sv-subtitle">{subtitle}</div> : null}
          </div>
          {/* NO_TRACK — modal close affordance, not an analytics action */}
          <button className="sv-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="sv-body">
          {phase === 'scraping' && (
            <ScrapeChecklist sections={sections} completed={completed} progress={progress} />
          )}
          {phase === 'verifying' && <VerifyingState />}
          {phase === 'done' && <DonePlaceholder data={data} />}
          {phase === 'error' && <ErrorState error={error} onRetry={retry} />}
        </div>
      </div>
    </div>
  );
};

const ScrapeChecklist = ({ sections, completed, progress }) => {
  const done = new Set(completed);
  const current = progress.section || sections[0]?.code || '';
  return (
    <div className="sv-scrape">
      <div className="sv-scrape-head">
        <span className="sv-spinner" aria-hidden="true" />
        <span>
          Pulling Section {current}…{' '}
          <strong>
            {progress.done}/{progress.total}
          </strong>
        </span>
      </div>
      <ul className="sv-checklist">
        {sections.map((s) => {
          const isDone = done.has(s.code);
          return (
            <li key={s.code} className={`sv-check-row ${isDone ? 'is-done' : ''}`}>
              <span className="sv-check-icon" aria-hidden="true">
                {isDone ? '✓' : <span className="sv-spinner sv-spinner--sm" />}
              </span>
              <span className="sv-check-code">Section {s.code}</span>
              {s.name ? <span className="sv-check-name">{s.name}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const VerifyingState = () => (
  <div className="sv-verifying">
    <span className="sv-spinner" aria-hidden="true" />
    <span>Checking PDPM + Quality Measures…</span>
  </div>
);

// Temporary results view for Task 6 — replaced by <VerifyResults> in Tasks 7–8.
const DonePlaceholder = ({ data }) => {
  const detections = Array.isArray(data?.enhancedDetections) ? data.enhancedDetections.length : 0;
  const qm = data?.qm;
  const qmTriggers = qm?.measures?.filter((m) => m.triggers && !m.excluded).length ?? 0;
  return (
    <div className="sv-done">
      <p>
        <strong>Verify complete.</strong> The full PDPM + QM results UI lands next.
      </p>
      <ul className="sv-done-summary">
        <li>{detections} PDPM detection{detections === 1 ? '' : 's'}</li>
        <li>
          Quality Measures: {qm ? `${qmTriggers} measure${qmTriggers === 1 ? '' : 's'} would trigger` : 'not available for this org'}
        </li>
      </ul>
    </div>
  );
};

const ErrorState = ({ error, onRetry }) => (
  <div className="sv-error">
    <div className="sv-error-icon" aria-hidden="true">!</div>
    <p className="sv-error-msg">{error?.message}</p>
    <div className="sv-error-actions">
      {error?.kind === 'session_expired' ? (
        // NO_TRACK — recovery affordance for an expired session
        <button className="sv-btn sv-btn--primary" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      ) : null}
      {error?.canRetry ? (
        // NO_TRACK — retry re-runs the scrape (covered by scrape analytics)
        <button className="sv-btn sv-btn--primary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  </div>
);
