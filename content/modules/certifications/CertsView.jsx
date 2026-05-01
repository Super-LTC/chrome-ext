import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import { useCertifications } from './hooks/useCertifications.js';
import { StayGroupCard } from './components/StayGroupCard.jsx';
import { SendCertModal } from './components/SendCertModal.jsx';
import { SkipCertModal } from './components/SkipCertModal.jsx';
import { EditClinicalReasonModal } from './components/EditClinicalReasonModal.jsx';
import { DelayCertModal } from './components/DelayCertModal.jsx';
import { PractitionerWorkloadView } from './components/PractitionerWorkloadView.jsx';
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
];

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

export function CertsView({ facilityName, orgSlug, patientId, patientName }) {
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

  const refetchAll = useCallback(() => {
    refetchActive();
    refetchSigned();
  }, [refetchActive, refetchSigned]);

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
      action: filteredActive.length,
      awaiting,
      overdue,
      dueSoon,
      signed: filteredSigned.length
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

    // 3. For non-signed tabs, find signed certs from same stays for history
    if (activeSubTab !== 'signed') {
      for (const cert of filteredSigned) {
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

    // 5. Sort groups by most urgent cert
    groups.sort((a, b) => {
      const aMin = Math.min(...a.displayCerts.map(getCertSortKey));
      const bMin = Math.min(...b.displayCerts.map(getCertSortKey));
      return aMin - bMin;
    });

    return groups;
  }, [filteredActive, filteredSigned, activeSubTab]);

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

  const loading = activeSubTab === 'signed' ? signedLoading : activeLoading;


  // Workload view replaces the list
  if (workloadPractitionerId) {
    return (
      <div class="cert__view">
        <PractitionerWorkloadView
          practitionerId={workloadPractitionerId}
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

      {/* Stay type filter + Sub-tabs */}
      <div class="cert__filters">
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
        <div class="cert__sub-tabs">
          {SUB_TABS.map(tab => (
            // NO_TRACK
            <button
              key={tab.id}
              class={`cert__sub-tab${activeSubTab === tab.id ? ' cert__sub-tab--active' : ''}`}
              onClick={() => setActiveSubTab(tab.id)}
            >
              {tab.label}
              {counts[tab.id] > 0 && (
                <span class="cert__sub-tab-count">{counts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div class="cert__list">
        {loading && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__spinner" />
            <p class="mds-cc__state-text">Loading certifications...</p>
          </div>
        )}

        {!loading && activeError && (
          <div class="mds-cc__state-container">
            <div class="mds-cc__state-icon">{'\u26A0'}</div>
            <p class="mds-cc__state-text">{activeError}</p>
            {/* NO_TRACK */}
            <button class="mds-cc__retry-btn" onClick={refetchAll}>Retry</button>
          </div>
        )}

        {!loading && !activeError && stayGroups.length === 0 && (
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

        {!loading && !activeError && stayGroups.map(group => (
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
            onEditReason={(c) => setEditCert(c)}
            onViewPractitioner={(practId) => setWorkloadPractitionerId(practId)}
          />
        ))}
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
