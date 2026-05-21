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
  onEnterStep,
}) => {
  useEffect(() => {
    window.SuperAnalytics?.track?.('care_plan_audit_dashboard_viewed', {});
  }, []);

  const skippedSet = skippedAddIds || new Set();
  const stampedSet = stampedAddIds || new Set();

  // Bucket toAdd items by ruleId prefix into three groups so the dashboard
  // tiles map 1:1 to clinical sources (baseline UCAs, MD orders, diagnoses).
  // Items that don't fit any bucket fall into baseline as a catch-all rather
  // than disappearing — keeps the dashboard total honest.
  const bucketOf = (it) => {
    const id = it.ruleId || '';
    if (id.startsWith('order.')) return 'order';
    if (id.startsWith('dx.')) return 'dx';
    return 'universal';
  };

  const grouped = { universal: [], order: [], dx: [] };
  (audit.toAdd || []).forEach((it) => {
    grouped[bucketOf(it)].push(it);
  });

  const bucketSpec = [
    {
      key: 'universal',
      kind: 'baseline',
      title: 'Baseline focuses',
      sublineSingular: 'baseline (universal) focus to add',
      sublinePlural: 'baseline (universal) focuses to add',
      doneSingular: 'baseline focus added',
      donePlural: 'baseline focuses added',
      icon: <IconBaseline />,
    },
    {
      key: 'order',
      kind: 'order',
      title: 'Order-driven focuses',
      sublineSingular: 'order-driven focus to add',
      sublinePlural: 'order-driven focuses to add',
      doneSingular: 'order-driven focus added',
      donePlural: 'order-driven focuses added',
      icon: <IconOrder />,
    },
    {
      key: 'dx',
      kind: 'dx',
      title: 'Diagnosis-driven focuses',
      sublineSingular: 'diagnosis-driven focus to add',
      sublinePlural: 'diagnosis-driven focuses to add',
      doneSingular: 'diagnosis-driven focus added',
      donePlural: 'diagnosis-driven focuses added',
      icon: <IconDx />,
    },
  ];

  const onPlanCount = (audit.onPlan || []).length;
  const totalAdds = (audit.toAdd || []).length;
  const totalRemaining = (audit.toAdd || []).filter(
    (it) => !stampedSet.has(it.ruleId) && !skippedSet.has(it.ruleId)
  ).length;
  const totalStamped = (audit.toAdd || []).filter((it) => stampedSet.has(it.ruleId)).length;
  const totalAuditItems = totalAdds + onPlanCount;

  return (
    <div className="cpas-dashboard">
      <div className="cpas-dashboard__summary">
        <div className="cpas-dashboard__summary-headline">
          {totalRemaining > 0
            ? <><strong>{totalRemaining}</strong> {totalRemaining === 1 ? 'focus needs' : 'focuses need'} your review</>
            : <>✓ Care plan is up to date</>}
        </div>
        <div className="cpas-dashboard__summary-sub">
          {totalStamped > 0
            ? <>Reviewed {totalAuditItems} care plan {totalAuditItems === 1 ? 'item' : 'items'} · <strong>{totalStamped}</strong> added this session</>
            : <>Reviewed {totalAuditItems} care plan {totalAuditItems === 1 ? 'item' : 'items'} in this audit</>}
        </div>
      </div>

      <div className="cpas-dashboard__tiles cpas-dashboard__tiles--three">
        {bucketSpec.map((spec) => {
          const items = grouped[spec.key];
          const remaining = items.filter((it) => !stampedSet.has(it.ruleId) && !skippedSet.has(it.ruleId)).length;
          const stampedHere = items.filter((it) => stampedSet.has(it.ruleId)).length;
          const isEmpty = items.length === 0;
          const isComplete = !isEmpty && remaining === 0;

          const displayCount = isComplete ? stampedHere : remaining;
          const label = isComplete
            ? (stampedHere === 1 ? spec.doneSingular : spec.donePlural)
            : (remaining === 1 ? spec.sublineSingular : spec.sublinePlural);

          const preview = isComplete || isEmpty
            ? null
            : items
                .filter((it) => !stampedSet.has(it.ruleId) && !skippedSet.has(it.ruleId))
                .slice(0, 3)
                .map(focusLabel);

          return (
            <Tile
              key={spec.key}
              kind={spec.kind}
              count={isEmpty ? 0 : displayCount}
              label={isEmpty ? `No ${spec.title.toLowerCase()} to add` : label}
              preview={preview}
              complete={isComplete}
              empty={isEmpty}
              completeLabel={isComplete ? `All ${stampedHere} stamped` : null}
              onEnter={() => !isEmpty && onEnterStep('add', { bucket: spec.key })}
              icon={isComplete ? <IconCheck /> : spec.icon}
              ctaLabel={
                isEmpty ? null : (isComplete ? 'Review again' : 'Review & stamp')
              }
            />
          );
        })}
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

const Tile = ({ kind, count, label, preview, complete, empty, completeLabel, onEnter, icon, ctaLabel }) => (
  /* NO_TRACK: navigation only, telemetry fires at the modal level via onEnterStep */
  <button
    type="button"
    className={`cpas-dashboard__tile cpas-dashboard__tile--${kind} ${complete ? 'is-complete' : ''} ${empty ? 'is-empty' : ''}`}
    onClick={empty ? undefined : onEnter}
    disabled={empty}
    aria-disabled={empty}
  >
    <span className={`cpas-dashboard__tile-icon cpas-dashboard__tile-icon--${kind}`}>{icon}</span>

    <span className="cpas-dashboard__tile-body">
      <span className="cpas-dashboard__tile-headline">
        <span className="cpas-dashboard__tile-count">{count}</span>
        <span className="cpas-dashboard__tile-label">{label}</span>
      </span>
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

    {ctaLabel && (
      <span className="cpas-dashboard__tile-cta">
        <span className="cpas-dashboard__tile-cta-text">{ctaLabel}</span>
        <span className="cpas-dashboard__tile-chevron" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </span>
    )}
  </button>
);

const IconCheck = () => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
    <path d="M4 10l4 4 8-9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);

// Three bucket icons — kept simple/abstract so they don't compete with the
// big count number. Indigo (baseline), amber (orders), teal (diagnoses).
const IconBaseline = () => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="6" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
    <path d="M3 9h14" stroke="currentColor" stroke-width="1.8"/>
    <path d="M7 4v3M13 4v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>
);

const IconOrder = () => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="7.5" width="14" height="5" rx="2.5" stroke="currentColor" stroke-width="1.8"/>
    <path d="M10 7.5v5" stroke="currentColor" stroke-width="1.8"/>
  </svg>
);

const IconDx = () => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
    <path d="M6 3v4a3 3 0 003 3v4a3 3 0 006 0v-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="15" cy="11" r="1.7" stroke="currentColor" stroke-width="1.8"/>
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M10 2l6 2v5c0 4-3 7-6 9-3-2-6-5-6-9V4l6-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);
