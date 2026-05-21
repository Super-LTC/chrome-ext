import { h } from 'preact';
import { useEffect } from 'preact/hooks';

/**
 * Step-1 overview for Comprehensive Review.
 *
 * Renders tiles summarizing what the audit found. Clicking a tile
 * navigates to that step's drill-in view.
 */
export const AuditDashboard = ({
  audit,
  stampedAddIds,
  skippedAddIds,
  dismissedVerifyIds,
  stampedVerifyIds,
  onEnterStep,
}) => {
  useEffect(() => {
    window.SuperAnalytics?.track?.('care_plan_audit_dashboard_viewed', {});
  }, []);

  const stampedVerifySet = stampedVerifyIds || new Set();
  const skippedSet = skippedAddIds || new Set();

  const totalAdds = (audit.toAdd || []).length;
  const stampedCount = stampedAddIds.size;
  const remainingAdds = (audit.toAdd || []).filter(it => !stampedAddIds.has(it.ruleId) && !skippedSet.has(it.ruleId)).length;

  const addBuckets = { universal: 0, dx: 0, order: 0 };
  (audit.toAdd || []).forEach((it) => {
    if (stampedAddIds.has(it.ruleId)) return;
    if (it.ruleId?.startsWith('universal.')) addBuckets.universal += 1;
    else if (it.ruleId?.startsWith('dx.')) addBuckets.dx += 1;
    else if (it.ruleId?.startsWith('order.')) addBuckets.order += 1;
  });
  const addSubParts = [];
  if (addBuckets.universal) addSubParts.push(`${addBuckets.universal} baseline`);
  if (addBuckets.dx) addSubParts.push(`${addBuckets.dx} diagnosis-driven`);
  if (addBuckets.order) addSubParts.push(`${addBuckets.order} order-driven`);

  const addPreview = (audit.toAdd || [])
    .filter((it) => !stampedAddIds.has(it.ruleId))
    .slice(0, 3)
    .map((it) => focusLabel(it));

  const totalVerify = (audit.toCheck || []).length;
  const liveVerifies = (audit.toCheck || []).filter((it) => !dismissedVerifyIds.has(it._rowId) && !stampedVerifySet.has(it._rowId));
  const uniqueFocuses = new Set(liveVerifies.map((it) => it.focusId).filter(Boolean)).size;
  const totalVerifyInterventions = liveVerifies.reduce(
    (sum, it) => sum + (it.suggestedInterventions?.length || 0), 0
  );
  const verifyPreview = liveVerifies.slice(0, 3).map(verifyLabel);

  const onPlanCount = (audit.onPlan || []).length;
  const addComplete = totalAdds > 0 && remainingAdds === 0;
  const verifyComplete = totalVerify > 0 && liveVerifies.length === 0;
  const showAdd = totalAdds > 0;
  const showVerify = totalVerify > 0;

  const totalActionable = remainingAdds + liveVerifies.length;
  const totalAuditItems = totalAdds + totalVerify + onPlanCount;
  const totalCompletedThisSession = stampedCount + stampedVerifySet.size;

  return (
    <div className="cpas-dashboard">
      <div className="cpas-dashboard__summary">
        <div className="cpas-dashboard__summary-headline">
          {totalActionable > 0
            ? <><strong>{totalActionable}</strong> {totalActionable === 1 ? 'item needs' : 'items need'} your review</>
            : <>✓ Care plan is up to date</>}
        </div>
        <div className="cpas-dashboard__summary-sub">
          {totalCompletedThisSession > 0
            ? <>Reviewed {totalAuditItems} care plan {totalAuditItems === 1 ? 'item' : 'items'} · <strong>{totalCompletedThisSession}</strong> handled this session</>
            : <>Reviewed {totalAuditItems} care plan {totalAuditItems === 1 ? 'item' : 'items'} in this audit</>}
        </div>
      </div>

      <div className="cpas-dashboard__tiles">
        {showAdd && (
          <Tile
            kind="add"
            count={addComplete ? stampedCount : remainingAdds}
            label={
              addComplete
                ? `${stampedCount === 1 ? 'focus' : 'focuses'} added`
                : (remainingAdds === 1 ? 'new focus to add' : 'new focuses to add')
            }
            subline={addComplete ? null : addSubParts.join(' · ')}
            preview={addComplete ? null : addPreview}
            complete={addComplete}
            completeLabel={addComplete ? `All ${stampedCount} stamped` : null}
            onEnter={() => onEnterStep('add')}
            icon={addComplete ? <IconCheck /> : <IconPlus />}
            ctaLabel={addComplete ? 'Review again' : 'Review & stamp'}
          />
        )}
        {showVerify && (
          <Tile
            kind="verify"
            count={verifyComplete ? stampedVerifySet.size : liveVerifies.length}
            label={
              verifyComplete
                ? `${stampedVerifySet.size === 1 ? 'focus' : 'focuses'} verified`
                : (liveVerifies.length === 1 ? 'existing focus to verify' : 'existing focuses to verify')
            }
            subline={
              verifyComplete
                ? null
                : `${totalVerifyInterventions} suggested ${totalVerifyInterventions === 1 ? 'intervention' : 'interventions'} across ${uniqueFocuses} ${uniqueFocuses === 1 ? 'focus' : 'focuses'}`
            }
            preview={verifyComplete ? null : verifyPreview}
            complete={verifyComplete}
            completeLabel={verifyComplete ? `All ${stampedVerifySet.size} verified` : null}
            onEnter={() => onEnterStep('verify')}
            icon={<IconCheck />}
            ctaLabel={verifyComplete ? 'Review again' : 'Review & stamp'}
          />
        )}
      </div>

      {onPlanCount > 0 && (
        /* NO_TRACK: navigation only, telemetry fires at the modal level via onEnterStep */
        <button
          type="button"
          className="cpas-dashboard__onplan"
          onClick={() => onEnterStep('on_plan')}
        >
          <span className="cpas-dashboard__onplan-icon"><IconShield /></span>
          <span className="cpas-dashboard__onplan-text">
            <strong>{onPlanCount}</strong> already on plan — no action needed
          </span>
          <span className="cpas-dashboard__onplan-link">Browse →</span>
        </button>
      )}
    </div>
  );
};

// Map a backend ruleId (e.g. "universal.communication") to a short, nurse-
// friendly label. Mirrors FocusCard's _ruleIdToLabel so the preview list on
// the dashboard reads as English, not as developer IDs.
const RULE_ID_LABELS = {
  'universal.fall_risk': 'Falls',
  'universal.skin_integrity': 'Skin integrity',
  'universal.adl': 'ADLs',
  'universal.nutrition': 'Nutrition',
  'universal.hydration': 'Hydration',
  'universal.pain': 'Pain',
  'universal.code_status': 'Code status',
  'universal.cognition': 'Cognition',
  'universal.mood': 'Mood',
  'universal.communication': 'Communication',
  'universal.trauma_informed': 'Trauma-informed care',
  'universal.discharge_planning': 'Discharge planning',
  'order.anticoag': 'Anticoagulant therapy',
  'order.opioid': 'Opioid therapy',
  'order.insulin': 'Insulin / diabetes management',
  'order.antibiotic': 'Antibiotic therapy',
  'order.psychotropic': 'Psychotropic medication',
  'order.oxygen': 'Oxygen therapy',
};

const _ruleIdLabel = (ruleId) => {
  if (!ruleId) return null;
  if (RULE_ID_LABELS[ruleId]) return RULE_ID_LABELS[ruleId];
  const tail = String(ruleId).split('.').pop() || ruleId;
  return tail.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const _truncate = (s, n) => {
  if (!s) return s;
  const trimmed = String(s).replace(/\s+/g, ' ').trim();
  return trimmed.length > n ? trimmed.slice(0, n - 1).trimEnd() + '…' : trimmed;
};

const focusLabel = (item) => {
  // Prefer a human label by ruleId — segment/description fields on audit items
  // are often verbose clinical paragraphs that don't belong in a peek preview.
  const fromRule = _ruleIdLabel(item.ruleId);
  if (fromRule) return fromRule;
  if (item.title) return _truncate(item.title, 60);
  if (Array.isArray(item.descriptionSegments) && item.descriptionSegments.length) {
    const text = item.descriptionSegments
      .map((s) => typeof s === 'string' ? s : (s.label || s.value || ''))
      .join(' ');
    return _truncate(text, 60);
  }
  return _truncate(item.description || item.detail, 60) || 'Focus';
};

const verifyLabel = (item) => {
  if (item.matchedFocusText) return _truncate(item.matchedFocusText, 70);
  if (item.detail) return _truncate(item.detail, 70);
  return 'Existing focus';
};

const Tile = ({ kind, count, label, subline, preview, complete, completeLabel, onEnter, icon, ctaLabel }) => (
  /* NO_TRACK: navigation only, telemetry fires at the modal level via onEnterStep */
  <button
    type="button"
    className={`cpas-dashboard__tile cpas-dashboard__tile--${kind} ${complete ? 'is-complete' : ''}`}
    onClick={onEnter}
  >
    <span className={`cpas-dashboard__tile-icon cpas-dashboard__tile-icon--${kind}`}>{icon}</span>

    <span className="cpas-dashboard__tile-body">
      <span className="cpas-dashboard__tile-headline">
        <span className="cpas-dashboard__tile-count">{count}</span>
        <span className="cpas-dashboard__tile-label">{label}</span>
      </span>
      {subline && <span className="cpas-dashboard__tile-subline">{subline}</span>}
      {preview && preview.length > 0 && (
        <ul className="cpas-dashboard__tile-preview">
          {preview.map((p, i) => (
            <li key={i} className="cpas-dashboard__tile-preview-item">
              <span className="cpas-dashboard__tile-preview-dot" aria-hidden="true" />
              <span className="cpas-dashboard__tile-preview-text">{p}</span>
            </li>
          ))}
        </ul>
      )}
      {complete && completeLabel && (
        <span className="cpas-dashboard__tile-done">✓ {completeLabel}</span>
      )}
    </span>

    <span className="cpas-dashboard__tile-cta">
      <span className="cpas-dashboard__tile-cta-text">{ctaLabel}</span>
      <span className="cpas-dashboard__tile-chevron" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </span>
  </button>
);

const IconPlus = () => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
    <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </svg>
);

const IconCheck = () => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
    <path d="M4 10l4 4 8-9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M10 2l6 2v5c0 4-3 7-6 9-3-2-6-5-6-9V4l6-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);
