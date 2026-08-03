/**
 * FL QIP's per-measure resident drill for a building selected from the QIP
 * rollup. Ported from superltc `qm-qip-measure-drill.tsx` (SUP-276).
 *
 * WHY A SEPARATE DRILL AT ALL. The QIP rollup lets a regional reader pick any
 * building, but routing a measure click at `MeasureDetail` would carry whichever
 * facility's board is loaded — so drilling into building B showed building A's
 * residents. A drill-in that silently answers for a different building is worse
 * than no drill-in. This one fetches quarter-rates FOR THE QIP BUILDING and
 * feeds the same `buildDenominatorView` the Five-Star roster uses, so the
 * numbers are the engine's, byte-for-byte.
 *
 * DEFERRED MEASURES — the reason this component is not merely a roster. For the
 * four measures FL QIP scores from CMS's published rate, everything below the
 * banner is our live MDS view: real residents, real coding, and NOT the input
 * behind the scored number. The banner says so in the deferral's own words.
 * Shipping the roster without it re-manufactures the exact confusion #1068 was
 * built to kill, which is why the banner is not a nicety to trim.
 *
 * This is Tailwind-styled, ported near-verbatim from the web, so it renders
 * inside `.sltc-tw` (see scripts/build-tailwind.mjs for the scoping contract).
 */
import { useMemo } from 'preact/hooks';
import { useQuarterRates } from '../../hooks/useQuarterRates.js';
import { buildDenominatorView } from '../../lib/qm-denominator-view.js';
import { shortLabel } from '../../lib/qm-view-model.js';
import { DenominatorPanel } from '../DenominatorPanel.jsx';
import { ArrowLeft, Landmark } from '../icons.jsx';

/** The 4-quarter CMS window, matching the web's picker. */
const QUARTERS_BACK = [0, 1, 2, 3];

export function QipMeasureDrill({
  facilityName,
  buildingName,
  orgSlug,
  measureId,
  quarterBack,
  onQuarterChange,
  onBack,
}) {
  // `back` is part of the key, so flipping quarters refetches for THIS building
  // rather than reusing the open quarter's roster under a different label.
  const { quarterRates: qr, loading, failed } = useQuarterRates({ facilityName, orgSlug, back: quarterBack });

  const denom = useMemo(
    () => (qr ? buildDenominatorView(qr).byMeasure.get(measureId) : undefined),
    [qr, measureId]
  );

  const label = useMemo(() => {
    const fromRates = qr?.rates?.find((r) => r.measureId === measureId)?.label;
    return shortLabel(measureId, fromRates ?? measureId);
  }, [qr, measureId]);

  // SERVER-AUTHORED, and the only source. `scoringDeferrals` (superltc #1084) is
  // attached to the quarter-rates payload unconditionally and is not
  // facility-dependent — it's a four-entry constant, and the DESTINATION decides
  // when it applies, so the drill never has to know which program a building is
  // in. We deliberately keep no local copy: this string's entire job is saying
  // "this number didn't come from where you think", and a stale copy of it would
  // be confidently wrong about provenance.
  //
  // A failed fetch therefore shows no banner. That's correct — there is no roster
  // on screen to be misread, and the failure message says so.
  const deferralReason = qr?.scoringDeferrals?.[measureId];

  return (
    <div className="sltc-tw">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} /* NO_TRACK */
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" /> QIP scorecard
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-800">{label}</div>
            {buildingName && <div className="truncate text-[11px] text-slate-400">{buildingName}</div>}
          </div>
        </div>

        {deferralReason && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <Landmark className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <div className="text-xs leading-relaxed text-amber-800">
              <span className="font-semibold">FL QIP scores this measure from CMS&apos;s published rate.</span>{' '}
              {deferralReason}. The roster below is our live MDS view of these residents — it is not the
              input behind the scored number.
            </div>
          </div>
        )}

        {failed ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
            Could not load this quarter for this building.
          </div>
        ) : loading || !qr ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : !denom ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
            This measure has no evaluated residents in {qr.quarter.label}.
          </div>
        ) : (
          <DenominatorPanel
            open
            meta={{ id: measureId, label }}
            denom={denom}
            onClose={onBack}
            headerExtra={
              <div className="flex items-center gap-1.5">
                {QUARTERS_BACK.map((back) => (
                  <button key={back} type="button" onClick={() => onQuarterChange(back)} /* NO_TRACK */
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      back === quarterBack
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
                    {back === quarterBack ? qr.quarter.label : back === 0 ? 'Open quarter' : `−${back}Q`}
                  </button>
                ))}
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
