/**
 * MDSCommandCenter — root component for the MDS Command Center overlay.
 *
 * Three tabs:
 *   1. Overview    — stat cards + needs-attention list (landing tab)
 *   2. Assessments — urgency-grouped cards with ARD countdown
 *   3. Queries     — outstanding queries list
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'preact/hooks';
import { useCommandCenter } from './hooks/useCommandCenter.js';
import { useSchedule } from './hooks/useSchedule.js';
import { useCertDashboard } from '../certifications/hooks/useCertDashboard.js';
import { useCertifications } from '../certifications/hooks/useCertifications.js';
import { CommandCenterHeader } from './CommandCenterHeader.jsx';
import { CertsView } from '../certifications/CertsView.jsx';
import { AssessmentRow, cleanAssessmentType } from './AssessmentRow.jsx';
import { AssessmentPreview } from './AssessmentPreview.jsx';
import { CalendarView } from './CalendarView.jsx';
import { ItemPopover } from './ItemPopover.jsx';
import { formatPaymentDelta } from '../../utils/payment.js';
import { useComplianceDashboard } from '../care-plan-coverage/hooks/useComplianceDashboard.js';
import { useTrending } from '../care-plan-coverage/hooks/useTrending.js';
import { ComplianceView } from '../care-plan-coverage/ComplianceView.jsx';
import { MdsPlanner } from '../mds-planner/MdsPlanner.jsx';
import { RoundingReports } from '../rounding-reports/RoundingReports.jsx';
import { RevokeQueryModal } from './RevokeQueryModal.jsx';
import { track } from '../../utils/analytics.js';
import { TrackedButton } from '../../components/TrackedButton.jsx';

// ── Helpers ──

// True if an ISO timestamp is within the last `days` days. Used to scope the
// "recently signed" FYI window client-side (the certs route returns all signed
// certs; we only dot the last 7 days, matching the badge summary's window).
function _withinDays(iso, days) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) <= days * 24 * 60 * 60 * 1000;
}

function getUrgency(assessment) {
  return assessment.deadlines?.urgency || assessment.urgency || 'on_track';
}

function filterAssessments(assessments, payerFilter, classFilter, focusFilter) {
  let result = assessments;
  if (payerFilter !== 'all') result = result.filter(a => a.payerType === payerFilter);
  if (classFilter !== 'all') result = result.filter(a => a.assessmentClass === classFilter);
  if (focusFilter === 'revenue') result = result.filter(a => a.pdpm?.hasImprovements);
  if (focusFilter === 'issues') result = result.filter(a => {
    const u = a.udaSummary;
    const hasUda = u && (
      u.bims === 'missing' || u.bims === 'near_miss' || u.bims === 'in_progress' ||
      u.phq9 === 'missing' || u.phq9 === 'near_miss' || u.phq9 === 'in_progress' ||
      u.gg === 'missing' || u.gg === 'near_miss' || u.gg === 'in_progress'
    );
    const hasOrder = a.compliance?.checks?.orders
      ? a.compliance.checks.orders.status !== 'passed'
      : false;
    return hasUda || hasOrder;
  });
  return result;
}

// ── Urgency grouping ──

const URGENCY_ORDER = ['overdue', 'urgent', 'approaching', 'on_track', 'completed'];

function groupByUrgency(assessments) {
  const groups = {};
  for (const key of URGENCY_ORDER) groups[key] = [];
  for (const a of assessments) {
    const u = getUrgency(a);
    if (groups[u]) groups[u].push(a);
    else groups.on_track.push(a);
  }
  // Sort within each group: first by patientId to cluster same-patient rows,
  // then by ARD ascending within each patient cluster.
  for (const key of URGENCY_ORDER) {
    groups[key].sort((a, b) => {
      if (a.patientId && b.patientId && a.patientId !== b.patientId) {
        return a.patientId.localeCompare(b.patientId);
      }
      const dA = a.ardDate ? new Date(a.ardDate) : new Date(0);
      const dB = b.ardDate ? new Date(b.ardDate) : new Date(0);
      return dA - dB;
    });
  }
  return groups;
}

// ── Shared sub-components ──

function LoadingState() {
  return (
    <div class="mds-cc__state-container">
      <div class="mds-cc__spinner" />
      <p class="mds-cc__state-text">Loading assessments...</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div class="mds-cc__state-container">
      <div class="mds-cc__state-icon">{'\u26A0'}</div>
      <p class="mds-cc__state-text">{message}</p>
      {/* NO_TRACK: error-state retry */}
      <button class="mds-cc__retry-btn" onClick={onRetry}>Retry</button>
    </div>
  );
}

function EmptyState() {
  return (
    <div class="mds-cc__state-container">
      <div class="mds-cc__state-icon">&#x1F4CB;</div>
      <p class="mds-cc__state-text">No assessments found.</p>
    </div>
  );
}

// ── Queries view helpers ──

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cleanType(type) {
  if (!type) return '';
  return type.replace(/\s*\/\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function ardBadge(q) {
  const d = q.ardDaysRemaining;
  if (d == null) return null;
  let label, cls;
  if (d < 0) {
    label = `ARD passed ${Math.abs(d)}d ago`;
    cls = 'mds-cc__ard--critical';
  } else if (d === 0) {
    label = 'ARD today';
    cls = 'mds-cc__ard--critical';
  } else if (d <= 3) {
    label = `ARD in ${d}d`;
    cls = 'mds-cc__ard--warn';
  } else {
    label = `ARD in ${d}d`;
    cls = 'mds-cc__ard--neutral';
  }
  return <span class={`mds-cc__ard ${cls}`}>{label}</span>;
}

function sortByArd(queries) {
  return [...queries].sort((a, b) => {
    const aVal = a.ardDaysRemaining ?? Infinity;
    const bVal = b.ardDaysRemaining ?? Infinity;
    return aVal - bVal;
  });
}

// True if the query was signed within the last `withinMinutes`. Used to
// distinguish a freshly-signed query whose PCC post is genuinely in-flight
// from a legacy/older signed query that simply has no post status.
function wasSignedRecently(signedAt, withinMinutes = 30) {
  if (!signedAt) return false;
  const t = new Date(signedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < withinMinutes * 60 * 1000;
}

// Whether the signed diagnosis was auto-posted onto the patient's PCC
// diagnosis list. `success` → done automatically; `failed`/`partial` → nurse
// must enter it manually; null → post runs in a lambda a beat after signing,
// so treat as in-progress (only while freshly signed), never as failed.
function PccPostBadge({ status, error, signedAt }) {
  if (status === 'success') {
    return <span class="mds-cc__qcard-pcc mds-cc__qcard-pcc--success">{'✓'} Added to PCC</span>;
  }
  if (status === 'failed' || status === 'partial') {
    return (
      <span class="mds-cc__qcard-pcc mds-cc__qcard-pcc--failed" title={error || undefined}>
        Not added to PCC — enter manually
      </span>
    );
  }
  // status == null → pending. Only show while the post could still be in
  // flight; older signed queries with no status show nothing.
  if (wasSignedRecently(signedAt)) {
    return <span class="mds-cc__qcard-pcc mds-cc__qcard-pcc--pending">Adding to PCC…</span>;
  }
  return null;
}

function QueryCard({ q, expanded, onToggle, onOpenAssessment, onPrint, onViewPdf, onRevoke, assessmentCtx, isPending }) {
  const delta = formatPaymentDelta(q.assessmentPayment);
  // SECTION-I diagnostic-only items don't move case-mix. Backend nulls
  // assessmentPayment for these (so `delta` is already null), but gate
  // explicitly on movesCaseMix and show a neutral "Coding accuracy" tag
  // instead of any payment/CMI lift.
  const codingOnly = q.movesCaseMix === false;
  const sentTo = q.sentTo?.[0] || q.practitioner;
  const practName = sentTo ? `${sentTo.firstName || ''} ${sentTo.lastName || ''}`.trim() : null;
  const practTitle = sentTo?.title;

  return (
    <div class={`mds-cc__qcard${expanded ? ' mds-cc__qcard--open' : ''}`}>
      <div class="mds-cc__qcard-header" onClick={onToggle} role="button" tabIndex={0}>
        <div class="mds-cc__qcard-left">
          <span class="mds-cc__qcard-patient">{q.patientName}</span>
          <div class="mds-cc__qcard-diag">
            <span class="mds-cc__qcard-code">{q.mdsItem}</span>
            <span class="mds-cc__qcard-name">{q.mdsItemName}</span>
          </div>
        </div>
        <div class="mds-cc__qcard-right">
          {ardBadge(q)}
          {delta && !codingOnly && <span class={`mds-cc__qcard-delta${isPending ? ' mds-cc__qcard-delta--pending' : ''}`}>{delta}</span>}
          {codingOnly && <span class="mds-cc__qcard-tag mds-cc__qcard-tag--coding">Coding accuracy</span>}
          <svg class={`mds-cc__qcard-chevron${expanded ? ' mds-cc__qcard-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="mds-cc__qcard-meta">
        {assessmentCtx && <span class="mds-cc__qcard-ctx">{assessmentCtx}</span>}
        <span class={`mds-cc__qcard-status mds-cc__qcard-status--${isPending ? 'pending' : 'sent'}`}>
          {isPending ? 'Not yet sent' : `Sent ${formatRelative(q.sentAt)}`}
        </span>
        {practName && <span class="mds-cc__qcard-practitioner">to {practName}{practTitle ? `, ${practTitle}` : ''}</span>}
      </div>
      {expanded && (
        <div class="mds-cc__qcard-body">
          <div class="mds-cc__qcard-actions">
            <TrackedButton
              track="mds_cc_item_actioned"
              trackProps={{ item_code: (q.mdsItem || '').includes(':') ? q.mdsItem.split(':')[0] : (q.mdsItem || ''), action: 'open_in_analyzer' }}
              class="mds-cc__qcard-btn mds-cc__qcard-btn--primary"
              onClick={(e) => { e.stopPropagation(); onOpenAssessment(); }}
            >
              Open in PDPM Analyzer
            </TrackedButton>
            {!isPending && (
              <TrackedButton
                track="mds_cc_item_actioned"
                trackProps={{ item_code: (q.mdsItem || '').includes(':') ? q.mdsItem.split(':')[0] : (q.mdsItem || ''), action: 'resend_query_sms' }}
                class="mds-cc__qcard-btn mds-cc__qcard-btn--secondary"
                onClick={(e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                btn.textContent = 'Sending...';
                btn.disabled = true;
                try {
                  window.QueryAPI.resendQuery(q.id)
                    .then(() => { window.SuperToast?.success?.('SMS resent'); btn.textContent = 'Sent!'; })
                    .catch((err) => { console.error('[Super] Resend failed:', err); window.SuperToast?.error?.('Failed to resend'); btn.textContent = 'Resend SMS'; btn.disabled = false; });
                } catch (err) {
                  console.error('[Super] Resend error:', err);
                  btn.textContent = 'Resend SMS';
                  btn.disabled = false;
                }
              }}>
                Resend SMS
              </TrackedButton>
            )}
            {onViewPdf && (q.hasPdf || q.status === 'signed') && (
              <TrackedButton
                track="mds_cc_item_actioned"
                trackProps={{ item_code: (q.mdsItem || '').includes(':') ? q.mdsItem.split(':')[0] : (q.mdsItem || ''), action: 'view_signed_pdf' }}
                class="mds-cc__qcard-btn mds-cc__qcard-btn--secondary"
                onClick={(e) => { e.stopPropagation(); onViewPdf(q.id); }}
              >
                View Signed PDF
              </TrackedButton>
            )}
            {/* Revoke — only for an outstanding (sent) query. Pulls back the
                doctor's live signing link; reversible via the Undo toast. */}
            {!isPending && onRevoke && (
              <TrackedButton
                track="mds_cc_item_actioned"
                trackProps={{ item_code: (q.mdsItem || '').includes(':') ? q.mdsItem.split(':')[0] : (q.mdsItem || ''), action: 'revoke_query' }}
                class="mds-cc__qcard-btn mds-cc__qcard-btn--danger"
                onClick={(e) => { e.stopPropagation(); onRevoke(q); }}
              >
                Revoke
              </TrackedButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QueriesView({ outstandingQueries, recentlySigned, assessments, onOpenAssessment, onRefetch }) {
  const [expandedId, setExpandedId] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const pending = sortByArd((outstandingQueries || []).filter(q => q.status === 'pending'));
  const sent = sortByArd((outstandingQueries || []).filter(q => q.status === 'sent' || q.status === 'awaiting_response'));

  // Revoke an outstanding (sent) query, then show an Undo toast wired to the
  // un-revoke (DELETE) endpoint — the only revoked-state UI for v1, since a
  // revoked query drops off the outstanding list. `q` is captured in the
  // closure so Undo still works after the modal closes.
  async function handleRevokeQuery(reason) {
    const q = revokeTarget;
    try {
      await window.QueryAPI.revokeQuery(q.id, reason);
    } catch (err) {
      console.error('[Super] Failed to revoke query:', err);
      // Surface the backend's domain message and re-throw so the modal
      // re-enables its button instead of closing.
      window.SuperToast?.error?.(err?.message || 'Failed to revoke query');
      throw err;
    }
    onRefetch?.();
    window.SuperToast?.show?.({
      type: 'success',
      icon: '↩',
      message: `Revoked query for ${q?.patientName || 'patient'}`,
      duration: 8000,
      action: 'Undo',
      onAction: async () => {
        try {
          await window.QueryAPI.unrevokeQuery(q.id);
          window.SuperToast?.success?.('Revoke undone — back to awaiting doctor');
          onRefetch?.();
        } catch (err) {
          console.error('[Super] Failed to un-revoke query:', err);
          window.SuperToast?.error?.('Failed to undo revoke');
        }
      },
    });
  }

  function findAssessmentId(q) {
    const match = (assessments || []).find(a => a.id === q.mdsAssessmentId);
    return match?.externalAssessmentId || match?.assessmentId || match?.id || q.mdsAssessmentId;
  }

  function findAssessmentContext(q) {
    const match = (assessments || []).find(a => a.id === q.mdsAssessmentId);
    if (!match) return null;
    return cleanType(match.assessmentType) || null;
  }

  async function handleViewPdf(queryId) {
    try {
      const { pdfUrl } = await window.QueryAPI.getQueryPdf(queryId);
      if (pdfUrl) window.open(pdfUrl, '_blank');
      else window.SuperToast?.error?.('No PDF available');
    } catch (e) {
      console.warn('[Super] PDF fetch failed', e);
      window.SuperToast?.error?.('Failed to load PDF');
    }
  }

  async function handlePrintQuery(q) {
    const code = q.selectedIcd10Code || q.icd10Code || q.suggestedIcd10Code;
    const description = q.selectedIcd10Description || q.icd10Description || q.suggestedIcd10Description || q.mdsItemName;
    if (!code || !description) {
      window.SuperToast?.error?.('Missing ICD-10 selection — open in Analyzer to print');
      return;
    }
    try {
      await window.QueryAPI.printQueryPdf(q.id, {
        code,
        description,
        filename: `query-${(q.patientName || 'patient').replace(/[^a-z0-9]/gi, '-')}-${code}.pdf`,
      });
    } catch (e) {
      console.warn('[Super] Print query failed', e);
      window.SuperToast?.error?.('Failed to print query');
    }
  }

  const totalOutstanding = pending.length + sent.length;

  return (
    <div class="mds-cc__queries-view">
      {sent.length > 0 && (
        <div class="mds-cc__queries-group">
          <div class="mds-cc__queries-group-label">
            <span class="mds-cc__queries-group-dot mds-cc__queries-group-dot--sent" />
            Awaiting Doctor
            <span class="mds-cc__queries-group-count">{sent.length}</span>
          </div>
          {sent.map(q => (
            <QueryCard
              key={q.id}
              q={q}
              expanded={expandedId === q.id}
              onToggle={() => setExpandedId(expandedId === q.id ? null : q.id)}
              onOpenAssessment={() => onOpenAssessment?.(findAssessmentId(q))}
              onViewPdf={handleViewPdf}
              onRevoke={(query) => setRevokeTarget(query)}
              assessmentCtx={findAssessmentContext(q)}
              isPending={false}
            />
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div class="mds-cc__queries-group">
          <div class="mds-cc__queries-group-label">
            <span class="mds-cc__queries-group-dot mds-cc__queries-group-dot--pending" />
            Needs to be Sent
            <span class="mds-cc__queries-group-count">{pending.length}</span>
          </div>
          {pending.map(q => (
            <QueryCard
              key={q.id}
              q={q}
              expanded={expandedId === q.id}
              onToggle={() => setExpandedId(expandedId === q.id ? null : q.id)}
              onOpenAssessment={() => onOpenAssessment?.(findAssessmentId(q))}
              onViewPdf={handleViewPdf}
              assessmentCtx={findAssessmentContext(q)}
              isPending={true}
            />
          ))}
        </div>
      )}

      {recentlySigned && recentlySigned.length > 0 && (
        <div class="mds-cc__queries-group">
          <div class="mds-cc__queries-group-label">
            <span class="mds-cc__queries-group-dot mds-cc__queries-group-dot--signed" />
            Recently Signed
            <span class="mds-cc__queries-group-count">{recentlySigned.length}</span>
          </div>
          {recentlySigned.map(q => {
            const isSigned = q.status === 'signed';
            const isRejected = q.status === 'rejected';
            const practitioner = q.practitioner || q.sentTo?.[0];
            return (
              <div key={q.id || q.mdsItem} class={`mds-cc__qcard mds-cc__qcard--signed${isRejected ? ' mds-cc__qcard--rejected' : ''}`}>
                <div class="mds-cc__qcard-header" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)} role="button" tabIndex={0}>
                  <div class="mds-cc__qcard-left">
                    <span class="mds-cc__qcard-patient">{q.patientName}</span>
                    <div class="mds-cc__qcard-diag">
                      <span class="mds-cc__qcard-code">{q.mdsItem}</span>
                      <span class="mds-cc__qcard-name">{q.mdsItemName}</span>
                    </div>
                  </div>
                  <div class="mds-cc__qcard-right">
                    <span class={`mds-cc__qcard-status-badge mds-cc__qcard-status-badge--${q.status}`}>
                      {isSigned ? 'Signed' : 'Rejected'}
                    </span>
                    <svg class={`mds-cc__qcard-chevron${expandedId === q.id ? ' mds-cc__qcard-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </div>
                <div class="mds-cc__qcard-meta">
                  {practitioner && (
                    <span class="mds-cc__qcard-practitioner">
                      {practitioner.firstName} {practitioner.lastName}{practitioner.title ? `, ${practitioner.title}` : ''}
                    </span>
                  )}
                  {isSigned && q.selectedIcd10Code && (
                    <span class="mds-cc__qcard-icd">{q.selectedIcd10Code}</span>
                  )}
                  {isSigned && (
                    <PccPostBadge
                      status={q.pccDiagnosisPostStatus}
                      error={q.pccDiagnosisPostError}
                      signedAt={q.signedAt}
                    />
                  )}
                  {isRejected && q.rejectionReason && (
                    <span class="mds-cc__qcard-rejection">&ldquo;{q.rejectionReason}&rdquo;</span>
                  )}
                </div>
                {expandedId === q.id && (
                  <div class="mds-cc__qcard-body">
                    <div class="mds-cc__qcard-actions">
                      <TrackedButton
                        track="mds_cc_item_actioned"
                        trackProps={{ item_code: (q.mdsItem || '').includes(':') ? q.mdsItem.split(':')[0] : (q.mdsItem || ''), action: 'open_in_analyzer' }}
                        class="mds-cc__qcard-btn mds-cc__qcard-btn--primary"
                        onClick={(e) => { e.stopPropagation(); onOpenAssessment?.(findAssessmentId(q)); }}
                      >
                        Open in PDPM Analyzer
                      </TrackedButton>
                      {q.hasPdf && (
                        <TrackedButton
                          track="mds_cc_item_actioned"
                          trackProps={{ item_code: (q.mdsItem || '').includes(':') ? q.mdsItem.split(':')[0] : (q.mdsItem || ''), action: 'view_signed_pdf' }}
                          class="mds-cc__qcard-btn mds-cc__qcard-btn--secondary"
                          onClick={(e) => { e.stopPropagation(); handleViewPdf(q.id); }}
                        >
                          View Signed PDF
                        </TrackedButton>
                      )}
                      {isSigned && (
                        <TrackedButton
                          track="mds_cc_item_actioned"
                          trackProps={{ item_code: (q.mdsItem || '').includes(':') ? q.mdsItem.split(':')[0] : (q.mdsItem || ''), action: 'print_query' }}
                          class="mds-cc__qcard-btn mds-cc__qcard-btn--secondary"
                          onClick={(e) => { e.stopPropagation(); handlePrintQuery(q); }}
                        >
                          Print
                        </TrackedButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalOutstanding === 0 && (!recentlySigned || recentlySigned.length === 0) && (
        <div class="mds-cc__state-container">
          <div class="mds-cc__state-icon">{'\u2709'}</div>
          <p class="mds-cc__state-text">No outstanding queries.</p>
        </div>
      )}

      <RevokeQueryModal
        isOpen={!!revokeTarget}
        query={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onRevoked={handleRevokeQuery}
      />
    </div>
  );
}

// ── Main Component ──

export function MDSCommandCenter({ facilityName, orgSlug, onClose, initialExpandedId }) {
  const [activeView, setActiveView] = useState('assessments');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar' (assessments tab only)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [payerFilter, setPayerFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [focusFilter, setFocusFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(initialExpandedId || null);
  const [selectedItem, setSelectedItem] = useState(null); // { item, assessmentId }

  // Mount-only: fire mds_command_center_opened exactly once. On unmount, refresh
  // the FAB "S" badge — action items may have been worked and FYI items viewed
  // while the center was open.
  useEffect(() => {
    track('mds_command_center_opened', { source: 'fab' });
    return () => window.updateMDSBadge?.();
  }, []);

  // Populated each render (below) so this stable callback always sees the
  // latest unseen keys + refetchers without re-creating on every data change.
  const fyiRef = useRef({ certKeys: [], queryKeys: [], refetchCerts: null, refetchData: null });

  const handleViewChange = useCallback((next) => {
    setActiveView(prev => {
      if (prev !== next) {
        track('mds_cc_view_switched', { from_view: prev, to_view: next });
      }
      return next;
    });
    // Per-tab clear: entering Certs/Queries marks all unseen recently-signed
    // items seen, then refreshes the FAB badge + refetches so the dots clear.
    const fyi = fyiRef.current;
    if (next === 'certs' && fyi.certKeys.length) {
      window.NotificationsAPI?.markSeen(fyi.certKeys).then(() => {
        window.updateMDSBadge?.();
        fyi.refetchCerts?.();
      });
    } else if (next === 'queries' && fyi.queryKeys.length) {
      window.NotificationsAPI?.markSeen(fyi.queryKeys).then(() => {
        window.updateMDSBadge?.();
        fyi.refetchData?.();
      });
    }
  }, []);

  const handleItemSelect = useCallback((item, assessmentId) => {
    if (item?.mdsItem) {
      // Strip optional ":suffix" so I8000:rare → I8000 (categorical reference data, no PHI).
      const itemCode = item.mdsItem.includes(':') ? item.mdsItem.split(':')[0] : item.mdsItem;
      track('mds_cc_item_popover_opened', { item_code: itemCode });
    }
    setSelectedItem({ item, assessmentId });
  }, []);

  const { data, loading, error, retry } = useCommandCenter({ facilityName, orgSlug });

  // Assessment schedule — upcoming OBRA quarterlies/annuals/admissions with isOpened flag
  const { data: scheduleData } = useSchedule({ facilityName, orgSlug, enabled: true });

  // Certification dashboard (returns null when module disabled)
  const { data: certDashboard } = useCertDashboard({ facilityName, orgSlug, enabled: true });
  const certsEnabled = certDashboard !== null;
  const certCount = certsEnabled ? (certDashboard?.pending || 0) + (certDashboard?.overdue || 0) : 0;

  // Full cert list (for calendar layer) — same data CertsView fetches.
  // Hoisted here so the calendar can plot certs alongside assessments and queries.
  const { certs: allCerts } = useCertifications({ facilityName, orgSlug });

  // ── Notification FYI "seen" state ──
  // Recently-signed certs/queries the current user hasn't viewed yet. Drives the
  // red dots on the Certs/Queries tabs; opening the tab marks them all seen
  // (per-tab clear) and decrements the FAB "S" badge.
  const { certs: signedCerts, refetch: refetchSignedCerts } = useCertifications({
    facilityName, orgSlug, status: 'signed',
  });
  const certUnseenKeys = useMemo(
    () => (signedCerts || [])
      .filter((c) => c.seenByMe === false && _withinDays(c.signedAt, 7))
      .map((c) => window.NOTIFICATION_KEYS.certSigned(c.id)),
    [signedCerts]
  );
  const queryUnseenKeys = useMemo(
    () => (data?.recentlySigned || [])
      .filter((q) => q.seenByMe === false)
      .map((q) => window.NOTIFICATION_KEYS.querySigned(q.id)),
    [data]
  );
  const certHasUnseen = certUnseenKeys.length > 0;
  const queryHasUnseen = queryUnseenKeys.length > 0;
  fyiRef.current = {
    certKeys: certUnseenKeys,
    queryKeys: queryUnseenKeys,
    refetchCerts: refetchSignedCerts,
    refetchData: retry,
  };

  // Compliance dashboard (care plan coverage)
  const {
    data: complianceData,
    loading: complianceLoading,
    error: complianceError,
    retry: complianceRetry
  } = useComplianceDashboard({ facilityName, orgSlug, enabled: true });
  const complianceGaps = complianceData?.summary?.totalGaps || 0;

  // Trending data for compliance chart
  const { data: trendingData } = useTrending({ facilityName, orgSlug, enabled: true });

  // Command Center is always facility-wide — no patient scoping even when
  // opened from a patient page. The Certs badge and content must match.

  const assessments = data?.assessments || [];
  const summary = data?.summary || {};

  // Group assessments by urgency. Upcoming-but-not-opened schedule items are
  // shown on the calendar view only — the list is dashboard (opened) rows.
  const urgencyGroups = useMemo(() => {
    const filtered = filterAssessments(assessments, payerFilter, classFilter, focusFilter);
    return groupByUrgency(filtered);
  }, [assessments, payerFilter, classFilter, focusFilter]);

  // Flatten urgency groups into a single sorted list. Same-patient rows still
  // cluster adjacent because groupByUrgency sorts by patientId within a group,
  // but there's no visual grouping treatment — uniform rows, simpler scan.
  const flatList = useMemo(() => {
    const keysToInclude = urgencyFilter === 'all' ? URGENCY_ORDER : [urgencyFilter];
    const rows = [];
    for (const key of keysToInclude) {
      const group = urgencyGroups[key] || [];
      for (const a of group) rows.push(a);
    }
    return rows;
  }, [urgencyGroups, urgencyFilter]);

  const totalFiltered = flatList.length;

  // Scroll to initial expanded assessment after data loads
  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (!initialExpandedId || !assessments.length || didRestoreScroll.current) return;
    didRestoreScroll.current = true;
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-assessment-id="${initialExpandedId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [assessments, initialExpandedId]);

  function handleToggleCard(id) {
    setExpandedId(prev => {
      const next = prev === id ? null : id;
      // Scroll expanded card into view after render
      if (next) {
        requestAnimationFrame(() => {
          const el = listRef.current?.querySelector(`[data-assessment-id="${next}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      return next;
    });
  }

  // Ref for scrolling to a specific assessment after view switch
  const scrollTargetRef = useRef(null);
  const listRef = useRef(null);

  // After view switches to assessments with a scroll target, scroll to it
  useEffect(() => {
    if (activeView === 'assessments' && scrollTargetRef.current) {
      const targetId = scrollTargetRef.current;
      scrollTargetRef.current = null;
      // Use requestAnimationFrame to wait for DOM render
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-assessment-id="${targetId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief highlight flash
          el.classList.add('mds-cc__card-wrapper--highlight');
          setTimeout(() => el.classList.remove('mds-cc__card-wrapper--highlight'), 1500);
        }
      });
    }
  }, [activeView, expandedId]);

  function handleOpenAnalyzer(assessment) {
    const assessmentId = assessment.externalAssessmentId || assessment.assessmentId || assessment.id;
    onClose({ hide: true });
    window.PDPMAnalyzerLauncher?.open({ scope: 'mds', assessmentId }, { fromCommandCenter: true });
  }

  function handleOpenAssessmentById(assessmentId) {
    onClose({ hide: true });
    window.PDPMAnalyzerLauncher?.open({ scope: 'mds', assessmentId }, { fromCommandCenter: true });
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div class="mds-cc__overlay" onClick={handleBackdropClick}>
      <div class={`mds-cc__modal${isFullscreen ? ' mds-cc__modal--fullscreen' : ''}`} role="dialog" aria-modal="true" aria-label="MDS Command Center">

        {/* ── Item detail popover ── */}
        {selectedItem && (
          <ItemPopover
            item={selectedItem.item}
            context={{ assessmentId: selectedItem.assessmentId }}
            onClose={() => setSelectedItem(null)}
          />
        )}

        <CommandCenterHeader
          summary={summary}
          facilityName={facilityName}
          onClose={onClose}
          activeView={activeView}
          onViewChange={handleViewChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(v => !v)}
          queryCount={(data?.outstandingQueries || []).length}
          queryHasUnseen={queryHasUnseen}
          certCount={certCount}
          certHasUnseen={certHasUnseen}
          certsEnabled={certsEnabled}
          complianceGaps={complianceGaps}
          payerFilter={payerFilter}
          onPayerFilterChange={setPayerFilter}
          classFilter={classFilter}
          onClassFilterChange={setClassFilter}
          focusFilter={focusFilter}
          onFocusFilterChange={setFocusFilter}
          urgencyFilter={urgencyFilter}
          onUrgencyFilterChange={setUrgencyFilter}
        />

        <div class="mds-cc__list" ref={listRef}>
          {/* The shared `loading`/`error` from useCommandCenter only feeds the
              assessments + queries tabs. Other tabs (certs, compliance,
              planner, rounding) own their own load state — don't double-up. */}
          {loading && (activeView === 'assessments' || activeView === 'queries') && <LoadingState />}
          {!loading && error && (activeView === 'assessments' || activeView === 'queries') && (
            <ErrorState message={error} onRetry={retry} />
          )}

          {/* Assessments — List or Calendar view */}
          {!loading && !error && activeView === 'assessments' && viewMode === 'list' && (
            <>
              {totalFiltered === 0 && <EmptyState />}
              {totalFiltered > 0 && (
                <div class="mds-cc__assessments mds-cc__assessments--flat">
                  {flatList.map(assessment => {
                    const id = assessment.id || assessment.assessmentId || assessment.externalAssessmentId;
                    const isExpanded = expandedId === id;
                    return (
                      <div
                        key={id}
                        class="mds-cc__card-wrapper"
                        data-assessment-id={id}
                      >
                        <AssessmentRow
                          assessment={assessment}
                          isExpanded={isExpanded}
                          onToggle={() => handleToggleCard(id)}
                          onOpenAnalyzer={() => handleOpenAnalyzer(assessment)}
                        />
                        {isExpanded && (
                          <AssessmentPreview
                            assessment={assessment}
                            onOpenAnalyzer={() => handleOpenAnalyzer(assessment)}
                            onSelectItem={(item) => {
                              const aid = assessment.externalAssessmentId || assessment.assessmentId || assessment.id;
                              handleItemSelect(item, aid);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Assessments — Calendar view */}
          {!loading && !error && activeView === 'assessments' && viewMode === 'calendar' && (
            <CalendarView
              dashboardAssessments={assessments}
              scheduleItems={scheduleData?.schedule || []}
              outstandingQueries={data?.outstandingQueries || []}
              certs={allCerts || []}
              onJumpToAssessment={(id) => {
                setViewMode('list');
                setExpandedId(id);
                scrollTargetRef.current = id;
              }}
            />
          )}

          {/* Queries */}
          {!loading && !error && activeView === 'queries' && (
            <QueriesView
              outstandingQueries={data?.outstandingQueries || []}
              recentlySigned={data?.recentlySigned || []}
              assessments={assessments}
              onOpenAssessment={handleOpenAssessmentById}
              onRefetch={retry}
            />
          )}

          {/* Certifications — always facility-wide */}
          {activeView === 'certs' && (
            <CertsView
              facilityName={facilityName}
              orgSlug={orgSlug}
            />
          )}

          {/* Compliance */}
          {activeView === 'compliance' && (
            <ComplianceView
              data={complianceData}
              loading={complianceLoading}
              error={complianceError}
              retry={complianceRetry}
              trendingData={trendingData}
              facilityName={facilityName}
              orgSlug={orgSlug}
            />
          )}

          {/* Rounding */}
          {activeView === 'rounding' && (
            <RoundingReports
              facilityName={facilityName}
              orgSlug={orgSlug}
            />
          )}

          {/* Planner */}
          {activeView === 'planner' && (
            <MdsPlanner
              facilityName={facilityName}
              orgSlug={orgSlug}
              isFullscreen={isFullscreen}
              onOpenTab={handleViewChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
