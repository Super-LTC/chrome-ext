import { useState, useEffect, useMemo } from 'preact/hooks';
import { createQmHistory } from '../lib/qm-route.js';

/**
 * useQmRoute — Preact binding for the in-memory route stack.
 *
 * The web's equivalent (`use-qm-route.ts`) reads the same route object out of
 * the URL via next/navigation. We can't: a content script doesn't own the
 * address bar — it belongs to PointClickCare. See `lib/qm-route.js` for the full
 * reasoning and the pure implementation; this file is only the subscription.
 *
 * The history object is created ONCE per mount and never recreated, so the stack
 * survives re-renders. `nav` is stable; `route` is the value that changes.
 *
 * @param {{mode?: string, scope?: string, measure?: string}} [defaults]
 *   Seeds the first route only — later navigation carries everything.
 */
export function useQmRoute(defaults) {
  // `defaults` is a fresh object literal for most callers, so it must not be a
  // dependency — it only matters on first paint, exactly as on the web.
  const history = useMemo(() => createQmHistory(defaults), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [route, setRoute] = useState(history.route);

  useEffect(() => history.subscribe(() => setRoute(history.route())), [history]);

  const nav = useMemo(() => ({
    go: history.go,
    set: history.set,
    back: history.back,
    canGoBack: history.canGoBack,
  }), [history]);

  return { route, nav };
}
