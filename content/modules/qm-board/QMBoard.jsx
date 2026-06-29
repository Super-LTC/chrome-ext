/**
 * QMBoard — root of the QM Command Center overlay (parity rebuild, PR #626).
 *
 * Surfaces (single-overlay view stack + a resident modal that layers on top):
 *   'dashboard' — Surface A (QmOverview): hero, clear-group segments, the
 *                 predicted Five-Star card, measure tiles, clear-group worklist.
 *   'measure'   — Surface B (MeasureDetail): one measure's residents + what-if.
 *   'signals'   — Surface D (ClinicalSignalsView): Mode-0 clinical signals.
 *   'simulator' — Surface E (WhatIfSimulator): every LS five-star trigger as a
 *                 lever; flip switches → predicted star moves live (client-only).
 *   resident modal — Surface C (ResidentDrillIn): every triggering measure for
 *                 one resident, each as a 3-beat timeline. Overlays any view.
 *
 * Focus mode (the landing) surfaces a predicted-★ chip; the full board carries
 * the predictor card + the what-if simulator. The predictor is lazy-fetched.
 *
 * Groups by the one honest ClearGroup axis (Clear with an MDS / Needs a clinical
 * fix / Locked this quarter) via the pure view-model, not raw cliff urgency.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'preact/hooks';
import { useQmBoard } from './hooks/useQmBoard.js';
import { useFiveStar } from './hooks/useFiveStar.js';
import { useDfs } from './hooks/useDfs.js';
import { useQuarterRates } from './hooks/useQuarterRates.js';
import { useRolling } from './hooks/useRolling.js';
import { track } from '../../utils/analytics.js';
import { totalActionable } from './lib/qm-clinical-signals.js';
import { QmInhouse } from './components/QmInhouse.jsx';
import { QmFiveStarScorecard } from './components/QmFiveStarScorecard.jsx';
import { ResidentDrillIn } from './components/ResidentDrillIn.jsx';
import { MeasureDetail } from './components/MeasureDetail.jsx';
import { ClinicalSignalsView } from './components/ClinicalSignalsView.jsx';
import { WhatIfSimulator } from './components/WhatIfSimulator.jsx';
import { DfsPage } from './components/DfsPage.jsx';
import { FunctionalDeclineView } from './FunctionalDecline.jsx';
import { QmLoading } from './components/QmLoading.jsx';

export function QMBoard({ facilityName, orgSlug, onClose }) {
  // Two modes off one fetch: Coordinator is the landing — the in-house "what do
  // I clear" worklist (List/Grid/Calendar), replacing the old Focus; QM Board is
  // the full regional board. The Coordinator | QM Board switch is always visible —
  // the full board must never feel hidden. (Regional Five-Star scorecard will
  // replace the 'board' mode in a later session.)
  const [mode, setMode] = useState('coordinator'); // 'coordinator' | 'board'
  const [history, setHistory] = useState([{ kind: 'dashboard' }]);
  const view = history[history.length - 1];
  // Resident drill-in modal — layers over whatever view is showing.
  const [resident, setResident] = useState(null); // { patient, entry } | null
  // Measure-set lens (Five-Star / QIP / Both) — board-only; owned here so it
  // drives the whole board AND filters the resident drill-in no matter which
  // surface opened it. Focus is implicitly the Five-Star "what to do now" view.
  const [lens, setLens] = useState('five_star'); // QmLens

  useEffect(() => { track('qm_board_opened', { source: 'fab' }); }, []);

  // Freeze the PCC page scroll while the board (and any nested modal) is open, so
  // the wheel scrolls our content — not the page behind. Restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Changing surface (push/pop a view, or flip mode) should land at the top of
  // the new page — otherwise the scroll position from the board carries over and
  // you open a detail page already scrolled into its middle.
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [view, mode]);

  const push = useCallback((v) => setHistory((h) => [...h, v]), []);
  const pop = useCallback(() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h)), []);

  const { currentlyTriggering, preventableAlerts, upcoming, loading, error, retry } =
    useQmBoard({ facilityName, orgSlug });
  // Predicted Five-Star QM — lazy-fetched separately so the board renders first
  // and the predictor card fills in (it does a double facility-rate pass).
  const { prediction, loading: predictionLoading } = useFiveStar({ facilityName, orgSlug });
  // Discharge Function Score card — also lazy (rolling-12-mo short-stay measure,
  // its own service + cache). Board renders first; the DFS card fills in.
  const { dfs } = useDfs({ facilityName, orgSlug });
  // Windowed (discharged-inclusive) quarter rates + denominator roster, and the
  // rolling 4-quarter trend — both lazy so the board renders first. The measure
  // tiles/detail show the active rate until quarter-rates lands, then the true
  // CMS windowed rate; the trend chart appears once rolling lands.
  const { quarterRates } = useQuarterRates({ facilityName, orgSlug });
  const { rolling } = useRolling({ facilityName, orgSlug });

  const signalCount = useMemo(
    () => (preventableAlerts ? totalActionable(preventableAlerts) : 0),
    [preventableAlerts]
  );

  const openMeasure = (measureId) => push({ kind: 'measure', measureId });
  const openSignals = (patientId) => push({ kind: 'signals', patientId });
  const openFunctional = () => push({ kind: 'functional' });
  const openSimulator = () => push({ kind: 'simulator' });
  const openDfs = () => push({ kind: 'dfs' });
  // scopeMeasureId: set when opened FROM a measure (measure-detail row / crosser),
  // so the drill-in leads with that measure and tucks the rest under an accordion.
  // Undefined from a worklist patient-row click → the modal shows all at once.
  const openResident = (patient, entry, scopeMeasureId) => setResident({ patient, entry, scopeMeasureId });
  const closeResident = () => setResident(null);

  // Open the resident modal from a (patientId, measureId) pair — used by the
  // measure-detail rows, which carry ids rather than the raw QmPatientRow.
  const openResidentById = (patientId, measureId) => {
    const p = currentlyTriggering?.patients?.find((x) => x.patientId === patientId);
    if (!p) return;
    const e = p.measures.find((m) => m.id === measureId) || p.measures.find((m) => m.triggers);
    openResident(p, e, measureId);
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
          <QmLoading title="Building your QM board" />
        ) : error ? (
          <div className="qmc-error">
            <div>Failed to load QM data</div>
            <div className="qmc-error__detail">{error}</div>
            <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
          </div>
        ) : !currentlyTriggering ? (
          <div className="qmc-loading">No QM data for this facility.</div>
        ) : (
          <div className="qmc-scroll" ref={scrollRef}>
            {/* Persistent Focus ⇄ QM Board switch — its own pill row at the top of
                the content (matches web), so neither mode ever feels hidden. Shown
                at each mode's top level; deeper board views carry their own back bar. */}
            {view.kind === 'dashboard' && (
              <div className="qmc qmb__modebar">
                <div className="qmb__modeswitch" role="tablist" aria-label="QM view mode">
                  <button type="button" role="tab" aria-selected={mode === 'coordinator'} /* NO_TRACK */
                    className={`qmb__modebtn ${mode === 'coordinator' ? 'qmb__modebtn--on' : ''}`} onClick={() => setMode('coordinator')}>Coordinator</button>
                  <button type="button" role="tab" aria-selected={mode === 'board'} /* NO_TRACK */
                    className={`qmb__modebtn ${mode === 'board' ? 'qmb__modebtn--on' : ''}`} onClick={() => setMode('board')}>Regional</button>
                </div>
              </div>
            )}
            {mode === 'coordinator' && view.kind === 'dashboard' && (
              <QmInhouse
                board={{ currentlyTriggering, upcoming, alerts: preventableAlerts }}
                lens="five_star"
                facilityState={currentlyTriggering?.facilityState}
                dfs={dfs}
                facilityName={facilityName}
                orgSlug={orgSlug}
                onOpenResident={openResident}
                onOpenSignals={openSignals}
                onOpenMeasure={openMeasure}
                onOpenDfs={openDfs}
                onOpenFunctional={openFunctional}
              />
            )}
            {mode === 'board' && view.kind === 'dashboard' && (
              <QmFiveStarScorecard
                rolling={rolling}
                prediction={prediction}
                board={{ currentlyTriggering, upcoming }}
                dfs={dfs}
                quarterRates={quarterRates}
                lens={lens}
                facilityState={currentlyTriggering?.facilityState}
                facilityName={facilityName}
                orgSlug={orgSlug}
                onOpenMeasure={openMeasure}
                onOpenDfs={openDfs}
                onOpenSimulator={openSimulator}
              />
            )}
            {view.kind === 'measure' && (
              <MeasureDetail
                measureId={view.measureId}
                currentlyTriggering={currentlyTriggering}
                preventableAlerts={preventableAlerts}
                upcoming={upcoming}
                quarterRates={quarterRates}
                rolling={rolling}
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
                initialOpenPatientId={view.patientId}
              />
            )}
            {view.kind === 'simulator' && (
              <WhatIfSimulator
                prediction={prediction}
                data={currentlyTriggering}
                upcoming={upcoming}
                onBack={pop}
                onOpenResident={openResident}
              />
            )}
            {view.kind === 'functional' && (
              <FunctionalDeclineView
                facilityName={facilityName}
                orgSlug={orgSlug}
                onBack={pop}
              />
            )}
            {view.kind === 'dfs' && (
              <DfsPage
                dfs={dfs}
                facilityName={facilityName}
                orgSlug={orgSlug}
                onBack={pop}
              />
            )}
          </div>
        )}
      </div>

      {resident && (
        <ResidentDrillIn patient={resident.patient} entry={resident.entry}
          scopeMeasureId={resident.scopeMeasureId}
          lens={lens} facilityState={currentlyTriggering?.facilityState}
          facilityDate={currentlyTriggering?.facilityDate}
          onClose={closeResident} />
      )}
    </div>
  );
}
