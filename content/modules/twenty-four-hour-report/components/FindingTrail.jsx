/**
 * FindingTrail — everything you can DO with a finding, once you've opened it.
 *
 * Commenting is the default. Resolving is the option. That ordering is the
 * whole point: most of the time somebody wants to say "I checked with the DON"
 * and nothing more, and the earlier versions made that the hard path by putting
 * two or three state-changing buttons in front of it.
 *
 * ── The progress-note loop ────────────────────────────────────────────────
 * "Add progress note" opens PCC's note form. We cannot see what she types
 * there. So when she comes back we ask the only question we can honestly ask —
 * "did you write it, and does that resolve this?" — and record HER answer as
 * the trail entry. The note itself stays unlinked for now (SUP-231); the entry
 * has to stand on its own, exactly as a paper hand-off would.
 */

import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { ACTION_VERB, REVIEW_STATUS, formatTrailTime, mergeTimeline, initialsOf } from '../utils/reviewStatus.js';
import { progressNoteUrl, openPccWindow } from '../../../utils/pcc-links.js';
import { MentionInput, toMentionTokens } from './MentionInput.jsx';

function actorLabel(entry) {
  return entry.actorName || entry.actorEmail || 'Someone';
}

function authorLabel(comment) {
  return comment.authorName || comment.authorEmail || 'Someone';
}

const NOTE_PROMPT = 'Added a progress note in PointClickCare.';

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
  onViewNote,
  hasNote,
  noteSummary,
  currentUserId,
  pccClientId,
  teammates,
  trackType,
}) {
  const [commentText, setCommentText] = useState('');
  const [picked, setPicked] = useState([]);
  const [localError, setLocalError] = useState(null);
  // 'idle' | 'writing' (PCC window open) | 'asking' (came back, did it resolve?)
  const [noteFlow, setNoteFlow] = useState('idle');
  const pollRef = useRef(null);

  const loaded = actions !== null || comments !== null;
  const timeline = useMemo(() => mergeTimeline(actions, comments), [actions, comments]);
  const isResolved = reviewStatus === REVIEW_STATUS.RESOLVED;

  useEffect(() => () => clearInterval(pollRef.current), []);

  const act = async (action, note) => {
    setLocalError(null);
    try {
      await onAction(action, note);
      setNoteFlow('idle');
    } catch (err) {
      setLocalError(err?.message || 'Could not save. Try again.');
    }
  };

  const submitComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    setLocalError(null);
    try {
      // Convert the names she PICKED into @[user:id] tokens. Typed-but-never-
      // picked names stay literal text and tag nobody.
      await onComment(toMentionTokens(body, picked));
      setCommentText('');
      setPicked([]);
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

  /**
   * Open PCC's note form, watch it, and try to learn the id of the note she
   * saves.
   *
   * PCC writes the note, not us. Reverse-engineering the form POST would let us
   * capture the id directly, but the failure mode is a malformed or
   * misattributed note in a legal medical record — or a nurse believing she
   * documented when she did not. Not a trade worth making for a link.
   *
   * Instead: the popup is SAME-ORIGIN (we are injected into PCC), so we can
   * read its location as she works. A saved note navigates to a URL carrying
   * ESOLpnid=<real id>; the blank form is ESOLpnid=-1, so anything else is the
   * note that now exists.
   *
   * PROBE ONLY for now — the id is logged, not stored. What PCC actually does
   * on save has never been observed, and the log tells us before we build on it.
   */
  const openNoteForm = () => {
    const url = progressNoteUrl(pccClientId);
    if (!url) return;
    // Must be synchronous with the click or the popup is blocked.
    const win = openPccWindow(url, 'super_pcc_note');
    window.SuperAnalytics?.track?.('report_24hr_progress_note_opened', {
      finding_type: trackType,
    });
    if (!win) {
      // Popup blocked — she can still write it in her own tab, so ask anyway
      // rather than dead-ending.
      setNoteFlow('asking');
      return;
    }
    setNoteFlow('writing');
    clearInterval(pollRef.current);

    const seen = new Set();
    let captured = null;
    pollRef.current = setInterval(() => {
      // Same-origin read. Wrapped anyway: PCC could bounce the window through
      // an SSO or CDN host mid-flow, and a cross-origin read throws.
      try {
        if (!win.closed) {
          const href = win.location.href || '';
          if (href && !seen.has(href)) {
            seen.add(href);
            const m = href.match(/ESOLpnid=(-?\d+)/);
            const pnid = m ? m[1] : null;
            console.log('[24hr note probe] url:', href, '| ESOLpnid:', pnid ?? '(none)');
            // -1 is the blank form; any other value is a note that now exists.
            if (pnid && pnid !== '-1') captured = pnid;
          }
        }
      } catch (err) {
        console.log('[24hr note probe] cross-origin, cannot read:', err?.message);
      }

      if (win.closed) {
        clearInterval(pollRef.current);
        console.log(
          '[24hr note probe] window closed.',
          captured ? `CAPTURED pnid=${captured}` : 'no pnid seen — list diff would be the fallback'
        );
        setNoteFlow('asking');
      }
    }, 500);
  };

  return (
    <div class="thr__trail">
      {loading && !loaded && <p class="thr__trail-empty">Loading…</p>}
      {error && <p class="thr__trail-error">{error}</p>}
      {localError && <p class="thr__trail-error">{localError}</p>}

      {hasNote && (
        <div class="thr__evidence">
          <span class="thr__evidence-label">Related progress note</span>
          {noteSummary && <span class="thr__evidence-summary">{noteSummary}</span>}
          <button
            type="button"
            class="thr__evidence-link"
            onClick={onViewNote}
            data-track="report_24hr_detection_note_opened"
            data-track-prop-finding-type={trackType}
          >
            View note
          </button>
        </div>
      )}

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
                  {kind === 'action' && data.note && <p class="thr__thread-text">{data.note}</p>}
                  {kind === 'comment' && <p class="thr__thread-text">{data.message}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {loaded && timeline.length === 0 && !loading && (
        <p class="thr__trail-empty">No comments yet.</p>
      )}

      {noteFlow === 'writing' ? (
        <div class="thr__prompt">
          <p class="thr__prompt-text">Writing a note in PointClickCare…</p>
          {/* NO_TRACK */}
          <button type="button" class="thr__btn thr__btn--ghost" onClick={() => setNoteFlow('asking')}>
            I’m done
          </button>
        </div>
      ) : noteFlow === 'asking' ? (
        <div class="thr__prompt">
          <p class="thr__prompt-text">Did that resolve this finding?</p>
          <div class="thr__prompt-actions">
            {/* NO_TRACK — declining just returns to the comment box. */}
            <button
              type="button"
              class="thr__btn thr__btn--ghost"
              onClick={() => setNoteFlow('idle')}
              disabled={submitting}
            >
              Not yet
            </button>
            <button
              type="button"
              class="thr__btn thr__btn--primary"
              onClick={() => act(REVIEW_STATUS.RESOLVED, NOTE_PROMPT)}
              disabled={submitting}
              data-track="report_24hr_finding_action"
              data-track-prop-action="resolved_via_note"
              data-track-prop-finding-type={trackType}
            >
              {submitting ? 'Saving…' : 'Yes, mark resolved'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div class="thr__composer">
            <MentionInput
              value={commentText}
              onInput={setCommentText}
              onSubmit={submitComment}
              onPickedChange={setPicked}
              teammates={teammates}
              disabled={submitting}
              placeholder="Add a comment… @john to tag a team member"
            />
            <div class="thr__composer-actions">
              <button
                type="button"
                class="thr__btn thr__btn--primary"
                onClick={submitComment}
                disabled={submitting || !commentText.trim()}
                data-track="report_24hr_comment_posted"
                data-track-prop-finding-type={trackType}
              >
                {submitting ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </div>

          {/* Real buttons, not text links. Inside the panel you have already
              opted in by opening the row, so weight here is not the same as
              weight on 295 collapsed rows — and as plain links these read as
              afterthoughts nobody would click. */}
          <div class="thr__secondary">
            {pccClientId && (
              /* openNoteForm fires report_24hr_progress_note_opened itself, so a
                 blocked popup still counts as an attempt. */
              /* NO_TRACK */
              <button
                type="button"
                class="thr__btn thr__btn--ghost"
                onClick={openNoteForm}
                disabled={submitting}
              >
                Add progress note
              </button>
            )}
            {isResolved ? (
              <button
                type="button"
                class="thr__btn thr__btn--ghost thr__btn--push"
                onClick={() => act('reopened')}
                disabled={submitting}
                data-track="report_24hr_finding_action"
                data-track-prop-action="reopened"
                data-track-prop-finding-type={trackType}
              >
                Reopen
              </button>
            ) : (
              <button
                type="button"
                class="thr__btn thr__btn--resolve thr__btn--push"
                onClick={() => act(REVIEW_STATUS.RESOLVED)}
                disabled={submitting}
                data-track="report_24hr_finding_action"
                data-track-prop-action="resolved"
                data-track-prop-finding-type={trackType}
              >
                ✓ Mark resolved
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
