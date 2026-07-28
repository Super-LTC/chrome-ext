/**
 * FindingRow — single finding card in the 24-hour report list.
 *
 * The row carries a right-side action rail: sign-off state, a toggle for the
 * activity trail, and the ↗ link into PCC. The ↗ stays an <a href> so
 * middle-click / cmd-click open in a new tab natively; plain same-tab click is
 * intercepted by onOpenInPCC which persists state for the auto-restore flow.
 *
 * Signing off never hides a finding — it records that a named person looked.
 */

import { useState, useCallback } from 'preact/hooks';
import { categoryInfo, subcategoryLabel, findingText } from '../utils/formatFinding.js';
import {
  REVIEW_STATUS,
  STATUS_LABEL,
  reviewStatusOf,
  formatTrailTime,
  shortName,
} from '../utils/reviewStatus.js';
import { useFindingActivity } from '../hooks/useFindingActivity.js';
import { FindingTrail } from './FindingTrail.jsx';

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

/** Most recent sign-off, for the collapsed pill: "✓ Jake 2:14 PM". */
function latestResolution(actions) {
  if (!Array.isArray(actions)) return null;
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    if (actions[i].action === 'resolved') return actions[i];
  }
  return null;
}

export function FindingRow({ finding, reportId, onOpenInPCC }) {
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

  const [expanded, setExpanded] = useState(false);
  const activity = useFindingActivity({ reportId, findingId });

  // The list payload carries the finding's status; once the trail loads, the
  // server's value wins.
  const status = activity.reviewStatus ?? reviewStatusOf(finding);
  const resolution = latestResolution(activity.actions);

  const handleClick = (e) => {
    if (!href) return;
    // Let middle-click / cmd-click / ctrl-click do native new-tab behavior.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    onOpenInPCC?.(finding, { href });
  };

  const toggleTrail = useCallback(() => {
    setExpanded((prev) => {
      if (!prev) activity.load();
      return !prev;
    });
  }, [activity]);

  // Use the finding's category as a categorical type for analytics. Never
  // include patient name, MRN, room, or finding free-text — those are PHI.
  const trackType = finding.category || 'unknown';

  // Sign-off needs a stable anchor on both ids; without them the row is still
  // fully readable, just not actionable.
  const canAct = Boolean(reportId && findingId);

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
          <span class="thr__row-name">{name}</span>
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
          <FindingTrail
            actions={activity.actions}
            reviewStatus={status}
            loading={activity.loading}
            submitting={activity.submitting}
            error={activity.error}
            onAction={activity.applyAction}
            trackType={trackType}
          />
        )}
      </div>

      <div class="thr__row-rail">
        {canAct && (
          <button
            type="button"
            class={`thr__status-pill thr__status-pill--${status}`}
            onClick={toggleTrail}
            aria-expanded={expanded}
            aria-label={`${STATUS_LABEL[status]} — show activity for ${name}`}
            title={STATUS_LABEL[status]}
            data-track="report_24hr_finding_trail_toggled"
            data-track-prop-finding-type={trackType}
          >
            {status === REVIEW_STATUS.RESOLVED && (
              <span class="thr__status-check" aria-hidden="true">✓</span>
            )}
            <span class="thr__status-text">
              {status === REVIEW_STATUS.RESOLVED && resolution
                ? `${shortName(resolution.actorName, resolution.actorEmail)} ${formatTrailTime(resolution.createdAt)}`
                : STATUS_LABEL[status]}
            </span>
          </button>
        )}

        {href && (
          <a
            class="thr__row-open"
            href={href}
            onClick={handleClick}
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
    </li>
  );
}
