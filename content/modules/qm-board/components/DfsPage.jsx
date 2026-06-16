/**
 * Full Discharge Function Score page — the detail surface behind the grid tile
 * ({ kind: 'dfs' } in the QMBoard view stack). Hosts the existing DFS card body
 * (hero + in-house climb list + recent-discharges table + drill-in modals) with a
 * Back button, instead of dropping that whole thing inline on the board.
 *
 * Ported from qm-handoff/qm-dfs-page.reference.tsx → Preact + the qmc- CSS.
 */
import { DfsCard } from './DfsCard.jsx';
import { ChevronLeft } from './icons.jsx';

export function DfsPage({ dfs, facilityName, orgSlug, onBack }) {
  return (
    <div className="qmc" style={{ gap: '16px' }}>
      <div className="qmc-bc">
        <button type="button" className="qmc-bc__back" onClick={onBack}><ChevronLeft /> Back to board</button> {/* NO_TRACK */}
      </div>
      <DfsCard dfs={dfs} facilityName={facilityName} orgSlug={orgSlug} />
    </div>
  );
}
