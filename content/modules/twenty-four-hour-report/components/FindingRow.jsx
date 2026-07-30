/**
 * FindingRow — single finding card in the 24-hour report list.
 *
 * ── The rule this layout follows ───────────────────────────────────────────
 * ONE action, ONE link, ONE thread. The first version put three peer buttons
 * (Write note / Needs input / Sign off), two separate link-outs, and an
 * always-open comment box in the same cramped rail, and nothing told you which
 * was the point. Worse, the status pill for an untouched finding read "Open" —
 * a state, but it parses as a verb, so people clicked it expecting the chart
 * and got a comment thread instead.
 *
 * So: the pill is now always the ACTION or the RESULT ("Sign off" -> "✓ Signed
 * off"), never an ambiguous noun. Going to the chart is the patient's NAME plus
 * the ↗, which are the two things that already look like links. Everything
 * conversational lives behind one disclosure.
 *
 * Signing off never hides a finding — it records that a named person looked.
 */

import { useState, useCallback } from 'preact/hooks';
import { categoryInfo, subcategoryLabel, findingText } from '../utils/formatFinding.js';
import { REVIEW_STATUS, reviewStatusOf } from '../utils/reviewStatus.js';
import { useFindingActivity } from '../hooks/useFindingActivity.js';
import { useCurrentUser } from '../../../hooks/useCurrentUser.js';
import { noteOrChartUrl } from '../../../utils/pcc-links.js';
import { FindingTrail } from './FindingTrail.jsx';
import { NoteModal } from './NoteModal.jsx';

const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function pccOrigin() {
  try {
    return new URL(window.location.href).origin;
  } catch {
    return '';
  }
}

function pccPatientUrl(patientId) {
  if (!patientId) return null;
  const origin = pccOrigin();
  if (!origin) return null;
  return `${origin}/admin/client/cp_residentdashboard.jsp?ESOLrow=1&ESOLclientid=${encodeURIComponent(patientId)}`;
}

function patientDisplayName(finding) {
  if (finding.patientName) return finding.patientName;
  const first = finding.patientFirstName || '';
  const last = finding.patientLastName || '';
  const joined = [last, first].filter(Boolean).join(', ');
  return joined || 'Unknown';
}

export function FindingRow({ finding, reportId, signoffEnabled, onOpenInPCC }) {
  const sev = (finding.severity || 'low').toLowerCase();
  const sevLabel = SEVERITY_LABEL[sev] || sev;
  const name = patientDisplayName(finding);
  const room = finding.room || finding.patientRoom || '';
  const cat = categoryInfo(finding.category);
  const subLabel = subcategoryLabel(finding.subcategory || finding.type || finding.findingType);
  const text = findingText(finding);
  const findingId = finding.id || finding.findingId || null;
  const patientId = finding.patientId || finding.residentId || null;
  const href = pccPatientUrl(patientId);
  // Only set when the backend confidently resolved the PCC client id. Writing a
  // progress note gates on this, never on `patientId` — that one falls back to
  // the raw display id when the MRN parse misses, and charting into the wrong
  // resident's record is a documentation error, not a bad link.
  const pccClientId = finding.pccClientId || null;

  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const activity = useFindingActivity({ reportId, findingId });
  // Needed only to decide whose comments show a Delete affordance — the server
  // enforces authorship regardless.
  const { user } = useCurrentUser();

  const status = activity.reviewStatus ?? reviewStatusOf(finding);
  const isResolved = status === REVIEW_STATUS.RESOLVED;
  const commentCount = activity.comments?.length ?? finding.commentCount ?? 0;

  // A machine-found follow-up nobody has confirmed yet. Rendered inline under
  // the finding rather than as a second pill — it is context for the decision,
  // not a competing action.
  const followup = finding.followup;
  const [followupHidden, setFollowupHidden] = useState(false);
  const showFollowup =
    signoffEnabled && !followupHidden && followup?.status === 'detected' && !isResolved;

  const goToChart = useCallback(
    (e) => {
      if (!href) return;
      // Let middle-click / cmd-click / ctrl-click do native new-tab behavior.
      if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return;
      e?.preventDefault();
      onOpenInPCC?.(finding, { href });
    },
    [href, finding, onOpenInPCC]
  );

  const toggleTrail = useCallback(() => {
    setExpanded((prev) => {
      if (!prev) activity.load();
      return !prev;
    });
  }, [activity]);

  // Use the finding's category as a categorical type for analytics. Never
  // include patient name, MRN, room, or finding free-text — those are PHI.
  const trackType = finding.category || 'unknown';

  const canAct = Boolean(signoffEnabled && reportId && findingId);

  return (
    <li
      class={`thr__row${expanded ? ' thr__row--expanded' : ''}`}
      data-finding-id={findingId || undefined}
      data-severity={sev}
      data-review-status={status}
    >
      <span class={`thr__row-bar thr__row-bar--${sev}`} aria-hidden="true" />
      <div class="thr__row-main">
        <div
          class="thr__row-heading"
          data-track="report_24hr_finding_clicked"
          data-track-prop-finding-type={trackType}
        >
          <span class={`thr__sev-badge thr__sev-badge--${sev}`}>{sevLabel}</span>
          {href ? (
            <a
              class="thr__row-name thr__row-name--link"
              href={href}
              onClick={goToChart}
              title={`Open ${name} in PointClickCare`}
            >
              {name}
            </a>
          ) : (
            <span class="thr__row-name">{name}</span>
          )}
          {room && <span class="thr__row-meta">{room}</span>}
          {cat && (
            <span class="thr__chip">
              {cat.emoji && <span class="thr__chip-emoji" aria-hidden="true">{cat.emoji}</span>}
              {cat.label}
            </span>
          )}
          {subLabel && <span class="thr__chip thr__chip--type">{subLabel}</span>}
        </div>
        {text && <p class="thr__row-text">{text}</p>}

        {showFollowup && (
          <div class="thr__followup">
            <span class="thr__followup-icon" aria-hidden="true">🔎</span>
            <span class="thr__followup-text">
              Looks addressed — <em>{followup.summary}</em>
            </span>
            <button
              type="button"
              class="thr__followup-link"
              onClick={() => setNoteOpen(true)}
              data-track="report_24hr_detection_note_opened"
              data-track-prop-finding-type={trackType}
            >
              View note
            </button>
            <button
              type="button"
              class="thr__followup-dismiss"
              onClick={() => setFollowupHidden(true)}
              aria-label="Hide this suggestion"
              title="Hide this suggestion"
              // NO_TRACK — hiding a hint is not an outcome; the sign-off is.
            >
              ×
            </button>
          </div>
        )}

        {expanded && canAct && (
          <FindingTrail
            actions={activity.actions}
            comments={activity.comments}
            reviewStatus={status}
            loading={activity.loading}
            submitting={activity.submitting}
            error={activity.error}
            onAction={activity.applyAction}
            onComment={activity.postComment}
            onDeleteComment={activity.removeComment}
            currentUserId={user?.id}
            trackType={trackType}
          />
        )}
      </div>

      <div class="thr__row-rail">
        {canAct && (
          <button
            type="button"
            class={`thr__pill${isResolved ? ' thr__pill--done' : ''}`}
            onClick={toggleTrail}
            aria-expanded={expanded}
            aria-label={
              isResolved
                ? `Signed off — show activity for ${name}`
                : `Sign off — show activity for ${name}`
            }
            data-track="report_24hr_finding_trail_toggled"
            data-track-prop-finding-type={trackType}
          >
            {isResolved && <span class="thr__pill-check" aria-hidden="true">✓</span>}
            <span class="thr__pill-text">{isResolved ? 'Signed off' : 'Sign off'}</span>
            {commentCount > 0 && (
              <span
                class="thr__pill-count"
                title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
              >
                {commentCount}
              </span>
            )}
          </button>
        )}

        {href && (
          <a
            class="thr__row-open"
            href={href}
            onClick={goToChart}
            aria-label={`Open ${name} in PointClickCare`}
            title="Open in PointClickCare"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 17L17 7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </a>
        )}
      </div>

      {noteOpen && (
        <NoteModal
          reportId={reportId}
          findingId={findingId}
          summary={followup?.summary}
          detectedAt={followup?.detectedAt}
          chartHref={noteOrChartUrl(pccClientId, followup?.detectedPccNoteId) || href}
          onOpenChart={(url) => onOpenInPCC?.(finding, { href: url })}
          onClose={() => setNoteOpen(false)}
        />
      )}
    </li>
  );
}
