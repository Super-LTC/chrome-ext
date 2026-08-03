import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useQipRollup — every QIP-state building in the org against the qualifying floor.
 *
 *   GET /api/extension/qip/region?orgSlug
 *     → { success, data: QipRollupResponse }
 *
 * Note this is a PLAIN payload, not the cache-read union the Five-Star region
 * route returns — so one `unwrap()` gets you the data, with no `.payload` hop.
 * The two region endpoints look alike and are not: reaching for `.payload` here
 * yields `undefined` and an empty board that renders as "no buildings".
 */
export function useQipRollup({ orgSlug }) {
  const [rollup, setRollup] = useState(null);
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
      endpoint: `/api/extension/qip/region?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        if (!res?.success) {
          setError(res?.error || 'The QIP rollup is unavailable.');
          return;
        }
        setRollup(unwrap(res.data));
      })
      .catch((e) => { if (live) setError(e?.message || 'The QIP rollup is unavailable.'); })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [orgSlug, nonce]);

  return { rollup, loading, error, retry };
}
