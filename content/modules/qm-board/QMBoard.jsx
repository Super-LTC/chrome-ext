/**
 * QMBoard — root of the QM Command Center overlay (parity rebuild, PR #626).
 *
 * Surfaces (single-overlay view stack + a resident modal that layers on top):
 *   'dashboard' — Surface A (QmOverview): hero, status segments, measure tiles,
 *                 actionability-bucketed worklist. Default view.
 *   'measure'   — Surface B (MeasureDetail): one measure's residents + what-if.
 *   'signals'   — Surface D (ClinicalSignalsView): Mode-0 clinical signals.
 *   resident modal — Surface C (ResidentDrillIn): every triggering measure for
 *                 one resident, each as a 3-beat timeline. Overlays any view.
 *
 * Buckets by actionability (at-risk / clearable / will-hit) via the pure
 * view-model, not raw cliff urgency.
 */
import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import { useQmBoard } from './hooks/useQmBoard.js';
import { track } from '../../utils/analytics.js';
import { totalActionable } from './lib/qm-clinical-signals.js';
import { QmOverview } from './components/QmOverview.jsx';
import { ResidentDrillIn } from './components/ResidentDrillIn.jsx';
import { MeasureDetail } from './components/MeasureDetail.jsx';
import { ClinicalSignalsView } from './components/ClinicalSignalsView.jsx';

export function QMBoard({ facilityName, orgSlug, onClose }) {
  const [history, setHistory] = useState([{ kind: 'dashboard' }]);
  const view = history[history.length - 1];
  // Resident drill-in modal — layers over whatever view is showing.
  const [resident, setResident] = useState(null); // { patient, entry } | null

  useEffect(() => { track('qm_board_opened', { source: 'fab' }); }, []);

  const push = useCallback((v) => setHistory((h) => [...h, v]), []);
  const pop = useCallback(() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h)), []);

  const { currentlyTriggering, preventableAlerts, loading, error, retry } =
    useQmBoard({ facilityName, orgSlug });

  const signalCount = useMemo(
    () => (preventableAlerts ? totalActionable(preventableAlerts) : 0),
    [preventableAlerts]
  );

  const openMeasure = (measureId) => push({ kind: 'measure', measureId });
  const openSignals = () => push({ kind: 'signals' });
  const openResident = (patient, entry) => setResident({ patient, entry });
  const closeResident = () => setResident(null);

  // Open the resident modal from a (patientId, measureId) pair — used by the
  // measure-detail rows, which carry ids rather than the raw QmPatientRow.
  const openResidentById = (patientId, measureId) => {
    const p = currentlyTriggering?.patients?.find((x) => x.patientId === patientId);
    if (!p) return;
    const e = p.measures.find((m) => m.id === measureId) || p.measures.find((m) => m.triggers);
    openResident(p, e);
  };

  return (
    <div className="qmb__overlay" role="dialog" aria-modal="true" aria-labelledby="qmb-title">
      <div className="qmb__backdrop" onClick={onClose}></div>

      <div className="qmb__modal">
        <header className="qmb__header">
          <div className="qmb__title-row">
            <div className="qmb__title-group">
              <h2 className="qmb__title" id="qmb-title">QM Board</h2>
              {facilityName && <span className="qmb__facility">{facilityName}</span>}
            </div>
            <button type="button" className="qmb__close" onClick={onClose} aria-label="Close"> {/* NO_TRACK */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        {loading ? (
          <div className="qmc-loading">Loading QM board…</div>
        ) : error ? (
          <div className="qmc-error">
            <div>Failed to load QM data</div>
            <div className="qmc-error__detail">{error}</div>
            <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
          </div>
        ) : !currentlyTriggering ? (
          <div className="qmc-loading">No QM data for this facility.</div>
        ) : (
          <div className="qmc-scroll">
            {view.kind === 'dashboard' && (
              <QmOverview
                data={currentlyTriggering}
                signalCount={signalCount}
                onOpenMeasure={openMeasure}
                onOpenResident={openResident}
                onOpenSignals={openSignals}
              />
            )}
            {view.kind === 'measure' && (
              <MeasureDetail
                measureId={view.measureId}
                currentlyTriggering={currentlyTriggering}
                preventableAlerts={preventableAlerts}
                onBack={pop}
                onOpenResident={openResident}
                onOpenResidentById={openResidentById}
              />
            )}
            {view.kind === 'signals' && (
              <ClinicalSignalsView
                preventableAlerts={preventableAlerts}
                currentlyTriggering={currentlyTriggering}
                facilityName={facilityName}
                orgSlug={orgSlug}
                onBack={pop}
              />
            )}
          </div>
        )}
      </div>

      {resident && (
        <ResidentDrillIn patient={resident.patient} entry={resident.entry} onClose={closeResident} />
      )}
    </div>
  );
}
