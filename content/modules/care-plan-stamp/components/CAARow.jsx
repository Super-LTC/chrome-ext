import { h } from 'preact';
import { AddBucketPane } from './AddBucketPane.jsx';
import { VerifyBucketPane } from './VerifyBucketPane.jsx';
import { RemoveBucketPane } from './RemoveBucketPane.jsx';

/**
 * One CAA accordion. Header shows status + counts; body (when expanded)
 * renders existing focuses + per-bucket item cards + bulk actions.
 *
 * Rows with status='covered' are non-expandable — informational only.
 */
export const CAARow = ({
  bucket,
  expanded,
  onToggle,
  expandedMode = 'collapsed',
  onSetExpandedMode,
  getFocusState,
  onPatchFocusState,
  onStampAdd,
  onSkipAdd,
  resolveStatus,
  resolveError,
  verifyLocal,
  onMarkVerified,
  onKeep,
  onResolveItem,
  onBulkAdd,
  onBulkResolve,
  onBulkVerify,
  onUniversalsMassStamp,
  stamping,
  stampedAddIds,
  skippedAddIds,
  dropdowns,
}) => {
  const status = bucket.status;
  const isCovered = status === 'covered';
  const tone = status === 'gap' ? 'gap' : status === 'partial' ? 'partial' : 'covered';

  // Filter out items the nurse already handled in this session.
  const liveAdds = (bucket.toAdd || []).filter((it) => !stampedAddIds?.has(it.ruleId) && !skippedAddIds?.has(it.ruleId));
  const liveRemoves = (bucket.toRemove || []).filter((it) => resolveStatus?.[it.focusId] !== 'done');
  const liveChecks = bucket.toCheck || [];

  const isUniversalsCluster =
    liveAdds.length >= 3 &&
    liveAdds.every((it) => it.ruleId.startsWith('universal.')) &&
    (bucket.existingFocusIds?.length || 0) === 0;

  return (
    <div className={`super-caa-row super-caa-row--${tone} ${expanded ? 'is-expanded' : ''}`}>
      {/* NO_TRACK: row toggle tracked via parent (caa_expanded) on first open */}
      <button
        type="button"
        className="super-caa-row__head"
        onClick={isCovered ? undefined : onToggle}
        disabled={isCovered}
        aria-expanded={expanded}
      >
        <span className={`super-caa-row__icon super-caa-row__icon--${tone}`}>
          {tone === 'gap' ? '✗' : tone === 'partial' ? '⚠' : '✓'}
        </span>
        <span className="super-caa-row__name">{bucket.displayName}</span>
        <span className={`super-caa-row__pill super-caa-row__pill--${tone}`}>{status}</span>
        <span className="super-caa-row__counts">{_formatCounts(bucket, liveAdds, liveChecks, liveRemoves)}</span>
        {!isCovered && (
          <span className="super-caa-row__caret">{expanded ? '▾' : '▸'}</span>
        )}
      </button>

      {expanded && !isCovered && (
        <div className="super-caa-row__body">
          {(bucket.existingFocusTexts?.length || 0) > 0 && (
            <div className="super-caa-row__existing">
              <div className="super-caa-row__existing-label">On plan</div>
              <ul className="super-caa-row__existing-list">
                {bucket.existingFocusTexts.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {isUniversalsCluster && expandedMode === 'collapsed' ? (
            <div className="super-caa-row__universals">
              <div className="super-caa-row__universals-text">
                {liveAdds.length} standard universals proposed
              </div>
              <div className="super-caa-row__universals-actions">
                <button
                  type="button"
                  className="super-btn super-btn--primary"
                  onClick={() => onUniversalsMassStamp(liveAdds)}
                  disabled={stamping}
                  data-track="care_plan_audit_universals_mass_stamped"
                >
                  Add all {liveAdds.length}
                </button>
                {/* NO_TRACK: pure-UI toggle to per-item view */}
                <button
                  type="button"
                  className="super-btn super-btn--secondary"
                  onClick={() => onSetExpandedMode('individual')}
                  disabled={stamping}
                >
                  Review individually
                </button>
              </div>
            </div>
          ) : (
            <>
              {liveAdds.map((item) => {
                const realIdx = bucket.toAdd.indexOf(item);
                return (
                  <div className="super-caa-row__item" key={`add-${item.ruleId}`}>
                    <AddBucketPane
                      item={item}
                      focusState={getFocusState(item)}
                      onPatch={(patch) => onPatchFocusState(item, patch)}
                      onStamp={() => onStampAdd(item)}
                      onSkip={() => onSkipAdd(item)}
                      stamping={stamping}
                      dropdowns={dropdowns}
                    />
                  </div>
                );
              })}

              {liveChecks.map((item, i) => (
                <div className="super-caa-row__item" key={`check-${item.focusId || item.kind || i}`}>
                  <VerifyBucketPane
                    item={item}
                    localState={verifyLocal?.[`${bucket.caa}:${i}`]}
                    onMarkVerified={() => onMarkVerified(item, `${bucket.caa}:${i}`)}
                    onKeep={() => onKeep(item, `${bucket.caa}:${i}`)}
                    onResolve={() => onResolveItem(item, 'verify')}
                    resolveStatus={resolveStatus?.[item.focusId]}
                  />
                </div>
              ))}

              {liveRemoves.map((item) => (
                <div className="super-caa-row__item" key={`remove-${item.focusId}`}>
                  <RemoveBucketPane
                    item={item}
                    onResolve={() => onResolveItem(item, 'remove')}
                    status={resolveStatus?.[item.focusId]}
                    errorMessage={resolveError?.[item.focusId]}
                  />
                </div>
              ))}
            </>
          )}

          {/* Per-CAA bulk buttons — only when expandedMode is individual or universals rule doesn't apply */}
          {(!isUniversalsCluster || expandedMode === 'individual') && (liveAdds.length + liveChecks.length + liveRemoves.length) > 1 && (
            <div className="super-caa-row__bulk">
              {liveAdds.length > 1 && (
                <button
                  type="button"
                  className="super-btn super-btn--primary"
                  onClick={() => onBulkAdd(liveAdds)}
                  disabled={stamping}
                  data-track="care_plan_audit_caa_bulk_stamp"
                >
                  Stamp all {liveAdds.length} adds
                </button>
              )}
              {liveRemoves.length > 1 && (
                <button
                  type="button"
                  className="super-btn super-btn--danger"
                  onClick={() => onBulkResolve(liveRemoves)}
                  disabled={stamping}
                  data-track="care_plan_audit_caa_bulk_resolve"
                >
                  Resolve all {liveRemoves.length}
                </button>
              )}
              {liveChecks.length > 1 && (
                <button
                  type="button"
                  className="super-btn super-btn--secondary"
                  onClick={() => onBulkVerify(liveChecks, bucket.caa)}
                  data-track="care_plan_audit_caa_bulk_verify"
                >
                  Mark all {liveChecks.length} verified
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function _formatCounts(bucket, liveAdds, liveChecks, liveRemoves) {
  const existing = (bucket.existingFocusIds?.length || 0);
  const parts = [];
  if (existing > 0) parts.push(`${existing} ${existing === 1 ? 'focus' : 'focuses'}`);
  if (liveAdds.length > 0) parts.push(`${liveAdds.length} to add`);
  if (liveChecks.length > 0) parts.push(`${liveChecks.length} to verify`);
  if (liveRemoves.length > 0) parts.push(`${liveRemoves.length} to remove`);
  return parts.join(' · ');
}
