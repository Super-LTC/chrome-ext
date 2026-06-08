/**
 * PDPMAnalyzer — focused per-assessment overlay.
 *
 * Opens when MDS bubble is clicked on a patient or MDS page.
 * Shows: HIPPS, revenue opportunity, would-change-HIPPS items,
 * pending queries, compliance.
 *
 * Layout: ~700px centered overlay.
 */
import { useState, useEffect, useRef } from 'preact/hooks';
import { usePDPMAnalyzer } from './hooks/usePDPMAnalyzer.js';
import { ComplianceCard } from './components/ComplianceCard.jsx';
import { ItemDetailView } from './components/ItemDetailView.jsx';
import { CertSection } from '../certifications/components/CertSection.jsx';
import { Selector } from '../../components/Selector.jsx';
import { formatPaymentRates } from '../../utils/payment.js';
import { track } from '../../utils/analytics.js';
import { MdsRunNow } from '../../super-menu/mds-run-now.js';

// ─── Assessment selector (patient scope — multiple assessments) ────────────────

function formatArdDate(ardDate) {
  if (!ardDate) return '';
  return new Date(ardDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cleanAssessmentType(raw) {
  if (!raw) return null;
  // Strip trailing slashes and whitespace: "Interim Payment /" → "Interim Payment"
  return raw.replace(/[\s/]+$/, '').trim() || null;
}

function AssessmentSelector({ assessments, selectedId, onChange }) {
  if (!assessments || assessments.length <= 1) return null;

  const options = assessments.map((a) => ({
    value: a.id,
    label: cleanAssessmentType(a.type) || cleanAssessmentType(a.assessmentType) || 'Assessment',
    subtitle: a.ardDate ? `ARD ${formatArdDate(a.ardDate)}` : undefined,
    badge: a.currentHipps || a.hipps || undefined,
  }));

  return (
    <Selector
      options={options}
      value={selectedId}
      onChange={onChange}
      align="right"
      ariaLabel="Select assessment"
    />
  );
}

// ─── MDS item label fallbacks ─────────────────────────────────────────────────
// Some items come back from the API with itemName === mdsItem (just the code).
// This map provides human-readable names for the most common ones.

const MDS_ITEM_LABELS = {
  'K0100': 'Swallowing Disorder',
  'K0200': 'Height & Weight',
  'K0520A': 'Nutritional Approach — Parenteral/IV',
  'K0520B': 'Nutritional Approach — Feeding Tube',
  'K0520C': 'Nutritional Approach — Mechanically Altered Diet',
  'K0710': 'Percent Intake by Artificial Route',
  'B0100': 'Comatose',
  'B0700': 'Makes Self Understood',
  'B0800': 'Ability to Understand Others',
  'C0100': 'Should Brief Interview for Mental Status Be Conducted',
  'C0200': 'Repetition of Three Words',
  'C0300': 'Temporal Orientation',
  'C0400': 'Recall',
  'C0500': 'BIMS Summary Score',
  'C0700': 'Short-term Memory OK',
  'C0800': 'Long-term Memory OK',
  'C0900': 'Memory/Recall Ability',
  'C1000': 'Cognitive Skills for Daily Decision Making',
  'D0100': 'Should Resident Mood Interview Be Conducted',
  'D0200': 'Resident Mood Interview (PHQ-2)',
  'D0300': 'PHQ-9 Total Severity Score',
  'D0350': 'Safety Notification — PHQ',
  'D0600': 'Staff Assessment of Resident Mood (PHQ-9-OV)',
  'E0100': 'Psychosis',
  'E0200': 'Behavioral Symptoms — Presence & Frequency',
  'E0800': 'Rejection of Care',
  'E0900': 'Wandering',
  'G0110': 'ADL Self-Performance',
  'G0120': 'ADL Support Provided — Bathing',
  'G0300': 'Balance During Transitions and Walking',
  'G0400': 'Functional Limitation in Range of Motion',
  'GG0130': 'Self-Care — Admission Performance',
  'GG0170': 'Mobility — Admission Performance',
  'H0100': 'Appliances — Indwelling Catheter',
  'H0200': 'Urinary Toileting Program',
  'H0300': 'Urinary Continence',
  'H0400': 'Bowel Continence',
  'H0500': 'Bowel Toileting Program',
  'H0600': 'Appliances — Ostomy',
  'I0020': 'Indicate Conditions or Diseases — Cancer',
  'I0100': 'Active Diagnoses — Cancer',
  'I0200': 'Active Diagnoses — Anemia',
  'I0300': 'Active Diagnoses — Atrial Fibrillation',
  'I0400': 'Active Diagnoses — Coronary Artery Disease',
  'I0500': 'Active Diagnoses — Deep Venous Thrombosis',
  'I0600': 'Active Diagnoses — Heart Failure',
  'I0700': 'Active Diagnoses — Hypertension',
  'I0900': 'Active Diagnoses — Peripheral Vascular Disease',
  'I2000': 'Active Diagnoses — Pneumonia',
  'I2100': 'Active Diagnoses — Septicemia',
  'I2300': 'Active Diagnoses — Urinary Tract Infection',
  'I2500': 'Active Diagnoses — Cerebrovascular Accident (CVA)',
  'I2900': 'Active Diagnoses — Hemiplegia/Hemiparesis',
  'I3700': 'Active Diagnoses — Anxiety Disorder',
  'I3800': 'Active Diagnoses — Depression',
  'I3900': 'Active Diagnoses — Schizophrenia',
  'I4000': 'Active Diagnoses — Psychotic Disorder',
  'I4200': 'Active Diagnoses — PTSD',
  'I4300': 'Active Diagnoses — Tourette Syndrome',
  'I4400': 'Active Diagnoses — Aphasia',
  'I4500': 'Active Diagnoses — Cerebral Palsy',
  'I4900': 'Active Diagnoses — Multi-Drug Resistant Organism',
  'I5100': 'Active Diagnoses — Quadriplegia',
  'I5200': 'Active Diagnoses — Additional Diagnosis',
  'I5250': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5300': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5350': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5400': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5500': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5550': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5600': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I5700': 'Active Diagnoses — Additional Diagnosis (cont.)',
  'I8000': 'Active Diagnoses — Additional Active Diagnosis',
  'J0100': 'Pain Management — Pain Screening',
  'J0200': 'Pain — Should Pain Assessment Be Conducted',
  'J0300': 'Pain Presence',
  'J0400': 'Pain Frequency',
  'J0500': 'Pain Effect on Function',
  'J0600': 'Pain Intensity — Numeric Rating Scale',
  'J0850': 'Pain Intensity — Verbal Descriptor Scale',
  'M0100': 'Determination of Skin Treatments',
  'M0150': 'Risk of Developing Pressure Ulcers',
  'M0210': 'Unhealed Pressure Ulcer(s)',
  'M0300': 'Current Number of Unhealed Pressure Ulcers',
  'M0610': 'Dimensions of Unhealed Stage 3 or 4 Pressure Ulcers',
  'M0700': 'Most Severe Tissue Type for Any Pressure Ulcer',
  'M0800': 'Worsening in Pressure Ulcer Status Since Prior Assessment',
  'M0900': 'Healed Pressure Ulcers',
  'M1030': 'Number of Venous and Arterial Ulcers',
  'M1040': 'Other Skin Ulcer or Open Lesion',
  'M1200': 'Skin & Ulcer Treatments',
  'N0415': 'High-Risk Drug Classes — Use & Indication',
  'O0100': 'Special Treatments, Procedures, and Programs',
  'O0250': 'Influenza Vaccine',
  'O0300': 'Pneumococcal Vaccine',
  'O0400': 'Therapies',
  'O0500': 'Restorative Nursing Programs',
  'O0600': 'Physician Examinations',
  'O0700': 'Physician Orders',
};

function resolveItemName(name, code) {
  // Strip bracket suffixes: K0520B[3] → K0520B
  const baseCode = code?.replace(/\[.*\]$/, '') || '';
  const baseName = name?.replace(/\[.*\]$/, '') || '';
  // If name looks like a code pattern (e.g. K0520B, K0520B[3]), prefer label lookup
  if (name && /^[A-Z]{1,2}\d+[A-Z]?(\[.*\])?$/.test(name)) {
    return MDS_ITEM_LABELS[baseName] || MDS_ITEM_LABELS[baseCode] || name;
  }
  // If name is genuinely different from the code, use it
  if (name && baseName !== baseCode) return name;
  return MDS_ITEM_LABELS[baseCode] || MDS_ITEM_LABELS[baseName] || name || code;
}

// ─── NTA impact formatting (state_rate → tier labels) ─────────────────────────

function ntaLevelToTier(level, payment) {
  if (!payment?.meta?.ntaTiers) return null;
  for (const t of payment.meta.ntaTiers) {
    if ((t.levels || []).includes(level)) return t.tier;
  }
  return null;
}

function formatNtaImpact(nta, payment) {
  if (payment?.mode === 'state_rate') {
    const curTier = ntaLevelToTier(nta.currentLevel, payment);
    const newTier = ntaLevelToTier(nta.newLevel, payment);
    if (curTier != null && newTier != null) return `NTA: Tier ${curTier} \u2192 Tier ${newTier}`;
    return 'NTA: tier upgrade';
  }
  return `NTA: ${nta.currentLevel} \u2192 ${nta.newLevel}`;
}

// ─── Would-change-HIPPS section ───────────────────────────────────────────────

function ImpactChips({ impact, payment, variant }) {
  const chips = [];
  if (impact?.nta?.wouldChangeLevel)
    chips.push({ label: 'NTA', text: formatNtaImpact(impact.nta, payment) });
  if (impact?.nursing?.wouldChangeGroup)
    chips.push({ label: 'Nursing', from: impact.nursing.currentPaymentGroup, to: impact.nursing.newPaymentGroup });
  if (impact?.slp?.wouldChangeGroup)
    chips.push({ label: 'SLP', from: impact.slp.currentGroup, to: impact.slp.newGroup });
  if (impact?.ptot?.wouldChangeGroup)
    chips.push({ label: 'PT/OT', from: impact.ptot.currentGroup, to: impact.ptot.newGroup });
  if (chips.length === 0) return null;
  const cls = variant === 'pending' ? 'pdpm-an__impact-chips pdpm-an__impact-chips--pending' : 'pdpm-an__impact-chips';
  return (
    <div class={cls}>
      {chips.map((c, i) => (
        <span key={i} class="pdpm-an__impact-chip">
          <span class="pdpm-an__impact-chip-k">{c.label}</span>
          <span class="pdpm-an__impact-chip-v">{c.text || `${c.from} → ${c.to}`}</span>
        </span>
      ))}
    </div>
  );
}

function OpportunityCallout({ data, onItemClick }) {
  const enhancedDetections = data?.enhancedDetections || [];
  const payment = data?.payment;
  const drivers = enhancedDetections.filter(
    d => d.wouldChangeHipps && d.solverStatus !== 'query_sent' && d.solverStatus !== 'awaiting_response'
      && d.solverStatus !== 'dont_code' && d.userDecision?.decision !== 'disagree'
  );
  if (drivers.length === 0) return null;

  return (
    <div class="pdpm-an__opps">
      {drivers.map((d, i) => {
        const displayCode = d.mdsItem?.startsWith('I8000:') ? 'I8000' : d.mdsItem;
        return (
          <div
            key={i}
            class="pdpm-an__opp-row"
            onClick={() => onItemClick && onItemClick(d)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemClick?.(d); } }}
          >
            <span class="pdpm-an__opp-icon">{'\u26A1'}</span>
            <span class="pdpm-an__opp-code">{displayCode}</span>
            <span class="pdpm-an__opp-name">{resolveItemName(d.itemName, d.mdsItem)}</span>
            <ImpactChips impact={d.impact} payment={payment} />
            <span class="pdpm-an__opp-review">Review</span>
            <svg class="pdpm-an__opp-go" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        );
      })}
    </div>
  );
}

// ─── Documentation risks section ─────────────────────────────────────────────

function DocRisksSection({ data, onItemClick, collapsed, onToggleCollapse }) {
  const enhancedDetections = data?.enhancedDetections || [];
  const risks = enhancedDetections.filter(
    d => d.solverStatus === 'dont_code' && (d.diagnosisPassed === false || d.activeStatusPassed === false)
      && d.userDecision?.decision !== 'disagree'
  );
  if (risks.length === 0) return null;

  return (
    <div class="pdpm-an__card pdpm-an__card--doc-risk">
      <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
        <span class="pdpm-an__card-icon">{'\u26A0'}</span>
        <span class="pdpm-an__card-title">Documentation Risks</span>
        <span class="pdpm-an__card-badge pdpm-an__card-badge--amber">{risks.length}</span>
        <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      {!collapsed && <div class="pdpm-an__doc-risk-list">
        {risks.map((d, i) => {
          const displayCode = d.mdsItem?.startsWith('I8000:') ? 'I8000' : d.mdsItem;
          const badges = [];
          if (d.diagnosisPassed === false) badges.push('No physician diagnosis found');
          if (d.activeStatusPassed === false) badges.push('No active treatment order found');
          return (
            <div
              key={i}
              class="pdpm-an__doc-risk-item"
              onClick={() => onItemClick && onItemClick(d)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemClick && onItemClick(d); } }}
            >
              <div class="pdpm-an__doc-risk-top">
                <span class="pdpm-an__driver-section">{displayCode}</span>
                <span class="pdpm-an__driver-text">{resolveItemName(d.itemName, d.mdsItem)}</span>
              </div>
              <div class="pdpm-an__doc-risk-badges">
                {badges.map((b, j) => (
                  <span key={j} class="pdpm-an__doc-risk-badge">{b}</span>
                ))}
              </div>
              {d.rationale && <div class="pdpm-an__doc-risk-rationale">{d.rationale}</div>}
            </div>
          );
        })}
      </div>}
    </div>
  );
}

// ─── Pending queries section ──────────────────────────────────────────────────

function relativeDate(sentAt) {
  if (!sentAt) return 'not yet sent';
  const days = Math.floor((Date.now() - new Date(sentAt)) / 86400000);
  return days === 0 ? 'sent today' : `sent ${days}d ago`;
}

function PendingQueriesSection({ data, onQueryClick, collapsed, onToggleCollapse }) {
  const queries = data?.outstandingQueries || [];
  const payment = data?.payment;
  const pending = queries.filter(
    q => q.status === 'sent' || q.status === 'pending' || q.status === 'awaiting_response'
  );
  if (pending.length === 0) return null;

  return (
    <div class="pdpm-an__card pdpm-an__card--queries">
      <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
        <span class="pdpm-an__card-icon">{'\u2709'}</span>
        <span class="pdpm-an__card-title">Pending Queries</span>
        <span class="pdpm-an__card-badge pdpm-an__card-badge--pending">{pending.length}</span>
        <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      {!collapsed && <ul class="pdpm-an__query-list">
        {pending.map((q, i) => {
          const ci = q.pdpmImpact?.componentImpacts;
          const impact = ci ? { slp: ci.slp, nta: ci.nta, nursing: ci.nursing, ptot: ci.ptot } : null;
          const isSent = q.status === 'sent' || q.status === 'awaiting_response';
          return (
            <li
              key={i}
              class="pdpm-an__query-item pdpm-an__query-item--clickable"
              onClick={() => onQueryClick && onQueryClick(q)}
              role="button"
              tabIndex={0}
            >
              <div class="pdpm-an__query-top">
                <div class="pdpm-an__query-main">
                  {q.mdsItem && <span class="pdpm-an__query-code">{q.mdsItem}</span>}
                  <span class="pdpm-an__query-text">{resolveItemName(q.mdsItemName, q.mdsItem)}</span>
                </div>
                <span class={`pdpm-an__query-status-pill${isSent ? '' : ' pdpm-an__query-status-pill--draft'}`}>
                  {isSent ? relativeDate(q.sentAt) : 'draft'}
                </span>
              </div>
              {impact && <ImpactChips impact={impact} payment={payment} variant="pending" />}
            </li>
          );
        })}
      </ul>}
    </div>
  );
}

// ─── Recently signed queries ─────────────────────────────────────────────────

function signedRelDate(dateStr) {
  if (!dateStr) return '';
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function RecentlySignedSection({ data, onQueryClick, collapsed, onToggleCollapse }) {
  const recentlySigned = data?.recentlySigned || data?.signedQueries || data?.completedQueries || [];
  const signed = recentlySigned.filter(
    q => q.status === 'signed' || q.status === 'completed' || q.status === 'resolved' || q.signedAt
  );
  if (signed.length === 0) return null;

  const needsCodingCount = signed.filter(q => q.mdsItemCoded === false).length;

  return (
    <div class="pdpm-an__card pdpm-an__card--signed">
      <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
        <span class="pdpm-an__card-icon">{'\u2713'}</span>
        <span class="pdpm-an__card-title">Recently Signed</span>
        <span class="pdpm-an__card-badge">{signed.length}</span>
        {needsCodingCount > 0 && (
          <span class="pdpm-an__card-badge pdpm-an__card-badge--coding">{needsCodingCount} need coding</span>
        )}
        <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      {!collapsed && (
        <ul class="pdpm-an__query-list">
          {signed.map((q, i) => {
            const needsCoding = q.mdsItemCoded === false;
            const coded = q.mdsItemCoded === true;
            const dateStr = signedRelDate(q.signedAt || q.completedAt);
            return (
              <li
                key={i}
                class={`pdpm-an__signed-item${needsCoding ? ' pdpm-an__signed-item--needs-coding' : ''} pdpm-an__signed-item--clickable`}
                onClick={() => onQueryClick && onQueryClick(q)}
                role="button"
                tabIndex={0}
              >
                {q.mdsItem && <span class="pdpm-an__query-code pdpm-an__query-code--signed">{q.mdsItem}</span>}
                <span class="pdpm-an__query-text">{resolveItemName(q.mdsItemName, q.mdsItem)}</span>
                <div class="pdpm-an__signed-badges">
                  {needsCoding && <span class="pdpm-an__signed-badge pdpm-an__signed-badge--coding">Needs Coding</span>}
                  {coded && <span class="pdpm-an__signed-badge pdpm-an__signed-badge--coded">Coded</span>}
                  {dateStr && <span class="pdpm-an__query-date">{dateStr}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Component breakdown (expandable gamified rows) ──────────────────────────

function NtaProgressBar({ gap, payment }) {
  const n = gap?.nta;
  if (!n || n.currentPoints == null || n.pointsNeeded == null) return null;

  // For state_rate, show tier-based label instead of CMS level code
  let targetLabel;
  if (payment?.mode === 'state_rate') {
    const currentTier = payment.current?.ntaTier?.tier;
    const nextTier = currentTier != null ? currentTier - 1 : null;
    targetLabel = (nextTier != null && nextTier >= 1) ? `Tier ${nextTier}` : null;
  } else {
    targetLabel = n.nextLevel || null;
  }

  if (!targetLabel && n.pointsNeeded <= 0) return null;

  const total = n.currentPoints + n.pointsNeeded;
  const pct = total > 0 ? Math.round((n.currentPoints / total) * 100) : 0;

  return (
    <div class="pdpm-an__progress-row">
      <div class="pdpm-an__progress-bar">
        <div class="pdpm-an__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span class="pdpm-an__progress-label">
        {targetLabel
          ? `${n.currentPoints} / ${total} pts to ${targetLabel}`
          : `${n.currentPoints} pts`
        }
      </span>
    </div>
  );
}

function NtaLevelTrack({ nta, potentialLevel, payment }) {
  if (!nta) return null;

  // State rate: fall back to simple bar (tiers don't map to CMS levels)
  if (payment?.mode === 'state_rate') {
    if (nta.currentPoints == null || nta.pointsNeeded == null) return null;
    const currentTier = payment.current?.ntaTier?.tier;
    const nextTier = currentTier != null ? currentTier - 1 : null;
    const targetLabel = (nextTier != null && nextTier >= 1) ? `Tier ${nextTier}` : null;
    if (!targetLabel && nta.pointsNeeded <= 0) return null;
    const total = nta.currentPoints + nta.pointsNeeded;
    const pct = total > 0 ? Math.round((nta.currentPoints / total) * 100) : 0;
    return (
      <div class="pdpm-an__nta-inline">
        <div class="pdpm-an__nta-sbar">
          <div class="pdpm-an__nta-sfill" style={{ width: `${pct}%` }} />
        </div>
        <span class="pdpm-an__nta-slbl">
          {nta.pointsNeeded === 1 ? '1 pt' : `${nta.pointsNeeded} pts`} away{targetLabel ? ` from ${targetLabel}` : ''}
        </span>
      </div>
    );
  }

  // CMS mode: read levels from API data (ordered low → high)
  // Expected shape: nta.levels = [{ code: 'NE', minPoints: 0 }, { code: 'ND', minPoints: 3 }, ...]
  const levels = nta.levels;
  if (!levels || levels.length < 2 || !nta.currentLevel) return null;

  const currentIdx = levels.findIndex(l => l.code === nta.currentLevel);
  if (currentIdx === -1) return null;

  const targetLevel = potentialLevel || nta.nextLevel;
  const targetIdx = targetLevel ? levels.findIndex(l => l.code === targetLevel) : -1;
  if (targetIdx <= currentIdx) return null;

  const lvlPct = (i) => (i / (levels.length - 1)) * 100;
  const curPct = Math.max(lvlPct(currentIdx), 4);
  const tgtPct = lvlPct(targetIdx);
  const gainPct = tgtPct - curPct;
  const away = nta.pointsNeeded;
  const nextLabel = nta.nextLevel;

  return (
    <div class="pdpm-an__nta-track">
      <div class="pdpm-an__nta-bar">
        <div class="pdpm-an__nta-bar-cur" style={{ width: `${curPct}%` }} />
        <div class="pdpm-an__nta-bar-gain" style={{ left: `${curPct}%`, width: `${gainPct}%` }} />
      </div>
      <div class="pdpm-an__nta-lvls">
        {levels.map((l, i) => (
          <span key={l.code} class={`pdpm-an__nta-lvl${i === currentIdx ? ' pdpm-an__nta-lvl--cur' : ''}${i === targetIdx ? ' pdpm-an__nta-lvl--tgt' : ''}`}>
            {l.code}
          </span>
        ))}
      </div>
      {away != null && away > 0 && nextLabel && (
        <span class="pdpm-an__nta-away">
          {away === 1 ? '1 pt' : `${away} pts`} {'\u2192'} {nextLabel}
        </span>
      )}
    </div>
  );
}

function SlpTierIndicator({ gap }) {
  const s = gap?.slp;
  if (!s || (s.tier1Met == null && s.tier2Met == null)) return null;
  const tier2Total = (s.tier2Met ?? 0) + (s.tier2Needed ?? 0);
  return (
    <div class="pdpm-an__tier-row">
      {s.tier1Met != null && (
        <span class="pdpm-an__tier-segment">
          Tier 1: {Array.from({ length: s.tier1Met }, (_, i) => (
            <span key={i} class="pdpm-an__tier-dot pdpm-an__tier-dot--filled">{'\u25CF'}</span>
          ))} {s.tier1Met} met
        </span>
      )}
      {(s.tier2Met != null || s.tier2Needed != null) && (
        <span class="pdpm-an__tier-segment">
          {s.tier1Met != null && <span class="pdpm-an__tier-sep">{'\u00b7'}</span>}
          Tier 2: {Array.from({ length: s.tier2Met ?? 0 }, (_, i) => (
            <span key={`f${i}`} class="pdpm-an__tier-dot pdpm-an__tier-dot--filled">{'\u25CF'}</span>
          ))}{Array.from({ length: s.tier2Needed ?? 0 }, (_, i) => (
            <span key={`e${i}`} class="pdpm-an__tier-dot pdpm-an__tier-dot--empty">{'\u25CB'}</span>
          ))} {s.tier2Met ?? 0}/{tier2Total}
        </span>
      )}
    </div>
  );
}

function buildCapturedFromCalculation(calc) {
  const result = { ptot: [], slp: [], nursing: [], nta: [] };
  if (!calc) return result;

  // NTA: contributingConditions → { mdsItem, itemName, helpText, pointsAdded }
  if (calc.nta?.contributingConditions) {
    console.log('[buildCapturedFromCalculation] nta.contributingConditions raw:', calc.nta.contributingConditions);
    result.nta = calc.nta.contributingConditions.map(c => {
      // Try every plausible source for the per-condition disambiguator the
      // backend wants in `categoryKey` (e.g. "NTA:18" for I8000 sub-items).
      const categoryKey =
        c.categoryKey ||
        c.mdsColumn ||
        c.column ||
        (c.categoryNumber != null ? `NTA:${c.categoryNumber}` : null) ||
        (c.comorbidityNumber != null ? `NTA:${c.comorbidityNumber}` : null) ||
        null;
      return {
        mdsItem: c.mdsItem,
        categoryKey,
        itemName: c.categoryName,
        helpText: `+${c.points} pts (${c.categoryName})`,
        pointsAdded: c.points,
        _raw: c, // for debugging — drop once stable
      };
    });
  }

  // SLP: comorbidities where isPresent + tier2 flags
  if (calc.slp) {
    const slpItems = [];
    // Tier 2 items
    if (calc.slp.tier2?.hasSwallowingDisorder) {
      slpItems.push({ mdsItem: 'K0100A', itemName: 'Swallowing Disorder', helpText: 'Tier 2: swallowing' });
    }
    if (calc.slp.tier2?.hasMechanicallyAlteredDiet) {
      slpItems.push({ mdsItem: 'K0520C1', itemName: 'Mechanically Altered Diet', helpText: 'Tier 2: mechanically altered diet' });
    }
    // Tier 1 comorbidities
    if (calc.slp.comorbidities) {
      for (const c of calc.slp.comorbidities) {
        if (c.isPresent && c.comorbidityNumber <= 100) {
          slpItems.push({ mdsItem: c.mdsItem, itemName: c.name, helpText: `Tier 1 comorbidity: ${c.name}` });
        }
      }
    }
    // Cognitive impairment
    if (calc.slp.tier1?.hasCognitiveImpairment) {
      slpItems.push({ mdsItem: 'C0500', itemName: 'Cognitive Impairment', helpText: 'Tier 1: cognitive impairment' });
    }
    if (calc.slp.tier1?.hasAcuteNeuro) {
      slpItems.push({ mdsItem: 'I4500', itemName: 'Acute Neurological', helpText: 'Tier 1: acute neurological condition' });
    }
    result.slp = slpItems;
  }

  // Nursing: conditionsEvaluated where isMet
  if (calc.nursing?.conditionsEvaluated) {
    const CAT_LABELS = { ES: 'Extensive Services', SCH: 'Special Care High', SCL: 'Special Care Low', CC: 'Clinically Complex' };
    result.nursing = calc.nursing.conditionsEvaluated
      .filter(c => c.isMet)
      .map(c => ({
        mdsItem: c.triggeringItems?.[0] || '',
        itemName: c.subcategoryName,
        helpText: `${CAT_LABELS[c.mainCategory] || c.mainCategory}: ${c.subcategoryName}`,
      }));
  }

  // PT/OT: no individual items, just clinical category (handled via comp.detail)

  return result;
}

function ComponentBreakdown({ data, payment, onItemClick, collapsed, onToggleCollapse }) {
  const [expandedKey, setExpandedKey] = useState(null);

  // Track when a component breakdown is opened. Component keys (ptot/slp/nursing/nta)
  // are categorical reference data — no PHI.
  const prevExpandedRef = useRef(null);
  useEffect(() => {
    if (expandedKey && expandedKey !== prevExpandedRef.current) {
      track('pdpm_breakdown_viewed', { component: expandedKey });
    }
    prevExpandedRef.current = expandedKey;
  }, [expandedKey]);

  const gap = data?.gapAnalysis || {};
  const decoded = data?.hippsDecoded || {};
  const potentialDecoded = data?.potentialHippsDecoded || {};
  const allDetections = data?.enhancedDetections || [];
  const captured = buildCapturedFromCalculation(data?.calculation);
  // Surface the I8000 / NTA detections so we can see what disambiguator
  // (categoryKey / mdsColumn / categoryNumber) the backend exposes per row.
  if (typeof window !== 'undefined' && !window.__loggedDetections) {
    const i8000s = allDetections.filter(d => d?.mdsItem === 'I8000');
    if (i8000s.length) console.log('[PDPMAnalyzer] I8000 detections:', i8000s);
    window.__loggedDetections = true;
  }

  const components = [
    {
      label: 'PT/OT', key: 'ptot',
      currentCode: decoded.ptot?.code,
      potential: potentialDecoded.ptot?.code,
      name: decoded.ptot?.name,
      detail: gap.ptot?.clinicalCategoryName,
      items: gap.ptot?.detectionsToHelp || [],
      captured: captured.ptot,
    },
    {
      label: 'SLP', key: 'slp',
      currentCode: decoded.slp?.code,
      potential: potentialDecoded.slp?.code,
      name: decoded.slp?.name,
      detail: gap.slp?.clinicalCategoryName,
      items: gap.slp?.detectionsToHelp || [],
      captured: captured.slp,
    },
    {
      label: 'Nursing', key: 'nursing',
      currentCode: decoded.nursing?.code,
      potential: potentialDecoded.nursing?.code,
      name: decoded.nursing?.name,
      detail: gap.nursing?.qualifyingSubcategoryName,
      items: gap.nursing?.detectionsToHelp || [],
      captured: captured.nursing,
    },
    {
      label: 'NTA', key: 'nta',
      currentCode: payment?.mode === 'state_rate'
        ? (payment.current?.ntaTier?.tier != null ? `Tier ${payment.current.ntaTier.tier}` : decoded.nta?.code)
        : decoded.nta?.code,
      potential: payment?.mode === 'state_rate'
        ? (payment.potential?.ntaTier?.tier != null && payment.potential.ntaTier.tier !== payment.current?.ntaTier?.tier
            ? `Tier ${payment.potential.ntaTier.tier}` : null)
        : potentialDecoded.nta?.code,
      name: payment?.mode === 'state_rate'
        ? (payment.current?.ntaTier?.label || decoded.nta?.name)
        : decoded.nta?.name,
      detail: payment?.mode === 'state_rate'
        ? (payment.current?.ntaTier?.pointRange || gap.nta?.clinicalCategoryName)
        : gap.nta?.clinicalCategoryName,
      items: gap.nta?.detectionsToHelp || [],
      captured: captured.nta,
      ntaProgress: gap.nta,
    },
  ];

  const hasAny = components.some(c => c.currentCode || c.potential);
  if (!hasAny) return null;

  return (
    <div class="pdpm-an__card">
      <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
        <span class="pdpm-an__card-icon">{'\u2630'}</span>
        <span class="pdpm-an__card-title">PDPM Components</span>
        <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      {!collapsed && <div class="pdpm-an__components">
        {components.map(comp => {
          if (!comp.currentCode && !comp.potential) return null;
          const improved = comp.potential && comp.currentCode && comp.potential !== comp.currentCode;
          const hasItems = comp.items.length > 0;
          const hasCaptured = comp.captured.length > 0;
          const isExpanded = expandedKey === comp.key;
          const toggleExpand = () => { if (hasItems || hasCaptured || comp.detail) setExpandedKey(isExpanded ? null : comp.key); };
          const isClickable = hasItems || hasCaptured || comp.detail;

          return (
            <div
              key={comp.key}
              class={`pdpm-an__comp-row${improved ? ' pdpm-an__comp-row--improved' : ''}${isExpanded ? ' pdpm-an__comp-row--expanded' : ''}`}
            >
              <div
                class={`pdpm-an__comp-clickwrap${isClickable ? ' pdpm-an__comp-clickwrap--clickable' : ''}`}
                onClick={isClickable ? toggleExpand : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); } } : undefined}
              >
                <div class={`pdpm-an__comp-header${isClickable ? ' pdpm-an__comp-header--clickable' : ''}`}>
                  <span class="pdpm-an__comp-label">{comp.label}</span>
                  <span class="pdpm-an__comp-name">{comp.name || '\u2014'}</span>
                  {comp.currentCode && (
                    <span class="pdpm-an__comp-code">{comp.currentCode}</span>
                  )}
                  {improved && (
                    <span class="pdpm-an__comp-change">
                      {'\u2192'} {comp.potential}
                    </span>
                  )}
                  {isClickable && (
                    <svg class={`pdpm-an__comp-chevron${isExpanded ? ' pdpm-an__comp-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M4 5.5L7 8.5L10 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  )}
                </div>

                {comp.ntaProgress && <NtaLevelTrack nta={comp.ntaProgress} potentialLevel={comp.potential} payment={payment} />}
              </div>

              {isExpanded && (
                <div class="pdpm-an__comp-detail">
                  {comp.detail && <div class="pdpm-an__comp-qualifier">{comp.detail}</div>}
                  {comp.key === 'slp' && <SlpTierIndicator gap={gap} />}
                  {hasItems && (
                    <>
                      {hasCaptured && <div class="pdpm-an__captured-label pdpm-an__captured-label--opps">Opportunities</div>}
                      <div class="pdpm-an__ci-list">
                        {comp.items.map((d, i) => {
                          const code = d.mdsItem?.startsWith('I8000:') ? 'I8000' : d.mdsItem;
                          const handleClick = (e) => {
                            e.stopPropagation();
                            if (!onItemClick) return;
                            const match = allDetections.find(ed => ed.mdsItem === d.mdsItem);
                            if (match) onItemClick(match);
                          };
                          return (
                            <div
                              key={i}
                              class="pdpm-an__ci-row"
                              onClick={handleClick}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}
                            >
                              <span class="pdpm-an__ci-code">{code}</span>
                              <div class="pdpm-an__ci-body">
                                <span class="pdpm-an__ci-name">{resolveItemName(d.itemName, d.mdsItem)}</span>
                                {d.helpText && <span class="pdpm-an__ci-help">{d.helpText}</span>}
                              </div>
                              {d.pointsAdded != null && (
                                <span class="pdpm-an__ci-impact pdpm-an__ci-impact--pts">+{d.pointsAdded} pts</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {hasCaptured && (
                    <div class="pdpm-an__captured">
                      {(hasItems || comp.detail) && <div class="pdpm-an__captured-label">Currently captured</div>}
                      <div class="pdpm-an__ci-list">
                        {comp.captured.map((d, i) => {
                          const code = d.mdsItem?.startsWith('I8000:') ? 'I8000' : d.mdsItem;
                          const handleClick = (e) => {
                            e.stopPropagation();
                            if (!onItemClick) return;
                            console.log('[ComponentBreakdown] captured click:', d);
                            // Prefer match by both mdsItem AND categoryKey when available,
                            // so multiple I8000 rows resolve to their own detection.
                            let match = null;
                            if (d.categoryKey) {
                              match = allDetections.find(
                                ed => ed.mdsItem === d.mdsItem &&
                                  (ed.categoryKey === d.categoryKey ||
                                   ed.mdsColumn === d.categoryKey)
                              );
                            }
                            if (!match) match = allDetections.find(ed => ed.mdsItem === d.mdsItem);
                            // Forward categoryKey onto whatever we end up with.
                            const enriched = match
                              ? { ...match, categoryKey: d.categoryKey || match.categoryKey || match.mdsColumn || null }
                              : { ...d };
                            console.log('[ComponentBreakdown] captured click → forwarding:', enriched);
                            onItemClick(enriched);
                          };
                          return (
                            <div
                              key={`cap-${i}`}
                              class="pdpm-an__ci-row pdpm-an__ci-row--captured"
                              onClick={handleClick}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}
                            >
                              <span class="pdpm-an__ci-check">{'\u2713'}</span>
                              <span class="pdpm-an__ci-code">{code}</span>
                              <div class="pdpm-an__ci-body">
                                <span class="pdpm-an__ci-name">{resolveItemName(d.itemName, d.mdsItem)}</span>
                                {d.helpText && <span class="pdpm-an__ci-help">{d.helpText}</span>}
                              </div>
                              {d.pointsAdded != null && (
                                <span class="pdpm-an__ci-impact pdpm-an__ci-impact--pts">+{d.pointsAdded} pts</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
}

// ─── Clinical Scores (BIMS, PHQ-9, NFS, PT/OT Functional) ───────────────────

const SEVERITY_COLORS = {
  // BIMS — lower = worse
  'Intact': '#059669', 'Mildly Impaired': '#d97706', 'Moderately/Severely Impaired': '#ef4444',
  // PHQ-9 — higher = worse
  'None/Minimal': '#059669', 'Mild': '#84cc16', 'Moderate': '#d97706',
  'Moderately Severe': '#ea580c', 'Severe': '#ef4444',
  // NFS
  'Low Needs': '#059669', 'Medium Needs': '#d97706', 'High Needs': '#ef4444',
  // PT/OT
  'Fully Independent': '#059669', 'Moderate/Independent': '#84cc16',
  'Dependent': '#d97706', 'Most Dependent': '#ef4444',
};

function ScoreCard({ value, max, label, severity, impact, extra }) {
  const color = SEVERITY_COLORS[severity] || '#9ca3af';
  const pct = (value != null && max > 0) ? Math.round((value / max) * 100) : 0;
  const r = 20, circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div class="pdpm-an__sc" title={impact || ''}>
      <div class="pdpm-an__sc-ring">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r={r} fill="none" stroke="#f1f5f9" stroke-width="4" />
          {value != null && (
            <circle cx="26" cy="26" r={r} fill="none" stroke={color} stroke-width="4"
              stroke-dasharray={circ} stroke-dashoffset={offset}
              stroke-linecap="round" transform="rotate(-90 26 26)" />
          )}
        </svg>
        <span class="pdpm-an__sc-val">{value != null ? value : '\u2014'}</span>
      </div>
      <span class="pdpm-an__sc-label">{label}</span>
      {severity && (
        <span class="pdpm-an__sc-severity" style={{ color }}>{severity}</span>
      )}
      {extra && <span class="pdpm-an__sc-extra">{extra}</span>}
    </div>
  );
}

const GG_ITEMS = [
  { key: 'eating', label: 'Eating', code: 'GG0130A', scope: 'both' },
  { key: 'oralHygiene', label: 'Oral Hygiene', code: 'GG0130B', scope: 'ptot' },
  { key: 'toiletingHygiene', label: 'Toileting Hygiene', code: 'GG0130C', scope: 'both' },
  { key: 'sittingToLying', label: 'Sitting to Lying', code: 'GG0170B', scope: 'both' },
  { key: 'lyingToSitting', label: 'Lying to Sitting', code: 'GG0170C', scope: 'both' },
  { key: 'sitToStand', label: 'Sit to Stand', code: 'GG0170D', scope: 'both' },
  { key: 'transfer', label: 'Transfer', code: 'GG0170E', scope: 'both' },
  { key: 'toiletTransfer', label: 'Toilet Transfer', code: 'GG0170F', scope: 'both' },
  { key: 'walking50', label: 'Walking 50ft', code: 'GG0170J', scope: 'ptot' },
  { key: 'walking150', label: 'Walking 150ft', code: 'GG0170K', scope: 'ptot' },
];

function GGBreakdown({ breakdown }) {
  if (!breakdown) return null;
  const sc = breakdown.selfCare || {};
  const mob = breakdown.mobility || {};
  const all = { ...sc, ...mob };

  return (
    <div class="pdpm-an__gg">
      <div class="pdpm-an__gg-header">
        <span class="pdpm-an__gg-title">GG Functional Items</span>
        <span class="pdpm-an__gg-total">Total: {breakdown.total}/24</span>
      </div>
      <div class="pdpm-an__gg-grid">
        <span class="pdpm-an__gg-th">Item</span>
        <span class="pdpm-an__gg-th">Score</span>
        <span class="pdpm-an__gg-th">Used In</span>
        {GG_ITEMS.map(item => {
          const val = all[item.key];
          return (
            <>
              <span class="pdpm-an__gg-cell">{item.label}</span>
              <span class="pdpm-an__gg-cell pdpm-an__gg-cell--score">{val != null ? val : '\u2014'}</span>
              <span class={`pdpm-an__gg-cell pdpm-an__gg-scope${item.scope === 'ptot' ? ' pdpm-an__gg-scope--ptot' : ''}`}>
                {item.scope === 'ptot' ? 'PT/OT only' : 'Nursing + PT/OT'}
              </span>
            </>
          );
        })}
      </div>
      {/* Computed averages */}
      <div class="pdpm-an__gg-avgs">
        {mob.bedMobilityAverage != null && <span>Bed Mobility Avg: {mob.bedMobilityAverage}</span>}
        {mob.transferAverage != null && <span>Transfer Avg: {mob.transferAverage}</span>}
        {mob.walkingAverage != null && <span>Walking Avg: {mob.walkingAverage}</span>}
      </div>
    </div>
  );
}

// ─── MDS Section Progress ─────────────────────────────────────────────────────

function SectionProgressCard({ data, collapsed, onToggleCollapse }) {
  const sp = data?.sectionProgress;
  if (!sp || !sp.total) return null;

  const { sections = {} } = sp;
  const entries = Object.entries(sections);

  // Compute counts from actual section statuses (API summary counts can be stale)
  let done = 0, inProgress = 0, notStarted = 0;
  for (const [, status] of entries) {
    if (status === 'Complete' || status === 'Completed' || status === 'Locked') done++;
    else if (status === 'In Progress') inProgress++;
    else notStarted++;
  }
  const total = entries.length || sp.total || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div class="pdpm-an__card">
      <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
        <span class="pdpm-an__card-icon">{'\uD83D\uDCCB'}</span>
        <span class="pdpm-an__card-title">MDS Sections</span>
        <span class="pdpm-an__card-badge">{pct}%</span>
        <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      {!collapsed && (
        <div class="pdpm-an__sp-body">
          <div class="pdpm-an__sp-bar-row">
            <div class="pdpm-an__sp-bar">
              <div class="pdpm-an__sp-fill" style={{ width: `${pct}%` }} />
            </div>
            <div class="pdpm-an__sp-counts">
              {done > 0 && <span class="pdpm-an__sp-count pdpm-an__sp-count--done">{done} done</span>}
              {inProgress > 0 && <span class="pdpm-an__sp-count pdpm-an__sp-count--wip">{inProgress} in progress</span>}
              {notStarted > 0 && <span class="pdpm-an__sp-count pdpm-an__sp-count--todo">{notStarted} not started</span>}
            </div>
          </div>
          {entries.length > 0 && (
            <div class="pdpm-an__sp-tags">
              {entries.map(([code, status]) => {
                const isDone = status === 'Complete' || status === 'Completed';
                const isLocked = status === 'Locked';
                const isWip = status === 'In Progress';
                const cls = isDone || isLocked ? 'pdpm-an__sp-tag--done'
                  : isWip ? 'pdpm-an__sp-tag--wip'
                  : 'pdpm-an__sp-tag--todo';
                return (
                  <span key={code} class={`pdpm-an__sp-tag ${cls}`} title={status}>
                    {(isDone || isLocked) && <span class="pdpm-an__sp-tag-check">{'\u2713'}</span>}
                    {code}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClinicalScores({ data, collapsed, onToggleCollapse }) {
  const [showGG, setShowGG] = useState(false);
  const scores = data?.scores;
  if (!scores) return null;

  const bims = scores.bims;
  const phq = scores.phq9;
  const nfs = scores.nursingFunctionalScore;
  const ptot = scores.ptotFunctionalScore;
  const gg = scores.functionalScoreBreakdown;

  if (!bims && !phq && !nfs && !ptot) return null;

  // PHQ-9: use resident score unless null/99, then fall back to staff
  const phqVal = (phq?.score != null && phq.score !== 99) ? phq.score : phq?.staffAssessmentScore;
  const phqExtra = (phq?.score == null || phq?.score === 99) && phq?.staffAssessmentScore != null
    ? '(Staff assessment)' : null;

  // Threshold banners
  const thresholds = [];
  if (bims?.meetsImpairmentThreshold) thresholds.push({ color: '#d97706', text: bims.pdpmImpact || 'Cognitive impairment detected \u2014 affects SLP and Nursing classification' });
  if (phq?.meetsDepressionThreshold) thresholds.push({ color: '#ea580c', text: phq.pdpmImpact || 'Depression threshold met \u2014 upgrades Nursing payment group' });
  if (nfs?.meetsBSCPThreshold) thresholds.push({ color: '#6366f1', text: nfs.bscpNote || 'NFS \u2265 11 \u2014 BSCP category eligible' });

  return (
    <div class="pdpm-an__card">
      <div class="pdpm-an__card-header pdpm-an__card-header--collapsible" onClick={onToggleCollapse} role="button" tabIndex={0}>
        <span class="pdpm-an__card-icon">{'\uD83E\uDDE0'}</span>
        <span class="pdpm-an__card-title">Clinical Scores</span>
        <svg class={`pdpm-an__card-chevron${collapsed ? '' : ' pdpm-an__card-chevron--open'}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      {!collapsed && (
        <div class="pdpm-an__scores-body">
          {/* Score cards row */}
          <div class="pdpm-an__scores-row">
            {bims && <ScoreCard value={bims.score} max={15} label="BIMS" severity={bims.severity} impact={bims.pdpmImpact} />}
            {phq && <ScoreCard value={phqVal} max={27} label="PHQ-9" severity={phq.severity} impact={phq.pdpmImpact} extra={phqExtra} />}
            {nfs && <ScoreCard value={nfs.score} max={16} label="NFS" severity={nfs.severity} impact={nfs.pdpmImpact} />}
            {ptot && <ScoreCard value={ptot.score} max={24} label="PT/OT Func" severity={ptot.severity} impact={ptot.pdpmImpact} />}
          </div>

          {/* Threshold banners */}
          {thresholds.length > 0 && (
            <div class="pdpm-an__thresholds">
              {thresholds.map((t, i) => (
                <div key={i} class="pdpm-an__threshold" style={{ borderLeftColor: t.color }}>
                  {t.text}
                </div>
              ))}
            </div>
          )}

          {/* GG breakdown toggle */}
          {gg && (
            <div class="pdpm-an__gg-toggle-wrap">
              {/* NO_TRACK: GG breakdown sub-toggle inside already-tracked pdpm_breakdown_viewed component */}
              <button class="pdpm-an__gg-toggle" onClick={() => setShowGG(!showGG)}>
                {showGG ? 'Hide' : 'Show'} GG Item Breakdown
                <svg class={`pdpm-an__card-chevron${showGG ? ' pdpm-an__card-chevron--open' : ''}`} width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              {showGG && <GGBreakdown breakdown={gg} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Light summary strip (replaces dark hero) ───────────────────────────────

function SummaryStrip({ data }) {
  if (!data) return null;

  const summary = data.summary || {};
  const calculation = data.calculation || {};
  const payment = data.payment;

  const cmsHipps = summary.currentHipps || calculation.hippsCode || '?????';
  const cmsPotential = summary.potentialHippsIfCoded;

  const isStateRate = payment?.mode === 'state_rate';
  const cleanGroup = (c) => c ? c.replace(/_/g, '') : null;
  const currentCode = isStateRate ? (cleanGroup(payment.current?.groupCode) || cmsHipps) : cmsHipps;
  const potentialCode = isStateRate ? (cleanGroup(payment.potential?.groupCode) ?? currentCode) : cmsPotential;
  const hasImprovement = isStateRate
    ? (potentialCode && potentialCode !== currentCode)
    : (summary.hasImprovements && cmsPotential && cmsPotential !== cmsHipps);

  const rates = formatPaymentRates(payment);

  // Compliance
  const comp = data.compliance?.summary || {};
  const compPassed = comp.passed ?? 0;
  const compNa = comp.notApplicable ?? 0;
  const compTotal = (comp.total ?? 0) - compNa;

  // Section progress — compute from actual section statuses (API counts can be stale)
  const sp = data.sectionProgress;
  let spDone = 0, spTotal = 0;
  if (sp?.sections) {
    for (const status of Object.values(sp.sections)) {
      spTotal++;
      if (status === 'Complete' || status === 'Completed' || status === 'Locked') spDone++;
    }
  }
  if (!spTotal) spTotal = sp?.total ?? 0;
  const spPct = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;

  // Opportunity count
  const drivers = (data.enhancedDetections || []).filter(
    d => d.wouldChangeHipps && d.solverStatus !== 'query_sent' && d.solverStatus !== 'awaiting_response'
      && d.solverStatus !== 'dont_code' && d.userDecision?.decision !== 'disagree'
  ).length;

  const hasDelta = rates && rates.delta && rates.delta !== '+$0/day' && rates.delta !== '+0';

  return (
    <div class="pdpm-an__summary">
      {hasDelta && (
        <div class="pdpm-an__summary-delta">{rates.delta}</div>
      )}

      <div class="pdpm-an__summary-codes">
        <span class="pdpm-an__summary-code">{currentCode}</span>
        {hasImprovement && (
          <>
            <span class="pdpm-an__summary-arrow">{'\u2192'}</span>
            <span class="pdpm-an__summary-code pdpm-an__summary-code--green">{potentialCode}</span>
          </>
        )}
      </div>

      <div class="pdpm-an__summary-stats">
        {spTotal > 0 && <span class="pdpm-an__summary-stat">{spPct}% MDS</span>}
        {compTotal > 0 && <span class="pdpm-an__summary-stat">{compPassed}/{compTotal} Compliance</span>}
        {drivers > 0 && <span class="pdpm-an__summary-stat pdpm-an__summary-stat--green">{drivers} Opp{drivers !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

// ─── Loading / Error states ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div class="pdpm-an__state">
      <div class="pdpm-an__spinner" />
      <p>Loading assessment data…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div class="pdpm-an__state">
      <div class="pdpm-an__state-icon">⚠</div>
      <p>{message}</p>
      {/* NO_TRACK: error-state retry inside pdpm_analyzer */}
      <button class="pdpm-an__retry-btn" onClick={onRetry}>Retry</button>
    </div>
  );
}

/**
 * RunItState — shown when the assessment isn't synced/solved yet (404). Triggers
 * the on-demand pipeline and waits for the FULL run to finish before re-fetching
 * (PDPM needs every section's detections, so no incremental reveal here).
 *
 * @param {string} code     originating 404 code
 * @param {object} runParams { externalPatientId, ardDate, assessmentType, facilityName, orgSlug }
 * @param {()=>void} onComplete  re-fetch the PDPM data once the run is done
 */
function RunItState({ code, runParams, onComplete }) {
  const [progress, setProgress] = useState(null); // null = pre-click
  const [errorMsg, setErrorMsg] = useState(null);
  const handleRef = useRef(null);

  useEffect(() => () => { handleRef.current?.cancel?.(); }, []);

  const intro = MdsRunNow.introCopy(code);

  function startRun() {
    if (!MdsRunNow.hasRequiredParams(runParams)) {
      setErrorMsg("Couldn't read the assessment details. Try reopening from the MDS page.");
      return;
    }
    setErrorMsg(null);
    setProgress({ phase: 'none' });
    handleRef.current = MdsRunNow.start(runParams, {
      onPhase: (state) => setProgress(state),
      onDone: () => { handleRef.current = null; onComplete?.(); },
      onError: (msg) => { handleRef.current = null; setProgress(null); setErrorMsg(msg); },
    }, 'pdpm_analyzer', code);
  }

  if (errorMsg) {
    return (
      <div class="pdpm-an__state">
        <div class="pdpm-an__state-icon">⚠</div>
        <p>{errorMsg}</p>
        {/* NO_TRACK: re-runs MdsRunNow which fires mds_run_triggered */}
        <button class="pdpm-an__retry-btn" onClick={startRun}>Retry</button>
      </div>
    );
  }

  if (progress) {
    const copy = MdsRunNow.phaseCopy(progress);
    return (
      <div class="pdpm-an__state">
        <div class="pdpm-an__spinner" />
        <p>{copy.title}</p>
        {copy.detail && <p class="pdpm-an__state-sub">{copy.detail}</p>}
      </div>
    );
  }

  return (
    <div class="pdpm-an__state">
      <div class="pdpm-an__state-icon">✨</div>
      <p>{intro}</p>
      <p class="pdpm-an__state-sub">Run Super's MDS analysis now — this usually takes about 10 minutes.</p>
      {/* NO_TRACK: run starts mds_run_triggered via MdsRunNow */}
      <button class="pdpm-an__retry-btn pdpm-an__run-btn" onClick={startRun}>Run it</button>
    </div>
  );
}

// ─── Assessment detail view ────────────────────────────────────────────────────

function AssessmentView({ assessmentData, onItemClick, onQueryClick, patientId }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  if (!assessmentData) {
    return (
      <div class="pdpm-an__state">
        <p>No assessment data available.</p>
      </div>
    );
  }

  return (
    <div class="pdpm-an__content">
      <SummaryStrip data={assessmentData} />
      <OpportunityCallout data={assessmentData} onItemClick={onItemClick} />
      <PendingQueriesSection data={assessmentData} onQueryClick={onQueryClick} collapsed={collapsed.queries} onToggleCollapse={() => toggle('queries')} />
      <RecentlySignedSection data={assessmentData} onQueryClick={onQueryClick} collapsed={collapsed.signed} onToggleCollapse={() => toggle('signed')} />
      <ComponentBreakdown data={assessmentData} payment={assessmentData?.payment} onItemClick={onItemClick} collapsed={collapsed.components} onToggleCollapse={() => toggle('components')} />
      <SectionProgressCard data={assessmentData} collapsed={collapsed.sections} onToggleCollapse={() => toggle('sections')} />
      <DocRisksSection data={assessmentData} onItemClick={onItemClick} collapsed={collapsed.docRisks} onToggleCollapse={() => toggle('docRisks')} />
      <ClinicalScores data={assessmentData} collapsed={collapsed.scores} onToggleCollapse={() => toggle('scores')} />
      <ComplianceCard data={assessmentData} collapsed={collapsed.compliance} onToggleCollapse={() => toggle('compliance')} />
      {patientId && <CertSection patientId={patientId} collapsed={collapsed.certs} onToggleCollapse={() => toggle('certs')} />}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

// ─── Mode toggle button ─────────────────────────────────────────────────────

function ModeToggleButton({ mode, onToggle }) {
  const title = mode === 'panel' ? 'Expand to modal' : 'Dock as side panel';
  return (
    /* NO_TRACK: pure-UI mode toggle (modal vs side-panel) inside pdpm_analyzer */
    <button class="pdpm-an__mode-toggle" onClick={onToggle} title={title} aria-label={title}>
      {mode === 'panel' ? (
        // Expand icon (arrows pointing outward)
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M5.5 2H3a1 1 0 00-1 1v2.5M10.5 2H13a1 1 0 011 1v2.5M10.5 14H13a1 1 0 001-1v-2.5M5.5 14H3a1 1 0 01-1-1v-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      ) : (
        // Sidebar/panel icon (panel docked right)
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          <line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      )}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PDPMAnalyzer({ context, onClose, initialMode = 'modal', fromCommandCenter = false }) {
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [mode, setMode] = useState(initialMode);
  const [isSplitView, setIsSplitView] = useState(false);

  // Mount-only: fire pdpm_analyzer_opened exactly once.
  useEffect(() => {
    track('pdpm_analyzer_opened', { source: 'fab' });
  }, []);

  const {
    assessments, detail, patientName: hookPatientName,
    loading, detailLoading, error, notSynced, retry, retryDetail
  } = usePDPMAnalyzer(context, selectedAssessmentId);

  // Auto-select first assessment once list loads
  const firstId = assessments?.[0]?.id;
  if (context?.scope === 'patient' && firstId && !selectedAssessmentId) {
    setSelectedAssessmentId(firstId);
  }

  const isPanel = mode === 'panel';

  function handleBackdropClick(e) {
    // In panel mode, clicking the backdrop does NOT close — only X or Escape
    if (isPanel) return;
    if (e.target === e.currentTarget) onClose();
  }

  function openCommandCenter() {
    onClose();
    if (typeof MDSCommandCenterLauncher !== 'undefined') {
      MDSCommandCenterLauncher.open();
    }
  }

  function toggleMode() {
    setMode(prev => prev === 'modal' ? 'panel' : 'modal');
  }

  // Determine what to show
  const patientName = hookPatientName || context?.patientName || '';
  const assessmentData = detail || null;

  // Header info: find the selected assessment in the list for type/ARD
  const selectedSummary = assessments.find(a => a.id === selectedAssessmentId);
  const assessmentLabel = cleanAssessmentType(
    assessmentData?.assessmentType || assessmentData?.type || selectedSummary?.type
  ) || '';
  const ardDate = (assessmentData?.ardDate || selectedSummary?.ardDate)
    ? formatArdDate(assessmentData?.ardDate || selectedSummary?.ardDate)
    : '';

  const isLoading = loading || detailLoading;

  // Params for an on-demand "Run it" when the assessment isn't synced/solved.
  // mds scope → scrape the live PCC MDS page; patient scope → use the selected
  // assessment summary + patient context.
  const runParams = (() => {
    const base = MdsRunNow.gatherParams?.() || {};
    if (context?.scope === 'patient') {
      return {
        ...base,
        externalPatientId: context?.patientId || base.externalPatientId,
        ardDate: selectedSummary?.ardDate || base.ardDate,
        assessmentType: selectedSummary?.type || selectedSummary?.assessmentType || base.assessmentType,
      };
    }
    return base;
  })();
  const onRunComplete = (context?.scope === 'patient' && selectedAssessmentId) ? retryDetail : retry;

  const backdropClass = isPanel ? 'pdpm-an__panel-backdrop' : 'pdpm-an__overlay';
  const containerClass = (isPanel ? 'pdpm-an__panel' : 'pdpm-an__modal') + (isSplitView ? ' pdpm-an--split' : '');

  return (
    <div class={backdropClass} onClick={handleBackdropClick}>
      <div class={containerClass} role="dialog" aria-modal={isPanel ? 'false' : 'true'} aria-label="PDPM Analyzer">
        {/* Header */}
        <div class="pdpm-an__header">
          <div class="pdpm-an__header-left">
            {fromCommandCenter && (
              /* NO_TRACK: navigates to MDS Command Center which fires its own mds_command_center_opened */
              <button class="pdpm-an__back-btn" onClick={openCommandCenter}>
                {'\u2190'} Command Center
              </button>
            )}
            <div class="pdpm-an__patient-info">
              {patientName && <span class="pdpm-an__patient-name">{patientName}</span>}
              {assessmentLabel && <span class="pdpm-an__assessment-label">{assessmentLabel}</span>}
              {ardDate && <span class="pdpm-an__ard-date">ARD {ardDate}</span>}
            </div>
          </div>
          <div class="pdpm-an__header-right">
            <AssessmentSelector
              assessments={assessments}
              selectedId={selectedAssessmentId}
              onChange={(id) => { setSelectedAssessmentId(id); setDetailItem(null); }}
            />
            <ModeToggleButton mode={mode} onToggle={toggleMode} />
            {/* NO_TRACK: close-X */}
            <button class="pdpm-an__close-btn" onClick={onClose} aria-label="Close">{'\u2715'}</button>
          </div>
        </div>

        {/* Body */}
        <div class="pdpm-an__body">
          {isLoading && <LoadingState />}
          {!isLoading && notSynced && (
            <RunItState code={notSynced} runParams={runParams} onComplete={onRunComplete} />
          )}
          {!isLoading && !notSynced && error && <ErrorState message={error} onRetry={detail ? retryDetail : retry} />}
          {!isLoading && !notSynced && !error && (
            detailItem
              ? <ItemDetailView
                  item={detailItem.item}
                  context={{ ...context, assessmentId: selectedAssessmentId || context?.assessmentId, patientName }}
                  onBack={() => { setDetailItem(null); setIsSplitView(false); }}
                  onSplitChange={setIsSplitView}
                  onDismiss={() => { setDetailItem(null); setIsSplitView(false); }}
                />
              : <AssessmentView
                  assessmentData={assessmentData}
                  patientId={context?.patientId}
                  onItemClick={(d) => {
                    if (d?.mdsItem) {
                      // Strip optional ":suffix" so I8000:rare → I8000 (categorical reference data, no PHI).
                      const itemCode = d.mdsItem.includes(':') ? d.mdsItem.split(':')[0] : d.mdsItem;
                      track('pdpm_item_drilled_in', { item_code: itemCode });
                    }
                    setDetailItem({ type: 'detection', item: d });
                  }}
                  onQueryClick={(q) => {
                    const enriched = {
                      ...q,
                      patientName: q.patientName || patientName,
                      locationName: q.locationName || context?.facilityName || ''
                    };
                    window.QueryDetailModal?.show(enriched, null, { showPdfButton: q.hasPdf ?? false });
                  }}
                />
          )}
        </div>
      </div>
    </div>
  );
}
