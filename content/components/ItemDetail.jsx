/**
 * ItemDetail — unified body content for item detail views.
 *
 * Used by both ItemPopover (variant="compact") and ItemDetailView (variant="full").
 * Displays: verdict badge, validation steps or rationale, HIPPS impacts,
 * evidence cards, key findings, and sticky action buttons.
 */
import { useState } from 'preact/hooks';
import { inferSourceType, SOURCE_LABELS, openEvidence, getActionText, parseViewer } from '../utils/evidence-helpers.js';

/* ── SVG icons ── */

const CheckIcon = () => (
  <svg class="sid__step-icon sid__step-icon--pass" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
  </svg>
);

const XIcon = () => (
  <svg class="sid__step-icon sid__step-icon--fail" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
);

/* ── Evidence categorization ── */

function getEvidenceCategory(ev) {
  const sourceType = ev.sourceType || ev.type || '';
  const evidenceId = ev.evidenceId || ev.sourceId || '';

  // Orders / MAR / admin
  if (sourceType === 'order' || sourceType === 'mar' || sourceType === 'medication' ||
      evidenceId.startsWith('order-') || evidenceId.startsWith('admin-') || evidenceId.startsWith('mar-')) {
    return 'orders';
  }
  // Notes (progress notes, nursing notes, clinical notes)
  if (sourceType === 'progress-note' || sourceType === 'nursing-note' || sourceType === 'clinical_note' ||
      ev.type === 'clinical_note' || evidenceId.startsWith('pcc-prognote-') || evidenceId.startsWith('pcc-practnote-') || evidenceId.startsWith('patient-practnote-')) {
    return 'notes';
  }
  // Documents / PDFs / therapy docs
  if (sourceType === 'document' || sourceType === 'therapy-doc' || ev.type === 'document' ||
      ev.type === 'therapy_document' || evidenceId.startsWith('therapy-doc-') || evidenceId.includes('-chunk-')) {
    return 'documents';
  }
  // Fallback
  if (sourceType) return 'other';
  return 'documents'; // default
}

const CATEGORY_LABELS = { orders: 'Orders', notes: 'Notes', documents: 'Documents', other: 'Other' };

/* ── Sub-components ── */

function formatFallInjuryList(fall) {
  if (Array.isArray(fall.injuries) && fall.injuries.length) {
    return fall.injuries
      .map(i => (i.type ? `${i.type}${i.location ? ` (${i.location})` : ''}` : ''))
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(fall.injuryTypes) && fall.injuryTypes.length) {
    return fall.injuryTypes.join(', ');
  }
  return '';
}

function truncateFallText(text, max = 140) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…';
}

function FallCard({ fall }) {
  const date = fall.incidentDate ? new Date(fall.incidentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  const injuryDetail = formatFallInjuryList(fall);
  let injuryText = 'No injury';
  let injuryClass = '';
  if (fall.hasMajorInjury) {
    injuryText = 'Major injury' + (injuryDetail ? `: ${injuryDetail}` : '');
    injuryClass = 'super-fall__injury--major';
  } else if (fall.hasInjury) {
    injuryText = 'Minor injury' + (injuryDetail ? `: ${injuryDetail}` : '');
    injuryClass = 'super-fall__injury--minor';
  }

  const narrative = truncateFallText(fall.nursingDescription);

  const handleClick = () => {
    if (fall.incidentId && window.showIncidentDetailModal) {
      window.showIncidentDetailModal(fall.incidentId);
    }
  };

  return (
    <div class="super-fall-row" onClick={handleClick} role="button">
      <div class="super-fall__header">
        <span class="super-fall__date">{date}</span>
        <span class="super-fall__type">{fall.incidentType || 'Fall'}</span>
      </div>
      {fall.residentName && <div class="super-fall__resident">{fall.residentName}</div>}
      <div class={`super-fall__injury ${injuryClass}`}>{injuryText}</div>
      {(fall.isWitnessed === true || fall.isWitnessed === false || fall.isHospitalized) && (
        <div class="super-fall__badges">
          {fall.isWitnessed === true && <span class="super-fall__badge super-fall__badge--witnessed">Witnessed</span>}
          {fall.isWitnessed === false && <span class="super-fall__badge super-fall__badge--unwitnessed">Unwitnessed</span>}
          {fall.isHospitalized && <span class="super-fall__badge super-fall__badge--hospitalized">Hospitalized</span>}
        </div>
      )}
      {narrative && <div class="super-fall__narrative">“{narrative}”</div>}
      {fall.incidentId && (
        <div class="super-fall__action">
          <span>View Incident</span>
          <ArrowIcon />
        </div>
      )}
    </div>
  );
}

function EvidenceCard({ ev, index, onViewSource }) {
  const quote = ev.quoteText || ev.orderDescription || ev.quote || ev.snippet || ev.text || '';
  if (!quote && !ev.rationale) return null;

  const sourceType = ev.sourceType || inferSourceType(ev.displayName, ev.evidenceId);
  const typeLabel = ev.displayName || SOURCE_LABELS[sourceType] || sourceType;
  const actionText = getActionText(ev);
  const isClickable = !!actionText;

  const handleClick = isClickable ? () => {
    // If onViewSource provided, use inline viewer for supported types
    if (onViewSource) {
      const viewer = parseViewer(ev);
      const isOrder = ev.sourceType === 'order' || (ev.evidenceId || '').startsWith('order-');
      const vt = viewer.viewerType;
      if (vt === 'document' || vt === 'clinical-note' || vt === 'therapy-document' || isOrder) {
        onViewSource(ev, index);
        return;
      }
    }
    openEvidence(ev);
  } : undefined;

  return (
    <div
      class={`sid__ev-card${isClickable ? ' sid__ev-card--clickable' : ''}`}
      onClick={handleClick}
      role={isClickable ? 'button' : undefined}
    >
      <div class="sid__ev-header">
        <span class={`sid__ev-type sid__ev-type--${sourceType}`}>{typeLabel}</span>
      </div>
      {quote && <div class="sid__ev-quote">{quote}</div>}
      {ev.rationale && <div class="sid__ev-rationale">{ev.rationale}</div>}
      {isClickable && (
        <div class="sid__ev-action">
          <span>{actionText}</span>
          <ArrowIcon />
        </div>
      )}
    </div>
  );
}

function ImpactChip({ label, impact }) {
  if (!impact) return null;
  if (!impact.wouldChangeGroup && !impact.wouldChangeLevel) return null;
  const from = impact.currentGroup || impact.currentLevel || impact.currentPaymentGroup;
  const to = impact.newGroup || impact.newLevel || impact.newPaymentGroup;
  return (
    <span class="sid__impact">
      {label} <span class="sid__impact-from">{from}</span> → <span class="sid__impact-to">{to}</span>
    </span>
  );
}

function ValidationSteps({ diagnosisSummary, treatmentSummary, validation }) {
  const diagPassed = validation?.diagnosisCheck?.passed ?? validation?.diagnosisPassed;
  const treatPassed = validation?.treatmentCheck?.passed ?? validation?.activeStatusPassed;

  return (
    <div class="sid__steps">
      <div class={`sid__step ${diagPassed ? 'sid__step--pass' : 'sid__step--fail'}`}>
        {diagPassed ? <CheckIcon /> : <XIcon />}
        <div class="sid__step-content">
          <div class="sid__step-label">Diagnosis</div>
          {diagnosisSummary && <div class="sid__step-summary">{diagnosisSummary}</div>}
        </div>
      </div>
      <div class={`sid__step ${treatPassed ? 'sid__step--pass' : 'sid__step--fail'}`}>
        {treatPassed ? <CheckIcon /> : <XIcon />}
        <div class="sid__step-content">
          <div class="sid__step-label">Treatment</div>
          {treatmentSummary && <div class="sid__step-summary">{treatmentSummary}</div>}
        </div>
      </div>
    </div>
  );
}

function RationaleBlock({ rationale }) {
  if (!rationale) return null;
  return (
    <div class="sid__rationale">
      <div class="sid__rationale-label">Rationale</div>
      {rationale}
    </div>
  );
}

function CarePlanSection({ carePlan }) {
  if (!carePlan) return null;
  const [expanded, setExpanded] = useState(false);
  const onPlan = carePlan.onCarePlan;
  const items = carePlan.items || [];

  return (
    <div class="sid__careplan">
      <button
        class="sid__careplan-toggle"
        type="button"
        onClick={() => items.length > 0 && setExpanded(!expanded)}
      >
        <span class={`sid__careplan-dot ${onPlan ? 'sid__careplan-dot--on' : 'sid__careplan-dot--off'}`} />
        <span class="sid__careplan-title">Care Plan</span>
        <span class="sid__careplan-status">{onPlan ? 'On Care Plan' : 'Not on Care Plan'}</span>
        {items.length > 0 && (
          <span class={`sid__findings-arrow ${expanded ? 'sid__findings-arrow--open' : ''}`}>&#9654;</span>
        )}
      </button>
      {expanded && items.length > 0 && (
        <ul class="sid__careplan-items">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </div>
  );
}

/* ── Main component ── */

/**
 * @param {Object}  props
 * @param {"compact"|"full"} props.variant — "compact" = coding modal, "full" = PDPM detail
 * @param {Object}  props.data — API response from useItemDetail ({ item, diagnosisSummary, treatmentSummary })
 * @param {Object}  props.detectionItem — detection item from parent (has .impact, .mdsItem, .itemName)
 * @param {string}  props.mdsItem — MDS item code (e.g. "I0600")
 */
export function ItemDetail({ variant = 'compact', data, detectionItem, mdsItem, onViewSource, onDismiss, dismissing, assessmentId }) {
  const isFull = variant === 'full';
  const apiItem = data?.item;
  const isColumnBased = !!apiItem?.columns;
  const isDiag = apiItem && !isColumnBased;
  const hasSectionISteps = !!(data?.diagnosisSummary || data?.treatmentSummary);

  // Verdict
  let status = apiItem?.status;
  // Column-based items (Section O) have no top-level status — derive from column answers
  if (!status && isColumnBased) {
    const hasYes = Object.values(apiItem.columns || {}).some(c => c?.answer?.toLowerCase() === 'yes');
    status = hasYes ? 'code' : 'dont_code';
  }
  const needsQuery = status === 'needs_physician_query';
  const shouldCode = status === 'code' || status === 'recommend_coding';
  const verdictDotClass = needsQuery ? 'sid__verdict-dot--query' : shouldCode ? 'sid__verdict-dot--code' : 'sid__verdict-dot--no-code';
  const verdictLabel = needsQuery ? 'Needs Query' : shouldCode ? 'Recommend Coding' : (status?.replace(/_/g, ' ') || 'Don\'t Code');

  // Evidence
  const diagEvidence = apiItem?.evidence || apiItem?.queryEvidence || [];
  const colEvidence = [];
  if (isColumnBased) {
    const seen = new Set();
    for (const col of Object.values(apiItem.columns || {})) {
      if (col?.evidence) col.evidence.forEach(ev => {
        const k = ev.sourceId || ev.quote || JSON.stringify(ev);
        if (!seen.has(k)) { seen.add(k); colEvidence.push(ev); }
      });
    }
  }
  const evidence = isDiag ? diagEvidence : colEvidence;

  const [showAllEv, setShowAllEv] = useState(false);
  const [evFilter, setEvFilter] = useState(null); // null = show all

  // Categorize evidence for filter chips
  const evCategories = {};
  evidence.forEach(ev => {
    const cat = getEvidenceCategory(ev);
    evCategories[cat] = (evCategories[cat] || 0) + 1;
  });
  const categoryKeys = Object.keys(evCategories).sort();
  const showFilterChips = categoryKeys.length > 1;

  const filteredEvidence = evFilter ? evidence.filter(ev => getEvidenceCategory(ev) === evFilter) : evidence;
  const visibleEvidence = showAllEv ? filteredEvidence : filteredEvidence.slice(0, 4);

  // Key findings
  const keyFindings = apiItem?.keyFindings || [];
  const [findingsOpen, setFindingsOpen] = useState(isFull);

  // HIPPS impact
  const impact = detectionItem?.impact;
  const hasImpact = impact && (impact.slp || impact.nta || impact.nursing || impact.ptot);

  // Column-based state
  const columns = apiItem?.columns || {};
  const colKeys = Object.keys(columns);
  const [activeCol, setActiveCol] = useState(colKeys[0] || 'A');
  const activeColData = columns[activeCol];
  const subItems = apiItem?.subItems || [];

  // Dismiss form state
  const [dismissMode, setDismissMode] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const displayCode = mdsItem?.startsWith('I8000:') ? 'I8000' : mdsItem;

  return (
    <>
      {/* ── Verdict ── */}
      <div class="sid__verdict">
        <span class={`sid__verdict-dot ${verdictDotClass}`} />
        <span class="sid__verdict-text">{verdictLabel}</span>
      </div>

      {/* ── Validation steps (Section I) or Rationale (others) ── */}
      {hasSectionISteps && (
        <ValidationSteps
          diagnosisSummary={data.diagnosisSummary}
          treatmentSummary={data.treatmentSummary}
          validation={apiItem?.validation}
        />
      )}

      {/* ── Care Plan (Section I) ── */}
      {hasSectionISteps && data?.carePlan && (
        <CarePlanSection carePlan={data.carePlan} />
      )}

      {!hasSectionISteps && isColumnBased && activeColData && (
        <div class="sid__rationale">
          <div class="sid__col-answer">
            <span class="sid__col-label">Column {activeCol}:</span>
            <span class={`sid__col-badge ${activeColData.answer?.toLowerCase() === 'yes' ? 'sid__col-badge--yes' : 'sid__col-badge--no'}`}>
              {activeColData.answer?.toUpperCase()}
            </span>
            {(activeColData.firstAdministered || activeColData.lastAdministered) && (
              <span class="sid__col-dates">
                {activeColData.firstAdministered}{activeColData.firstAdministered && activeColData.lastAdministered && ' – '}{activeColData.lastAdministered}
              </span>
            )}
          </div>
          {activeColData.rationale && <div>{activeColData.rationale}</div>}
        </div>
      )}

      {!hasSectionISteps && !isColumnBased && (
        <RationaleBlock rationale={apiItem?.rationale} />
      )}

      {/* ── Column tabs (Section O, if multiple columns) ── */}
      {isColumnBased && colKeys.length > 1 && (
        <div class="sid__coltabs">
          {colKeys.map(k => {
            const c = columns[k];
            const yes = c?.answer?.toLowerCase() === 'yes';
            return (
              // NO_TRACK: column tab — internal sub-flow filter, parent feature owns the open event
              <button key={k} type="button"
                class={`sid__coltab ${activeCol === k ? 'sid__coltab--on' : ''}`}
                onClick={() => setActiveCol(k)}>
                Col {k}
                <span class={`sid__coltab-dot ${yes ? 'sid__coltab-dot--yes' : ''}`} />
              </button>
            );
          })}
        </div>
      )}

      {/* ── Sub-items (Section O) ── */}
      {subItems.length > 0 && (
        <div class="sid__subs">
          {subItems.map((sub, i) => {
            const a = sub.columns?.A;
            if (!a) return null;
            const yes = a.answer?.toLowerCase() === 'yes';
            return (
              <div key={sub.mdsItem || i} class={`sid__sub ${yes ? 'sid__sub--on' : ''}`}>
                <span class={`sid__sub-dot ${yes ? 'sid__sub-dot--yes' : ''}`}>{yes ? '\u2713' : '\u2013'}</span>
                <span class="sid__sub-name">{sub.description}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HIPPS Impact (full variant only) ── */}
      {isFull && hasImpact && (
        <div class="sid__impacts">
          <ImpactChip label="NTA" impact={impact.nta} />
          <ImpactChip label="Nursing" impact={impact.nursing} />
          <ImpactChip label="SLP" impact={impact.slp} />
          <ImpactChip label="PT/OT" impact={impact.ptot} />
        </div>
      )}

      {/* ── Falls (Section J) ── */}
      {apiItem?.falls?.length > 0 && (
        <div class="super-falls-section">
          <div class="super-falls-section__label">Falls ({apiItem.fallCount ?? apiItem.falls.length})</div>
          {apiItem.lookbackWindow && (
            <div class="super-lookback-info">
              Lookback: {apiItem.lookbackWindow.startDate} – {apiItem.lookbackWindow.endDate} ({apiItem.lookbackWindow.daysCovered} days)
            </div>
          )}
          <div class="super-falls-list">
            {apiItem.falls.map((fall, i) => <FallCard key={fall.incidentId || i} fall={fall} />)}
          </div>
        </div>
      )}

      {/* ── Evidence ── */}
      {evidence.length > 0 && (
        <div class="sid__evidence">
          <div class="sid__ev-label">Evidence ({evidence.length})</div>
          {showFilterChips && (
            <div class="sid__ev-filters">
              <button
                type="button"
                class={`sid__ev-chip ${evFilter === null ? 'sid__ev-chip--active' : ''}`}
                onClick={() => { setEvFilter(null); setShowAllEv(false); }}
              >All ({evidence.length})</button>
              {categoryKeys.map(cat => (
                <button
                  key={cat}
                  type="button"
                  class={`sid__ev-chip ${evFilter === cat ? 'sid__ev-chip--active' : ''}`}
                  onClick={() => { setEvFilter(evFilter === cat ? null : cat); setShowAllEv(false); }}
                >{CATEGORY_LABELS[cat] || cat} ({evCategories[cat]})</button>
              ))}
            </div>
          )}
          <div class="sid__ev-list">
            {visibleEvidence.map((ev, i) => <EvidenceCard key={i} ev={ev} index={i} onViewSource={onViewSource} />)}
          </div>
          {filteredEvidence.length > 4 && !showAllEv && (
            // NO_TRACK: in-place show-more — parent feature owns the open event
            <button class="sid__ev-show-more" type="button" onClick={() => setShowAllEv(true)}>
              Show all {filteredEvidence.length} &darr;
            </button>
          )}
        </div>
      )}

      {/* ── Key Findings (collapsible) ── */}
      {keyFindings.length > 0 && (
        <>
          {/* NO_TRACK: collapsible toggle — in-place expand/collapse */}
          <button class="sid__findings-toggle" type="button" onClick={() => setFindingsOpen(!findingsOpen)}>
            <span class={`sid__findings-arrow ${findingsOpen ? 'sid__findings-arrow--open' : ''}`}>&#9654;</span>
            Key Findings ({keyFindings.length})
          </button>
          {findingsOpen && (
            <ul class="sid__findings">
              {keyFindings.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </>
      )}

      {/* ── Actions (sticky) ── */}
      {dismissMode && onDismiss ? (
        <div class="sid__dismiss-form">
          <label>Why do you disagree? (optional)</label>
          <textarea
            value={dismissReason}
            onInput={(e) => setDismissReason(e.target.value)}
            placeholder="Enter reason..."
            disabled={dismissing}
          />
          <div class="sid__dismiss-form-btns">
            {/* NO_TRACK: dismiss-form cancel — sub-flow inside ItemDetail, parent owns events */}
            <button class="sid__btn sid__btn--secondary" type="button" disabled={dismissing}
              onClick={() => { setDismissMode(false); setDismissReason(''); }}>
              Cancel
            </button>
            {/* NO_TRACK: dismiss-form submit — onDismiss callback owned by parent feature */}
            <button class="sid__btn sid__btn--primary" type="button" disabled={dismissing}
              onClick={() => onDismiss(dismissReason)}>
              {dismissing ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      ) : (
        <div class="sid__actions">
          {onDismiss && (
            // NO_TRACK: opens dismiss-form sub-flow; parent's onDismiss owns the resolution
            <button class="sid__btn sid__btn--dismiss" type="button" onClick={() => setDismissMode(true)}>
              Dismiss
            </button>
          )}
          <div class="sid__actions-right">
            {/* NO_TRACK: opens QuerySendModal which fires its own query_* events */}
            <button class="sid__btn sid__btn--primary" onClick={() => {
              const queryData = {
                mdsItem: apiItem?.mdsItem || mdsItem,
                description: apiItem?.description || detectionItem?.itemName,
                aiAnswer: apiItem
              };
              window.QuerySendModal?.show(queryData);
            }} type="button">
              Query Physician
            </button>
            {mdsItem && (
              // NO_TRACK: navigateToMDSItem is captured at the navigator level
              <button class="sid__btn sid__btn--secondary" onClick={() => window.navigateToMDSItem?.(mdsItem, assessmentId)} type="button">
                Go to {displayCode} &#x2197;
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
