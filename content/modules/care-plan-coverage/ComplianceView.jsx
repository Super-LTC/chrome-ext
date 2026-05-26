/**
 * ComplianceView — facility-wide care plan compliance tab for the MDS Command Center.
 * Shows trend chart, summary cards, smart "needs attention" sections,
 * and full patient list with sparklines and PCC navigation.
 */
import { useState, useMemo /*, useEffect */ } from 'preact/hooks';
import { TrendChart } from './components/TrendChart.jsx';
import { ScoreBar } from './components/ScoreBar.jsx';
import { ChangesList } from './components/ChangesList.jsx';
import { GapsList } from './components/GapsList.jsx';
import { CoveredList } from './components/CoveredList.jsx';
import { useCoverage } from './hooks/useCoverage.js';
// import { fetchPatientHistories } from './hooks/usePatientHistory.js';

// ── Helpers ──

function scoreTier(score) {
  if (score >= 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

const TIER_COLORS = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

/** Title-case ALL CAPS PCC text — "KINYON, BARBARA" → "Kinyon, Barbara" */
function humanize(str) {
  if (!str) return '';
  if (str === str.toUpperCase() && str.length > 3) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
}

function navigateToPatient(externalPatientId) {
  if (!externalPatientId) return;
  const origin = new URL(window.location.href).origin;
  window.location.href = `${origin}/admin/client/cp_careplans_rev.jsp?ESOLreviewid=-1&ESOLclientid=${externalPatientId}`;
}

// ── Summary Cards ──

function SummaryCards({ summary }) {
  if (!summary) return null;

  return (
    <div class="cpc-cv__cards">
      <div class="cpc-cv__card">
        <div class={`cpc-cv__card-value cpc-cv__card-value--${scoreTier(summary.overallCoverage)}`}>
          {summary.overallCoverage}%
        </div>
        <div class="cpc-cv__card-label">Overall Coverage</div>
      </div>
      <div class="cpc-cv__card">
        <div class="cpc-cv__card-value">{summary.totalGaps}</div>
        <div class="cpc-cv__card-label">Total Gaps</div>
      </div>
      <div class="cpc-cv__card">
        <div class="cpc-cv__card-value">{summary.patientsChecked}/{summary.totalPatients}</div>
        <div class="cpc-cv__card-label">Patients Checked</div>
      </div>
      {summary.patientsStale > 0 && (
        <div class="cpc-cv__card cpc-cv__card--warn">
          <div class="cpc-cv__card-value">{summary.patientsStale}</div>
          <div class="cpc-cv__card-label">Stale</div>
        </div>
      )}
    </div>
  );
}

// ── Needs Attention Section ──

function AttentionCard({ patient, histories, onOpenCoverage }) {
  const tier = scoreTier(patient.overallScore ?? 0);
  const dxGaps = (patient.diagnosisMissing || 0) + (patient.diagnosisPartial || 0);
  const orderGaps = (patient.orderMissing || 0) + (patient.orderPartial || 0);
  const totalGaps = dxGaps + orderGaps;

  return (
    <div class="cpc-cv__acard" onClick={() => onOpenCoverage(patient)}>
      <div class="cpc-cv__acard-top">
        <span class="cpc-cv__acard-name">{humanize(patient.patientName)}</span>
        {patient.levelOfCare && <span class="cpc-cv__acard-loc">{patient.levelOfCare}</span>}
      </div>
      <div class="cpc-cv__acard-bottom">
        {patient.hasResults ? (
          <span class={`cpc-cv__acard-pct cpc-cv__acard-pct--${tier}`}>{patient.overallScore}%</span>
        ) : (
          <span class="cpc-cv__row-unchecked">Not checked</span>
        )}
        {totalGaps > 0 && <span class="cpc-cv__gap-badge">{totalGaps} gap{totalGaps !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

const ATTENTION_PREVIEW = 3;

function AttentionGroup({ label, accent, patients, histories, historiesLoading, onOpenCoverage, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);

  // Show loading state when this group depends on histories and they haven't loaded
  const needsHistories = accent === 'orange'; // declining coverage needs history data
  const isLoading = needsHistories && historiesLoading;

  if (!isLoading && (!patients || patients.length === 0)) return null;

  const visible = expanded ? patients : (patients || []).slice(0, ATTENTION_PREVIEW);
  const remaining = (patients || []).length - ATTENTION_PREVIEW;

  return (
    <div class={`cpc-cv__attention-group cpc-cv__attention-group--${accent}`}>
      <div class="cpc-cv__attention-header" onClick={() => setOpen(!open)}>
        <span class={`cpc__section-arrow ${open ? 'cpc__section-arrow--open' : ''}`}>{'\u25b6'}</span>
        <span class="cpc-cv__attention-label">{label}</span>
        {!isLoading && patients && <span class="cpc-cv__attention-count">{patients.length}</span>}
      </div>
      {open && (
        <div class="cpc-cv__attention-list">
          {isLoading ? (
            <div class="cpc-cv__attention-loading">
              <div class="cpc__spinner cpc__spinner--sm" />
              <span>Analyzing trends...</span>
            </div>
          ) : (
            <>
              <div class="cpc-cv__acards">
                {visible.map(p => (
                  <AttentionCard
                    key={p.patientId}
                    patient={p}
                    histories={histories}
                    onOpenCoverage={onOpenCoverage}
                  />
                ))}
              </div>
              {!expanded && remaining > 0 && (
                // NO_TRACK
                <button class="cpc-cv__view-more" onClick={(e) => { e.stopPropagation(); setExpanded(true); }}>
                  View {remaining} more
                </button>
              )}
              {expanded && patients.length > ATTENTION_PREVIEW && (
                // NO_TRACK
                <button class="cpc-cv__view-more" onClick={(e) => { e.stopPropagation(); setExpanded(false); }}>
                  Show less
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Patient Row ──

function PatientRow({ patient, onOpenCoverage }) {
  const tier = scoreTier(patient.overallScore ?? 0);
  const dxGaps = (patient.diagnosisMissing || 0) + (patient.diagnosisPartial || 0);
  const orderGaps = (patient.orderMissing || 0) + (patient.orderPartial || 0);
  const totalGaps = dxGaps + orderGaps;

  return (
    <div class="cpc-cv__row" onClick={() => onOpenCoverage(patient)}>
      <div class="cpc-cv__row-name">
        <span class="cpc-cv__row-patient">{humanize(patient.patientName)}</span>
        {patient.levelOfCare && (
          <span class="cpc-cv__row-loc">{patient.levelOfCare}</span>
        )}
      </div>
      <div class="cpc-cv__row-score">
        {patient.hasResults ? (
          <span class={`cpc-cv__row-pct cpc-cv__row-pct--${tier}`}>{patient.overallScore}%</span>
        ) : (
          <span class="cpc-cv__row-unchecked">Not checked</span>
        )}
      </div>
      <div class="cpc-cv__row-gaps">
        {totalGaps > 0 ? (
          <span class="cpc-cv__gap-badge">{totalGaps} gap{totalGaps !== 1 ? 's' : ''}</span>
        ) : patient.hasResults ? (
          <span class="cpc-cv__gap-ok">{'\u2713'}</span>
        ) : null}
      </div>
      {patient.stale && <span class="cpc-cv__stale-dot" title="Stale" />}
      <button
        class="cpc-cv__row-nav"
        title="Go to patient in PCC"
        onClick={(e) => {
          e.stopPropagation();
          navigateToPatient(patient.externalPatientId || patient.patientId);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// ── Detail Item (used in patient detail) ──

function DetailItem({ item, expanded, onToggle }) {
  const isDx = item.type === 'diagnosis';
  const gapType = isDx ? 'diagnosis' : 'order';
  return (
    <div class={`cpd__item ${expanded ? 'cpd__item--open' : ''}`}>
      <div
        class="cpd__item-row"
        onClick={onToggle}
        data-track="care_plan_gap_clicked"
        data-track-prop-gap-type={gapType}
      >
        <span class={`cpd__item-dot cpd__item-dot--${item.status}`} />
        <div class="cpd__item-main">
          {item.code && <span class="cpd__item-code">{item.code}</span>}
          <span class="cpd__item-desc">{humanize(item.description)}</span>
        </div>
        <span class="cpd__item-type">{isDx ? 'Dx' : 'Order'}</span>
        <span class={`cpd__item-chevron ${expanded ? 'cpd__item-chevron--open' : ''}`}>{'\u25b6'}</span>
      </div>
      {expanded && (
        <div class="cpd__item-detail">
          {item.matchedFocus && (
            <div class="cpd__item-field">
              <div class="cpd__item-field-label">Matched Focus</div>
              <div class="cpd__item-field-value">{item.matchedFocus}</div>
            </div>
          )}
          {item.matchedIntervention && (
            <div class="cpd__item-field">
              <div class="cpd__item-field-label">Intervention</div>
              <div class="cpd__item-field-value">{item.matchedIntervention}</div>
            </div>
          )}
          {item.reason && (
            <div class="cpd__item-reason">{item.reason}</div>
          )}
          {!item.matchedFocus && !item.matchedIntervention && !item.reason && (
            <div class="cpd__item-reason">No matching care plan focus found.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline Patient Detail — story-driven layout ──

const STATUS_RANK = { covered: 0, partial: 1, missing: 2 };

function PatientDetail({ patient, facilityName, orgSlug, onBack }) {
  const { summary, changes, loading: covLoading, error: covError, refreshing, refresh, retry: covRetry } = useCoverage({
    patientId: patient.patientId,
    facilityName,
    orgSlug
  });
  const [expandedItem, setExpandedItem] = useState(null);
  const [showCovered, setShowCovered] = useState(false);

  const neverChecked = summary && summary.hasResults === false;
  const hasData = summary && !neverChecked;

  // Split gaps into missing vs partial
  const missing = useMemo(() => (summary?.gaps || []).filter(g => g.status === 'missing'), [summary]);
  const partial = useMemo(() => (summary?.gaps || []).filter(g => g.status === 'partial'), [summary]);
  const coveredCount = (summary?.covered || []).length;

  // Drift
  const driftParts = [];
  if (summary?.pendingChanges?.newDiagnoses > 0)
    driftParts.push(`${summary.pendingChanges.newDiagnoses} new diagnosis${summary.pendingChanges.newDiagnoses > 1 ? 'es' : ''}`);
  if (summary?.pendingChanges?.newOrders > 0)
    driftParts.push(`${summary.pendingChanges.newOrders} new order${summary.pendingChanges.newOrders > 1 ? 's' : ''}`);

  // Changes — only worsening
  const worsened = useMemo(() => {
    if (!changes?.changes) return [];
    return changes.changes.filter(c => (STATUS_RANK[c.currentStatus] ?? 0) > (STATUS_RANK[c.previousStatus] ?? 0));
  }, [changes]);

  const tier = summary ? scoreTier(summary.score) : 'red';

  return (
    <div class="cpd">
      {/* ── Top bar ── */}
      <div class="cpd__topbar">
        {/* NO_TRACK */}
        <button class="cpd__back" onClick={onBack} title="Back to all patients">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>All Patients</span>
        </button>
        <div class="cpd__topbar-actions">
          {summary?.stale && <span class="cpd__stale">Stale</span>}
          {/* NO_TRACK */}
          <button class={`cpd__refresh ${refreshing ? 'cpd__refresh--spin' : ''}`} onClick={refresh} disabled={refreshing}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? 'Checking...' : 'Re-check'}
          </button>
          {/* NO_TRACK */}
          <button class="cpd__pcc-link" onClick={() => navigateToPatient(patient.externalPatientId || patient.patientId)} title="Open in PCC">
            Open in PCC
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Hero card ── */}
      <div class="cpd__hero">
        <div class="cpd__hero-left">
          <div class="cpd__name">{humanize(patient.patientName)}</div>
          <div class="cpd__meta">
            {patient.levelOfCare && <span>{patient.levelOfCare}</span>}
            {summary?.checkedAt && <span>Checked {new Date(summary.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </div>
        </div>
        {hasData && (
          <div class="cpd__hero-right">
            <div class={`cpd__score cpd__score--${tier}`}>{summary.score}<span>%</span></div>
            <div class="cpd__score-detail">
              {summary.diagnosisCovered}/{summary.diagnosisTotal} dx &middot; {summary.orderCovered}/{summary.orderTotal} orders
            </div>
            <div class="cpd__score-bar">
              <div class={`cpd__score-fill cpd__score-fill--${tier}`} style={{ width: `${summary.score}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Loading / Error / Empty ── */}
      {covLoading && (
        <div class="cpc__loading"><div class="cpc__spinner" /><span class="cpc__loading-text">Loading coverage...</span></div>
      )}
      {covError && !covLoading && (
        <div class="cpc__error"><div class="cpc__error-text">{covError}</div>{/* NO_TRACK */}<button class="cpc__retry-btn" onClick={covRetry}>Try Again</button></div>
      )}
      {neverChecked && !covLoading && !covError && (
        <div class="cpd__empty-state">
          <div class="cpd__empty-title">No coverage data yet</div>
          <div class="cpd__empty-sub">Coverage checks run automatically, or click Re-check above.</div>
        </div>
      )}

      {hasData && !covLoading && !covError && (
        <div class="cpd__body">

          {/* ── Drift alert ── */}
          {driftParts.length > 0 && (
            <div class="cpd__drift">
              <strong>Drift alert:</strong> {driftParts.join(' and ')} added since last coverage check. These haven't been reviewed yet.
            </div>
          )}

          {/* ── What Changed (only degradations) ── */}
          {worsened.length > 0 && (
            <div class="cpd__section">
              <div class="cpd__section-head cpd__section-head--red">What Got Worse</div>
              {worsened.map((c, i) => (
                <div class="cpd__change-row" key={i}>
                  <span class="cpd__change-arrow">{'\u2193'}</span>
                  <span class="cpd__change-code">{c.code}</span>
                  <span class="cpd__change-desc">{humanize(c.description)}</span>
                  <span class="cpd__change-transition">{c.previousStatus} {'\u2192'} {c.currentStatus}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Missing from care plan ── */}
          {missing.length > 0 && (
            <div class="cpd__section">
              <div class="cpd__section-head cpd__section-head--red">
                Missing From Care Plan
                <span class="cpd__section-count">{missing.length}</span>
              </div>
              <div class="cpd__section-hint">These have no care plan focus at all.</div>
              {missing.map((item, i) => (
                <DetailItem key={`m-${i}`} item={item} expanded={expandedItem === `m-${i}`} onToggle={() => setExpandedItem(expandedItem === `m-${i}` ? null : `m-${i}`)} />
              ))}
            </div>
          )}

          {/* ── Partially covered ── */}
          {partial.length > 0 && (
            <div class="cpd__section">
              <div class="cpd__section-head cpd__section-head--amber">
                Partially Covered
                <span class="cpd__section-count">{partial.length}</span>
              </div>
              <div class="cpd__section-hint">Has a related focus but it's incomplete or doesn't fully address the issue.</div>
              {partial.map((item, i) => (
                <DetailItem key={`p-${i}`} item={item} expanded={expandedItem === `p-${i}`} onToggle={() => setExpandedItem(expandedItem === `p-${i}` ? null : `p-${i}`)} />
              ))}
            </div>
          )}

          {/* ── Covered (collapsed) ── */}
          {coveredCount > 0 && (
            <div class="cpd__section cpd__section--muted">
              <div class="cpd__section-head cpd__section-head--green cpd__section-head--toggle" onClick={() => setShowCovered(!showCovered)}>
                <span>{showCovered ? '\u25bc' : '\u25b6'}</span>
                Covered
                <span class="cpd__section-count">{coveredCount}</span>
              </div>
              {showCovered && (
                <div class="cpd__covered-list">
                  {(summary.covered || []).map((item, i) => (
                    <div class="cpd__covered-row" key={i}>
                      <span class="cpd__covered-dot" />
                      {item.code && <span class="cpd__covered-code">{item.code}</span>}
                      <span class="cpd__covered-desc">{humanize(item.description)}</span>
                      <span class="cpd__covered-type">{item.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function ComplianceView({ data, loading, error, retry, trendingData, facilityName, orgSlug, onOpenCoverage }) {
  const [filter, setFilter] = useState('all');
  const [selectedPatient, setSelectedPatient] = useState(null);

  // ── "Needs Attention" (Stale / Declining / Never Checked) — disabled, may resurrect later ──
  // const [histories, setHistories] = useState(null);
  // const [historiesLoading, setHistoriesLoading] = useState(false);
  // const resolvedFacility = facilityName || data?.facilityName || '';
  // const resolvedOrg = orgSlug || data?.orgSlug || '';
  // useEffect(() => {
  //   if (!data?.patients?.length) return;
  //   setHistoriesLoading(true);
  //   fetchPatientHistories(resolvedFacility, resolvedOrg)
  //     .then(setHistories)
  //     .finally(() => setHistoriesLoading(false));
  // }, [data?.patients, resolvedFacility, resolvedOrg]);
  //
  // const { stalePatients, decliningPatients, uncheckedPatients } = useMemo(() => {
  //   if (!data?.patients) return { stalePatients: [], decliningPatients: [], uncheckedPatients: [] };
  //   const stale = data.patients.filter(p => p.stale);
  //   const unchecked = data.patients.filter(p => !p.hasResults);
  //   let declining = [];
  //   if (histories) {
  //     declining = data.patients.filter(p => {
  //       const scores = histories.get(p.patientId);
  //       if (!scores || scores.length < 2) return false;
  //       return scores[scores.length - 1].score < scores[0].score;
  //     });
  //   }
  //   return { stalePatients: stale, decliningPatients: declining, uncheckedPatients: unchecked };
  // }, [data, histories]);
  // const hasAttention = stalePatients.length > 0 || decliningPatients.length > 0 || uncheckedPatients.length > 0;
  //
  // Render block (paste below SummaryCards when re-enabling):
  // {hasAttention && (
  //   <div class="cpc-cv__attention">
  //     <div class="cpc-cv__attention-title">Needs Attention</div>
  //     <AttentionGroup label="New Gaps / Stale Data" accent="red" patients={stalePatients} histories={histories} historiesLoading={historiesLoading} onOpenCoverage={setSelectedPatient} defaultOpen={true} />
  //     <AttentionGroup label="Declining Coverage" accent="orange" patients={decliningPatients} histories={histories} historiesLoading={historiesLoading} onOpenCoverage={setSelectedPatient} defaultOpen={true} />
  //     <AttentionGroup label="Never Checked" accent="gray" patients={uncheckedPatients} histories={histories} historiesLoading={historiesLoading} onOpenCoverage={setSelectedPatient} defaultOpen={false} />
  //   </div>
  // )}

  // Filtered patient list
  const patients = useMemo(() => {
    if (!data?.patients) return [];
    let list = data.patients;
    if (filter === 'gaps') list = list.filter(p => p.hasResults && p.overallScore < 100);
    else if (filter === 'unchecked') list = list.filter(p => !p.hasResults);
    else if (filter === 'stale') list = list.filter(p => p.stale);
    return list;
  }, [data, filter]);

  if (loading) {
    return (
      <div class="cpc__loading">
        <div class="cpc__spinner" />
        <span class="cpc__loading-text">Loading compliance data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="cpc__error">
        <div class="cpc__error-text">{error}</div>
        {/* NO_TRACK */}
        <button class="cpc__retry-btn" onClick={retry}>Try Again</button>
      </div>
    );
  }

  if (!data) return null;

  // If a patient is selected, show inline detail
  if (selectedPatient) {
    return (
      <div class="cpc-cv">
        <PatientDetail
          patient={selectedPatient}
          facilityName={facilityName || data?.facilityName || ''}
          orgSlug={orgSlug || data?.orgSlug || ''}
          onBack={() => setSelectedPatient(null)}
        />
      </div>
    );
  }

  const uncheckedCount = data.patients?.filter(p => !p.hasResults).length || 0;
  const staleCount = data.summary?.patientsStale || 0;
  const gapCount = data.patients?.filter(p => p.hasResults && p.overallScore < 100).length || 0;

  return (
    <div class="cpc-cv">
      {/* Trend chart */}
      <TrendChart days={trendingData?.days} />

      {/* Summary cards */}
      <SummaryCards summary={data.summary} />

      {/* Filter pills */}
      <div class="cpc-cv__filters">
        {[
          { value: 'all', label: `All (${data.patients?.length || 0})` },
          { value: 'gaps', label: `With Gaps (${gapCount})` },
          { value: 'unchecked', label: `Unchecked (${uncheckedCount})` },
          ...(staleCount > 0 ? [{ value: 'stale', label: `Stale (${staleCount})` }] : []),
        ].map(f => (
          // NO_TRACK
          <button
            key={f.value}
            class={`cpc-cv__filter-pill${filter === f.value ? ' cpc-cv__filter-pill--active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Patient list */}
      <div class="cpc-cv__list">
        {patients.length === 0 ? (
          <div class="cpc__empty" style={{ padding: '24px' }}>
            No patients match this filter.
          </div>
        ) : (
          patients.map(p => (
            <PatientRow
              key={p.patientId}
              patient={p}
              onOpenCoverage={setSelectedPatient}
            />
          ))
        )}
      </div>
    </div>
  );
}
