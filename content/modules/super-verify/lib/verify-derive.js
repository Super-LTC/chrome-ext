/**
 * Pure view-model derivation for the Super Verify panel. Turns the raw verify
 * response into the shapes the panel renders. No DOM, no Preact — unit-tested.
 *
 * Field names verified against the live pdpm-potential payload (the same object
 * the PDPMAnalyzer renders) + the verify handoff doc.
 */
import { getPaymentDeltaNumeric, formatPaymentDelta } from '../../../utils/payment.js';

const OPEN_QUERY_STATUSES = new Set(['pending', 'sent', 'awaiting_response']);
const INTERVIEW_KEYS = ['bims', 'phq9', 'gg', 'pain'];
const INTERVIEW_LABELS = { bims: 'BIMS', phq9: 'PHQ-9', gg: 'GG Function', pain: 'Pain (J)' };

export function countOpenQueries(queries) {
  if (!Array.isArray(queries)) return 0;
  return queries.filter((q) => OPEN_QUERY_STATUSES.has(q?.status)).length;
}

export function countMissingInterviews(compliance) {
  const checks = compliance?.checks || {};
  return INTERVIEW_KEYS.filter((k) => checks[k]?.status === 'failed').length;
}

export function summaryTiles(data) {
  const measures = data?.qm?.measures || [];
  return {
    qmTriggers: measures.filter((m) => m.triggers && !m.excluded).length,
    dollarsDelta: getPaymentDeltaNumeric(data?.payment),
    dollarsLabel: formatPaymentDelta(data?.payment, 'long'),
    queriesOpen: countOpenQueries(data?.outstandingQueries),
    interviewsMissing: countMissingInterviews(data?.compliance),
  };
}

// I8000:NTA:18 → I8000 (the composite suffix is internal bookkeeping).
export function detectionDisplayCode(mdsItem) {
  if (typeof mdsItem !== 'string') return '';
  return mdsItem.startsWith('I8000:') ? 'I8000' : mdsItem;
}

// The MDS section letter(s) for an item id — used to deep-link PCC's
// section.xhtml. "I2100" → "I", "GG0130B1" → "GG", "I8000:NTA:18" → "I".
export function sectionCodeForItem(mdsItem) {
  const m = detectionDisplayCode(mdsItem).match(/^([A-Z]+)/);
  return m ? m[1] : '';
}

function ntaTierLabel(level, payment) {
  const tiers = payment?.meta?.ntaTiers;
  if (!Array.isArray(tiers)) return null;
  for (const t of tiers) if ((t.levels || []).includes(level)) return t.tier;
  return null;
}

function ntaImpactText(nta, payment) {
  if (payment?.mode === 'state_rate') {
    const cur = ntaTierLabel(nta.currentLevel, payment);
    const next = ntaTierLabel(nta.newLevel, payment);
    if (cur != null && next != null) return `Tier ${cur} → Tier ${next}`;
    return 'tier upgrade';
  }
  return `${nta.currentLevel} → ${nta.newLevel}`;
}

/**
 * Per-component group/level-change chips for a detection. The payload has NO
 * per-item dollar figure — impact is expressed as PDPM component changes.
 */
export function buildImpactChips(impact, payment) {
  const chips = [];
  if (impact?.nta?.wouldChangeLevel) chips.push({ label: 'NTA', text: ntaImpactText(impact.nta, payment) });
  if (impact?.nursing?.wouldChangeGroup)
    chips.push({ label: 'Nursing', text: `${impact.nursing.currentPaymentGroup} → ${impact.nursing.newPaymentGroup}` });
  if (impact?.slp?.wouldChangeGroup)
    chips.push({ label: 'SLP', text: `${impact.slp.currentGroup} → ${impact.slp.newGroup}` });
  if (impact?.ptot?.wouldChangeGroup)
    chips.push({ label: 'PT/OT', text: `${impact.ptot.currentGroup} → ${impact.ptot.newGroup}` });
  return chips;
}

function decisionState(userDecision) {
  const d = userDecision?.decision;
  if (d === 'agree') return 'accept';
  if (d === 'disagree') return 'dismiss';
  return null;
}

/**
 * Split enhancedDetections into the panel's "Coding opportunities" cards.
 * - opportunity: would change HIPPS and isn't a pending query (missed code)
 * - risk: solver says don't-code but documentation is missing (over-code/audit risk)
 *
 * Unlike the PDPMAnalyzer (which hides dismissed items), we KEEP dispositioned
 * items so the panel shows the decision as an audit trail.
 */
export function categorizeDetections(data) {
  const detections = data?.enhancedDetections || [];
  const payment = data?.payment;
  const items = [];

  detections.forEach((d, index) => {
    let kind = null;
    if (
      d.wouldChangeHipps &&
      d.solverStatus !== 'query_sent' &&
      d.solverStatus !== 'awaiting_response' &&
      d.solverStatus !== 'dont_code'
    ) {
      kind = 'opportunity';
    } else if (
      d.solverStatus === 'dont_code' &&
      (d.diagnosisPassed === false || d.activeStatusPassed === false)
    ) {
      kind = 'risk';
    }
    if (!kind) return;

    items.push({
      index,
      kind,
      mdsItem: d.mdsItem,
      displayCode: detectionDisplayCode(d.mdsItem),
      impact: buildImpactChips(d.impact, payment),
      rationale: d.rationale || null,
      diagnosisPassed: d.diagnosisPassed,
      activeStatusPassed: d.activeStatusPassed,
      decided: decisionState(d.userDecision),
      note: d.userDecision?.note || '',
      raw: d,
    });
  });

  return { items, pendingCount: items.filter((i) => i.decided === null).length };
}

/**
 * Bucket QM measures for the hero section.
 * - triggering: this MDS puts the resident in the numerator
 * - willClear: resident is in the numerator today but this codes clean
 * - excluded, split by exclusionKind:
 *     excludedIncomplete ('incomplete') = items not coded yet → "evaluate once coded"
 *     excludedClinical   ('clinical'|null) = genuine clinical exclusion
 */
export function partitionMeasures(qm) {
  const measures = qm?.measures || [];
  const triggering = measures.filter((m) => m.triggers && !m.excluded);
  const willClear = measures.filter((m) => !m.triggers && !m.excluded && m.facilityCount?.wouldClearOnLock);
  const excluded = measures.filter((m) => m.excluded);
  const excludedIncomplete = excluded.filter((m) => m.exclusionKind === 'incomplete');
  const excludedClinical = excluded.filter((m) => m.exclusionKind !== 'incomplete');
  const cleanCount = measures.filter((m) => !m.triggers && !m.excluded).length;
  return {
    triggering,
    willClear,
    excluded,
    excludedIncomplete,
    excludedClinical,
    firingCount: triggering.length,
    cleanCount,
  };
}

// Reimbursement per-component breakdown (round-2): NTA / Nursing / SLP / PT-OT,
// each current→potential CMG (from the HIPPS decode) + $ delta (from
// gapAnalysis.componentRevenue) + a proportional bar.
const REIMB_COMPONENTS = [
  { key: 'nta', label: 'NTA' },
  { key: 'nursing', label: 'Nursing' },
  { key: 'slp', label: 'SLP' },
  { key: 'ptot', label: 'PT/OT' },
];

export function componentBreakdown(data) {
  const decoded = data?.hippsDecoded || {};
  const potential = data?.potentialHippsDecoded || {};
  const rev = data?.gapAnalysis?.componentRevenue || {};

  const rows = REIMB_COMPONENTS.map(({ key, label }) => {
    const delta = Number(rev[key]?.delta) || 0;
    const currentCmg = decoded[key]?.code || null;
    const potentialCmg = potential[key]?.code || null;
    return {
      key,
      label,
      currentCmg,
      potentialCmg,
      delta,
      changed: delta > 0 || (!!currentCmg && !!potentialCmg && currentCmg !== potentialCmg),
    };
  });

  const maxDelta = rows.reduce((m, r) => Math.max(m, r.delta), 0);
  return {
    rows,
    maxDelta,
    hippsCurrent: data?.calculation?.hippsCode || data?.summary?.currentHipps || null,
    hippsPotential: data?.summary?.potentialHippsIfCoded || null,
  };
}

// status → UDA cell tone: passed=ok, failed=miss, not_applicable=na, else pending.
function interviewTone(status) {
  if (status === 'passed') return 'ok';
  if (status === 'failed') return 'miss';
  if (status === 'not_applicable') return 'na';
  return 'pending';
}

export function interviewCells(compliance) {
  const checks = compliance?.checks || {};
  return INTERVIEW_KEYS.map((key) => {
    const c = checks[key] || {};
    return {
      key,
      label: INTERVIEW_LABELS[key],
      status: c.status || 'unknown',
      tone: interviewTone(c.status),
      message: c.message || '',
    };
  });
}
