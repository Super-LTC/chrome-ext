import { useEffect } from 'preact/hooks';
import { useSuperVerify } from './hooks/useSuperVerify.js';
import { VerifyResults } from './components/VerifyResults.jsx';

/**
 * Super Verify — centered modal over the PCC chart, styled with the app design
 * system (super-modal conventions, indigo primary, --super-* tokens). Scrapes
 * the live MDS, POSTs to the verify endpoint, and renders the results
 * (summary tiles → reimbursement → QM → coding disposition → queries →
 * interviews → Med A cert). Content follows mds-verify-panel-spec.md; chrome
 * follows our general design system rather than the handoff's bespoke panel.
 */
export const SuperVerifyModal = ({ assessId, patientId, onClose }) => {
  const { phase, sections, progress, completed, data, nAnswers, error, retry } = useSuperVerify({
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
  const sub = [meta.assessmentType, meta.ardDate && `ARD ${meta.ardDate}`].filter(Boolean).join('  ·  ');

  const scanText =
    phase === 'scraping'
      ? `Scanning the live MDS… ${progress.done}/${progress.total} sections`
      : phase === 'error'
      ? 'Scan incomplete'
      : `Scanned the live MDS just now — ${nAnswers} items read`;

  return (
    <div className="sv-overlay" onClick={onClose}>
      <div className="sv-modal" role="dialog" aria-modal="true" aria-label="Super Verify" onClick={(e) => e.stopPropagation()}>
        <header className="sv-phead">
          <div className="sv-phead__row">
            <span className="sv-phead__icon" aria-hidden="true">✨</span>
            <span className="sv-phead__title">Super Verify</span>
            {residentName ? <span className="sv-phead__badge">{residentName}</span> : null}
            <span className="sv-phead__sp" />
            {/* NO_TRACK — modal close affordance */}
            <button className="sv-phead__x" onClick={onClose} aria-label="Close">&times;</button>
          </div>
          <div className="sv-scan">
            <span className="sv-scan__p" /> {scanText}
            {sub ? <span className="sv-scan__meta">· {sub}</span> : null}
          </div>
        </header>

        {phase === 'done' ? (
          <VerifyResults data={data} assessId={assessId} onRescan={retry} onClose={onClose} />
        ) : (
          <div className="sv-body">
            {phase === 'scraping' && (
              <ScrapeChecklist sections={sections} completed={completed} progress={progress} />
            )}
            {phase === 'verifying' && <VerifyingState />}
            {phase === 'error' && <ErrorState error={error} onRetry={retry} />}
          </div>
        )}
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

const ErrorState = ({ error, onRetry }) => (
  <div className="sv-error">
    <div className="sv-error-icon" aria-hidden="true">!</div>
    <p className="sv-error-msg">{error?.message}</p>
    <div className="sv-error-actions">
      {error?.kind === 'session_expired' ? (
        // NO_TRACK — recovery affordance for an expired session
        <button className="sv-btn sv-btn--pri" onClick={() => window.location.reload()}>Refresh page</button>
      ) : null}
      {error?.canRetry ? (
        // NO_TRACK — retry re-runs the scrape (covered by scrape analytics)
        <button className="sv-btn sv-btn--pri" onClick={onRetry}>Try again</button>
      ) : null}
    </div>
  </div>
);
