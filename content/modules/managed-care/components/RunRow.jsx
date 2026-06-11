// content/modules/managed-care/components/RunRow.jsx
import { useState } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { isInProgress, isStuck, STATUS_LABELS } from '../lib/recert-utils.js';
import { track } from '../../../utils/analytics.js';

export const RunRow = ({ run, showFacility, showCreator, onArchived, onRetry }) => {
  const [busy, setBusy] = useState(false);
  const stuck = isStuck(run);

  const openOnDashboard = async () => {
    setBusy(true);
    try {
      const url = await RecertAPI.mintViewLink(run.id); // mint on click, never cached
      track('mc_view_link_opened');
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      window.SuperToast?.error(e.message || 'Could not open — try again');
    } finally { setBusy(false); }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await RecertAPI.archive(run.id);
      track('mc_run_archived', { from_status: run.status });
      onArchived(run.id);
    } catch (e) {
      window.SuperToast?.error(e.message || 'Archive failed');
    } finally { setBusy(false); }
  };

  const mod = run.status === 'failed' ? '--failed'
    : stuck ? '--stuck'
    : isInProgress(run.status) ? '--running' : '--done';

  return (
    <div className={`mc-run-row mc-run-row${mod}`}>
      <div className="mc-run-row__main">
        <span className="mc-run-row__patient">{run.patientName}</span>
        {run.payerName && <span className="mc-run-row__payer">{run.payerName}</span>}
        {showFacility && (run.facilityName || run.locationId) && (
          <span className="mc-run-row__facility-chip">{run.facilityName || run.locationId}</span>
        )}
        {showCreator && run.createdByName && <span className="mc-run-row__creator">{run.createdByName}</span>}
        <span className="mc-run-row__status">
          {stuck ? `Taking longer than expected (started ${minutesAgo(run.createdAt)}m ago)` : STATUS_LABELS[run.status] || run.status}
        </span>
        {run.status === 'failed' && run.errorMessage && (
          <div className="mc-run-row__error">{run.errorMessage}</div>
        )}
      </div>
      <div className="mc-run-row__actions">
        {run.status === 'completed' && (
          // NO_TRACK — handler emits mc_view_link_opened
          <button disabled={busy} onClick={openOnDashboard}>Open on dashboard →</button>
        )}
        {run.status === 'failed' && (
          // NO_TRACK — retry flow emits mc_run_retried on completion
          <button disabled={busy} onClick={() => onRetry(run)}>Retry</button>
        )}
        {(run.status === 'failed' || stuck) && (
          // NO_TRACK — handler emits mc_run_archived
          <button disabled={busy} onClick={archive}>Archive</button>
        )}
      </div>
    </div>
  );
};

const minutesAgo = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
