import { usePractitionerWorkload } from '../hooks/usePractitionerWorkload.js';
import { CertTypeBadge } from './CertTypeBadge.jsx';
import { CertStatusBadge } from './CertStatusBadge.jsx';

/**
 * PractitionerWorkloadView — replaces CertsView list content when a
 * practitioner is selected (via signed-by link in cert row).
 *
 * Shows practitioner info, their pending queue, and recently signed items.
 */

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function QueueRow({ item }) {
  // item can be a cert or a diagnosis query
  const isCert = !!item.type && (item.type === 'initial' || item.type.includes('recert'));

  return (
    <div class="cert__workload-row">
      <div class="cert__workload-row-top">
        {isCert ? (
          <>
            <CertTypeBadge type={item.type} />
            <span class="cert__workload-patient">{item.patientName}</span>
            <CertStatusBadge
              status={item.status}
              isDelayed={item.isDelayed}
              dueDate={item.dueDate}
              signedAt={item.signedAt}
            />
          </>
        ) : (
          <>
            <span class="cert__workload-query-badge">Query</span>
            <span class="cert__workload-patient">{item.patientName}</span>
            {item.mdsItem && (
              <span class="cert__workload-meta">{item.mdsItem}{item.mdsItemName ? ` — ${item.mdsItemName}` : ''}</span>
            )}
          </>
        )}
      </div>
      <div class="cert__workload-row-bottom">
        {isCert && item.dueDate && <span class="cert__row-meta">Due {formatShortDate(item.dueDate)}</span>}
        {!isCert && item.sentAt && <span class="cert__row-meta">Sent {formatShortDate(item.sentAt)}</span>}
      </div>
    </div>
  );
}

function SignedRow({ item }) {
  const isCert = !!item.type && (item.type === 'initial' || item.type.includes('recert'));

  return (
    <div class="cert__workload-row">
      <div class="cert__workload-row-top">
        {isCert ? (
          <>
            <CertTypeBadge type={item.type} />
            <span class="cert__workload-patient">{item.patientName}</span>
          </>
        ) : (
          <>
            <span class="cert__workload-query-badge">Query</span>
            <span class="cert__workload-patient">{item.patientName}</span>
            {item.mdsItem && <span class="cert__workload-meta">{item.mdsItem}</span>}
          </>
        )}
      </div>
      <div class="cert__workload-row-bottom">
        {item.signedAt && <span class="cert__row-meta">Signed {formatShortDate(item.signedAt)}</span>}
        {!isCert && item.selectedIcd10Code && (
          <span class="cert__row-meta">ICD-10: {item.selectedIcd10Code}</span>
        )}
      </div>
    </div>
  );
}

export function PractitionerWorkloadView({ practitionerId, facilityName, orgSlug, onBack }) {
  const { data, loading, error, retry } = usePractitionerWorkload(practitionerId, facilityName, orgSlug);

  if (loading) {
    return (
      <div class="cert__workload">
        <div class="cert__workload-header">
          {/* NO_TRACK */}
          <button class="cert__workload-back" onClick={onBack}>{'\u2190'} Back to Certs</button>
        </div>
        <div class="mds-cc__state-container">
          <div class="mds-cc__spinner" />
          <p class="mds-cc__state-text">Loading practitioner...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="cert__workload">
        <div class="cert__workload-header">
          {/* NO_TRACK */}
          <button class="cert__workload-back" onClick={onBack}>{'\u2190'} Back to Certs</button>
        </div>
        <div class="mds-cc__state-container">
          <div class="mds-cc__state-icon">{'\u26A0'}</div>
          <p class="mds-cc__state-text">{error}</p>
          {/* NO_TRACK */}
          <button class="mds-cc__retry-btn" onClick={retry}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { practitioner } = data;
  // Backend returns queue/recentlySigned as { certifications: [], diagnosisQueries: [] }
  const queueRaw = data.queue || {};
  const signedRaw = data.recentlySigned || {};
  const queue = Array.isArray(queueRaw)
    ? queueRaw
    : [
        ...(queueRaw.certifications || []).map(c => ({ ...c, _kind: 'cert' })),
        ...(queueRaw.diagnosisQueries || []).map(q => ({ ...q, _kind: 'query' })),
      ];
  const recentlySigned = Array.isArray(signedRaw)
    ? signedRaw
    : [
        ...(signedRaw.certifications || []).map(c => ({ ...c, _kind: 'cert' })),
        ...(signedRaw.diagnosisQueries || []).map(q => ({ ...q, _kind: 'query' })),
      ];

  return (
    <div class="cert__workload">
      <div class="cert__workload-header">
        {/* NO_TRACK */}
        <button class="cert__workload-back" onClick={onBack}>{'\u2190'} Back to Certs</button>
      </div>

      {/* Practitioner info */}
      <div class="cert__workload-info">
        <div class="cert__workload-name">
          {practitioner?.firstName} {practitioner?.lastName}
          {practitioner?.title && <span class="cert__workload-title">, {practitioner.title}</span>}
        </div>
        {practitioner?.phone && (
          <div class="cert__workload-phone">{practitioner.phone}</div>
        )}
      </div>

      {/* In Queue */}
      <div class="cert__workload-section">
        <div class="cert__workload-section-header">
          In Queue
          {queue.length > 0 && <span class="cert__workload-section-count">{queue.length}</span>}
        </div>
        {queue.length === 0 ? (
          <div class="cert__workload-empty">No items in queue</div>
        ) : (
          queue.map((item, i) => <QueueRow key={i} item={item} />)
        )}
      </div>

      {/* Recently Signed */}
      <div class="cert__workload-section">
        <div class="cert__workload-section-header">
          Recently Signed
          {recentlySigned.length > 0 && <span class="cert__workload-section-count">{recentlySigned.length}</span>}
        </div>
        {recentlySigned.length === 0 ? (
          <div class="cert__workload-empty">No recent signatures</div>
        ) : (
          recentlySigned.map((item, i) => <SignedRow key={i} item={item} />)
        )}
      </div>
    </div>
  );
}
