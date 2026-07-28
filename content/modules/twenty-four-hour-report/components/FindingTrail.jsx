/**
 * FindingTrail — the expanded sign-off trail under one finding.
 *
 * Inline expansion, not a modal: the report is already an overlay panel, and
 * stacking a dialog on top of it reads badly. Mirrors the in-place form swap
 * used by content/components/ItemDetail.jsx.
 */

import { useState, useMemo } from 'preact/hooks';
import {
  REVIEW_STATUS,
  ACTION_VERB,
  formatTrailTime,
  mergeTimeline,
} from '../utils/reviewStatus.js';
import { useProgressNote } from '../hooks/useProgressNote.js';

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
  pccClientId,
}) {
  const [composing, setComposing] = useState(null); // null | 'resolved' | 'needs_input'
  const [note, setNote] = useState('');
  const [commentText, setCommentText] = useState('');
  const [localError, setLocalError] = useState(null);

  const loaded = actions !== null || comments !== null;
  const timeline = useMemo(() => mergeTimeline(actions, comments), [actions, comments]);

  const progressNote = useProgressNote({
    pccClientId,
    onOpened: () =>
      window.SuperAnalytics?.track?.('report_24hr_progress_note_opened', {
        finding_type: trackType,
      }),
  });

  const startCompose = (action) => {
    setComposing(action);
    setNote('');
    setLocalError(null);
  };

  const cancelCompose = () => {
    setComposing(null);
    setNote('');
    setLocalError(null);
  };

  const submit = async (action, noteText, resolutionType) => {
    setLocalError(null);
    try {
      await onAction(action, noteText?.trim() || undefined, resolutionType);
      cancelCompose();
      progressNote.reset();
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

  const onKeyDown = (e) => {
    // Cmd/Ctrl+Enter submits, Escape backs out — same as the MDS dismiss note.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit(composing, note);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelCompose();
    }
  };

  const isResolved = reviewStatus === REVIEW_STATUS.RESOLVED;

  return (
    <div class="thr__trail">
      {loading && !loaded && <p class="thr__trail-empty">Loading activity…</p>}

      {error && <p class="thr__trail-error">{error}</p>}
      {localError && <p class="thr__trail-error">{localError}</p>}

      {loaded && timeline.length === 0 && !loading && (
        <p class="thr__trail-empty">
          Nothing here yet — sign off, or leave a comment for someone.
        </p>
      )}

      {timeline.length > 0 && (
        <ol class="thr__trail-list">
          {timeline.map(({ kind, data }) =>
            kind === 'action' ? (
              <li class="thr__trail-item" key={`a-${data.id}`}>
                <div class="thr__trail-head">
                  <span class="thr__trail-actor">{actorLabel(data)}</span>
                  <span class="thr__trail-verb">
                    {ACTION_VERB[data.action] || data.action}
                    {data.resolutionType === 'progress_note' && ' with a progress note'}
                  </span>
                  <span class="thr__trail-time">{formatTrailTime(data.createdAt)}</span>
                </div>
                {data.note && <p class="thr__trail-note">{data.note}</p>}
              </li>
            ) : (
              <li class="thr__trail-item thr__trail-item--comment" key={`c-${data.id}`}>
                <div class="thr__trail-head">
                  <span class="thr__trail-actor">{authorLabel(data)}</span>
                  <span class="thr__trail-time">{formatTrailTime(data.createdAt)}</span>
                  {currentUserId && data.userId === currentUserId && onDeleteComment && (
                    <button
                      type="button"
                      class="thr__trail-delete"
                      onClick={() => onDeleteComment(data.id)}
                      disabled={submitting}
                      aria-label="Delete your comment"
                      data-track="report_24hr_comment_deleted"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p class="thr__trail-message">{data.message}</p>
              </li>
            )
          )}
        </ol>
      )}


      {composing ? (
        <div class="thr__trail-compose">
          <textarea
            class="thr__trail-textarea"
            rows="3"
            autoFocus
            value={note}
            placeholder={
              composing === REVIEW_STATUS.RESOLVED
                ? 'What was done? (optional)'
                : 'What do you need? (optional)'
            }
            onInput={(e) => setNote(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={submitting}
          />
          {localError && <p class="thr__trail-error">{localError}</p>}
          <div class="thr__trail-actions">
            <button
              type="button"
              class="thr__btn thr__btn--ghost"
              onClick={cancelCompose}
              disabled={submitting}
              data-track="report_24hr_finding_action_cancelled"
              data-track-prop-action={composing}
            >
              Cancel
            </button>
            <button
              type="button"
              class="thr__btn thr__btn--primary"
              onClick={() => submit(composing, note)}
              disabled={submitting}
              data-track="report_24hr_finding_action"
              data-track-prop-action={composing}
              data-track-prop-finding-type={trackType}
            >
              {submitting
                ? 'Saving…'
                : composing === REVIEW_STATUS.RESOLVED
                  ? 'Sign off'
                  : 'Flag for input'}
            </button>
          </div>
        </div>
      ) : progressNote.state === 'writing' ? (
        <div class="thr__trail-note-wait">
          <p class="thr__trail-hint">
            Writing a progress note in PointClickCare… close that window when
            you’re done.
          </p>
          <div class="thr__trail-actions">
            <button
              type="button"
              class="thr__btn thr__btn--ghost"
              onClick={progressNote.cancel}
              // NO_TRACK — backing out of a wait state, no outcome to record.
            >
              Never mind
            </button>
          </div>
        </div>
      ) : progressNote.state === 'ready' ? (
        <div class="thr__trail-note-wait">
          <p class="thr__trail-hint">
            {progressNote.blocked
              ? 'Couldn’t open PointClickCare — write the note there, then sign off here.'
              : 'Note written? Signing off records that you handled this.'}
          </p>
          <div class="thr__trail-actions">
            <button
              type="button"
              class="thr__btn thr__btn--ghost"
              onClick={progressNote.cancel}
              disabled={submitting}
              // NO_TRACK — abandons the flow; the sign-off below is tracked.
            >
              Cancel
            </button>
            <button
              type="button"
              class="thr__btn thr__btn--primary"
              onClick={() => submit(REVIEW_STATUS.RESOLVED, undefined, 'progress_note')}
              disabled={submitting}
              data-track="report_24hr_finding_action"
              data-track-prop-action="progress_note"
              data-track-prop-finding-type={trackType}
            >
              {submitting ? 'Saving…' : 'Note written — sign off'}
            </button>
          </div>
        </div>
      ) : (
        <div class="thr__trail-actions">
          {isResolved ? (
            <button
              type="button"
              class="thr__btn thr__btn--ghost"
              onClick={() => submit('reopened')}
              disabled={submitting}
              data-track="report_24hr_finding_action"
              data-track-prop-action="reopened"
              data-track-prop-finding-type={trackType}
            >
              {submitting ? 'Saving…' : 'Reopen'}
            </button>
          ) : (
            <>
              {pccClientId && (
                <button
                  type="button"
                  class="thr__btn thr__btn--ghost"
                  onClick={progressNote.open}
                  disabled={submitting}
                  title="Open a new progress note in PointClickCare"
                  // NO_TRACK — the hook fires report_24hr_progress_note_opened,
                  // since a blocked popup is still an open attempt worth seeing.
                >
                  Write note
                </button>
              )}
              <button
                type="button"
                class="thr__btn thr__btn--ghost"
                onClick={() => startCompose(REVIEW_STATUS.NEEDS_INPUT)}
                disabled={submitting}
                // NO_TRACK — opens the compose box; the submit button is tracked.
              >
                Needs input
              </button>
              <button
                type="button"
                class="thr__btn thr__btn--primary"
                onClick={() => startCompose(REVIEW_STATUS.RESOLVED)}
                disabled={submitting}
                // NO_TRACK — opens the compose box; the submit button is tracked.
              >
                Sign off
              </button>
            </>
          )}
        </div>
      )}

      {/* Hidden while a sign-off note or progress-note flow is open — two
          textareas at once leaves you guessing which one you are typing in. */}
      {loaded && !composing && progressNote.state === 'idle' && (
        <div class="thr__trail-comment-box">
          <textarea
            class="thr__trail-textarea"
            rows="2"
            value={commentText}
            placeholder="Add a comment…"
            onInput={(e) => setCommentText(e.target.value)}
            onKeyDown={onCommentKeyDown}
            disabled={submitting}
          />
          {commentText.trim() && (
            <div class="thr__trail-actions">
              <button
                type="button"
                class="thr__btn thr__btn--ghost"
                onClick={() => setCommentText('')}
                disabled={submitting}
                // NO_TRACK — clearing a draft is not an outcome.
              >
                Clear
              </button>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
