import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useFiveStarFacility — one building's full Five-Star scorecard.
 *
 *   GET /api/extension/five-star/facility?facilityName&orgSlug
 *     → { success, data: FiveStarCachedRead<FiveStarFacilityResponse>, locationId }
 *
 * Same double-envelope + cache-read shape as `useFiveStarRegion`: `unwrap()`
 * peels the background worker's wrapper, and the result is a CACHE READ whose
 * payload lives at `.payload`. See that hook for why the three states matter.
 *
 * `facilityName` MUST be the PCC facility name (`pccFacilityName` off the region
 * row), not our display name — 20 of 432 locations differ and the route resolves
 * on PCC's. See lib/region-pin.js.
 *
 * ONE fetch replaces five. The old facility view composed the scorecard from
 * board + predictor + dfs + quarter-rates + rolling; this payload is precomputed
 * server-side and arrives already scored, so the screen renders from a single
 * response and computes nothing.
 */
export function useFiveStarFacility({ facilityName, orgSlug }) {
  const [read, setRead] = useState(null);
  const [locationId, setLocationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((x) => x + 1), []);

  useEffect(() => {
    if (!facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ facilityName, orgSlug });
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/five-star/facility?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        if (!res?.success) {
          setError(res?.error || 'Could not load this building.');
          return;
        }
        const envelope = res.data;
        setRead(unwrap(envelope));
        // The route returns the resolved locationId alongside the payload — the
        // only place the extension learns it for a building it addressed by name.
        setLocationId(envelope?.locationId ?? null);
      })
      .catch((e) => { if (live) setError(e?.message || 'Could not load this building.'); })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [facilityName, orgSlug, nonce]);

  return {
    /** FiveStarFacilityResponse, or null when the cache has nothing yet. */
    facility: read?.payload ?? null,
    notYetReason: read?.status === 'not_yet_computed' ? read.reason : null,
    stale: read?.status === 'stale',
    locationId,
    loading,
    error,
    retry,
  };
}
