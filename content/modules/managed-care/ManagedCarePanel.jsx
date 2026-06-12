// content/modules/managed-care/ManagedCarePanel.jsx
// The extension is a LAUNCHER: this panel lists runs and mints one-time login
// links into the real dashboard pages (create wizard / editor). It does not
// render a wizard or packet itself.
import { useState, useEffect } from 'preact/hooks';
import { RunList } from './components/RunList.jsx';
import { openDashWindow } from './components/RunRow.jsx';
import { RecertAPI } from './recert-api.js';
import { track } from '../../utils/analytics.js';

export const ManagedCarePanel = ({ orgSlug, facilityName, patientId, patientName, source, onClose }) => {
  const [refreshToken, setRefreshToken] = useState(0);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    track('mc_panel_opened', { source, scope: patientId ? 'patient' : 'all' });
  }, []);

  // "New Clinical Update" → real dashboard create wizard via one-time login link.
  const launchCreate = async () => {
    setLaunching(true);
    try {
      const url = await RecertAPI.openCreateLink({
        orgSlug,
        externalPatientId: patientId, // backend strips a leading EID_ prefix itself
        facilityName,
      });
      track('mc_create_launched');
      openDashWindow(url);
      // The run gets created over in the dashboard — watch the list for it so
      // the badge/toasts pick it up without the nurse reopening this panel.
      window.McRunTracker?.watchForNew();
      setRefreshToken((t) => t + 1);
    } catch (e) {
      window.SuperToast?.error(
        e.status === 403
          ? "Managed Care isn't enabled for this facility."
          : e.message || 'Could not start a clinical update'
      );
    } finally { setLaunching(false); }
  };

  return (
    <div className="mc-panel-overlay">
      <div className="mc-panel-overlay__backdrop" onClick={onClose} />
      <div className="mc-panel" role="dialog" aria-label="Managed Care">
        <div className="mc-panel__header">
          <div className="mc-panel__title">
            Managed Care
            {patientName && <span className="mc-panel__patient">{patientName}</span>}
          </div>
          {/* NO_TRACK — close mirrors mc_panel_opened; no close event in schema */}
          <button className="mc-panel__close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="mc-panel__body">
          {patientId && (
            /* NO_TRACK — handler emits mc_create_launched */
            <button className="mc-panel__new-btn" disabled={launching} onClick={launchCreate}>
              {launching ? <span className="mc-btn-spinner mc-btn-spinner--light" aria-hidden="true" /> : null}
              {launching ? 'Opening…' : '+ New Clinical Update'}
            </button>
          )}
          <RunList
            orgSlug={orgSlug}
            patientId={patientId}
            currentFacilityName={facilityName}
            refreshToken={refreshToken}
          />
        </div>
      </div>
    </div>
  );
};
