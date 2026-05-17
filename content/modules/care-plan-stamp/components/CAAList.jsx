import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { CAARow } from './CAARow.jsx';

/**
 * Renders all CAA rows in `audit.byCAA` order (already pre-sorted by backend).
 *
 * Owns:
 *  - per-row expanded boolean (keyed by caa)
 *  - per-row universals expanded mode ('collapsed' | 'individual')
 *  - telemetry on first expand
 *
 * All item-action callbacks are forwarded from parent.
 */
export const CAAList = ({
  byCAA,
  patientId,
  // Item handlers proxied from modal:
  getFocusState,
  onPatchFocusState,
  onStampAdd,
  onSkipAdd,
  onMarkVerified,
  onKeep,
  onResolveItem,
  onBulkAdd,
  onBulkResolve,
  onBulkVerify,
  onUniversalsMassStamp,
  resolveStatus,
  resolveError,
  verifyLocal,
  stamping,
  stampedAddIds,
  skippedAddIds,
  dropdowns,
}) => {
  const [expanded, setExpanded] = useState({});            // { [caa]: true }
  const [universalsMode, setUniversalsMode] = useState({}); // { [caa]: 'collapsed' | 'individual' }
  const [seenCaaExpanded, setSeenCaaExpanded] = useState(new Set());

  const handleToggle = useCallback((bucket) => {
    setExpanded((prev) => {
      const next = { ...prev, [bucket.caa]: !prev[bucket.caa] };
      // Telemetry on first expand only.
      if (next[bucket.caa] && !seenCaaExpanded.has(bucket.caa)) {
        window.SuperAnalytics?.track?.('care_plan_audit_caa_expanded', {
          patient_id: patientId,
          caa: bucket.caa,
          status: bucket.status,
          n_add: bucket.toAdd?.length || 0,
          n_check: bucket.toCheck?.length || 0,
          n_remove: bucket.toRemove?.length || 0,
        });
        setSeenCaaExpanded((s) => new Set([...s, bucket.caa]));
      }
      return next;
    });
  }, [patientId, seenCaaExpanded]);

  const handleSetMode = useCallback((caa, mode) => {
    setUniversalsMode((prev) => ({ ...prev, [caa]: mode }));
  }, []);

  if (!byCAA || byCAA.length === 0) {
    return (
      <div className="super-caa-list">
        <div className="super-audit-empty">
          <div className="super-audit-empty__icon">✓</div>
          <div className="super-audit-empty__title">Care plan looks complete</div>
          <div className="super-audit-empty__subtitle">No CAA buckets need attention.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="super-caa-list">
      {byCAA.map((bucket) => (
        <CAARow
          key={bucket.caa}
          bucket={bucket}
          expanded={!!expanded[bucket.caa]}
          onToggle={() => handleToggle(bucket)}
          expandedMode={universalsMode[bucket.caa] || 'collapsed'}
          onSetExpandedMode={(mode) => handleSetMode(bucket.caa, mode)}
          getFocusState={getFocusState}
          onPatchFocusState={onPatchFocusState}
          onStampAdd={onStampAdd}
          onSkipAdd={onSkipAdd}
          resolveStatus={resolveStatus}
          resolveError={resolveError}
          verifyLocal={verifyLocal}
          onMarkVerified={onMarkVerified}
          onKeep={onKeep}
          onResolveItem={onResolveItem}
          onBulkAdd={onBulkAdd}
          onBulkResolve={onBulkResolve}
          onBulkVerify={onBulkVerify}
          onUniversalsMassStamp={onUniversalsMassStamp}
          stamping={stamping}
          stampedAddIds={stampedAddIds}
          skippedAddIds={skippedAddIds}
          dropdowns={dropdowns}
        />
      ))}
    </div>
  );
};
