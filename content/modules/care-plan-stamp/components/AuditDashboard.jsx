import { h } from 'preact';
import { useEffect } from 'preact/hooks';

/**
 * Step-1 overview for Comprehensive Review.
 *
 * Renders three tiles summarizing what the audit found. Clicking a tile
 * navigates to that step's drill-in view (Add wizard, Verify list, or
 * On Plan browse).
 *
 * Tile visibility is gated on having content — if onPlan is empty the
 * tile is hidden; if both Add and Verify are empty the modal would
 * normally show an empty state at the modal level (audit returned
 * nothing), so this component assumes at least one tile has items.
 */
export const AuditDashboard = ({
  audit,
  stampedAddIds,
  dismissedVerifyIds,
  onEnterStep,                 // (step) => void
}) => {
  useEffect(() => {
    window.SuperAnalytics?.track?.('care_plan_audit_dashboard_viewed', {});
  }, []);

  const totalAdds = (audit.toAdd || []).length;
  const stampedCount = stampedAddIds.size;
  const remainingAdds = totalAdds - stampedCount;

  // Partition Add items for the subline
  const addBuckets = { universal: 0, dx: 0, order: 0 };
  (audit.toAdd || []).forEach((it) => {
    if (stampedAddIds.has(it.ruleId)) return;
    if (it.ruleId?.startsWith('universal.')) addBuckets.universal += 1;
    else if (it.ruleId?.startsWith('dx.')) addBuckets.dx += 1;
    else if (it.ruleId?.startsWith('order.')) addBuckets.order += 1;
  });

  const liveVerifies = (audit.toCheck || []).filter((it) => !dismissedVerifyIds.has(it._rowId));
  const uniqueFocuses = new Set(liveVerifies.map((it) => it.focusId).filter(Boolean)).size;
  const totalVerifyInterventions = liveVerifies.reduce(
    (sum, it) => sum + (it.suggestedInterventions?.length || 0), 0
  );

  const onPlanCount = (audit.onPlan || []).length;

  const addComplete = totalAdds > 0 && remainingAdds === 0;

  return (
    <div className="cpas-dashboard">
      <Tile
        kind="add"
        title={`${remainingAdds} new ${remainingAdds === 1 ? 'focus' : 'focuses'} to add`}
        complete={addComplete}
        completeLabel={`✓ ${stampedCount} added`}
        sublines={[
          addBuckets.universal > 0 && `🟦 ${addBuckets.universal} baseline ${addBuckets.universal === 1 ? 'universal' : 'universals'}`,
          addBuckets.dx > 0 && `🟪 ${addBuckets.dx} diagnosis-driven`,
          addBuckets.order > 0 && `🟪 ${addBuckets.order} order-driven`,
        ].filter(Boolean)}
        ctaLabel={addComplete ? 'Review again' : 'Review & stamp →'}
        onEnter={() => onEnterStep('add')}
        hidden={totalAdds === 0}
      />
      <Tile
        kind="verify"
        title={`${liveVerifies.length} ${liveVerifies.length === 1 ? 'intervention set' : 'intervention sets'} for existing focuses`}
        sublines={[
          liveVerifies.length > 0 && `Across ${uniqueFocuses} ${uniqueFocuses === 1 ? 'focus' : 'focuses'} · ${totalVerifyInterventions} suggested ${totalVerifyInterventions === 1 ? 'intervention' : 'interventions'}`,
        ].filter(Boolean)}
        ctaLabel="Review & stamp →"
        onEnter={() => onEnterStep('verify')}
        hidden={liveVerifies.length === 0}
      />
      <Tile
        kind="onplan"
        title={`${onPlanCount} already on plan`}
        sublines={['No action needed']}
        ctaLabel="Browse if curious"
        onEnter={() => onEnterStep('on_plan')}
        muted
        hidden={onPlanCount === 0}
      />
    </div>
  );
};

const Tile = ({ kind, title, complete, completeLabel, sublines, ctaLabel, onEnter, muted, hidden }) => {
  if (hidden) return null;
  return (
    <div className={`cpas-dashboard__tile cpas-dashboard__tile--${kind} ${muted ? 'is-muted' : ''} ${complete ? 'is-complete' : ''}`}>
      <div className="cpas-dashboard__tile-head">
        <div className="cpas-dashboard__tile-title">{title}</div>
        {complete && <span className="cpas-dashboard__tile-done">{completeLabel}</span>}
      </div>
      <ul className="cpas-dashboard__tile-sublines">
        {sublines.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
      <div className="cpas-dashboard__tile-cta">
        {/* NO_TRACK: navigation only, telemetry fires at the modal level via onEnterStep */}
        <button
          type="button"
          className="cpas-btn cpas-btn--primary"
          onClick={onEnter}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
};
