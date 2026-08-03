/**
 * QIP ROLLUP — every QIP-state building against the qualifying floor.
 * Ported from superltc `qip-rollup.tsx`.
 *
 * Same grammar as the Five-Star board on purpose (grid ⇄ table, tiles click
 * through, distance-to-the-cut is the headline), because it answers the same
 * shape of question one program over: who is safe, who is on the bubble, who is
 * short and by how much.
 *
 * THE HEADLINE IS POINTS VS FLOOR, NOT A PERCENTAGE. FL QIP tops out at 49
 * points (27 MDS + 22 non-MDS) but pays on clearing a ~16.5-point qualifying
 * floor, so "34/49" or "69%" would be a true number that answers nothing.
 *
 * Two tracks, always both: OFFICIAL is CMS's lagged published anchor, PROJECTED
 * is ours from the MDS we hold. A building can qualify on one and not the other,
 * and that difference is the entire value of showing our number.
 *
 * The two things this board refuses to do — rank a building with no MDS, and
 * report "below the floor" as one number — live in `lib/qip-rollup-view.js`
 * with their reasoning and tests.
 */
import { useMemo, useState } from 'preact/hooks';
import { shortLabel } from '../../lib/qm-view-model.js';
import { standing, standingText, orderFacilities } from '../../lib/qip-rollup-view.js';
import { AlertTriangle, ChevronRight, Grid as LayoutGrid, List } from '../icons.jsx';

const TONE = {
  safe: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500' },
  bubble: { chip: 'bg-amber-50 text-amber-800 ring-amber-200', bar: 'bg-amber-500' },
  pending: { chip: 'bg-sky-50 text-sky-700 ring-sky-200', bar: 'bg-sky-400' },
  short: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500' },
  error: { chip: 'bg-slate-100 text-slate-500 ring-slate-200', bar: 'bg-slate-300' },
  unscored: { chip: 'bg-slate-100 text-slate-500 ring-slate-200', bar: 'bg-slate-200' },
};

/**
 * Points laid on the floor's scale. The bar is anchored at the FLOOR, not at
 * max: the whole question is which side of it you are on, so the floor is the
 * tick everything else is read against.
 */
function FloorBar({ f, floor, maxPoints }) {
  const s = standing(f, floor);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / maxPoints) * 100))}%`;
  const unscored = s.kind === 'unscored' || s.kind === 'error';
  return (
    <div className="relative mt-2 h-2 w-full rounded-full bg-slate-100">
      {/* Points recoverable from un-entered inputs — visibly not-yet-earned, but
          visibly reachable. */}
      {!unscored && f.missingPoints > 0 && (
        <div className="absolute inset-y-0 rounded-r-full bg-slate-200"
          style={{ left: pct(f.projected.points), width: pct(f.missingPoints) }}
          title={`+${f.missingPoints} pts available once staffing inputs are entered`} />
      )}
      {!unscored && (
        <div className={`absolute inset-y-0 left-0 rounded-full ${TONE[s.kind].bar}`}
          style={{ width: pct(f.projected.points) }} />
      )}
      {/* The floor tick — the only line on this bar that pays. */}
      <div className="absolute -top-1 h-4 w-0.5 bg-slate-800"
        style={{ left: pct(floor) }} title={`Qualifying floor ${floor} pts`} />
      {/* CMS's published position, for direction of travel. */}
      {!unscored && (
        <div className="absolute -top-0.5 h-3 w-0.5 bg-slate-400"
          style={{ left: pct(f.official.points) }}
          title={`CMS published ${f.official.points.toFixed(1)} pts`} />
      )}
    </div>
  );
}

function FacilityCard({ f, floor, maxPoints, onSelect }) {
  const s = standing(f, floor);
  return (
    /* NO_TRACK — scope change into a building; the facility view emits its own. */
    <button type="button" onClick={onSelect}
      className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-800">{f.name}</div>
          <div className="font-mono text-[10.5px] text-slate-400">
            {f.state}{f.ccn ? ` · CCN ${f.ccn}` : ''}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300 group-hover:text-slate-500" />
      </div>

      {f.error ? (
        <div className="mt-3 text-xs text-slate-400">{f.error}</div>
      ) : f.insufficientData ? (
        <>
          {/* No number at all. Printing the ~24 points this building nominally
              computed would be the whole bug, restated politely. */}
          <div className="mt-3 font-mono text-lg font-bold text-slate-300">— pts</div>
          <div className="mt-1 text-[11px] leading-snug text-slate-500">
            No MDS assessments in this program year, so no measure has a denominator and
            there is no QIP score to report.
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums text-slate-900">
              {f.projected.points.toFixed(1)}
            </span>
            <span className="pb-1 text-[11px] text-slate-400">
              pts projected · CMS {f.official.points.toFixed(1)}
            </span>
            {f.delta !== 0 && (
              <span className={`pb-1 font-mono text-[11px] font-bold ${f.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {f.delta > 0 ? '▲' : '▼'} {Math.abs(f.delta).toFixed(1)}
              </span>
            )}
          </div>

          <FloorBar f={f} floor={floor} maxPoints={maxPoints} />

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${TONE[s.kind].chip}`}>
              {standingText(s.kind, s.gap, floor)}
            </span>
            {f.missingPoints > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500"
                title={`Un-entered: ${f.missingInputs.join(', ')}. Ceiling credits each at the best tier — an upper bound, not a forecast.`}>
                +{f.missingPoints} available · ceiling {f.ceiling.toFixed(1)}
              </span>
            )}
          </div>

          {f.gaps.length > 0 && (
            <div className="mt-2.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">Costing points:</span>{' '}
              {f.gaps.slice(0, 3).map((g, i) => (
                <span key={g.measureId}>
                  {i > 0 ? ' · ' : ''}
                  {shortLabel(g.measureId, g.measureId)}{' '}
                  <span className="font-mono text-rose-600">−{g.shortBy}</span>
                </span>
              ))}
              {f.gaps.length > 3 ? <span className="text-slate-400"> +{f.gaps.length - 3} more</span> : null}
            </div>
          )}
        </>
      )}
    </button>
  );
}

function FacilityRow({ f, floor, onSelect }) {
  const s = standing(f, floor);
  // No score is no score: a failed build and a building with no MDS both print
  // em-dashes rather than the points they nominally computed.
  const noScore = !!f.error || f.insufficientData;
  return (
    /* NO_TRACK — see FacilityCard. */
    <tr onClick={onSelect} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-3 py-2">
        <div className="font-semibold text-slate-800">{f.name}</div>
        <div className="font-mono text-[10px] text-slate-400">{f.state}{f.ccn ? ` · ${f.ccn}` : ''}</div>
      </td>
      <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-slate-900">
        {noScore ? '—' : f.projected.points.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-400">
        {noScore || f.missingPoints === 0 ? '—' : f.ceiling.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
        {noScore ? '—' : f.official.points.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-400">{floor}</td>
      <td className="px-3 py-2 text-right">
        {noScore ? (
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${TONE[s.kind].chip}`}>
            {f.error ? 'failed' : 'no MDS'}
          </span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold ring-1 ${TONE[s.kind].chip}`}>
            {s.gap >= 0 ? '+' : ''}{s.gap.toFixed(1)}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
        {noScore ? '—' : f.mdsPoints.projected.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
        {noScore ? '—' : f.nonMdsPoints.toFixed(1)}
        {/* No missing-input warning on an unscored row: there is nothing for the
            reader to go fix — the building has no score at all. */}
        {!noScore && f.missingInputs.length > 0 ? (
          <span className="ml-1 text-amber-600" title={`Missing: ${f.missingInputs.join(', ')}`}>⚠</span>
        ) : null}
      </td>
      <td className="max-w-[280px] truncate px-3 py-2 text-slate-500">
        {noScore ? null : f.gaps.slice(0, 3).map((g, i) => (
          <span key={g.measureId}>
            {i > 0 ? ' · ' : ''}{shortLabel(g.measureId, g.measureId)} −{g.shortBy}
          </span>
        ))}
      </td>
    </tr>
  );
}

export function QipRollup({ data, onSelectFacility }) {
  const [view, setView] = useState('grid');
  const { floor, maxPoints } = data;

  const ordered = useMemo(() => orderFacilities(data.facilities), [data.facilities]);
  const select = (f) => () => onSelectFacility?.(f);

  return (
    <div className="sltc-tw">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">QIP</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="font-semibold text-slate-700">
                {data.summary.scored} scored building{data.summary.scored === 1 ? '' : 's'}
              </span>{' '}
              · {data.summary.projectedQualifying} projected qualifying ·{' '}
              {data.summary.officialQualifying} qualifying on CMS&apos;s published score
              {data.summary.onTheBubble > 0 ? (
                <>{' · '}<span className="font-semibold text-amber-700">{data.summary.onTheBubble} on the bubble</span></>
              ) : null}
              {data.summary.insufficientData > 0 ? (
                <> · {data.summary.insufficientData} unscored (no MDS)</>
              ) : null}
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">
              Qualifying floor {floor} pts · max attainable {maxPoints} (27 MDS + 22 non-MDS) · points,
              not a percentage
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => setView('grid')} /* NO_TRACK */
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button type="button" onClick={() => setView('table')} /* NO_TRACK */
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                view === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              <List className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>

        {/* The split matters more than the count. "Below the floor" has two causes
            with opposite responses — enter a cost-report number, or change clinical
            practice — and reporting them as one number always reads as the second. */}
        {data.summary.belowFloorPendingInputs + data.summary.shortAtCeiling > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {data.summary.shortAtCeiling > 0 ? (
                <>
                  <b>{data.summary.shortAtCeiling}</b> building
                  {data.summary.shortAtCeiling === 1 ? ' is' : 's are'} short of the floor{' '}
                  <b>even crediting every missing input</b> — that is the clinical worklist.{' '}
                </>
              ) : (
                <><b>No building</b> is short of the floor on clinical performance. </>
              )}
              {data.summary.belowFloorPendingInputs > 0 && (
                <>
                  The other <b>{data.summary.belowFloorPendingInputs}</b> below the floor could clear
                  it on the un-entered staffing tiers alone — a data-entry gap before a care gap.
                </>
              )}
            </span>
          </div>
        )}

        {data.summary.insufficientData > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              <b>{data.summary.insufficientData}</b> building
              {data.summary.insufficientData === 1 ? '' : 's'} have no MDS in this program year and are{' '}
              <b>not scored</b>. An empty measure reads as a perfect adverse rate, so scoring them
              would rank them at the top of the board on no data.
            </span>
          </div>
        )}

        {view === 'grid' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ordered.map((f) => (
              <FacilityCard key={f.locationId} f={f} floor={floor} maxPoints={maxPoints} onSelect={select(f)} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold">Building</th>
                  <th className="px-3 py-2 text-right font-semibold">Projected</th>
                  <th className="px-3 py-2 text-right font-semibold"
                    title="Projected + every un-entered non-MDS input credited in full">Ceiling</th>
                  <th className="px-3 py-2 text-right font-semibold">CMS published</th>
                  <th className="px-3 py-2 text-right font-semibold">Floor</th>
                  <th className="px-3 py-2 text-right font-semibold">To / above floor</th>
                  <th className="px-3 py-2 text-right font-semibold">MDS</th>
                  <th className="px-3 py-2 text-right font-semibold">Non-MDS</th>
                  <th className="px-3 py-2 font-semibold">Costing points</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((f) => (
                  <FacilityRow key={f.locationId} f={f} floor={floor} onSelect={select(f)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.notes.length > 0 && (
          <div className="text-[11px] text-slate-400"><b>Notes.</b> {data.notes.join(' · ')}</div>
        )}
      </div>
    </div>
  );
}
