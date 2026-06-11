// content/modules/managed-care/ManagedCarePanel.jsx
import { useState, useEffect } from 'preact/hooks';
import { RunList } from './components/RunList.jsx';
import { Wizard } from './components/Wizard.jsx';
import { RecertAPI } from './recert-api.js';
import { track } from '../../utils/analytics.js';

export const ManagedCarePanel = ({ orgSlug, facilityName, patientId, patientName, source, onClose }) => {
  const [refreshToken, setRefreshToken] = useState(0);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState(null);
  const [retryTarget, setRetryTarget] = useState(null);  // { failedId, externalPatientId, locationId }

  useEffect(() => {
    track('mc_panel_opened', { source, scope: patientId ? 'patient' : 'all' });
  }, []);

  // Retry = re-create from the failed run's stored config, then archive it.
  // Retry-in-place is deliberately server-disabled.
  const onRetry = async (failedRun) => {
    const full = await RecertAPI.get(failedRun.id); // full record carries the original config
    if (!full) { window.SuperToast?.error('Could not load the failed run'); return; }
    setRetryTarget({
      failedId: failedRun.id,
      // Central-panel retry must target the failed run's patient + location,
      // not whatever facility PCC is parked on.
      externalPatientId: full.externalPatientId ?? full.patientId,
      locationId: full.locationId,
    });
    setWizardPrefill({
      payerName: full.payerName,
      payerType: full.payerType,
      daysRequested: full.daysRequested,
      authorizationType: full.authorizationType,
      documentStartDate: full.documentStartDate,
      documentEndDate: full.documentEndDate,
      requestedDocumentTypes: full.requestedDocumentTypes,
      documentTypeRangeOverrides: full.documentTypeRangeOverrides,
      mdsSections: full.mdsSections,
      includeAdmissionDocs: full.includeAdmissionDocs,
    });
    setShowWizard(true);
  };

  const onCreated = async () => {
    if (retryTarget) {
      // Best-effort: the new run is already going; a stale failed row is cosmetic.
      try {
        await RecertAPI.archive(retryTarget.failedId);
      } catch (e) {
        window.SuperToast?.error('New run started, but the old failed run could not be archived');
      }
      window.McRunTracker?.untrack(retryTarget.failedId);
      track('mc_run_retried');
    }
    setRetryTarget(null);
    setWizardPrefill(null);
    setShowWizard(false);
    setRefreshToken((t) => t + 1);
  };

  const onCancelWizard = () => {
    setRetryTarget(null);
    setWizardPrefill(null);
    setShowWizard(false);
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
          {showWizard ? (
            <Wizard
              orgSlug={orgSlug}
              patientId={patientId}
              facilityName={facilityName}
              prefillConfig={wizardPrefill}
              retryTarget={retryTarget}
              onCreated={onCreated}
              onCancel={onCancelWizard}
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
                onRetry={onRetry}
                refreshToken={refreshToken}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
