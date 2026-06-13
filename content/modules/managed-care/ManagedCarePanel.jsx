// content/modules/managed-care/ManagedCarePanel.jsx
// Split model: CREATE happens here in the extension (3-step wizard), while
// opening a finished/failed run hands off to the real dashboard editor via a
// one-time login link (see RunRow).
import { useState, useEffect } from 'preact/hooks';
import { RunList } from './components/RunList.jsx';
import { Wizard } from './components/Wizard.jsx';
import { track } from '../../utils/analytics.js';

export const ManagedCarePanel = ({ orgSlug, facilityName, patientId, patientName, source, onClose }) => {
  const [refreshToken, setRefreshToken] = useState(0);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    track('mc_panel_opened', { source, scope: patientId ? 'patient' : 'all' });
  }, []);

  const onCreated = () => {
    setShowWizard(false);
    setRefreshToken((t) => t + 1);
  };

  return (
    <div className="mc-panel-overlay">
      <div className="mc-panel-overlay__backdrop" onClick={onClose} />
      <div className="mc-panel" role="dialog" aria-label="Clinical Update">
        <div className="mc-panel__header">
          <div className="mc-panel__title">
            Clinical Update
            {patientName && <span className="mc-panel__patient">{patientName}</span>}
          </div>
          {/* NO_TRACK — close mirrors mc_panel_opened; no close event in schema */}
          <button className="mc-panel__close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="mc-panel__body">
          {showWizard ? (
            <Wizard
              orgSlug={orgSlug}
              patientId={patientId}
              facilityName={facilityName}
              onCreated={onCreated}
              onCancel={() => setShowWizard(false)}
            />
          ) : (
            <>
              {patientId && (
                /* NO_TRACK — wizard mount emits mc_wizard_opened */
                <button className="mc-panel__new-btn" onClick={() => setShowWizard(true)}>
                  + New Clinical Update
                </button>
              )}
              <RunList
                orgSlug={orgSlug}
                patientId={patientId}
                currentFacilityName={facilityName}
                refreshToken={refreshToken}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
