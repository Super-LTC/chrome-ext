import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useFiveStarRegion — the all-buildings Five-Star payload behind the QM landing.
 *
 *   GET /api/extension/five-star/region?orgSlug
 *     → { success, data: FiveStarCachedRead<FiveStarRegionResponse> }
 *
 * NOTE THE DOUBLE UNWRAP. `unwrap()` peels the background worker's envelope to
 * get the server's `{ success, data }`, and `data` is itself a CACHE READ, not
 * the payload:
 *
 *   { status: 'fresh' | 'stale' | 'not_yet_computed', payload, provenance, reason }
 *
 * so the board's data is `…data.payload`. This is the one route in the QM family
 * shaped this way — a region build takes ~70s, far past a request timeout, so it
 * is precomputed on a 6h sweep and this endpoint only ever READS the cache.
 *
 * THREE STATES, NOT TWO. `not_yet_computed` is a real, expected answer (a new org,
 * or the first sweep hasn't run) and carries a server-authored `reason` meant to
 * be rendered as-is. It is NOT an error and must not show a Retry button —
 * retrying cannot make the sweep run sooner. `stale` DOES carry a full payload
 * and must render it: a stale board beats a blank one, as long as it says so.
 */
export function useFiveStarRegion({ orgSlug }) {
  const [read, setRead] = useState(null);   // the cache-read envelope
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((x) => x + 1), []);

  useEffect(() => {
    if (!orgSlug) return undefined;
    let live = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ orgSlug });
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/five-star/region?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        if (!res?.success) {
          // The route maps an access failure to 403 by sniffing the message;
          // surface whatever it said rather than inventing our own copy.
          setError(res?.error || 'Could not load the Five-Star board.');
          return;
        }
        setRead(unwrap(res.data));
      })
      .catch((e) => { if (live) setError(e?.message || 'Could not load the Five-Star board.'); })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [orgSlug, nonce]);

  return {
    /** FiveStarRegionResponse, or null when the cache has nothing yet. */
    region: read?.payload ?? null,
    /** Server-authored copy for the not-yet-computed case. Render as-is. */
    notYetReason: read?.status === 'not_yet_computed' ? read.reason : null,
    stale: read?.status === 'stale',
    provenance: read?.provenance ?? null,
    loading,
    error,
    retry,
  };
}
