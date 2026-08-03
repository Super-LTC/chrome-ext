/**
 * The QM landing: a grid of every building the user may see.
 *
 * WHY A GRID AND NOT THE CURRENT BUILDING (Andrew, Aug 2). We could try to drop
 * the user straight into the building they have open in PCC, but the only handle
 * we have on "which building is this" is a NAME string scraped off the page, and
 * that match has a real failure rate. A wrong auto-drop shows one facility's
 * numbers under another facility's name — worse than one click. So: always the
 * grid, with the current building pinned first and chipped when we DO recognise
 * it (see lib/region-pin.js).
 *
 * This component owns fetching + the three cache states; `RegionalBoard` is the
 * pure renderer ported from the web.
 */
import { useMemo } from 'preact/hooks';
import { useFiveStarRegion } from '../../hooks/useFiveStarRegion.js';
import { matchCurrentBuilding } from '../../lib/region-pin.js';
import { RegionalBoard } from './RegionalBoard.jsx';
import { QmLoading } from '../QmLoading.jsx';

export function FiveStarLanding({ facilityName, orgSlug, onSelectFacility }) {
  const { region, notYetReason, stale, loading, error, retry } = useFiveStarRegion({ orgSlug });

  const currentLocationId = useMemo(
    () => (region ? matchCurrentBuilding(region.facilities, facilityName) : null),
    [region, facilityName]
  );

  if (loading && !region) return <QmLoading title="Loading your buildings" />;

  if (error) {
    return (
      <div className="qmc-error">
        <div>Failed to load the Five-Star board</div>
        <div className="qmc-error__detail">{error}</div>
        <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
      </div>
    );
  }

  // Not an error, and deliberately no Retry: the region board is precomputed on a
  // ~6h sweep because a live build takes ~70s, so retrying cannot make it appear
  // sooner. The server writes the copy for this case; render it as-is.
  if (!region) {
    return (
      <div className="qmc-loading">
        {notYetReason || 'The Five-Star board has not been built for this organization yet.'}
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
      <RegionalBoard
        data={region}
        currentLocationId={currentLocationId}
        // `isCurrent` rides along because a few things are only valid for the
        // building open in PCC — the what-if simulator runs off a prediction
        // fetched for that facility alone.
        onSelectFacility={(f) => onSelectFacility?.(f, f.locationId === currentLocationId)}
      />
    </>
  );
}
