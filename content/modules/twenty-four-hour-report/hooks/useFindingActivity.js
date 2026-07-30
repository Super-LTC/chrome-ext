import { useState, useCallback, useRef } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/**
 * useFindingActivity — the sign-off trail for ONE finding, loaded on demand.
 *
 *   GET  /api/extension/24hr-report/finding?reportId&findingId
 *        → { reviewStatus, actions: [...], comments: [] }
 *   POST /api/extension/24hr-report/action
 *        { reportId, findingId, action, note? } → { finding }
 *
 * Lazy by design: a report can carry a hundred findings and almost none of them
 * get opened, so the trail is fetched the first time a row is expanded rather
 * than up front for every row.
 *
 * No optimistic updates — house pattern is await-then-refetch (see
 * pdpm-analyzer/components/ItemDetailView.jsx). A sign-off that silently failed
 * would be worse than a spinner.
 */
export function useFindingActivity({ reportId, findingId }) {
  const [actions, setActions] = useState(null); // null = never loaded
  const [comments, setComments] = useState(null); // null = never loaded
  const [reviewStatus, setReviewStatus] = useState(undefined); // undefined = unknown
  // Server truth for the follow-up annotation. The row's own `finding.followup`
  // comes from the list payload and goes stale the moment a note is linked.
  const [followup, setFollowup] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const loadedRef = useRef(false);

  const load = useCallback(async ({ force = false } = {}) => {
    if (!reportId || !findingId) return;
    if (loadedRef.current && !force) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ reportId, findingId });
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/24hr-report/finding?${params}`,
        options: { method: 'GET' },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to load activity');
      const data = unwrap(res.data) || {};
      setActions(Array.isArray(data.actions) ? data.actions : []);
      setComments(Array.isArray(data.comments) ? data.comments : []);
      setReviewStatus(data.reviewStatus);
      setFollowup(data.followup ?? null);
      loadedRef.current = true;
    } catch (err) {
      console.error('[24HR] finding activity fetch failed', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'report_24hr',
        error_code: window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown',
        error_type: 'api_error',
      });
      setError(err.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [reportId, findingId]);

  /**
   * Apply an action ('needs_input' | 'resolved' | 'reopened') with an optional
   * note, and — for a resolution — how it happened ('manual' | 'progress_note').
   * Resolves to the new review status so the caller can update the row, or
   * throws so the caller can keep its form open.
   */
  const applyAction = useCallback(async (action, note, resolutionType) => {
    if (!reportId || !findingId) throw new Error('Missing report or finding id');
    setSubmitting(true);
    setError(null);
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: '/api/extension/24hr-report/action',
        options: {
          method: 'POST',
          body: JSON.stringify({
            reportId,
            findingId,
            action,
            ...(note ? { note } : {}),
            ...(resolutionType ? { resolutionType } : {}),
          }),
        },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to save');
      const data = unwrap(res.data) || {};
      const nextStatus = data.finding?.reviewStatus ?? null;
      if (nextStatus) setReviewStatus(nextStatus);
      // Re-read so the trail shows the entry we just wrote, with its server
      // timestamp rather than a guessed one.
      await load({ force: true });
      return nextStatus;
    } finally {
      setSubmitting(false);
    }
  }, [reportId, findingId, load]);

  /**
   * Post a comment. Appends the returned row locally rather than refetching the
   * whole trail — the server hands back the hydrated comment, so a round-trip
   * would only re-fetch what we already hold.
   */
  const postComment = useCallback(async (message) => {
    const body = message?.trim();
    if (!body) return null;
    if (!reportId || !findingId) throw new Error('Missing report or finding id');
    setSubmitting(true);
    setError(null);
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: '/api/extension/24hr-report/comment',
        options: {
          method: 'POST',
          body: JSON.stringify({ reportId, findingId, message: body }),
        },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to post comment');
      const data = unwrap(res.data) || {};
      if (data.comment) {
        setComments((prev) => [...(prev ?? []), data.comment]);
      }
      return data.comment ?? null;
    } finally {
      setSubmitting(false);
    }
  }, [reportId, findingId]);

  /** Remove your own comment. Drops it locally on success. */
  const removeComment = useCallback(async (commentId) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/24hr-report/comment/${encodeURIComponent(commentId)}`,
        options: { method: 'DELETE' },
      });
      if (!res?.success) throw new Error(res?.error || 'Failed to delete comment');
      setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    actions,
    comments,
    reviewStatus,
    followup,
    loading,
    submitting,
    error,
    load,
    applyAction,
    postComment,
    removeComment,
  };
}
