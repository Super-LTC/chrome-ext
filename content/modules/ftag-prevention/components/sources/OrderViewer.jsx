import { patientDashboardUrl, openPccWindow } from '../../utils/pccLinks.js';

/**
 * OrderViewer — source view for F758 (order kind). There is no dedicated
 * extension order-detail endpoint, so we render a compact read-only summary
 * and a deep-link into PCC for the full order.
 */
export function OrderViewer({ source, finding }) {
  const { orderId } = source || {};
  const pccId = finding?.pccPatientId || source?.patientId;
  const dashUrl = patientDashboardUrl(finding?.pccPatientId);

  return (
    <div className="ftp-order">
      <div className="ftp-order__summary">
        <div className="ftp-order__row"><span className="ftp-order__label">Order</span><span className="ftp-mono">{orderId || '—'}</span></div>
        {pccId && <div className="ftp-order__row"><span className="ftp-order__label">Resident</span><span className="ftp-mono">{pccId}</span></div>}
      </div>
      {finding?.rationale && <p className="ftp-order__rationale">{finding.rationale}</p>}
      {dashUrl && (
        <button type="button" className="ftp-btn ftp-btn--secondary" data-track="ftag_open_pcc_order" onClick={() => openPccWindow(dashUrl)}>
          Open order in PCC →
        </button>
      )}
    </div>
  );
}
