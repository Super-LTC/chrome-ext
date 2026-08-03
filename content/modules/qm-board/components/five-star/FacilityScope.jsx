/**
 * Everything under a Five-Star FACILITY scope — the scorecard, and the measure
 * drill-in beneath it.
 *
 * WHY THIS OWNS THE DRILL TOO. QMBoard's per-building hooks are bound to the
 * building the user has open in PointClickCare. The grid can scope to ANY
 * building, so a measure opened from here has to read that building's residents,
 * not the PCC one's — otherwise the drill silently shows the wrong facility's
 * people under the right facility's name. Both surfaces therefore live here,
 * where `facilityName` is the scoped building.
 *
 * WHICH NAME. `facilityName` must be the PCC facility name (`pccFacilityName`
 * off the region row), not our display name — 20 of 432 locations differ and
 * every /api/extension route resolves on PCC's. See lib/region-pin.js.
 *
 * FETCH SHAPE. The scorecard is ONE precomputed payload
 * (`useFiveStarFacility`). The drill still needs the qm-planner family, so those
 * hooks live in `ScopedMeasureDetail` — a separate component so they only fire
 * when a measure is actually open, rather than on every scope-in.
 */
import { useFiveStarFacility } from '../../hooks/useFiveStarFacility.js';
import { useQmBoard } from '../../hooks/useQmBoard.js';
import { useQuarterRates } from '../../hooks/useQuarterRates.js';
import { useRolling } from '../../hooks/useRolling.js';
import { FacilityFiveStar } from './FacilityFiveStar.jsx';
import { MeasureDetail } from '../MeasureDetail.jsx';
import { QmLoading } from '../QmLoading.jsx';

/**
 * The measure view for a scoped building. Its own component purely so the
 * qm-planner hooks are not called until a measure is open — scoping into a
 * building should cost one request, not four.
 */
function ScopedMeasureDetail({ facilityName, displayName, orgSlug, measureId, onBack, onOpenResident }) {
  const { currentlyTriggering, preventableAlerts, upcoming, loading, error, retry } =
    useQmBoard({ facilityName, orgSlug });
  const { quarterRates } = useQuarterRates({ facilityName, orgSlug });
  const { rolling } = useRolling({ facilityName, orgSlug });

  if (loading) return <QmLoading title={`Loading ${displayName || 'this building'}`} />;
  if (error) {
    return (
      <div className="qmc-error">
        <div>Couldn't load this measure</div>
        <div className="qmc-error__detail">{error}</div>
        <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
      </div>
    );
  }
  if (!currentlyTriggering) {
    return (
      <div className="qmc">
        <button type="button" className="qmc-bc__back" onClick={onBack}>‹ Back</button> {/* NO_TRACK */}
        <div className="qmc-loading">No resident-level QM data for {displayName || 'this building'}.</div>
      </div>
    );
  }

  return (
    <MeasureDetail
      measureId={measureId}
      currentlyTriggering={currentlyTriggering}
      preventableAlerts={preventableAlerts}
      upcoming={upcoming}
      quarterRates={quarterRates}
      rolling={rolling}
      onBack={onBack}
      onOpenResident={onOpenResident}
    />
  );
}

export function FacilityScope({
  facilityName,
  displayName,
  orgSlug,
  view,
  measureId,
  quarterBack,
  onQuarterBackChange,
  onOpenMeasure,
  onBackToMeasureHost,
  onScopeOut,
  onOpenResident,
  onOpenSimulator,
}) {
  const { facility, notYetReason, stale, loading, error, retry } =
    useFiveStarFacility({ facilityName, orgSlug });

  // No address, no request. `pccFacilityName` is the only key the extension
  // routes resolve on, and guessing with the display name would 404 for the
  // buildings whose two names differ — or, worse, quietly resolve to a DIFFERENT
  // building if one location's display name matches another's PCC name. Say what
  // is wrong instead. (Populated on every row in prod today; this is the guard,
  // not the expected path.)
  if (!facilityName) {
    return (
      <div className="qmc">
        <button type="button" className="qmc-bc__back" onClick={onScopeOut}>‹ All buildings</button> {/* NO_TRACK */}
        <div className="qmc-loading">
          {displayName ? `${displayName} isn't` : "This building isn't"} linked to a
          PointClickCare facility name yet, so we can't pull its scorecard.
        </div>
      </div>
    );
  }

  if (view === 'measure' && measureId) {
    return (
      <div className="qmc">
        <ScopedMeasureDetail
          facilityName={facilityName}
          displayName={displayName}
          orgSlug={orgSlug}
          measureId={measureId}
          onBack={onBackToMeasureHost}
          onOpenResident={onOpenResident}
        />
      </div>
    );
  }

  const backBar = (
    <button type="button" className="qmc-bc__back" onClick={onScopeOut}>‹ All buildings</button> /* NO_TRACK */
  );

  if (loading && !facility) {
    return <div className="qmc">{backBar}<QmLoading title={`Loading ${displayName || 'this building'}`} /></div>;
  }

  if (error) {
    return (
      <div className="qmc">
        {backBar}
        <div className="qmc-error">
          <div>Couldn't load {displayName || 'this building'}</div>
          <div className="qmc-error__detail">{error}</div>
          <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
        </div>
      </div>
    );
  }

  // Not an error, and deliberately no Retry — the payload is precomputed on a
  // sweep, so retrying cannot make it appear sooner. The server writes the copy.
  if (!facility) {
    return (
      <div className="qmc">
        {backBar}
        <div className="qmc-loading">
          {notYetReason || `We haven't scored ${displayName || 'this building'} yet.`}
        </div>
      </div>
    );
  }

  return (
    <>
      {stale ? (
        <div className="fs-stalebar">
          Showing the last completed refresh — a newer one is still building.
        </div>
      ) : null}
      {/* Deliberately OUTSIDE FacilityFiveStar. That component is a faithful port
          of the approved mockup and gains no extension-only chrome; the what-if
          is ours, so it sits in the wrapper. Only offered for the building open
          in PCC — see the prop's note in QMBoard. */}
      {onOpenSimulator ? (
        <div className="fs-scopebar">
          <button type="button" className="qmc-retry" onClick={onOpenSimulator}> {/* NO_TRACK */}
            What-if simulator
          </button>
        </div>
      ) : null}
      <FacilityFiveStar
        data={facility}
        quarterBack={quarterBack}
        onQuarterBackChange={onQuarterBackChange}
        onOpenMeasure={onOpenMeasure}
        onScopeOut={onScopeOut}
      />
    </>
  );
}
