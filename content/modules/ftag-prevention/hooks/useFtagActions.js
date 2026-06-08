import { useState, useCallback } from 'preact/hooks';
import { apiPost, apiSend } from '../utils/api.js';

/**
 * useFtagActions — resolve / snooze mutations for a finding.
 *
 *   POST /api/extension/ftag-prevention/findings/[id]/resolve
 *        body { resolutionType: 'resolved'|'no_action'|'progress_note', reason? }
 *        (reason required, >=3 chars, ONLY for resolutionType 'resolved')
 *   POST /api/extension/ftag-prevention/findings/[id]/snooze
 *        body { days: 3|7|30 }
 *
 * On success fires `super:ftag-changed` so the feed hook refetches.
 */
export function useFtagActions({ facilityName, orgSlug }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const qs = new URLSearchParams({ facilityName, orgSlug }).toString();

  const run = useCallback(async (endpoint, body, surface, method = 'POST') => {
    setPending(true);
    setError(null);
    try {
      const data = method === 'POST' ? await apiPost(endpoint, body) : await apiSend(endpoint, method, body);
      window.dispatchEvent(new CustomEvent('super:ftag-changed'));
      return data;
    } catch (err) {
      console.error('[FTagPrevention] mutation failed', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: surface || 'ftag_action',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message || 'Action failed');
      throw err;
    } finally {
      setPending(false);
    }
  }, [qs]);

  const resolve = useCallback((id, { resolutionType = 'resolved', reason } = {}) => {
    const body = { resolutionType };
    if (reason) body.reason = reason;
    return run(
      `/api/extension/ftag-prevention/findings/${id}/resolve?${qs}`,
      body,
      'ftag_resolve',
    );
  }, [run, qs]);

  const snooze = useCallback((id, days) =>
    run(
      `/api/extension/ftag-prevention/findings/${id}/snooze?${qs}`,
      { days },
      'ftag_snooze',
    ), [run, qs]);

  // Unsnooze — mirrors the QM board's DELETE snooze pattern. Lets a nurse pull a
  // finding back into the open list before its window passes.
  // NOTE: backend endpoint pending (see handoff). Calls DELETE on the snooze.
  const unsnooze = useCallback((id) =>
    run(
      `/api/extension/ftag-prevention/findings/${id}/snooze?${qs}`,
      null,
      'ftag_unsnooze',
      'DELETE',
    ), [run, qs]);

  // Reopen — undo a resolution, pulling the finding back to open.
  // NOTE: backend endpoint pending (see handoff).
  const reopen = useCallback((id) =>
    run(
      `/api/extension/ftag-prevention/findings/${id}/reopen?${qs}`,
      {},
      'ftag_reopen',
    ), [run, qs]);

  return { resolve, snooze, unsnooze, reopen, pending, error };
}
