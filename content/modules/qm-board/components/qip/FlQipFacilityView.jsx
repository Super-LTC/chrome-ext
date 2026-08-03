/**
 * Florida QIP — Official vs Projected, for one building.
 * Ported from superltc `qm-fl-qip-view.tsx`.
 *
 * OFFICIAL is CMS's published scoreboard, lagged ~1 year, so it reflects last
 * year's care. PROJECTED is ours, live from the MDS we hold. A building can
 * qualify on one and not the other, and that gap is the whole point of the screen.
 *
 * ── The non-MDS editor runs real scoring in the browser ─────────────────────
 * Editing accreditation / staffing tiers / hospitalizations re-scores the total
 * locally via `withInputs` so the number moves as you type, AND PATCHes the
 * server (which invalidates the `fl_qip` precompute). Both halves are required:
 * without the local pass the panel feels broken, without the PATCH the number
 * silently reverts on reload. See lib/fl-qip-view-model.js.
 *
 * The data flow lives in `useFlQip` (GET / PATCH / dismissal POST+DELETE), which
 * predates this port; this component supplies the UI over it.
 */
import { useState, useEffect } from 'preact/hooks';
import { useFlQip } from '../../hooks/useFlQip.js';
import { inputsToForm, withInputs } from '../../lib/fl-qip-view-model.js';
import { CodingAccuracyPanel } from './CodingAccuracyPanel.jsx';
import {
  ArrowLeft, Lock, Radio, Info, AlertTriangle, CircleCheck, ChevronRight, Pencil,
} from '../icons.jsx';

const fmtPct = (r) => (r == null ? '—' : `${r.toFixed(2)}%`);
const fmtDate = (iso) => (iso || '—');

/**
 * Points as plain coloured text (no box → reads as a score, not a badge).
 * Band colour: 3 emerald, 2 amber, 1 orange, 0 slate.
 */
function Pts({ n, muted }) {
  const color =
    muted ? 'text-slate-400'
      : n >= 3 ? 'text-emerald-600'
        : n >= 2 ? 'text-amber-600'
          : n >= 1 ? 'text-orange-500'
            : 'text-slate-400';
  return (
    <span className="tabular-nums">
      <span className={`text-lg font-extrabold ${color}`}>{n}</span>
      <span className="ml-0.5 text-[11px] font-medium text-slate-400">{n === 1 ? 'pt' : 'pts'}</span>
    </span>
  );
}

/** A qualify/floor summary card for one track (official or projected). */
function TrackCard({ title, icon, subtitle, total, floor, qualifying, toQualify, accent, insufficientData }) {
  return (
    <div className={`flex-1 rounded-xl border bg-white p-4 shadow-sm ${accent}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        {/* A score of 0.0 out of nothing is not a score. Suppressing the number is
            the point — printing it invites someone to act on it. */}
        <span className="text-3xl font-bold tabular-nums text-slate-900">
          {insufficientData ? '—' : total.toFixed(1)}
        </span>
        <span className="text-sm text-slate-400">/ floor {floor}</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
      <div className="mt-2">
        {insufficientData ? (
          // Neutral, NOT rose. "Nothing to measure" and "measured and failing" are
          // different facts, and colouring them the same turns a data gap into a
          // performance alarm.
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            <AlertTriangle className="h-3.5 w-3.5" /> No MDS data to score
          </span>
        ) : qualifying ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <CircleCheck className="h-3.5 w-3.5" /> Qualifying
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {toQualify.toFixed(1)} pts short
          </span>
        )}
      </div>
    </div>
  );
}

function Cell({ pts, rate, muted, unavailable, trend }) {
  if (unavailable) return <span className="text-xs text-slate-300">not scored</span>;
  return (
    <div className="flex items-baseline gap-2">
      <Pts n={pts} muted={muted} />
      <span className={`text-xs tabular-nums ${muted ? 'text-slate-300' : 'text-slate-400'}`}>{fmtPct(rate)}</span>
      {trend}
    </div>
  );
}

/** Subtle "vs last year" trend next to the projected rate — green better / red worse. */
function YoyTrend({ m }) {
  if (m.deferredToOfficial || m.improvementPct == null || Math.abs(m.improvementPct) < 5) return null;
  const better = m.improvementPct > 0;
  // Arrow reflects the RATE's direction: lower-better measures improve when the rate falls.
  const arrow = m.direction === 'higher_better' ? (better ? '↑' : '↓') : (better ? '↓' : '↑');
  return (
    <span className={`text-[10px] font-semibold tabular-nums ${better ? 'text-emerald-600' : 'text-rose-400'}`}
      title={`${Math.abs(m.improvementPct).toFixed(0)}% ${better ? 'better' : 'worse'} than last year`}>
      {arrow}{Math.abs(m.improvementPct).toFixed(0)}%
    </span>
  );
}

/**
 * A deferred measure's "projected" number is CMS's, not ours — this says whose
 * and from WHEN. Risk-/claims-adjusted rates can't be reproduced from raw MDS,
 * so we show CMS's published figure; muting the cell alone left it reading as
 * our own live projection of the program year.
 *
 * Amber is the one that matters: it means CMS has published none of the program
 * year yet, so the number is the rolling four-quarter average — mostly
 * PRIOR-year care sitting in a column headed "projected". That should look
 * unresolved, not calm.
 */
function DeferralChip({ m }) {
  if (!m.deferredToOfficial) return null;
  // `m.deferralReason` (#1084) is the server's wording. The chip itself shows
  // provenance + period; the full sentence lives in the drill's banner.
  const onProgramYear = m.deferralSource === 'program_year_quarters';
  const quarters = m.deferralQuarters.join(' + ');
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ${
        onProgramYear ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}
      title={onProgramYear
        ? `Risk-/claims-adjusted, so it can't be computed from raw MDS. This is CMS's published rate for ${quarters}${m.deferralWeighted ? ', pooled by eligible residents' : ''}.`
        : "Risk-/claims-adjusted, and CMS hasn't published any of this program year yet — so this is its rolling four-quarter average, which is mostly last year's care."}
    >
      CMS {onProgramYear ? quarters : 'prior 4Q'}
    </span>
  );
}

function MeasureRow({ m, onOpen }) {
  const clickable = !!onOpen;
  return (
    /* NO_TRACK — opens the resident roster, which emits its own event. */
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
      title={clickable ? 'See the residents behind this measure' : undefined}
      className={`group grid grid-cols-[1.7fr_1fr_1fr] items-center gap-2 border-b border-slate-100 px-3 py-3 last:border-0 ${clickable ? 'cursor-pointer hover:bg-slate-50' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-medium text-slate-800">{m.label}</span>
        {clickable && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />}
        {m.fromImprovement && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-600"
            title="Improved 20%+ vs last year — earns a half point even below the tier.">
            improving
          </span>
        )}
        <DeferralChip m={m} />
      </div>
      <Cell pts={m.officialPoints} rate={m.officialRate} unavailable={m.officialUnavailable} />
      {/* `unavailable` matters as much here as on the official column: an empty
          denominator renders 0 pts at 0.0%, which reads as "you scored terribly"
          when it means "we have nothing to score". */}
      <Cell pts={m.projectedPoints} rate={m.projectedRate} unavailable={!m.projectedMeasurable}
        muted={m.deferredToOfficial} trend={<YoyTrend m={m} />} />
    </div>
  );
}

/** Small emerald on/off toggle. */
function Toggle({ on, onClick }) {
  return (
    /* NO_TRACK — a form control; the Save that persists it is the tracked step. */
    <button type="button" onClick={onClick}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

/** A "Not set / Tier 1-3" staffing picker with its resulting points. */
function TierField({ label, value, onChange, pts }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        <span className="w-10 text-right text-xs text-slate-400">{pts} pts</span>
        <select value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700">
          <option value="">Not set</option>
          <option value="1">Tier 1 (1 pt)</option>
          <option value="2">Tier 2 (2 pts)</option>
          <option value="3">Tier 3 (3 pts)</option>
        </select>
      </span>
    </label>
  );
}

export function FlQipFacilityView({ facilityName, orgSlug, onBack, onOpenMeasure }) {
  const { data, setData, loading, error, saveInputs, setDismiss } = useFlQip({ facilityName, orgSlug });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => inputsToForm({}));

  // Seed the working form once the saved inputs arrive.
  useEffect(() => { if (data?.inputs) setForm(inputsToForm(data.inputs)); }, [data?.inputs]);

  // The rendered comparison: the saved `data`, re-scored by the working form
  // while editing. This is the local half of the two-halves contract.
  const view = data ? (editing ? withInputs(data, form) : data) : null;

  const updateForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      await saveInputs(form);
    } catch {
      // Server unreachable — keep the optimistic view so the panel still reads.
      // The server remains truth: a reload will show its number, not this one.
      setData(withInputs(data, form));
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <div className="sltc-tw">
      <div className="space-y-4">
        <button type="button" onClick={onBack} /* NO_TRACK */
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div>
          <h2 className="text-lg font-bold text-slate-900">Florida QIP — Official vs Projected</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            <span className="font-semibold text-slate-600">Official</span> = CMS-published scoreboard (lagged ~1&nbsp;year).{' '}
            <span className="font-semibold text-slate-600">Projected</span> = our live estimate of where this year lands.
          </p>
        </div>

        {loading && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading QIP comparison…</div>}
        {error && !data && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">Couldn’t load the QIP comparison.</div>}

        {view && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <TrackCard
                title="Official (CMS)" icon={<Lock className="h-3.5 w-3.5" />} accent="border-slate-200"
                subtitle={`As of ${fmtDate(view.officialAsOf)} · reflects prior-year care`}
                total={view.officialTotalPoints} floor={view.floor}
                qualifying={view.officialQualifying} toQualify={view.officialPointsToQualify}
              />
              <TrackCard
                title="Projected (ours)" icon={<Radio className="h-3.5 w-3.5" />} accent="border-indigo-200 ring-1 ring-indigo-100"
                subtitle={`Live · ${view.completedQuarters.join(', ') || '—'}${view.currentQuarter ? ` + ${view.currentQuarter}` : ''}`}
                total={view.projectedTotalPoints} floor={view.floor}
                qualifying={view.projectedQualifying} toQualify={view.projectedPointsToQualify}
                insufficientData={view.insufficientData}
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[1.7fr_1fr_1fr] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Measure</span>
                <span>Official (CMS)</span>
                <span>Projected (ours)</span>
              </div>
              {view.measures.map((m) => (
                <MeasureRow key={m.measureId} m={m}
                  onOpen={onOpenMeasure ? () => onOpenMeasure(m.measureId, {
                    measureId: m.measureId,
                    projectedNum: m.projectedNumerator,
                    projectedDen: m.projectedDenominator,
                    lockedNum: m.lockedNumerator,
                    currentPoints: m.projectedPoints,
                    improvementPct: m.improvementPct,
                    baseTotalPoints: view.projectedTotalPoints,
                    floor: view.floor,
                    adjusted: m.adjusted,
                  }) : undefined} />
              ))}
              <div className="grid grid-cols-[1.7fr_1fr_1fr] items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700">
                <span>Quality-measure points</span>
                <span className="tabular-nums">{view.officialMdsPoints} pts</span>
                <span className="tabular-nums">{view.projectedMdsPoints} pts</span>
              </div>
            </div>

            {/* Non-MDS half — editable facility inputs (5-Star + turnover auto from
                CMS; accreditation / staffing / hospitalizations entered here). */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Other points (non-MDS) — {view.nonMds.total} pts</div>
                {!editing ? (
                  <button type="button" onClick={() => { setForm(inputsToForm(view.inputs)); setEditing(true); }} /* NO_TRACK */
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <Pencil className="h-3 w-3" /> Edit inputs
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setEditing(false)} /* NO_TRACK */
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                    <button type="button" data-track="qm_action_clicked" onClick={save} disabled={saving}
                      data-track-prop-measure-code="fl_qip_non_mds" data-track-prop-action="save_inputs"
                      className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {!editing ? (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>5-Star: <b>{view.nonMds.fiveStar}</b></span>
                    <span>Accreditation: <b>{view.nonMds.accreditation}</b></span>
                    <span>RN turnover ({view.rnTurnoverSource === 'rn' ? 'RN' : 'total'} {view.rnTurnoverPct ?? '—'}%): <b>{view.nonMds.rnTurnover}</b></span>
                    <span>Hospitalizations: <b>{view.nonMds.hospitalizations}</b></span>
                    <span>Direct-care staffing: <b>{view.nonMds.directCareStaffing}</b></span>
                    <span>SW/Activity staffing: <b>{view.nonMds.socialWorkActivityStaffing}</b></span>
                  </div>
                  {view.nonMds.missing.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Add your facility’s numbers to score more points — tap <b>Edit inputs</b>: {view.nonMds.missing.join(', ').replace(/_/g, ' ')}.</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
                    From CMS (automatic): 5-Star <b className="text-slate-700">{view.nonMds.fiveStar} pt{view.nonMds.fiveStar === 1 ? '' : 's'}</b>. The rest are your facility’s numbers:
                  </div>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">Accreditation <span className="text-slate-400">(Gold Seal / Joint Commission)</span></span>
                    <span className="flex items-center gap-2">
                      <span className="w-10 text-right text-xs text-slate-400">{view.nonMds.accreditation} pts</span>
                      <Toggle on={form.hasAccreditation} onClick={() => updateForm({ hasAccreditation: !form.hasAccreditation })} />
                    </span>
                  </label>
                  <TierField label="Direct-care staffing tier" value={form.directCareStaffingTier}
                    onChange={(v) => updateForm({ directCareStaffingTier: v })} pts={view.nonMds.directCareStaffing} />
                  <TierField label="Social-work / activity staffing tier" value={form.socialWorkActivityStaffingTier}
                    onChange={(v) => updateForm({ socialWorkActivityStaffingTier: v })} pts={view.nonMds.socialWorkActivityStaffing} />
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">Hospitalizations per 1,000 days</span>
                    <span className="flex items-center gap-2">
                      <span className="w-10 text-right text-xs text-slate-400">{view.nonMds.hospitalizations} pts</span>
                      <input type="number" step="0.01" min="0" placeholder="—"
                        value={form.hospitalizationsPer1000 ?? ''}
                        onChange={(e) => updateForm({ hospitalizationsPer1000: e.target.value === '' ? null : Number(e.target.value) })}
                        className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-sm tabular-nums text-slate-700" />
                    </span>
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">RN turnover figure <span className="text-slate-400">({view.nonMds.rnTurnover} pts)</span></span>
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
                      <button type="button" onClick={() => updateForm({ rnTurnoverSource: 'rn' })} /* NO_TRACK */
                        className={form.rnTurnoverSource === 'rn' ? 'rounded-md bg-slate-900 px-2 py-1 text-white' : 'px-2 py-1 text-slate-500'}>RN {view.rnTurnoverPctRn ?? '—'}%</button>
                      <button type="button" onClick={() => updateForm({ rnTurnoverSource: 'total' })} /* NO_TRACK */
                        className={form.rnTurnoverSource === 'total' ? 'rounded-md bg-slate-900 px-2 py-1 text-white' : 'px-2 py-1 text-slate-500'}>Total {view.rnTurnoverPctTotal ?? '—'}%</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Total — spells out Quality + Other = projected total so the two big
                numbers obviously connect (no mental math). */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3">
              <div className="text-sm text-slate-600">
                Quality-measure <b className="text-slate-800">{view.projectedMdsPoints}</b>
                <span className="mx-1.5 text-slate-400">+</span>
                Other points <b className="text-slate-800">{view.nonMds.total}</b>
                <span className="mx-1.5 text-slate-400">=</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums text-slate-900">
                  {view.insufficientData ? '—' : view.projectedTotalPoints}
                </span>
                <span className="text-sm text-slate-500">projected total</span>
                {view.insufficientData ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> No MDS data — nothing to score yet
                  </span>
                ) : view.projectedQualifying ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    <CircleCheck className="h-3.5 w-3.5" /> clears the {view.floor} floor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> {view.projectedPointsToQualify.toFixed(1)} below the {view.floor} floor
                  </span>
                )}
                {/* Partial gaps: some measures scored, some couldn't. The ceiling is
                    the honest denominator — "18 of a possible 40" is a different
                    statement from "18 of 49". */}
                {!view.insufficientData && view.unmeasurableMeasures > 0 && (
                  <span className="text-xs text-slate-500">
                    of a possible <b className="text-slate-700">{view.projectedCeiling}</b> ·{' '}
                    {view.unmeasurableMeasures} measure{view.unmeasurableMeasures === 1 ? '' : 's'} not scored
                  </span>
                )}
              </div>
            </div>

            {view.coding && (
              <CodingAccuracyPanel
                coding={view.coding}
                onCodingChange={(c) => setData((d) => (d ? { ...d, coding: c } : d))}
                onDismiss={setDismiss}
              />
            )}

            <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                <b>Official</b> is CMS’s scoreboard — it runs about a year behind, so it reflects last year’s care.{' '}
                <b>Projected</b> is where you’re headed this year, from your live MDS. Pressure ulcers, incontinence, and
                antipsychotics are scored on CMS’s own adjusted formula, so we show the official number for those (greyed).
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
