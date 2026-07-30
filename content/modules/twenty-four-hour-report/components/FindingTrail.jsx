/**
 * FindingTrail — the expanded panel under one finding: who did what, the
 * conversation, and the single action.
 *
 * Inline expansion, not a modal: the report is already an overlay panel, and
 * stacking a dialog on top of it reads badly.
 *
 * ── What was cut, and why ──────────────────────────────────────────────────
 * "Needs input" and "Write note" used to sit here as peers of "Sign off".
 * Three equal-weight buttons meant none of them was obviously the thing to do.
 * Mark's actual ask was one thing — "somebody saw this, I'm signing off" — so
 * that is the only button. Sign-off is now ONE click; the note you would have
 * typed goes in the comment box, where it also belongs when you are not
 * signing off. Reopen is the undo.
 */

import { useState, useMemo } from 'preact/hooks';
import { ACTION_VERB, REVIEW_STATUS, formatTrailTime, mergeTimeline, initialsOf } from '../utils/reviewStatus.js';

function actorLabel(entry) {
  return entry.actorName || entry.actorEmail || 'Someone';
}

function authorLabel(comment) {
  return comment.authorName || comment.authorEmail || 'Someone';
}

export function FindingTrail({
  actions,
  comments,
  reviewStatus,
  loading,
  submitting,
  error,
  onAction,
  onComment,
  onDeleteComment,
  currentUserId,
  trackType,
}) {
  const [commentText, setCommentText] = useState('');
  const [localError, setLocalError] = useState(null);

  const loaded = actions !== null || comments !== null;
  const timeline = useMemo(() => mergeTimeline(actions, comments), [actions, comments]);
  const isResolved = reviewStatus === REVIEW_STATUS.RESOLVED;

  const act = async (action) => {
    setLocalError(null);
    try {
      await onAction(action);
    } catch (err) {
      setLocalError(err?.message || 'Could not save. Try again.');
    }
  };

  const submitComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    setLocalError(null);
    try {
      await onComment(body);
      setCommentText('');
    } catch (err) {
      setLocalError(err?.message || 'Could not post that comment. Try again.');
    }
  };

  const onCommentKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submitComment();
    }
  };

  return (
    <div class="thr__trail">
      {loading && !loaded && <p class="thr__trail-empty">Loading…</p>}
      {error && <p class="thr__trail-error">{error}</p>}
      {localError && <p class="thr__trail-error">{localError}</p>}

      {timeline.length > 0 && (
        <ol class="thr__thread">
          {timeline.map(({ kind, data }) => {
            const who = kind === 'action' ? actorLabel(data) : authorLabel(data);
            return (
              <li class="thr__thread-item" key={`${kind}-${data.id}`}>
                <span class="thr__avatar" aria-hidden="true">{initialsOf(who)}</span>
                <div class="thr__thread-body">
                  <div class="thr__thread-head">
                    <span class="thr__thread-who">{who}</span>
                    {kind === 'action' && (
                      <span class="thr__thread-verb">
                        {ACTION_VERB[data.action] || data.action}
                      </span>
                    )}
                    <span class="thr__thread-time">{formatTrailTime(data.createdAt)}</span>
                    {kind === 'comment' &&
                      currentUserId &&
                      data.userId === currentUserId &&
                      onDeleteComment && (
                        <button
                          type="button"
                          class="thr__thread-delete"
                          onClick={() => onDeleteComment(data.id)}
                          disabled={submitting}
                          aria-label="Delete your comment"
                          data-track="report_24hr_comment_deleted"
                        >
                          Delete
                        </button>
                      )}
                  </div>
                  {kind === 'action' && data.note && (
                    <p class="thr__thread-text">{data.note}</p>
                  )}
                  {kind === 'comment' && <p class="thr__thread-text">{data.message}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {loaded && timeline.length === 0 && !loading && (
        <p class="thr__trail-empty">No activity yet.</p>
      )}

      <div class="thr__composer">
        <textarea
          class="thr__composer-input"
          rows="1"
          value={commentText}
          placeholder="Add a comment…"
          onInput={(e) => setCommentText(e.target.value)}
          onKeyDown={onCommentKeyDown}
          disabled={submitting}
        />
        <div class="thr__composer-actions">
          {commentText.trim() ? (
            <button
              type="button"
              class="thr__btn thr__btn--primary"
              onClick={submitComment}
              disabled={submitting}
              data-track="report_24hr_comment_posted"
              data-track-prop-finding-type={trackType}
            >
              {submitting ? 'Posting…' : 'Comment'}
            </button>
          ) : isResolved ? (
            <button
              type="button"
              class="thr__btn thr__btn--ghost"
              onClick={() => act('reopened')}
              disabled={submitting}
              data-track="report_24hr_finding_action"
              data-track-prop-action="reopened"
              data-track-prop-finding-type={trackType}
            >
              {submitting ? 'Saving…' : 'Reopen'}
            </button>
          ) : (
            <button
              type="button"
              class="thr__btn thr__btn--primary"
              onClick={() => act(REVIEW_STATUS.RESOLVED)}
              disabled={submitting}
              data-track="report_24hr_finding_action"
              data-track-prop-action="resolved"
              data-track-prop-finding-type={trackType}
            >
              {submitting ? 'Saving…' : 'Sign off'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
