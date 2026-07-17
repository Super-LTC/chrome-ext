import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import { useCertifications } from './hooks/useCertifications.js';
import { useDischargedCerts } from './hooks/useDischargedCerts.js';
import { useNotificationPrefs } from './hooks/useNotificationPrefs.js';
import { StayGroupCard } from './components/StayGroupCard.jsx';
import { CertSettingsPopover } from './components/CertSettingsPopover.jsx';
import { CertDigestBanner } from './components/CertDigestBanner.jsx';
import { SendCertModal } from './components/SendCertModal.jsx';
import { SkipCertModal } from './components/SkipCertModal.jsx';
import { RevokeCertModal } from './components/RevokeCertModal.jsx';
import { EditClinicalReasonModal } from './components/EditClinicalReasonModal.jsx';
import { DelayCertModal } from './components/DelayCertModal.jsx';
import { PractitionerWorkloadView } from './components/PractitionerWorkloadView.jsx';
import { CertAuditView } from './components/CertAuditView.jsx';
import { track } from '../../utils/analytics.js';
import { getCertUrgency as resolveCertUrgency, isOverdueUrgency } from './cert-urgency.js';

/**
 * CertsView — main tab content for the Certs tab in MDS Command Center.
 *
 * Groups certs by Part A stay (partAStayId). Each group renders as a
 * StayGroupCard with patient header, actionable certs, and collapsed history.
 */

const SUB_TABS = [
  { id: 'action', label: 'Action Needed' },
  { id: 'awaiting', label: 'Awaiting Signature' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'dueSoon', label: 'Due Soon' },
  { id: 'signed', label: 'Signed' },
  { id: 'discharged', label: 'Discharged' },
  { id: 'audit', label: 'All' },
];

/**
 * Adapt a discharged-endpoint patient object into the stay-grouped shape
 * StayGroupCard/CertListRow consume. Enriches each cert with the patient-level
 * fields those components read (name, payer, start date, external id) and shows
 * the full chain inline (archive view — signed rows render quiet).
 */
function adaptDischargedPatient(p) {
  const enriched = (p.certs || []).map(c => ({
    ...c,
    partAStayId: p.stayId,
    patientName: p.patientName,
    patientExternalId: p.patientExternalId,
    payerType: p.payerType,
    partAStartDate: p.partAStartDate,
  }));
  enriched.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
  return {
    stayId: p.stayId,
    dischargeDate: p.endDate,
    outstandingCount: p.outstandingCount || 0,
    displayCerts: enriched,
    historyCerts: [],
    allCerts: enriched,
  };
}

function matchesStayTypePayer(payerType, filter) {
  if (filter === 'all') return true;
  if (filter === 'managed') return payerType === 'managed_care';
  return payerType !== 'managed_care';
}

/** Lower score = more urgent. Used to sort stay groups. */
function getCertSortKey(cert) {
  const { urgency, daysUntilDue } = resolveCertUrgency(cert);
  if (isOverdueUrgency(urgency)) return Math.min(daysUntilDue, -0.5);
  return daysUntilDue ?? Infinity;
}

const STAY_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'medicare', label: 'Med A' },
  { id: 'managed', label: 'Managed' },
];

function matchesStayType(cert, filter) {
  if (filter === 'all') return true;
  if (filter === 'managed') return cert.payerType === 'managed_care';
  return cert.payerType !== 'managed_care'; // 'medicare' = everything that's not managed
}

// Mirrors the backend CERT_DUE_SOON_THRESHOLD_DAYS — the single "close to due"
// window shared by due-soon and "signature almost due" so the two can't drift.
const CERT_DUE_SOON_THRESHOLD_DAYS = 3;

/**
 * A cert is "action needed" when it's time-pressured but not yet resolved:
 * close to being due to send, or sent-but-signature-almost-due-and-unsigned.
 * The backend owns this (cert.actionNeeded); we recompute locally only as a
 * fallback for older backends that predate the field.
 */
function isActionNeeded(cert) {
  if (typeof cert.actionNeeded === 'boolean') return cert.actionNeeded;
  const { urgency, daysUntilDue } = resolveCertUrgency(cert);
  if (urgency === 'overdue' || urgency === 'due_soon' || urgency === 'delayed' || urgency === 'awaiting_signature_overdue') {
    return true;
  }
  if (urgency === 'awaiting_signature') return (daysUntilDue ?? Infinity) <= CERT_DUE_SOON_THRESHOLD_DAYS;
  return false;
}

function _withinDays(iso, days) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t <= days * 86400000;
}

/**
 * A signed cert the current user hasn't looked at yet — drives the Signed-tab
 * "new" nudge. Backend ships isNewlySigned; fall back to the same seenByMe +
 * 7-day basis the FAB "S" badge uses so the two can't disagree.
 */
function isNewlySigned(cert) {
  if (typeof cert.isNewlySigned === 'boolean') return cert.isNewlySigned;
  return cert.seenByMe === false && _withinDays(cert.signedAt, 7);
}

export function CertsView({ facilityName, orgSlug, patientId, patientName, onSignedSeen }) {
  const [activeSubTab, setActiveSubTab] = useState('action');
  const [stayTypeFilter, setStayTypeFilter] = useState('all');

  // Mount-only open event. CertsView renders inside MDS Command Center.
  useEffect(() => {
    track('cert_view_opened', { source: 'mds_cc' });
  }, []);

  // Workload view state
  const [workloadPractitionerId, setWorkloadPractitionerId] = useState(null);

  // Modal state
  const [sendCert, setSendCert] = useState(null);
  const [skipCert, setSkipCert] = useState(null);
  const [revokeCert, setRevokeCert] = useState(null);
  const [delayCert, setDelayCert] = useState(null);
  const [editCert, setEditCert] = useState(null);

  // Fetch non-signed certs
  const { certs: activeCerts, loading: activeLoading, error: activeError, refetch: refetchActive } = useCertifications({
    facilityName, orgSlug, patientId
  });

  // Fetch signed certs separately
  const { certs: signedCerts, loading: signedLoading, refetch: refetchSigned } = useCertifications({
    facilityName, orgSlug, patientId, status: 'signed'
  });

  // Discharged tab — lazy, paginated, patient-grouped (separate endpoint).
  // Only fetches once the tab is first opened.
  const {
    patients: dischargedPatients,
    hasMore: dischargedHasMore,
    loading: dischargedLoading,
    loadingMore: dischargedLoadingMore,
    error: dischargedError,
    loadMore: dischargedLoadMore,
    refetch: refetchDischarged,
  } = useDischargedCerts({
    facilityName, orgSlug, enabled: activeSubTab === 'discharged'
  });

  // Notification preferences (gear popover + digest banner). Facility-wide —
  // not loaded in the per-patient overlay (same scope as the Discharged tab).
  const { prefs: notificationPrefs, update: updateNotificationPref } = useNotificationPrefs({
    facilityName: patientId ? null : facilityName,
    orgSlug: patientId ? null : orgSlug,
  });
  const turnOnDigest = useCallback(
    () => updateNotificationPref('morningDigest', true),
    [updateNotificationPref]
  );

  // Opening the Signed sub-tab = the coordinator has now actually looked at the
  // signatures. Mark those cert_signed notifications seen (clears the "new"
  // nudge here + the FAB "S" badge via onSignedSeen), then refetch so the badge
  // clears. Uses the unfiltered signed list so every stay type clears at once.
  // Idempotent server-side, and self-terminating: once seen, isNewlySigned goes
  // false → keys empty → no re-fire.
  useEffect(() => {
    if (activeSubTab !== 'signed') return;
    const keys = signedCerts
      .filter(isNewlySigned)
      .map(c => window.NOTIFICATION_KEYS?.certSigned(c.id))
      .filter(Boolean);
    if (keys.length === 0) return;
    window.NotificationsAPI?.markSeen(keys).then(() => {
      refetchSigned();
      onSignedSeen?.();
    });
  }, [activeSubTab, signedCerts]);

  // Fire-once when the Discharged tab is first opened.
  const [dischargedOpened, setDischargedOpened] = useState(false);
  useEffect(() => {
    if (activeSubTab === 'discharged' && !dischargedOpened) {
      setDischargedOpened(true);
      track('cert_discharged_tab_opened', { source: 'mds_cc' });
    }
  }, [activeSubTab, dischargedOpened]);

  // Fire-once when the Audit tab is first opened.
  const [auditOpened, setAuditOpened] = useState(false);
  useEffect(() => {
    if (activeSubTab === 'audit' && !auditOpened) {
      setAuditOpened(true);
      track('cert_audit_tab_opened', { source: 'mds_cc' });
    }
  }, [activeSubTab, auditOpened]);

  const refetchAll = useCallback(() => {
    refetchActive();
    refetchSigned();
    refetchDischarged(); // no-op until the discharged tab has loaded
  }, [refetchActive, refetchSigned, refetchDischarged]);

  // Filter certs by stay type
  const filteredActive = useMemo(
    () => activeCerts.filter(c => matchesStayType(c, stayTypeFilter)),
    [activeCerts, stayTypeFilter]
  );
  const filteredSigned = useMemo(
    () => signedCerts.filter(c => matchesStayType(c, stayTypeFilter)),
    [signedCerts, stayTypeFilter]
  );

  // Stay type counts (for filter badges)
  const stayTypeCounts = useMemo(() => {
    const all = activeCerts.length + signedCerts.length;
    let medicare = 0, managed = 0;
    for (const cert of [...activeCerts, ...signedCerts]) {
      if (cert.payerType === 'managed_care') managed++;
      else medicare++;
    }
    return { all, medicare, managed };
  }, [activeCerts, signedCerts]);

  // Sub-tab counts (per-cert, not per-group) — driven by backend-computed urgency
  const counts = useMemo(() => {
    let overdue = 0, dueSoon = 0, awaiting = 0;
    for (const cert of filteredActive) {
      const { urgency } = resolveCertUrgency(cert);
      if (isOverdueUrgency(urgency)) overdue++;
      else if (urgency === 'due_soon') dueSoon++;
      if (urgency === 'awaiting_signature' || urgency === 'awaiting_signature_overdue') awaiting++;
    }
    return {
      // Badge counts only the time-pressured certs (backend `actionNeeded`),
      // not every active cert. The tab still LISTS the full worklist below —
      // only the number narrows, so nothing hides.
      action: filteredActive.filter(isActionNeeded).length,
      awaiting,
      overdue,
      dueSoon,
      // Signed badge = a "newly signed, not yet seen" nudge (clears once the
      // Signed sub-tab is opened), not the total signed count.
      signed: filteredSigned.filter(isNewlySigned).length
    };
  }, [filteredActive, filteredSigned]);

  // Group certs by stay
  const stayGroups = useMemo(() => {
    // 1. Determine which certs to display based on sub-tab
    let displaySource;
    if (activeSubTab === 'signed') {
      displaySource = filteredSigned;
    } else {
      displaySource = filteredActive.filter(cert => {
        const { urgency } = resolveCertUrgency(cert);
        if (activeSubTab === 'awaiting') return cert.status === 'sent';
        if (activeSubTab === 'overdue') return isOverdueUrgency(urgency);
        if (activeSubTab === 'dueSoon') return urgency === 'due_soon';
        return true; // 'action'
      });
    }

    if (displaySource.length === 0) return [];

    // 2. Group display certs by partAStayId
    const groupMap = {};
    for (const cert of displaySource) {
      const key = cert.partAStayId || cert.id;
      if (!groupMap[key]) groupMap[key] = { stayId: key, displayCerts: [], historyCerts: [] };
      groupMap[key].displayCerts.push(cert);
    }

    // 3. For non-signed tabs, find signed certs from same stays for history.
    //    Skip any cert already in displayCerts to avoid double-rendering.
    if (activeSubTab !== 'signed') {
      const displayedIds = new Set();
      for (const group of Object.values(groupMap)) {
        for (const cert of group.displayCerts) displayedIds.add(cert.id);
      }
      for (const cert of filteredSigned) {
        if (displayedIds.has(cert.id)) continue;
        const key = cert.partAStayId;
        if (key && groupMap[key]) {
          groupMap[key].historyCerts.push(cert);
        }
      }
    }

    // 4. Sort within groups by sequenceNumber, build allCerts for chain indicator
    const groups = Object.values(groupMap);
    for (const group of groups) {
      group.displayCerts.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
      group.historyCerts.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
      const seen = new Set();
      group.allCerts = [];
      for (const cert of [...group.displayCerts, ...group.historyCerts]) {
        if (!seen.has(cert.id)) {
          seen.add(cert.id);
          group.allCerts.push(cert);
        }
      }
      group.allCerts.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
    }

    // 5. Sort groups.
    //    Actionable tabs → MOST URGENT FIRST: order by each group's soonest-due
    //    (most-overdue) cert so the nurse always works top-down by deadline.
    //    `getCertSortKey` returns a negative number for overdue certs and the
    //    days-until-due otherwise, so the group minimum = its most urgent cert.
    //    Newest Part A stay is only a tiebreaker.
    //    Signed tab → keep newest-stay-first (due dates are meaningless there).
    groups.sort((a, b) => {
      const aStart = a.displayCerts[0]?.partAStartDate || a.historyCerts[0]?.partAStartDate || '';
      const bStart = b.displayCerts[0]?.partAStartDate || b.historyCerts[0]?.partAStartDate || '';
      if (activeSubTab === 'signed') {
        return bStart.localeCompare(aStart); // newest first
      }
      const aMin = Math.min(...a.displayCerts.map(getCertSortKey));
      const bMin = Math.min(...b.displayCerts.map(getCertSortKey));
      if (aMin !== bMin) return aMin - bMin; // due soonest / most overdue first
      return bStart.localeCompare(aStart); // tiebreak: newest stay first
    });

    return groups;
  }, [filteredActive, filteredSigned, activeSubTab]);

  // Discharged groups (already patient-grouped + newest-first from backend).
  // Apply the same stay-type filter as the other tabs.
  const dischargedGroups = useMemo(
    () => dischargedPatients
      .filter(p => matchesStayTypePayer(p.payerType, stayTypeFilter))
      .map(adaptDischargedPatient),
    [dischargedPatients, stayTypeFilter]
  );

  // Tab badge for Discharged = the actionable subset (outstanding certs), 0 until loaded.
  const dischargedOutstanding = useMemo(
    () => dischargedGroups.reduce((sum, g) => sum + g.outstandingCount, 0),
    [dischargedGroups]
  );
  const tabCounts = { ...counts, discharged: dischargedOutstanding };

  // Action handlers
  async function handleSkipCert(reason) {
    await window.CertAPI.skipCert(skipCert.id, reason);
    window.SuperToast?.success?.('Certification skipped');
    refetchAll();
  }

  async function handleDelayCert(reason) {
    await window.CertAPI.delayCert(delayCert.id, reason);
    window.SuperToast?.success?.('Certification marked as delayed');
    refetchAll();
  }

  async function handleEditReason({ clinicalReason, estimatedDays, planForDischarge }) {
    await window.CertAPI.saveClinicalReason(editCert.id, { clinicalReason, estimatedDays, planForDischarge });
    window.SuperToast?.success?.(`Clinical details updated for ${editCert.patientName}`);
    refetchAll();
  }

  async function handleUnskip(cert) {
    try {
      await window.CertAPI.unskipCert(cert.id);
      window.SuperToast?.success?.('Certification restored');
      refetchAll();
    } catch (err) {
      console.error('[Certifications] Failed to unskip:', err);
      window.SuperToast?.error?.('Failed to restore certification');
    }
  }

  // Revoke an outstanding (sent) cert. On success, show an Undo toast wired to
  // the un-revoke (DELETE) endpoint — the only revoked-state UI for v1, since
  // revoked certs drop off the actionable lists. `cert` is captured from the
  // modal's context (the closed-over `revokeCert` is null by the time the
  // promise resolves), so we pass it through.
  async function handleRevokeCert(reason) {
    const cert = revokeCert;
    try {
      await window.CertAPI.revokeCert(cert.id, reason);
    } catch (err) {
      console.error('[Certifications] Failed to revoke:', err);
      // Surface the backend's domain message (e.g. "Cannot revoke a signed
      // certification") and re-throw so the modal re-enables its button.
      window.SuperToast?.error?.(err?.message || 'Failed to revoke certification');
      throw err;
    }
    refetchAll();
    window.SuperToast?.show?.({
      type: 'success',
      icon: '↩',
      message: `Revoked certification for ${cert?.patientName || 'patient'}`,
      duration: 8000,
      action: 'Undo',
      onAction: async () => {
        try {
          await window.CertAPI.unrevokeCert(cert.id);
          window.SuperToast?.success?.('Revoke undone — back to awaiting signature');
          refetchAll();
        } catch (err) {
          console.error('[Certifications] Failed to un-revoke:', err);
          window.SuperToast?.error?.('Failed to undo revoke');
        }
      },
    });
  }

  function handleDischargedLoadMore() {
    track('cert_discharged_load_more', { page: Math.floor(dischargedPatients.length / 10) });
    dischargedLoadMore();
  }

  const isDischarged = activeSubTab === 'discharged';
  const isAudit = activeSubTab === 'audit';
  const loading = activeSubTab === 'signed' ? signedLoading : activeLoading;


  // Workload view replaces the list
  if (workloadPractitionerId) {
    return (
      <div class="cert__view">
        <PractitionerWorkloadView
          practitionerId={workloadPractitionerId}
          facilityName={facilityName}
          orgSlug={orgSlug}
          onBack={() => setWorkloadPractitionerId(null)}
        />
      </div>
    );
  }

  return (
    <div class="cert__view">
      {/* Patient filter banner */}
      {patientId && patientName && (
        <div class="cert__patient-banner">
          Showing certs for <strong>{patientName}</strong>
        </div>
      )}

      {/* Digest opt-in nudge (facility-wide; self-hides once opted in/dismissed) */}
      {!patientId && (
        <CertDigestBanner
          prefs={notificationPrefs}
          facilityName={facilityName}
          orgSlug={orgSlug}
          onTurnOn={turnOnDigest}
        />
      )}

      {/* Stay type filter + Sub-tabs */}
      <div class="cert__filters">
        {/* Stay-type (payer) filter doesn't apply to the Audit tab — that list is
            paginated server-side, so a client-only payer filter would be
            misleading. The Audit tab has its own status/date filters instead. */}
        {!isAudit && (
        <div class="cert__stay-type-filter">
          {STAY_TYPES.map(t => (
            // NO_TRACK
            <button
              key={t.id}
              class={`cert__stay-type-pill${stayTypeFilter === t.id ? ' cert__stay-type-pill--active' : ''}`}
              onClick={() => setStayTypeFilter(t.id)}
            >
              {t.label}
              {stayTypeCounts[t.id] > 0 && (
                <span class="cert__stay-type-pill-count">{stayTypeCounts[t.id]}</span>
              )}
            </button>
          ))}
        </div>
        )}
        <div class="cert__sub-tabs-row">
        <div class="cert__sub-tabs">
          {/* Discharged + Audit are facility-wide archives; hide them in per-patient overlay */}
          {SUB_TABS.filter(tab => (tab.id !== 'discharged' && tab.id !== 'audit') || !patientId).map(tab => (
            // NO_TRACK
            <button
              key={tab.id}
              class={`cert__sub-tab${activeSubTab === tab.id ? ' cert__sub-tab--active' : ''}`}
              onClick={() => setActiveSubTab(tab.id)}
            >
              {tab.label}
              {tabCounts[tab.id] > 0 && (
                <span class={`cert__sub-tab-count${tab.id === 'discharged' ? ' cert__sub-tab-count--due' : ''}`}>{tabCounts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>
        {/* Notification settings gear (facility-wide; renders only when at least
            one module-enabled toggle exists for this facility) */}
        {!patientId && (
          <CertSettingsPopover prefs={notificationPrefs} onToggle={updateNotificationPref} />
        )}
        </div>
      </div>

      {/* Content */}
      <div class="cert__list">
        {/* Active / signed tabs */}
        {!isDischarged && !isAudit &&loading && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__spinner" />
            <p class="mds-cc__state-text">Loading certifications...</p>
          </div>
        )}

        {!isDischarged && !isAudit &&!loading && activeError && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__state-icon">{'\u26A0'}</div>
            <p class="mds-cc__state-text">{activeError}</p>
            {/* NO_TRACK */}
            <button class="mds-cc__retry-btn" onClick={refetchAll}>Retry</button>
          </div>
        )}

        {!isDischarged && !isAudit &&!loading && !activeError && stayGroups.length === 0 && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__state-icon">{activeSubTab === 'overdue' ? '\u2705' : '\u{1F4CB}'}</div>
            <p class="mds-cc__state-text">
              {activeSubTab === 'action' && 'All certifications are up to date'}
              {activeSubTab === 'awaiting' && 'No certifications awaiting signature'}
              {activeSubTab === 'overdue' && 'No overdue certifications'}
              {activeSubTab === 'dueSoon' && 'No certifications due soon'}
              {activeSubTab === 'signed' && 'No certifications signed in the last 7 days'}
            </p>
          </div>
        )}

        {!isDischarged && !isAudit &&!loading && !activeError && stayGroups.map(group => (
          <StayGroupCard
            key={group.stayId}
            stayId={group.stayId}
            displayCerts={group.displayCerts}
            historyCerts={group.historyCerts}
            allCerts={group.allCerts}
            onSend={(c) => setSendCert(c)}
            onSkip={(c) => setSkipCert(c)}
            onDelay={(c) => setDelayCert(c)}
            onUnskip={handleUnskip}
            onRevoke={(c) => setRevokeCert(c)}
            onEditReason={(c) => setEditCert(c)}
            onViewPractitioner={(practId) => setWorkloadPractitionerId(practId)}
          />
        ))}

        {/* Discharged tab \u2014 archive of ended Part A stays, paginated */}
        {isDischarged && dischargedLoading && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__spinner" />
            <p class="mds-cc__state-text">Loading discharged patients...</p>
          </div>
        )}

        {isDischarged && !dischargedLoading && dischargedError && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__state-icon">{'\u26A0'}</div>
            <p class="mds-cc__state-text">{dischargedError}</p>
            {/* NO_TRACK */}
            <button class="mds-cc__retry-btn" onClick={refetchDischarged}>Retry</button>
          </div>
        )}

        {isDischarged && !dischargedLoading && !dischargedError && dischargedGroups.length === 0 && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__state-icon">{'\u{1F4CB}'}</div>
            <p class="mds-cc__state-text">No discharged patients</p>
          </div>
        )}

        {isDischarged && !dischargedLoading && !dischargedError && dischargedGroups.map(group => (
          <StayGroupCard
            key={group.stayId}
            stayId={group.stayId}
            displayCerts={group.displayCerts}
            historyCerts={group.historyCerts}
            allCerts={group.allCerts}
            dischargeDate={group.dischargeDate}
            outstandingCount={group.outstandingCount}
            onSend={(c) => setSendCert(c)}
            onSkip={(c) => setSkipCert(c)}
            onDelay={(c) => setDelayCert(c)}
            onUnskip={handleUnskip}
            onRevoke={(c) => setRevokeCert(c)}
            onEditReason={(c) => setEditCert(c)}
            onViewPractitioner={(practId) => setWorkloadPractitionerId(practId)}
          />
        ))}

        {isDischarged && !dischargedLoading && !dischargedError && dischargedHasMore && (
          // NO_TRACK
          <button
            class="cert__load-more"
            onClick={handleDischargedLoadMore}
            disabled={dischargedLoadingMore}
          >
            {dischargedLoadingMore ? 'Loading\u2026' : 'Load more'}
          </button>
        )}

        {/* Audit tab \u2014 full facility-wide list of every cert, filterable + CSV export */}
        {isAudit && (
          <CertAuditView facilityName={facilityName} orgSlug={orgSlug} />
        )}
      </div>

      {/* Modals */}
      <SendCertModal
        isOpen={!!sendCert}
        onClose={() => setSendCert(null)}
        cert={sendCert}
        facilityName={facilityName}
        orgSlug={orgSlug}
        onSent={refetchAll}
      />

      <SkipCertModal
        isOpen={!!skipCert}
        onClose={() => setSkipCert(null)}
        cert={skipCert}
        onSkipped={handleSkipCert}
      />

      <RevokeCertModal
        isOpen={!!revokeCert}
        onClose={() => setRevokeCert(null)}
        cert={revokeCert}
        onRevoked={handleRevokeCert}
      />

      <DelayCertModal
        isOpen={!!delayCert}
        onClose={() => setDelayCert(null)}
        cert={delayCert}
        onDelayed={handleDelayCert}
      />

      <EditClinicalReasonModal
        isOpen={!!editCert}
        onClose={() => setEditCert(null)}
        cert={editCert}
        onSaved={handleEditReason}
      />
    </div>
  );
}
