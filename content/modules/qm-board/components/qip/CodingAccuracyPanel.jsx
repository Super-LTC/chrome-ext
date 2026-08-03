/**
 * CODING ACCURACY — the FL QIP coding-accuracy harvests (terminal prognosis + flu).
 * Ported from superltc `web/components/quality-measures/qm-fl-qip-view.tsx`
 * (lines 267–727: `residentLabel` through `CodingAccuracyPanel`).
 *
 * NOT a score fix: it surfaces residents whose CHART supports a code that isn't
 * on the MDS yet. Coding it (when it's clinically true) takes them out of the
 * measure — that's an accuracy correction that happens to move points.
 *
 * PORT NOTES (differences from the web original, all deliberate):
 *  - Preact, not React. No types/interfaces; JSDoc only where it earns its keep.
 *  - Tailwind class strings are copied VERBATIM from the web component. That is
 *    the point of this port — do not reorder or "tidy" them, or the next diff
 *    against the source stops being readable.
 *  - lucide-react isn't available in the extension. Icons come from `../icons.jsx`.
 *    Substitutions: TriangleAlert→AlertTriangle, CheckCircle2→CircleCheck,
 *    HeartPulse→Activity (closest pulse-line glyph), Syringe→FlaskConical
 *    (closest clinical glyph), Sparkles→Star (closest "upside" glyph).
 *  - NO FETCHING. The web version POST/DELETEs
 *    `/api/facilities/:id/qm-planner/fl-qip-coding-dismissal` inline; a content
 *    script shouldn't own that URL, and the parent already holds the payload. So
 *    `locationId` is gone and the mutation is an `onDismiss(patientId, kind,
 *    dismiss)` prop returning a Promise. The optimistic `moveCoding` hop is kept
 *    exactly as the original had it, and if the promise resolves with fresh
 *    coding we reconcile — same two-phase behaviour, caller-supplied transport.
 *  - The `kind` handed to `onDismiss` is the WIRE string from
 *    `lib/fl-qip-coding-kinds.js`, never a literal — the server validates that
 *    exact set and 400s on anything else.
 *  - Renders inside a Tailwind scope supplied by the parent; no `.sltc-tw`
 *    wrapper here.
 */
// Only useState is used — the original's other hooks live in the parts of the
// file above this range (data fetching / non-MDS form), which didn't come over.
import { useState } from 'preact/hooks';
import {
  AlertTriangle, CircleCheck, ChevronRight, ChevronDown, FlaskConical, Activity,
  Star, X, Undo2, ListChecks,
} from '../icons.jsx';
import { FL_QIP_PROGNOSIS_KIND, FL_QIP_FLU_KIND } from '../../lib/fl-qip-coding-kinds.js';

/** "Last, F." from the candidate's name, falling back to the external id. */
function residentLabel(c) {
  const last = c.lastName?.trim();
  const first = c.firstName?.trim();
  if (last) return first ? `${last}, ${first[0]}.` : last;
  return c.externalPatientId ? `#${c.externalPatientId}` : 'Resident';
}

const CONDITION_LABEL = { dementia: 'Dementia', parkinsons: "Parkinson's", cva: 'CVA' };

function ConditionBadges({ conditions }) {
  return (
    <span className="flex flex-wrap gap-1">
      {conditions.map((c) => (
        <span key={c.condition} className="rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-semibold text-violet-600" title={`Active diagnosis ${c.code}`}>
          {CONDITION_LABEL[c.condition] ?? c.condition}
        </span>
      ))}
    </span>
  );
}

/** A small "+N pts" chip when there's real upside; nothing when there isn't. */
function UpsideChip({ pts }) {
  if (pts <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
      {/* Sparkles → Star (no Sparkles in icons.jsx) */}
      <Star className="h-3 w-3" /> up to +{pts} {pts === 1 ? 'pt' : 'pts'}
    </span>
  );
}

/** A collapsible coding-accuracy opportunity (prognosis / flu / …). */
function OpportunityCard({
  icon, title, subtitle, upsidePts, count, defaultOpen, children,
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const canOpen = count > 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button /* NO_TRACK — expand/collapse within the surface. */
        type="button"
        onClick={() => canOpen && setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left ${canOpen ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{title}</span>
            <UpsideChip pts={upsidePts} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>
        </div>
        {canOpen && (open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />)}
      </button>
      {open && canOpen && <div className="border-t border-slate-100 px-3.5 py-2">{children}</div>}
    </div>
  );
}

const MEASURE_SHORT = {
  adl_decline: 'ADL decline',
  antianxiety_hypnotic_rate: 'Antianxiety',
  walk_indep_worsened: 'Walk decline',
  weight_loss: 'Weight loss',
};

/** Explicit "the chart supports it but it's not entered on the MDS yet" — the gap, in amber. */
function NotCodedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Not entered on the MDS yet">
      {/* TriangleAlert → AlertTriangle */}
      <AlertTriangle className="h-3 w-3" /> Not coded
    </span>
  );
}

/** A measure the resident is in — rose when they're in the numerator (pulling that
 *  rate down, so excluding them actually helps), slate when denominator-only. */
function MeasureTag({ id, inNumerator }) {
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] font-semibold ${inNumerator ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}
      title={inNumerator ? 'Currently pulling this rate down — excluding them helps the score' : 'In this measure but not counting against you'}
    >
      {MEASURE_SHORT[id] ?? id}
    </span>
  );
}

const PROG_GRID = 'grid-cols-[1.3fr_1.2fr_0.9fr_1.3fr_auto]';
const FLU_GRID = 'grid-cols-[1.3fr_1.3fr_0.9fr_0.9fr_auto]';

/** A clearly-visible "Dismiss" chip (hide this resident — e.g. the physician declined). */
function DismissBtn({ onClick }) {
  return (
    <button
      type="button"
      data-track="qm_action_clicked" data-track-prop-measure-code="fl_qip_coding" data-track-prop-action="dismiss"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Dismiss — hide this resident (e.g. physician declined)"
      className="justify-self-end inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
    >
      <X className="h-3 w-3" /> Dismiss
    </button>
  );
}

/** Collapsible list of dismissed residents with an Undo, shared by both cards. */
function DismissedSection({ items, onUndo }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button type="button" /* NO_TRACK — expansion. */ onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Dismissed ({items.length})
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {items.map((it) => (
            <div key={it.patientId} className="flex items-center justify-between gap-2 pl-4 text-xs">
              <span className="truncate text-slate-400"><span className="line-through">{it.label}</span> <span className="text-slate-300">{it.sub}</span></span>
              <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code="fl_qip_coding" data-track-prop-action="undo_dismiss" onClick={() => onUndo(it.patientId)} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700">
                <Undo2 className="h-3 w-3" /> Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The expanded diagnosis detail — matched dx + when each was added to the problem list. */
function DxDetail({ conditions }) {
  return (
    <div className="space-y-1 bg-slate-50/70 px-3 py-2 pl-8 text-xs">
      {conditions.map((cond) => (
        <div key={cond.code} className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-700">{cond.description || cond.label}</span>
          <span className="rounded border border-slate-200 bg-white px-1 py-px text-[10px] tabular-nums text-slate-400">{cond.code}</span>
          <span className="text-[11px] text-slate-400">{cond.addedDate ? `added to problem list ${cond.addedDate}` : 'date added unknown'}</span>
        </div>
      ))}
    </div>
  );
}

/** One prognosis-candidate row — click to expand the matched diagnoses + when each
 *  was added to the problem list (so the reviewer can vet the prognosis basis). */
function ProgRow({ c, onDismiss }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-slate-100">
      {/* NO_TRACK — row expansion, not navigation off the surface. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        className={`grid ${PROG_GRID} cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50`}
      >
        <span className="flex min-w-0 items-center gap-1 text-slate-700">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="truncate">{residentLabel(c)}</span>
        </span>
        <ConditionBadges conditions={c.conditions} />
        <span><NotCodedChip /></span>
        <span className="flex flex-wrap gap-1">
          {c.affectedMeasures.length === 0
            ? <span className="text-[10px] text-slate-300">— not in a scored measure</span>
            : c.affectedMeasures.map((a) => <MeasureTag key={a.measureId} id={a.measureId} inNumerator={a.inNumerator} />)}
        </span>
        <DismissBtn onClick={onDismiss} />
      </div>
      {open && <DxDetail conditions={c.conditions} />}
    </div>
  );
}

/** A read-only prognosis row for the coverage view (coded / dismissed groups) —
 *  name + diagnoses, expandable to the dx detail, with a trailing status/action slot. */
function CoverageRow({ c, right }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-slate-100">
      {/* NO_TRACK — row expansion. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-1 text-slate-700">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="truncate">{residentLabel(c)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2"><ConditionBadges conditions={c.conditions} />{right}</span>
      </div>
      {open && <DxDetail conditions={c.conditions} />}
    </div>
  );
}

/** Coverage progress bar — how many of the qualifying cohort are coded. */
function CoverageBar({ coded, total }) {
  const pct = total ? Math.round((coded / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-slate-800">{coded} of {total} coded</span>
        <span className="tabular-nums text-slate-400">{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Full-screen coverage view for the prognosis opportunity: coded ✓ + not-coded ⚠ +
 *  dismissed, with the coverage ratio and score impact. Reached via "See all". */
function CodingCoverageModal({
  prognosis, onDismiss, onUndo, onClose,
}) {
  const total = prognosis.coded.length + prognosis.candidates.length + prognosis.dismissed.length;
  return (
    /* NO_TRACK — backdrop click closes. */
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" onClick={onClose}>
      {/* NO_TRACK — click-eater so an inside click doesn't reach the backdrop. */}
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Terminal prognosis — coding coverage</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Long-stay residents whose diagnosis list shows dementia / Parkinson’s / CVA. Coding J1400 (life
              expectancy under 6 months, when clinically true) excludes them from ADL-decline & antianxiety.
            </p>
          </div>
          <button type="button" /* NO_TRACK — close. */ onClick={onClose} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3"><CoverageBar coded={prognosis.coded.length} total={total} /></div>
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {prognosis.totalPotentialPoints > 0
            ? <>Coding the {prognosis.candidates.length} not-yet-coded could add up to <b className="text-emerald-700">+{prognosis.totalPotentialPoints}</b> pts.</>
            : <>You’re already in the top band on these measures — coding more won’t move your score right now, but it keeps the MDS accurate.</>}
        </div>

        {/* Not coded — the worklist (dismissable) */}
        {prognosis.candidates.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              <AlertTriangle className="h-3 w-3" /> Not coded ({prognosis.candidates.length})
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-100">
              {prognosis.candidates.map((c) => <ProgRow key={c.patientId} c={c} onDismiss={() => onDismiss(c.patientId)} />)}
            </div>
          </div>
        )}

        {/* Coded — the covered cohort */}
        {prognosis.coded.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
              {/* CheckCircle2 → CircleCheck */}
              <CircleCheck className="h-3 w-3" /> Coded ({prognosis.coded.length})
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-100">
              {prognosis.coded.map((c) => (
                <CoverageRow key={c.patientId} c={c} right={<span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">J1400 coded</span>} />
              ))}
            </div>
          </div>
        )}

        {/* Dismissed — with undo */}
        {prognosis.dismissed.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dismissed ({prognosis.dismissed.length})</div>
            <div className="overflow-hidden rounded-lg border border-slate-100">
              {prognosis.dismissed.map((c) => (
                <CoverageRow key={c.patientId} c={c} right={
                  <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code="fl_qip_coding" data-track-prop-action="undo_dismiss" onClick={() => onUndo(c.patientId)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700">
                    <Undo2 className="h-3 w-3" /> Undo
                  </button>
                } />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Optimistically move a candidate between the active + dismissed lists (server refresh corrects impact). */
export function moveCoding(coding, patientId, kind, dismiss) {
  if (kind === 'prognosis') {
    const p = coding.prognosis;
    const src = dismiss ? p.candidates : p.dismissed;
    const cand = src.find((c) => c.patientId === patientId);
    if (!cand) return coding;
    const candidates = dismiss ? p.candidates.filter((c) => c.patientId !== patientId) : [...p.candidates, cand];
    const dismissed = dismiss ? [...p.dismissed, cand] : p.dismissed.filter((c) => c.patientId !== patientId);
    return { ...coding, prognosis: { ...p, candidates, dismissed, candidateCount: candidates.length } };
  }
  const f = coding.flu;
  const src = dismiss ? f.candidates : f.dismissed;
  const cand = src.find((c) => c.patientId === patientId);
  if (!cand) return coding;
  const candidates = dismiss ? f.candidates.filter((c) => c.patientId !== patientId) : [...f.candidates, cand];
  const dismissed = dismiss ? [...f.dismissed, cand] : f.dismissed.filter((c) => c.patientId !== patientId);
  return { ...coding, flu: { ...f, candidates, dismissed, candidateCount: candidates.length } };
}

/** The "Coding accuracy" panel — coding-accuracy harvests (prognosis + flu). NOT a
 *  score fix: it surfaces residents whose CHART supports a code not yet on the MDS.
 *
 * @param {object}   props
 * @param {object}   props.coding          FlQipCodingOpportunities payload ({ prognosis, flu, totalPotentialPoints }).
 * @param {(c:object)=>void} props.onCodingChange  Hand the parent a new coding payload (optimistic + reconciled).
 * @param {(patientId:string, kind:string, dismiss:boolean)=>Promise<any>} props.onDismiss
 *        Persist a dismissal (`dismiss=true`) or undo it (`false`). `kind` is the
 *        wire string from lib/fl-qip-coding-kinds.js. May resolve with fresh
 *        coding (either the payload itself or `{ coding }`) to reconcile with.
 */
export function CodingAccuracyPanel({ coding, onCodingChange, onDismiss }) {
  const prog = coding.prognosis;
  const flu = coding.flu;
  const progCounting = prog.candidates.filter((c) => c.affectedMeasures.length > 0).length;
  const anyNumerator = prog.candidates.some((c) => c.affectedMeasures.some((a) => a.inNumerator));
  const progCohort = prog.coded.length + prog.candidates.length + prog.dismissed.length;
  const [coverageOpen, setCoverageOpen] = useState(false);

  // Dismiss / undo — optimistic local move, then reconcile with the server's fresh
  // harvest (which also recomputes point impact). Offline preview keeps the optimistic move.
  //
  // PORT: the web version did the POST/DELETE itself. Here the caller owns the
  // transport via onDismiss; everything else (optimistic-first, reconcile-if-we-
  // get-something, swallow failures) is unchanged.
  async function mutate(patientId, kind, dismiss) {
    onCodingChange(moveCoding(coding, patientId, kind, dismiss));
    try {
      const fresh = await onDismiss(patientId, kind === 'prognosis' ? FL_QIP_PROGNOSIS_KIND : FL_QIP_FLU_KIND, dismiss);
      // Accept either the raw coding payload or the API's `{ coding }` envelope.
      const next = fresh && (fresh.coding ?? (fresh.prognosis ? fresh : null));
      if (next) onCodingChange(next);
    } catch { /* offline preview — keep optimistic */ }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Coding accuracy</div>
        {coding.totalPotentialPoints > 0 && (
          <span className="text-xs text-slate-500">up to <b className="text-emerald-700">+{coding.totalPotentialPoints}</b> pts if fully coded</span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Residents whose chart supports an MDS code that isn’t entered yet. Coding it (when it’s clinically true)
        takes them out of the measure.
      </p>

      {/* Prognosis exclusions */}
      <OpportunityCard
        icon={<Activity className="h-4 w-4" />}  /* HeartPulse → Activity */
        title="Terminal prognosis exclusions"
        subtitle={
          prog.candidateCount === 0
            ? 'No residents with an uncoded qualifying prognosis.'
            : <>{prog.candidateCount} resident{prog.candidateCount === 1 ? '' : 's'} with a qualifying diagnosis and no ≤6-month prognosis on the MDS{progCounting > 0 ? ` · ${progCounting} in a scored measure` : ''}.</>
        }
        upsidePts={prog.totalPotentialPoints}
        count={prog.candidateCount + prog.dismissed.length}
        defaultOpen
      >
        {prog.candidates.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <div className={`grid ${PROG_GRID} gap-2 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400`}>
              <span>Resident</span><span>Diagnosis</span><span>Prognosis (J1400)</span><span>In these measures</span><span />
            </div>
            {prog.candidates.map((c) => (
              <ProgRow key={c.patientId} c={c} onDismiss={() => mutate(c.patientId, 'prognosis', true)} />
            ))}
          </div>
        )}
        {prog.candidates.length > 0 && (
          <p className="mt-1.5 text-[10px] text-slate-400">
            Coding J1400 (life expectancy under 6 months) removes them from ADL-decline & antianxiety.
            {anyNumerator ? ' Rose = currently pulling that rate down (excluding them helps).' : ' None are pulling a rate down right now, so it won’t move points yet.'}
          </p>
        )}
        <DismissedSection
          items={prog.dismissed.map((c) => ({ patientId: c.patientId, label: residentLabel(c), sub: c.conditions.map((x) => x.label).join(', ') }))}
          onUndo={(id) => mutate(id, 'prognosis', false)}
        />
        {progCohort > 0 && (
          <button /* NO_TRACK — opens the roster modal inside this surface. */
            type="button"
            onClick={() => setCoverageOpen(true)}
            className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100/60"
          >
            <span className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              View full roster — {prog.coded.length} of {progCohort} coded ({Math.round((prog.coded.length / progCohort) * 100)}%)
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </OpportunityCard>

      {/* Flu documentation */}
      <OpportunityCard
        icon={<FlaskConical className="h-4 w-4" />}  /* Syringe → FlaskConical */
        title="Flu documentation"
        subtitle={
          flu.candidateCount > 0
            ? <>{flu.candidateCount} resident{flu.candidateCount === 1 ? '' : 's'} failing flu whose immunization record shows a refusal or receipt not on the MDS{flu.impact.reaches100 && flu.impact.pointDelta > 0 ? ' — coding them reaches 100%' : ''}.</>
            : flu.impact.liveFailures > 0
              ? <>{flu.impact.liveFailures} resident{flu.impact.liveFailures === 1 ? '' : 's'} failing flu, but no immunization record to code from — they need a vaccination, not a code.</>
              : 'All current residents are vaccinated or already coded.'
        }
        upsidePts={flu.impact.pointDelta}
        count={flu.candidateCount + flu.dismissed.length}
        defaultOpen
      >
        {flu.candidates.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <div className={`grid ${FLU_GRID} gap-2 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400`}>
              <span>Resident</span><span>Chart shows</span><span>On MDS (O0250)</span><span>Code</span><span />
            </div>
            {flu.candidates.map((c) => (
              <div key={c.patientId} className={`grid ${FLU_GRID} items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm`}>
                <span className="truncate text-slate-700">{residentLabel(c)}</span>
                <span><span className="rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-semibold text-sky-600">{c.immStatus}{c.immDate ? ` · ${c.immDate}` : ''}</span></span>
                <span><NotCodedChip /></span>
                <span><span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] font-bold text-emerald-700" title={c.note}>{c.suggestedCode}</span></span>
                <DismissBtn onClick={() => mutate(c.patientId, 'flu', true)} />
              </div>
            ))}
          </div>
        )}
        {flu.impact.genuineMisses > 0 && (
          <p className="mt-1.5 text-[10px] text-slate-400">
            {flu.impact.genuineMisses} other{flu.impact.genuineMisses === 1 ? '' : 's'} truly missed the vaccine — those need a vaccination, not a code.
          </p>
        )}
        <DismissedSection
          items={flu.dismissed.map((c) => ({ patientId: c.patientId, label: residentLabel(c), sub: c.immStatus }))}
          onUndo={(id) => mutate(id, 'flu', false)}
        />
      </OpportunityCard>

      {coverageOpen && (
        <CodingCoverageModal
          prognosis={prog}
          onDismiss={(id) => mutate(id, 'prognosis', true)}
          onUndo={(id) => mutate(id, 'prognosis', false)}
          onClose={() => setCoverageOpen(false)}
        />
      )}
    </div>
  );
}
