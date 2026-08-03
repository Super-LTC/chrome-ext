/**
 * The QIP destination: rollup → one building → one measure.
 *
 * Mirrors the Five-Star world's shape deliberately (a board you scope out of, a
 * facility you scope into), and owns its own scope the same way `FacilityScope`
 * does — because the same hazard applies. A measure opened from a QIP building
 * must read THAT building's residents; routing it at the generic measure view
 * would show whichever facility the PCC page belongs to.
 *
 * ORDER OF THE BRANCHES IS SIGNIFICANT, and it fixed a live bug on the web: the
 * measure drill is checked BEFORE the facility scope, otherwise scoping into a
 * building swallows the measure view and the drill never renders.
 */
import { useQipRollup } from '../../hooks/useQipRollup.js';
import { QipRollup } from './QipRollup.jsx';
import { FlQipFacilityView } from './FlQipFacilityView.jsx';
import { QipMeasureDrill } from './QipMeasureDrill.jsx';
import { QmLoading } from '../QmLoading.jsx';

export function QipDestination({
  orgSlug,
  view,
  measureId,
  quarterBack,
  scope,          // 'rollup' | 'facility'
  scopeCtx,       // { name, pccFacilityName } for the selected building
  onSelectFacility,
  onOpenMeasure,
  onQuarterChange,
  onBackToRollup,
  onBackToFacility,
}) {
  const { rollup, loading, error, retry } = useQipRollup({ orgSlug });

  const inFacility = scope === 'facility' && !!scopeCtx?.pccFacilityName;

  // Measure drill first — see the header note.
  if (view === 'measure' && measureId && inFacility) {
    return (
      <QipMeasureDrill
        facilityName={scopeCtx.pccFacilityName}
        buildingName={scopeCtx.name}
        orgSlug={orgSlug}
        measureId={measureId}
        quarterBack={quarterBack}
        onQuarterChange={onQuarterChange}
        onBack={onBackToFacility}
      />
    );
  }

  if (inFacility) {
    return (
      <FlQipFacilityView
        key={scopeCtx.pccFacilityName}
        facilityName={scopeCtx.pccFacilityName}
        orgSlug={orgSlug}
        onBack={onBackToRollup}
        onOpenMeasure={onOpenMeasure}
      />
    );
  }

  // A building selected from the rollup with no PCC name cannot be addressed —
  // same rule as the Five-Star grid, and deliberately not a `name` fallback.
  if (scope === 'facility') {
    return (
      <div className="qmc">
        <button type="button" className="qmc-bc__back" onClick={onBackToRollup}>‹ QIP</button> {/* NO_TRACK */}
        <div className="qmc-loading">
          {scopeCtx?.name ? `${scopeCtx.name} isn't` : "This building isn't"} linked to a
          PointClickCare facility name yet, so we can't pull its QIP scorecard.
        </div>
      </div>
    );
  }

  if (loading && !rollup) return <QmLoading title="Loading your QIP buildings" />;

  if (error) {
    return (
      <div className="qmc-error">
        <div>The QIP rollup is unavailable</div>
        <div className="qmc-error__detail">{error}</div>
        <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
      </div>
    );
  }

  if (!rollup) return <div className="qmc-loading">No QIP data for this organization.</div>;

  return <QipRollup data={rollup} onSelectFacility={onSelectFacility} />;
}
