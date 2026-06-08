import { patientDashboardUrl, openPccWindow } from '../../utils/pccLinks.js';
import { formatDate } from '../../utils/derive.js';

/**
 * NotesViewer — source view for F756 (and F758 GDR context).
 *
 * The notes source descriptor gives `patientId`, `query`, and `around` — there
 * is no single note id and no dedicated extension notes-search endpoint, so we
 * surface the search context and deep-link the nurse into PCC's chart to read
 * the relevant notes around that date.
 */
export function NotesViewer({ source, finding }) {
  const { query, around } = source || {};
  const pccId = finding?.pccPatientId;
  const dashUrl = patientDashboardUrl(pccId);

  return (
    <div className="ftp-notes">
      <div className="ftp-notes__ctx">
        {query && (
          <div className="ftp-notes__ctx-row">
            <span className="ftp-notes__ctx-label">Look for</span>
            <span className="ftp-notes__ctx-val">“{query}”</span>
          </div>
        )}
        {around && (
          <div className="ftp-notes__ctx-row">
            <span className="ftp-notes__ctx-label">Around</span>
            <span className="ftp-notes__ctx-val">{formatDate(around)}</span>
          </div>
        )}
      </div>

      {finding?.rationale && <p className="ftp-notes__rationale">{finding.rationale}</p>}

      {dashUrl ? (
        <button type="button" className="ftp-btn ftp-btn--secondary" data-track="ftag_open_pcc_chart" onClick={() => openPccWindow(dashUrl)}>
          Open chart in PCC →
        </button>
      ) : (
        <div className="ftp-notes__nopcc">Open this resident’s chart in PointClickCare to review the clinical notes.</div>
      )}
    </div>
  );
}
