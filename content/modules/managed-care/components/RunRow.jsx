// content/modules/managed-care/components/RunRow.jsx
import { useState } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { isInProgress, isStuck, STATUS_LABELS } from '../lib/recert-utils.js';
import { track } from '../../../utils/analytics.js';

export const RunRow = ({ run, showFacility, showCreator, onArchived, onRetry }) => {
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const stuck = isStuck(run);

  const openOnDashboard = async () => {
    setOpening(true);
    try {
      const url = await RecertAPI.mintViewLink(run.id); // mint on click, never cached
      track('mc_view_link_opened');
      // Dedicated window, not a tab — tabs confused nurses. Named so a second
      // "Open" reuses the same window instead of stacking viewers.
      const w = Math.min(1200, window.screen.availWidth - 80);
      const h = Math.min(900, window.screen.availHeight - 80);
      window.open(url, 'super-mc-viewer', `noopener,width=${w},height=${h},left=${(window.screen.availWidth - w) / 2},top=${(window.screen.availHeight - h) / 2}`);
    } catch (e) {
      window.SuperToast?.error(e.message || 'Could not open — try again');
    } finally { setOpening(false); }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await RecertAPI.archive(run.id);
      track('mc_run_archived', { from_status: run.status });
      onArchived(run.id);
    } catch (e) {
      window.SuperToast?.error(e.message || 'Could not hide this run');
    } finally { setBusy(false); }
  };

  const mod = run.status === 'failed' ? '--failed'
    : stuck ? '--stuck'
    : isInProgress(run.status) ? '--running' : '--done';

  return (
    <div className={`mc-run-row mc-run-row${mod}`}>
      <div className="mc-run-row__body">
        <div className="mc-run-row__line1">
          <span className="mc-run-row__patient">{run.patientName}</span>
          {run.payerName && <span className="mc-run-row__payer">{run.payerName}</span>}
          {/* Only a real facility name is worth a chip — never the internal locationId. */}
          {showFacility && run.facilityName && (
            <span className="mc-run-row__facility-chip">{run.facilityName}</span>
          )}
        </div>
        <div className="mc-run-row__line2">
          <span className="mc-run-row__time">{fmtRunTime(run.createdAt)}</span>
          {showCreator && run.createdByName && (
            <span className="mc-run-row__creator">{run.createdByName}</span>
          )}
          <span className="mc-run-row__status">
            {stuck ? `Taking longer than expected (started ${minutesAgo(run.createdAt)}m ago)` : STATUS_LABELS[run.status] || run.status}
          </span>
        </div>
        {run.status === 'failed' && run.errorMessage && (
          <div className="mc-run-row__error">{run.errorMessage}</div>
        )}
      </div>
      <div className="mc-run-row__actions">
        {run.status === 'completed' && (
          // NO_TRACK — handler emits mc_view_link_opened
          <button className="mc-run-row__primary" disabled={opening} onClick={openOnDashboard}>
            {opening ? <span className="mc-btn-spinner" aria-hidden="true" /> : null}
            {opening ? 'Opening…' : 'Open on dashboard →'}
          </button>
        )}
        {run.status === 'failed' && (
          // NO_TRACK — retry flow emits mc_run_retried on completion
          <button disabled={busy} onClick={() => onRetry(run)}>Retry</button>
        )}
        {(run.status === 'failed' || stuck) && (
          // NO_TRACK — handler emits mc_run_archived
          <button disabled={busy} onClick={archive}>Archive</button>
        )}
        {run.status === 'completed' && (
          // NO_TRACK — handler emits mc_run_archived
          <button className="mc-run-row__hide" disabled={busy} onClick={archive} title="Remove from this list">
            Hide
          </button>
        )}
      </div>
    </div>
  );
};

const minutesAgo = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

// Today → "3:42 PM"; everything older → "Jun 8, 3:42 PM".
function fmtRunTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return time;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}
