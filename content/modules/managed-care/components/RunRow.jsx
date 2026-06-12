// content/modules/managed-care/components/RunRow.jsx
import { useState } from 'preact/hooks';
import { RecertAPI } from '../recert-api.js';
import { isInProgress, isStuck, STATUS_LABELS } from '../lib/recert-utils.js';
import { track } from '../../../utils/analytics.js';

export const RunRow = ({ run, showFacility, showCreator, onArchived }) => {
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const stuck = isStuck(run);

  const openInDashboard = async () => {
    setOpening(true);
    try {
      // One-time 5-min login link into the real editor — mint on click.
      const url = await RecertAPI.openLink(run.id);
      track('mc_run_opened', { status: run.status });
      openDashWindow(url);
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

  // Failed runs open the real editor too — that's where retry lives now.
  const canOpen = run.status === 'completed' || run.status === 'failed';

  return (
    <div className={`mc-run-row mc-run-row${mod}`}>
      <div className="mc-run-row__body">
        <div className="mc-run-row__line1">
          <span className="mc-run-row__patient">{run.patientName}</span>
          {run.payerName && <span className="mc-run-row__payer">{run.payerName}</span>}
          {/* Only a real facility name is worth a chip — never the internal locationId.
              (Backend ask pending: include facilityName/locationName on list rows.) */}
          {showFacility && (run.facilityName || run.locationName) && (
            <span className="mc-run-row__facility-chip">{run.facilityName || run.locationName}</span>
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
        {canOpen && (
          // NO_TRACK — handler emits mc_run_opened
          <button className="mc-run-row__primary" disabled={opening} onClick={openInDashboard}>
            {opening ? <span className="mc-btn-spinner" aria-hidden="true" /> : null}
            {opening ? 'Opening…' : 'Open →'}
          </button>
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

// Shared dashboard window: launch links land in the real app — reuse one named
// window so repeated opens don't stack viewers (tabs confused nurses).
export function openDashWindow(url) {
  const w = Math.min(1280, window.screen.availWidth - 60);
  const h = Math.min(940, window.screen.availHeight - 60);
  window.open(url, 'super-mc-dashboard', `noopener,width=${w},height=${h},left=${(window.screen.availWidth - w) / 2},top=${(window.screen.availHeight - h) / 2}`);
}

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
