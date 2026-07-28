/**
 * FindingTrail — the expanded sign-off trail under one finding.
 *
 * Inline expansion, not a modal: the report is already an overlay panel, and
 * stacking a dialog on top of it reads badly. Mirrors the in-place form swap
 * used by content/components/ItemDetail.jsx.
 */

import { useState } from 'preact/hooks';
import {
  REVIEW_STATUS,
  ACTION_VERB,
  formatTrailTime,
} from '../utils/reviewStatus.js';

function actorLabel(entry) {
  return entry.actorName || entry.actorEmail || 'Someone';
}

export function FindingTrail({
  actions,
  reviewStatus,
  loading,
  submitting,
  error,
  onAction,
  trackType,
}) {
  const [composing, setComposing] = useState(null); // null | 'resolved' | 'needs_input'
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState(null);

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

  const submit = async (action, noteText) => {
    setLocalError(null);
    try {
      await onAction(action, noteText?.trim() || undefined);
      cancelCompose();
    } catch (err) {
      setLocalError(err?.message || 'Could not save. Try again.');
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
      {loading && actions === null && (
        <p class="thr__trail-empty">Loading activity…</p>
      )}

      {error && <p class="thr__trail-error">{error}</p>}

      {actions !== null && actions.length === 0 && !loading && (
        <p class="thr__trail-empty">
          No one has signed off on this yet.
        </p>
      )}

      {actions !== null && actions.length > 0 && (
        <ol class="thr__trail-list">
          {actions.map((entry) => (
            <li class="thr__trail-item" key={entry.id}>
              <div class="thr__trail-head">
                <span class="thr__trail-actor">{actorLabel(entry)}</span>
                <span class="thr__trail-verb">
                  {ACTION_VERB[entry.action] || entry.action}
                </span>
                <span class="thr__trail-time">{formatTrailTime(entry.createdAt)}</span>
              </div>
              {entry.note && <p class="thr__trail-note">{entry.note}</p>}
            </li>
          ))}
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
    </div>
  );
}
