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

// The "to capture" tile. Prefers the backend's mode-aware reimbursementHeadline,
// but falls back to `payment.delta` when the headline is absent / reports no lift
// (e.g. an env without PR #744) — so we never show "captured" while payment has a
// real lift. Never derived from componentRevenue (Medicare-only → the "+$0" bug).
function liftTile(cmi, delta) {
  return cmi
    ? { display: `+${Number(delta).toFixed(2)}`, label: 'CMI to capture', muted: false }
    : { display: `+$${Math.round(Number(delta))}`, label: '/day to capture', muted: false };
}

export function captureTile(headline, payment) {
  const h = headline || {};
  if (h.hasLift && h.kind !== 'none' && h.deltaValue != null) {
    return liftTile(h.kind === 'cmi', h.deltaValue);
  }
  const pDelta = Number(payment?.delta) || 0;
  const applicable = payment && payment.mode && payment.mode !== 'not_applicable';
  if (applicable && pDelta > 0) return liftTile(payment.mode === 'cmi', pDelta);
  const cmi = h.kind === 'cmi' || payment?.mode === 'cmi';
  return { display: cmi ? '0.00' : '$0', label: cmi ? 'CMI captured' : 'captured', muted: true };
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
// Backend now supplies `verifyBucket` (pre-sorted, most-actionable first) — we
// just group by it. Fallback derivation keeps the panel working against an older
// response that predates the field.
const TRIGGERING_BUCKETS = new Set(['new_trigger', 'will_clear', 'clearable', 'locked']);

function effectiveBucket(m) {
  if (m.verifyBucket) return m.verifyBucket;
  if (m.excluded) return m.exclusionKind === 'incomplete' ? 'incomplete' : 'clinical';
  if (!m.triggers) return m.facilityCount?.wouldClearOnLock ? 'will_clear' : 'clean';
  if (m.facilityCount?.isNewTrigger) return 'new_trigger';
  return 'locked';
}

export function groupQmByBucket(qm) {
  const measures = qm?.measures || [];
  const bucketOf = (m) => effectiveBucket(m);
  const newTrigger = measures.filter((m) => bucketOf(m) === 'new_trigger');
  // "Clearing from last time" worklist: a clean lock removes it, or a lever exists.
  const clearing = measures.filter((m) => bucketOf(m) === 'will_clear' || bucketOf(m) === 'clearable');
  const locked = measures.filter((m) => bucketOf(m) === 'locked');
  const incomplete = measures.filter((m) => bucketOf(m) === 'incomplete');
  const clinical = measures.filter((m) => bucketOf(m) === 'clinical');
  const firingCount = measures.filter((m) => TRIGGERING_BUCKETS.has(bucketOf(m))).length;
  return { newTrigger, clearing, locked, incomplete, clinical, firingCount };
}

// Evidence chips can repeat the same item=value (current + prior coded the
// same). Collapse to unique item=value for display.
export function dedupeEvidence(evidence) {
  const seen = new Set();
  const out = [];
  for (const e of evidence || []) {
    const key = `${e.mdsItem}=${e.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
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
