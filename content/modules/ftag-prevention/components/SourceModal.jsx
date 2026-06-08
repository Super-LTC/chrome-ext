import { useEffect } from 'preact/hooks';
import { SourceView } from './sources/SourceView.jsx';
import { ftagMeta, sourceHint } from '../utils/ftags.js';

/**
 * SourceModal — read-only clinical evidence (MAR grid, vitals trend, etc.) for
 * one finding, shown over the worklist. Actions stay inline on the row; this is
 * purely "verify the evidence", then dismiss back to the list.
 */
export function SourceModal({ finding, facilityName, orgSlug, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!finding) return null;
  const meta = ftagMeta(finding.ftag);

  return (
    <div className="ftp-srcmodal" role="dialog" aria-modal="true">
      <div className="ftp-srcmodal__backdrop" onClick={onClose}></div>
      <div className="ftp-srcmodal__panel">
        <header className="ftp-srcmodal__head">
          <div className="ftp-srcmodal__title-group">
            <span className="ftp-srcmodal__tag">{finding.ftag}</span>
            <span className="ftp-srcmodal__name">{finding.patientName}</span>
            <span className="ftp-srcmodal__sub">{meta?.title || ''}</span>
          </div>
          <button type="button" className="ftp__close" onClick={onClose} aria-label="Close"> {/* NO_TRACK */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        <div className="ftp-srcmodal__body">
          {finding.clinicalDetail && (
            <div className="ftp-srcmodal__detail">{finding.clinicalDetail}</div>
          )}
          {sourceHint(finding.ftag) && (
            <div className="ftp-srcmodal__hint">
              <span className="ftp-srcmodal__hint-icon" aria-hidden="true">i</span>
              <span>{sourceHint(finding.ftag)}</span>
            </div>
          )}
          <SourceView finding={finding} facilityName={facilityName} orgSlug={orgSlug} />
        </div>
      </div>
    </div>
  );
}
