/**
 * QMBoard — root of the QM / Five-Star surface.
 *
 * DESTINATIONS (the top bar), same grammar as the web:
 *   'coordinator' — the nurse's building-level worklist (QmInhouse). EXTENSION-ONLY
 *                   now: the web hid it, and it is a big part of why the extension
 *                   matters, so it stays and it stays the default landing.
 *   'regional'    — the Five-Star world. Lands on the all-buildings GRID
 *                   (FiveStarLanding) and scopes into one building.
 *   'qip'         — the FL QIP world: rollup → building → measure, with the
 *                   deferral banner that keeps a live MDS roster from reading as
 *                   the input behind a CMS-scored number.
 *   'cna'         — CNA scorecards (AideScoringView).
 *   'functional'  — Functional Decline. A separate page on the web; a destination
 *                   here, because there is no router to link out to.
 *
 * VIEWS (where you drill to inside a destination): 'overview' | 'measure' |
 * 'signals' | 'simulator' | 'dfs' — plus a resident drill-in modal that layers
 * over any of them.
 *
 * NAVIGATION is the ported route OBJECT (lib/qm-route.js), backed by an
 * in-memory stack rather than the URL — a content script doesn't own the address
 * bar. Keeping the web's route shape is what lets ported components read
 * `route.measure` / `route.quarter` / `route.scope` unchanged.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useQmRoute } from './hooks/useQmRoute.js';
import { useQmBoard } from './hooks/useQmBoard.js';
import { useFiveStar } from './hooks/useFiveStar.js';
import { useDfs } from './hooks/useDfs.js';
import { useQuarterRates } from './hooks/useQuarterRates.js';
import { useRolling } from './hooks/useRolling.js';
import { track } from '../../utils/analytics.js';
import { QmInhouse } from './components/QmInhouse.jsx';
import { ResidentDrillIn } from './components/ResidentDrillIn.jsx';
import { MeasureDetail } from './components/MeasureDetail.jsx';
import { ClinicalSignalsView } from './components/ClinicalSignalsView.jsx';
import { WhatIfSimulator } from './components/WhatIfSimulator.jsx';
import { DfsPage } from './components/DfsPage.jsx';
import { FiveStarLanding } from './components/five-star/FiveStarLanding.jsx';
import { FacilityScope } from './components/five-star/FacilityScope.jsx';
import { QipDestination } from './components/qip/QipDestination.jsx';
import { toMeasureDetailQip } from './lib/fl-qip-view-model.js';
import { sameFacilityName } from './lib/region-pin.js';
import { FunctionalDeclineView } from './FunctionalDecline.jsx';
import { AideScoringView } from './aide-scoring/AideScoringView.jsx';
import { QmLoading } from './components/QmLoading.jsx';

/** The top bar. Order is the reading order, not an importance ranking. */
const DESTINATIONS = [
  { mode: 'coordinator', label: 'Coordinator' },
  { mode: 'regional', label: 'Five-Star' },
  { mode: 'qip', label: 'QIP' },
  { mode: 'cna', label: 'CNA' },
  { mode: 'functional', label: 'Functional Decline' },
];

export function QMBoard({ facilityName, orgSlug, onClose }) {
  const { route, nav } = useQmRoute({ mode: 'coordinator', scope: 'board' });
  const { mode, view, lens } = route;

  // Resident drill-in modal — layers over whatever view is showing.
  const [resident, setResident] = useState(null); // { patient, entry, scopeMeasureId } | null

  // Non-route state that rides along with a view. Deliberately NOT on the route:
  // these are derived CONTEXT, not part of an address — the same measure at the
  // same quarter is the same view whichever frame opened it, and the selected
  // building's name is a lookup on `scopeId`, not an independent fact. Putting
  // derivable values on the route is how a route starts disagreeing with itself.
  // The web keeps `qipWhatIf` in React state for the same reason.
  const [measureCtx, setMeasureCtx] = useState({});
  const [scopeCtx, setScopeCtx] = useState({}); // { name, pccFacilityName } for route.scopeId

  useEffect(() => { track('qm_board_opened', { source: 'fab' }); }, []);

  // Freeze the PCC page scroll while the board (and any nested modal) is open, so
  // the wheel scrolls our content — not the page behind. Restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Changing surface should land at the top of the new page — otherwise the
  // scroll position from the board carries over and you open a detail page
  // already scrolled into its middle.
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [view, mode]);

  const { currentlyTriggering, preventableAlerts, upcoming, loading, error, retry } =
    useQmBoard({ facilityName, orgSlug });
  // Predicted Five-Star QM — lazy-fetched separately so the board renders first
  // and the predictor card fills in (it does a double facility-rate pass).
  const { prediction } = useFiveStar({ facilityName, orgSlug });
  // Discharge Function Score card — also lazy (rolling-12-mo short-stay measure,
  // its own service + cache). Board renders first; the DFS card fills in.
  const { dfs } = useDfs({ facilityName, orgSlug });
  // Windowed (discharged-inclusive) quarter rates + denominator roster, and the
  // rolling 4-quarter trend — both lazy so the board renders first.
  // Keyed to the SELECTED quarter. This value feeds MeasureDetail and nothing
  // else, and a measure drill must answer for the quarter the reader is in —
  // pinning it to the open quarter silently re-answers for a different one.
  const { quarterRates } = useQuarterRates({ facilityName, orgSlug, back: route.quarter });
  const { rolling } = useRolling({ facilityName, orgSlug });

  const openMeasure = useCallback((measureId, opts) => {
    setMeasureCtx({ scoreContext: opts?.scoreContext, qip: opts?.qip });
    nav.go({ view: 'measure', measure: measureId });
  }, [nav]);

  const openSignals = useCallback((patientId) => nav.go({ view: 'signals', patient: patientId }), [nav]);
  const openSimulator = useCallback(() => nav.go({ view: 'simulator' }), [nav]);
  const openDfs = useCallback(() => nav.go({ view: 'dfs' }), [nav]);
  const openFunctional = useCallback(() => nav.go({ mode: 'functional', view: 'overview' }), [nav]);
  const back = useCallback(() => nav.back({ view: 'overview' }), [nav]);

  // scopeMeasureId: set when opened FROM a measure (measure-detail row / crosser),
  // so the drill-in leads with that measure and tucks the rest under an accordion.
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

  const isOverview = view === 'overview';
  // A Five-Star facility scope swallows its own measure view: the drill has to
  // read the SCOPED building's residents, and the generic `view === 'measure'`
  // branch below is bound to the building open in PCC. Without this the two
  // would both render, the second one showing the wrong facility's people.
  const inFacilityScope =
    mode === 'regional' && route.scope === 'facility' && (isOverview || view === 'measure');
  // QIP owns its whole destination for the same reason: a measure opened from a
  // QIP building must read THAT building's residents, not the PCC page's.
  const inQip = mode === 'qip' && (isOverview || view === 'measure');
  // Mirrors the web's split. A QIP measure opened for the building the user has
  // open in PCC can use the RICH MeasureDetail — its board, residents and what-if
  // are already loaded here. Any other building has only quarter-rates, so it gets
  // the roster drill. Routing every QIP measure at the drill (the first wiring)
  // silently dropped the what-if for the one building that could show it.
  const qipMeasureIsCurrentBuilding =
    inQip && view === 'measure'
    && sameFacilityName(scopeCtx.pccFacilityName, facilityName);

  return (
    <div className="qmb__overlay" role="dialog" aria-modal="true" aria-labelledby="qmb-title">
      <div className="qmb__backdrop" onClick={onClose}></div>

      <div className="qmb__modal">
        <header className="qmb__header">
          <div className="qmb__title-row">
            <div className="qmb__title-group">
              <h2 className="qmb__title" id="qmb-title">Quality</h2>
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
            {/* The destination bar. Shown at each destination's top level; deeper
                views carry their own back bar, so it never competes with one. */}
            {isOverview && (
              <div className="qmc qmb__modebar">
                <div className="qmb__modeswitch" role="tablist" aria-label="Quality destination">
                  {DESTINATIONS.map((d) => (
                    <button key={d.mode} type="button" role="tab" aria-selected={mode === d.mode} /* NO_TRACK */
                      className={`qmb__modebtn ${mode === d.mode ? 'qmb__modebtn--on' : ''}`}
                      onClick={() => nav.go({ mode: d.mode, view: 'overview' })}>{d.label}</button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'coordinator' && isOverview && (
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

            {/* Five-Star lands on the all-buildings grid; clicking a building
                scopes to it. A facility scope owns BOTH its overview and its
                measure drill — see FacilityScope for why the drill can't be
                rendered by the generic `view === 'measure'` branch below. */}
            {mode === 'regional' && isOverview && route.scope === 'board' && (
              <FiveStarLanding
                facilityName={facilityName}
                orgSlug={orgSlug}
                onSelectFacility={(f, isCurrent) => {
                  // `pccFacilityName` is the ADDRESS — every /api/extension route
                  // resolves on it. `name` is only the label we show, and it is a
                  // DIFFERENT column: 20 of 432 locations disagree.
                  //
                  // Deliberately NO fallback to `name`. An earlier version fell
                  // back to cover the cache-version window before #1078 deployed;
                  // that window has closed (field is populated on every row, cache
                  // reads fresh), so the fallback is now dead code that can only
                  // do harm. If it ever fired it would address a building by the
                  // wrong string — usually a 404, but a silent WRONG BUILDING if
                  // one location's display name happens to equal another's PCC
                  // name. A missing address means "can't open", which the scope
                  // says out loud.
                  setScopeCtx({ name: f.name, pccFacilityName: f.pccFacilityName || null, isCurrent });
                  nav.go({ scope: 'facility', scopeId: f.locationId });
                }}
              />
            )}
            {inFacilityScope && (
              // `key` forces a remount per building, so the scope's hooks
              // re-fetch instead of showing the previous building's numbers
              // under the new building's name.
              <FacilityScope
                key={route.scopeId}
                facilityName={scopeCtx.pccFacilityName}
                displayName={scopeCtx.name}
                orgSlug={orgSlug}
                view={view}
                measureId={route.measure}
                quarterBack={route.quarter}
                onQuarterBackChange={(q) => nav.set({ quarter: q })}
                onOpenMeasure={(measureId, quarterBack) =>
                  nav.go({ view: 'measure', measure: measureId, quarter: quarterBack })}
                onBackToMeasureHost={() => nav.back({ view: 'overview' })}
                onScopeOut={() => nav.back({ scope: 'board', view: 'overview' })}
                onOpenResident={openResident}
                // The what-if runs off `prediction`, which is fetched for the
                // building open in PCC only — so it is offered for that building
                // and withheld for the rest rather than run on the wrong numbers.
                onOpenSimulator={scopeCtx.isCurrent ? openSimulator : undefined}
              />
            )}

            {inQip && !qipMeasureIsCurrentBuilding && (
              <QipDestination
                orgSlug={orgSlug}
                view={view}
                measureId={route.measure}
                quarterBack={route.quarter}
                scope={route.qipScope}
                scopeCtx={scopeCtx}
                onSelectFacility={(f) => {
                  setScopeCtx({ name: f.name, pccFacilityName: f.pccFacilityName || null });
                  nav.go({ qipScope: 'facility', qipScopeId: f.locationId });
                }}
                onOpenMeasure={(measureId, whatIf) => {
                  // The what-if is CONTEXT, not an address — same rule as the
                  // Five-Star measure. Dropping it (as the first wiring did) makes
                  // the QIP what-if unreachable even though MeasureDetail supports it.
                  setMeasureCtx({ scoreContext: 'fl_qip', qip: toMeasureDetailQip(whatIf) });
                  nav.go({ view: 'measure', measure: measureId });
                }}
                onQuarterChange={(q) => nav.set({ quarter: q })}
                onBackToRollup={() => nav.back({ qipScope: 'rollup', qipScopeId: undefined, view: 'overview' })}
                onBackToFacility={() => nav.back({ view: 'overview' })}
              />
            )}

            {mode === 'cna' && isOverview && (
              <div className="qmc">
                <AideScoringView facilityName={facilityName} orgSlug={orgSlug} />
              </div>
            )}

            {mode === 'functional' && isOverview && (
              <FunctionalDeclineView
                facilityName={facilityName}
                orgSlug={orgSlug}
                onBack={() => nav.go({ mode: 'coordinator', view: 'overview' })}
              />
            )}

            {view === 'measure' && !inFacilityScope && (!inQip || qipMeasureIsCurrentBuilding) && (
              <MeasureDetail
                measureId={route.measure}
                scoreContext={measureCtx.scoreContext}
                qip={measureCtx.qip}
                currentlyTriggering={currentlyTriggering}
                preventableAlerts={preventableAlerts}
                upcoming={upcoming}
                quarterRates={quarterRates}
                rolling={rolling}
                onBack={back}
                onOpenResident={openResident}
                onOpenResidentById={openResidentById}
              />
            )}
            {view === 'signals' && (
              <ClinicalSignalsView
                preventableAlerts={preventableAlerts}
                currentlyTriggering={currentlyTriggering}
                facilityName={facilityName}
                orgSlug={orgSlug}
                onBack={back}
                initialOpenPatientId={route.patient}
              />
            )}
            {view === 'simulator' && (
              <WhatIfSimulator
                prediction={prediction}
                data={currentlyTriggering}
                upcoming={upcoming}
                onBack={back}
                onOpenResident={openResident}
              />
            )}
            {view === 'dfs' && (
              <DfsPage
                dfs={dfs}
                facilityName={facilityName}
                orgSlug={orgSlug}
                onBack={back}
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
