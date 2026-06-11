// content/modules/managed-care/ManagedCarePanel.jsx
import { useState, useEffect } from 'preact/hooks';
import { RunList } from './components/RunList.jsx';
import { track } from '../../utils/analytics.js';

export const ManagedCarePanel = ({ orgSlug, facilityName, patientId, patientName, source, onClose }) => {
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    track('mc_panel_opened', { source, scope: patientId ? 'patient' : 'all' });
  }, []);

  // Wizard arrives in Task 7; retry wiring in Task 8.
  const onRetry = () => {};

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
            {/* NO_TRACK — wizard mount emits mc_wizard_opened */}
            <button className="mc-panel__new-btn" disabled>+ New Clinical Update</button>
          )}
          <RunList
            orgSlug={orgSlug}
            patientId={patientId}
            currentFacilityName={facilityName}
            onRetry={onRetry}
            refreshToken={refreshToken}
          />
        </div>
      </div>
    </div>
  );
};
