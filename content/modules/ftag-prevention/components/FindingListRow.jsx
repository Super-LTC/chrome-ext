import { useState, useRef, useEffect } from 'preact/hooks';
import { ResolveDialog } from './ResolveDialog.jsx';
import { SnoozeMenu } from './SnoozeMenu.jsx';
import { CodeStatusBody } from './CodeStatusBody.jsx';
import { evidenceRows, formatAgo, formatDate } from '../utils/derive.js';
import { ftagMeta } from '../utils/ftags.js';
import { hasSourceView } from '../utils/source.js';
import { progressNoteUrl, patientDashboardUrl, openPccWindow, navigatePcc } from '../utils/pccLinks.js';
import { track } from '../../../utils/analytics.js';

/**
 * FindingListRow — one finding in the flat feed, with inline actions:
 *   View source · Snooze · Add Prog Note · Resolve   (no detail page)
 *
 * Add Prog Note opens PCC's new-note window and does NOT auto-resolve: the
 * button becomes a green "Resolve" (with a Cancel) so the nurse resolves
 * explicitly after writing. We poll the window to show writing → note added.
 */
export function FindingListRow({ finding, actions, pending, onViewSource }) {
  const [resolving, setResolving] = useState(false);
  const [noteState, setNoteState] = useState('idle'); // idle | writing | ready
  const [done, setDone] = useState(null);             // null | 'resolved' | 'snoozed' | 'note'
  const winRef = useRef(null);
  const pollRef = useRef(null);

  const meta = ftagMeta(finding.ftag);
  const ev = evidenceRows(finding.evidence).slice(0, 3);
  const isCodeStatus = !!finding.codeStatus;
  const showSource = hasSourceView(finding);
  const sourceLabel = isCodeStatus ? 'View form' : 'Source';
  const inNoteFlow = noteState !== 'idle';

  const clearPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => clearPoll, []);

  const doResolve = async ({ resolutionType, reason }) => {
    try {
      await actions.resolve(finding.id, { resolutionType, reason });
      track('ftag_finding_resolved', { ftag: finding.ftag, resolution_type: resolutionType });
      setResolving(false);
      setDone('resolved');
    } catch (_) { toast('Could not resolve finding.', 'error'); }
  };

  const doSnooze = async (days) => {
    try {
      await actions.snooze(finding.id, days);
      track('ftag_finding_snoozed', { ftag: finding.ftag, days });
      setDone('snoozed');
    } catch (_) { toast('Could not snooze finding.', 'error'); }
  };

  // Step 1: open the note window (synchronous, popup-safe). No resolve yet.
  const openNote = () => {
    const win = openPccWindow(progressNoteUrl(finding.pccPatientId));
    track('ftag_finding_progress_note_opened', { ftag: finding.ftag });
    if (!win) {
      setNoteState('ready');
      toast('Could not open PCC — write the note, then mark resolved.', 'error');
      return;
    }
    winRef.current = win;
    setNoteState('writing');
    clearPoll();
    pollRef.current = setInterval(() => {
      if (winRef.current && winRef.current.closed) { clearPoll(); setNoteState('ready'); }
    }, 600);
  };

  const cancelNote = () => { clearPoll(); winRef.current = null; setNoteState('idle'); };

  // Step 2: nurse confirms the note → resolve as progress_note.
  const resolveNote = async () => {
    try {
      await actions.resolve(finding.id, { resolutionType: 'progress_note' });
      track('ftag_finding_progress_note', { ftag: finding.ftag });
      setDone('note');
    } catch (_) { toast('Could not record progress note.', 'error'); }
  };

  if (done) {
    return (
      <div className="ftp-frow ftp-frow--done">
        <div className="ftp-frow__doneflash">
          <span className="ftp-frow__donecheck">✓</span>
          <span>{DONE_LABEL[done]} — {finding.patientName}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`ftp-frow ftp-frow--${finding.severity}`}>
      <div className="ftp-frow__main">
        <span className="ftp-frow__dot" aria-hidden="true"></span>

        <div className="ftp-frow__body">
          <div className="ftp-frow__line1">
            {finding.pccPatientId ? (
              <button
                type="button"
                className="ftp-frow__name ftp-frow__name--link"
                title="Open resident in PointClickCare"
                data-track="ftag_open_patient"
                data-track-prop-ftag={finding.ftag}
                onClick={() => navigatePcc(patientDashboardUrl(finding.pccPatientId))}
              >
                {finding.patientName}
              </button>
            ) : (
              <span className="ftp-frow__name">{finding.patientName}</span>
            )}
            <span className={`ftp-pill ftp-pill--${finding.severity}`}>{cap(finding.severity)}</span>
            {finding.acute && <span className="ftp-tile__acute">ACUTE</span>}
          </div>

          {isCodeStatus ? (
            <CodeStatusBody finding={finding} />
          ) : (
            <>
              <div className="ftp-frow__detail">
                <span className="ftp-frow__detail-text">{finding.clinicalDetail || finding.catalogSubtitle || meta?.subtitle || '—'}</span>
                {finding.vital?.direction && (
                  <span className={`ftp-vdir ftp-vdir--${finding.vital.direction}`}>
                    {finding.vital.direction === 'high' ? '▲' : '▼'} {finding.vital.direction}
                  </span>
                )}
                {finding.detailTag && <span className="ftp-row__detail-tag">{String(finding.detailTag).toUpperCase()}</span>}
              </div>

              <div className="ftp-frow__meta">
                <span className="ftp-frow__tagname">{meta?.title || finding.catalogTitle}</span>
                {ev.map((e, i) => (
                  <span className={`ftp-frow__chip${/no note/i.test(e.label) ? ' ftp-frow__chip--alert' : ''}`} key={i}>{e.label.toLowerCase()} <b>{maybeDate(e.value)}</b></span>
                ))}
                <span className="ftp-frow__ago">flagged {formatAgo(finding.triggeredAt)}</span>
              </div>
            </>
          )}
        </div>

        <div className="ftp-frow__actions">
          {showSource && (
            <button type="button" className="ftp-iconbtn ftp-iconbtn--primary" title={isCodeStatus ? 'View signed form' : 'View source evidence'} data-track="ftag_view_source" data-track-prop-ftag={finding.ftag} onClick={() => onViewSource(finding)}>
              {isCodeStatus ? <FormIcon /> : <SearchIcon />} {sourceLabel}
            </button>
          )}

          {inNoteFlow ? (
            <div className="ftp-noteflow">
              <span className="ftp-noteflow__status">{noteState === 'writing' ? 'writing note…' : 'note added'}</span>
              <button type="button" className="ftp-btn ftp-btn--ghost ftp-btn--sm" onClick={cancelNote}>Cancel</button> {/* NO_TRACK */}
              {/* NO_TRACK — tracked in resolveNote */}
              <button type="button" className="ftp-btn ftp-btn--confirm ftp-btn--sm" disabled={pending} onClick={resolveNote}>✓ Resolve</button>
            </div>
          ) : (
            <>
              <SnoozeMenu onSnooze={doSnooze} disabled={pending} />
              {/* NO_TRACK — resolution tracked in doResolve once confirmed */}
              <button type="button" className="ftp-btn ftp-btn--secondary ftp-btn--sm" disabled={pending} onClick={() => setResolving((r) => !r)}>Resolve</button>
              {/* NO_TRACK — open tracked in openNote */}
              <button type="button" className="ftp-btn ftp-btn--secondary ftp-btn--sm" disabled={pending} onClick={openNote}>Add Prog Note ↗</button>
            </>
          )}
        </div>
      </div>

      {resolving && (
        <div className="ftp-frow__resolve">
          <ResolveDialog onConfirm={doResolve} onCancel={() => setResolving(false)} pending={pending} />
        </div>
      )}
    </div>
  );
}

const DONE_LABEL = { resolved: 'Resolved', snoozed: 'Snoozed', note: 'Resolved via progress note' };

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

function FormIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line>
    </svg>
  );
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function maybeDate(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return formatDate(v);
  return v;
}
function toast(message, type) {
  if (typeof window.SuperToast?.show === 'function') window.SuperToast.show({ message, type });
}
