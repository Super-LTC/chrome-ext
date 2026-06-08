import { useState } from 'preact/hooks';

/**
 * ResolveDialog — collects the resolution type + reason before resolving.
 *
 *   resolved   → genuinely handled; reason REQUIRED (>= 3 chars)
 *   no_action  → not actionable / false positive; reason optional
 *
 * (progress_note is its own flow — see FindingListRow's "Make note".)
 */
export function ResolveDialog({ onConfirm, onCancel, pending }) {
  const [type, setType] = useState('resolved');
  const [reason, setReason] = useState('');

  const reasonRequired = type === 'resolved';
  const reasonOk = !reasonRequired || reason.trim().length >= 3;

  return (
    <div className="ftp-resolve">
      <div className="ftp-resolve__seg">
        <button
          type="button"
          className={`ftp-resolve__seg-btn ${type === 'resolved' ? 'is-active' : ''}`}
          onClick={() => setType('resolved')}
        > {/* NO_TRACK */}
          Resolved
        </button>
        <button
          type="button"
          className={`ftp-resolve__seg-btn ${type === 'no_action' ? 'is-active' : ''}`}
          onClick={() => setType('no_action')}
        > {/* NO_TRACK */}
          Not actionable
        </button>
      </div>

      <label className="ftp-resolve__label">
        {reasonRequired ? 'Reason (required)' : 'Reason (optional)'}
        <textarea
          className="ftp-resolve__textarea"
          rows={3}
          value={reason}
          placeholder={reasonRequired ? 'How was this handled?' : 'Why is this not actionable? (optional)'}
          onInput={(e) => setReason(e.target.value)}
        />
      </label>
      {reasonRequired && !reasonOk && reason.length > 0 && (
        <div className="ftp-resolve__hint">Please enter at least 3 characters.</div>
      )}

      <div className="ftp-resolve__actions">
        <button type="button" className="ftp-btn ftp-btn--ghost" onClick={onCancel} disabled={pending}>Cancel</button> {/* NO_TRACK */}
        <button
          type="button"
          className="ftp-btn ftp-btn--confirm"
          disabled={pending || !reasonOk}
          onClick={() => onConfirm({ resolutionType: type, reason: reason.trim() || undefined })}
        > {/* NO_TRACK */}
          {pending ? 'Resolving…' : '✓ Confirm resolve'}
        </button>
      </div>
    </div>
  );
}
