/**
 * FindingRow — single finding card in the 24-hour report list.
 *
 * ── The rule this layout follows ───────────────────────────────────────────
 * A row in a 295-item list SHOWS STATE. It does not ask you to do anything.
 *
 * Two earlier tries got this wrong. First the pill read "Open" — a state that
 * parses as a verb, so it got clicked expecting the chart. Then it read
 * "Sign off", which is worse: 295 rows each demanding an action, and a scary
 * one, when most of the time you just want to look or leave a comment.
 *
 * So the rail is now a chevron plus passive badges — note / comments / who
 * resolved it. Opening commits you to nothing. Every verb lives INSIDE, where
 * commenting is the default and resolving is the option.
 *
 * Resolving never hides a finding — it records that a named person handled it.
 */

import { useState, useCallback } from 'preact/hooks';
import { categoryInfo, subcategoryLabel, findingText } from '../utils/formatFinding.js';
import { REVIEW_STATUS, reviewStatusOf } from '../utils/reviewStatus.js';
import { useFindingActivity } from '../hooks/useFindingActivity.js';
import { useTeammates } from '../hooks/useTeammates.js';
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
  // Only once the panel is open — 295 collapsed rows must not each fetch a roster.
  const teammates = useTeammates(expanded ? reportId : null);

  const status = activity.reviewStatus ?? reviewStatusOf(finding);
  const isResolved = status === REVIEW_STATUS.RESOLVED;
  const commentCount = activity.comments?.length ?? finding.commentCount ?? 0;

  // A machine-found follow-up. Surfaced as a passive "note" badge on the row
  // and as named evidence inside — never as an action competing with the
  // human's. "Super found a possible resolution note" in words, because a bare
  // magnifying glass tells a nurse nothing.
  const followup = finding.followup;
  const hasNote = Boolean(signoffEnabled && followup?.status === 'detected');

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
      class={`thr__row${expanded ? ' thr__row--expanded' : ''}${canAct ? ' thr__row--clickable' : ''}`}
      data-finding-id={findingId || undefined}
      data-severity={sev}
      data-review-status={status}
      onClick={canAct ? toggleTrail : undefined}
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
              onClick={(e) => {
                e.stopPropagation();
                goToChart(e);
              }}
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


        {expanded && canAct && (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <div onClick={(e) => e.stopPropagation()}>
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
            onViewNote={() => setNoteOpen(true)}
            hasNote={hasNote}
            noteSummary={followup?.summary}
            currentUserId={user?.id}
            pccClientId={pccClientId}
            teammates={teammates}
            trackType={trackType}
          />
          </div>
        )}
      </div>

      <div class="thr__row-rail">
        {canAct && (
          <button
            type="button"
            class="thr__disclose"
            // The row itself handles the toggle; without stopping here the
            // click bubbles and fires it a second time, which reads as the
            // button being broken.
            onClick={(e) => {
              e.stopPropagation();
              toggleTrail();
            }}
            aria-expanded={expanded}
            aria-label={`Show comments and activity for ${name}`}
            title="Comments and activity"
            data-track="report_24hr_finding_trail_toggled"
            data-track-prop-finding-type={trackType}
          >
            {/* Badges are STATE — only rendered when there IS state. A word on
                every row ("Comments" x295) was just noise. Discoverability
                comes from the whole row being clickable and hover-lit, with the
                chevron as a bordered affordance rather than a loose glyph. */}
            {isResolved && (
              <span class="thr__badge thr__badge--done" title="Resolved">
                ✓ Resolved
              </span>
            )}
            {hasNote && (
              <span class="thr__badge thr__badge--note" title="A progress note that may relate to this finding">
                note
              </span>
            )}
            {commentCount > 0 && (
              <span class="thr__disclose-label">
                {commentCount} comment{commentCount === 1 ? '' : 's'}
              </span>
            )}
            <span class={`thr__chevron${expanded ? ' thr__chevron--open' : ''}`} aria-hidden="true">
              ⌄
            </span>
          </button>
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
