/**
 * Surface B — measure detail (one measure's residents + what-if + Five-Star).
 *
 * Ported from web/components/quality-measures/qm-measure-detail.tsx (PR #626),
 * adapted to Preact + `qmc-` CSS. Live rate %, estimated Five-Star points,
 * a What-if mode that recomputes the rate as you mark residents Cleared, and
 * residents grouped by actionability status. Crossers (day-101) render only
 * when an `upcoming` payload is supplied (the extension doesn't wire it yet).
 */
import { useMemo, useState } from 'preact/hooks';
import {
  isFiveStarMds, measureRate, crosserCountsThisQuarter, reCodeClearableIds,
  projectedNum, ratePct, shortLabel, measureCode, clearGroupForEntry, displayMdsValue,
} from '../lib/qm-view-model.js';
import { fiveStarMeasure, pointsForRate, nextTier } from '../lib/qm-five-star.js';
import { buildDenominatorView, windowedRate } from '../lib/qm-denominator-view.js';
import { quarterTrendForMeasure } from '../lib/qm-quarter-trend-view.js';
import { CROSSING, CLEAR_GROUP, clearMicrocopy, crosserToDrill, fullName, prettyDate, quarterLabel, nextQuarterLabel, stayDayLabel } from '../lib/qm-tones.js';
import { DenominatorPanel } from './DenominatorPanel.jsx';
import { QuarterTrend, QuarterTrendChip } from './QuarterTrend.jsx';
import { ChevronLeft, ChevronRight, Users } from './icons.jsx';

const GROUP_DEFS = [
  { key: 'clear_mds', label: CLEAR_GROUP.clear_mds.label, sub: CLEAR_GROUP.clear_mds.sub, tone: CLEAR_GROUP.clear_mds.tone },
  { key: 'clinical',  label: CLEAR_GROUP.clinical.label,  sub: CLEAR_GROUP.clinical.sub,  tone: CLEAR_GROUP.clinical.tone },
  { key: 'locked',    label: CLEAR_GROUP.locked.label,    sub: CLEAR_GROUP.locked.sub,    tone: CLEAR_GROUP.locked.tone },
];

export function MeasureDetail({ currentlyTriggering: data, measureId, scoreContext, onBack, onOpenResident, upcoming, quarterRates, rolling }) {
  // Opened from the FL QIP view — that program scores on percentile bands, not
  // Five-Star star points, so the star-point estimates below would be wrong here.
  // The RATE what-if is still correct (bands are driven by the rate), so we keep
  // it and just replace the point block with a pointer back to the QIP table.
  const isFlQip = scoreContext === 'fl_qip';
  const [wif, setWif] = useState(false);
  const [cleared, setCleared] = useState(() => new Set());
  const [prevented, setPrevented] = useState(() => new Set());
  const [showDenominator, setShowDenominator] = useState(false);
  const [showTrend, setShowTrend] = useState(false);

  const meta = data.measuresEvaluated.find((m) => m.id === measureId);
  const fiveStar = isFiveStarMds(measureId);
  const counts = data.summary.byMeasure[measureId] ?? { triggering: 0, excluded: 0, applicable: 0 };
  const rate = measureRate(counts);

  // Windowed (discharged-inclusive) denominator — the CORRECT CMS rate. The
  // headline shows it when loaded; the worklist below stays active-only (you can
  // only clear active residents this quarter). Falls back to active until loaded.
  const denominatorView = useMemo(
    () => (quarterRates ? buildDenominatorView(quarterRates) : null),
    [quarterRates]
  );
  const windowed = denominatorView ? windowedRate(denominatorView, measureId) : null;
  const denom = denominatorView?.byMeasure.get(measureId) ?? null;
  const headlineNum = windowed ? windowed.num : rate.num;
  const headlineDen = windowed ? windowed.den : rate.den;

  // Rolling 4-quarter trend for this measure — only when rolling data is present
  // AND the measure has at least one applicable quarter (claims measures render
  // nothing).
  const trend = useMemo(
    () => (rolling ? quarterTrendForMeasure(rolling, measureId) : null),
    [rolling, measureId]
  );
  const hasTrend = trend && trend.points.some((p) => p.present);

  const people = useMemo(() => {
    const out = [];
    for (const p of data.patients) {
      const entry = p.measures.find((m) => m.id === measureId);
      if (!entry?.triggers) continue;
      out.push({ patient: p, entry, status: clearGroupForEntry(entry) });
    }
    return out;
  }, [data.patients, measureId]);

  const crossers = useMemo(() => {
    if (!upcoming) return [];
    const out = [];
    for (const p of upcoming.upcomingPatients) {
      const hit = p.projectedHits.find((h) => h.id === measureId);
      if (hit) out.push({ patient: p, hit });
    }
    return out.sort((a, b) => a.hit.daysUntilCrossing - b.hit.daysUntilCrossing);
  }, [upcoming, measureId]);

  // Quarter-scope the crossers (PR #654): a resident who reaches day-101 AFTER
  // the quarter locks becomes long-stay next quarter and can't move this rate.
  const qEnd = data.summary.currentQuarterEnd;
  const crossersThisQ = crossers.filter((c) => crosserCountsThisQuarter(c.hit.crossingDate, qEnd));
  const crossersNextQ = crossers.filter((c) => !crosserCountsThisQuarter(c.hit.crossingDate, qEnd));

  // The ONLY honest what-if seed: residents whose trigger is a free MDS coding
  // fix (actionType 'modification'). NOT nextObraPreview.wouldClear — that
  // assumes the clinical work (d/c the drug, heal the wound) is already done and
  // projects a fake 0%. Empty for every standard measure → what-if opens clean.
  const seed = useMemo(() => reCodeClearableIds(data.patients, measureId), [data.patients, measureId]);

  const projNum = projectedNum(rate.num, cleared.size);
  const moved = wif && cleared.size > 0;
  const projPct = ratePct(projNum, rate.den);

  const spec = fiveStarMeasure(measureId);
  const curPts = spec ? pointsForRate(spec, rate.rate) : undefined;
  const projPts = spec && rate.den > 0 ? pointsForRate(spec, projNum / rate.den) : curPts;
  // curPts/projPts stay on the ACTIVE base (the what-if only clears active
  // residents, so the → move must be computed on the active denominator). The
  // next-tier coaching, though, compares against the real current score CMS would
  // assign — that's the windowed rate when loaded.
  const nt = spec ? nextTier(spec, windowed ? windowed.rate : rate.rate) : null;
  const ptsMoved = moved && spec != null && projPts !== curPts;

  const toggleSet = (setter) => (id, value) => setter((prev) => {
    const next = new Set(prev);
    if (value) next.add(id); else next.delete(id);
    return next;
  });
  const toggleCleared = toggleSet(setCleared);
  const togglePrevented = toggleSet(setPrevented);

  function toggleWif() {
    if (wif) {
      setCleared(new Set());
      setPrevented(new Set());
    } else {
      // Seed only the free re-code clears (empty for standard measures).
      setCleared(new Set(seed));
    }
    setWif((v) => !v);
  }

  const label = shortLabel(measureId, meta?.label ?? '');
  const code = measureCode(measureId);
  const qLabel = quarterLabel(data.summary.currentQuarterEnd);

  return (
    <div className="qmc" style={{ gap: '16px' }}>
      {/* Breadcrumb */}
      <div className="qmc-bc">
        <button type="button" className="qmc-bc__back" onClick={onBack}><ChevronLeft /> All measures</button> {/* NO_TRACK */}
        <span style={{ color: 'var(--slate-300)' }}>/</span>
        <div className="qmc-bc__crumb">
          {label}
          {code && <span className="qmc-tile__code">{code}</span>}
          {fiveStar ? <span className="qmc-tag qmc-tag--star">5★</span> : <span className="qmc-tag qmc-tag--state">state</span>}
        </div>
      </div>

      {/* Header card */}
      <div className="qmc-hero qmc-rise">
        <div className="qmc-mhead">
          <div>
            <div className="qmc-eyebrow" style={{ letterSpacing: '.14em' }}>{meta?.label ?? label}</div>
            {/* Headline = the WINDOWED CMS rate (incl. discharged) when loaded;
                falls back to the active-only rate, labeled "active" so it never
                poses as the CMS number before the real one lands. The what-if
                overlay (→ projPct) is the ACTIVE simulation, so it strikes the
                active rate, not the CMS rate. */}
            <div className="qmc-mhead__rate-line">
              <span className={`qmc-rate ${moved && !windowed ? 'qmc-rate--struck' : ''}`}>{ratePct(headlineNum, headlineDen).toFixed(1)}%</span>
              <span className="qmc-rate__tag">{windowed ? 'CMS' : 'active'}</span>
              {moved && <span className="qmc-rate__proj">→ {projPct.toFixed(1)}% <small>active</small></span>}
              <span className="qmc-rate__sub">
                {headlineNum} of {headlineDen} {windowed ? 'residents (CMS window)' : 'active residents'} · {qLabel} locks {prettyDate(data.summary.currentQuarterEnd)}
              </span>
            </div>
            {/* Active worklist count vs CMS rate — reconciled so they never read as
                a contradiction. Big % is the CMS (windowed) rate; the worklist
                acts on the active triggering residents you can still move. */}
            {windowed && (
              <div className="qmc-recon">
                <span><b>{counts.triggering}</b> active triggering · {ratePct(rate.num, rate.den).toFixed(1)}% active rate</span>
                {denom && (
                  <button type="button" className="qmc-recon__denom" onClick={() => setShowDenominator(true)}> {/* NO_TRACK */}
                    <Users /> View denominator
                  </button>
                )}
              </div>
            )}
            {/* Rolling 4-quarter trend — collapsed to a compact "vs last quarter"
                chip by default; click to expand the full 4-bar chart. Only when
                rolling data is present AND the measure has applicable quarters. */}
            {hasTrend && (
              <div className="qmc-mhead__trend">
                <QuarterTrendChip trend={trend} higherIsBetter={spec?.higherIsBetter ?? false}
                  expanded={showTrend} onToggle={() => setShowTrend((s) => !s)} />
                {showTrend && (
                  <div className="qmc-mhead__trend-chart">
                    <QuarterTrend trend={trend} higherIsBetter={spec?.higherIsBetter ?? false} label={label} />
                  </div>
                )}
              </div>
            )}
            {isFlQip ? (
              <div className="qmc-pts__hint" style={{ marginTop: '8px' }}>
                Florida QIP scores this on percentile bands — see the QIP table for points. The what-if below shows the rate move.
              </div>
            ) : spec ? (
              <div className="qmc-pts">
                <span className="qmc-pts__main">
                  ≈ {curPts}{ptsMoved && <span className="qmc-text--emerald"> → {projPts}</span>}
                  <span style={{ fontWeight: 400, color: 'var(--slate-400)' }}> / {spec.maxPoints} CMS pts</span>
                </span>
                <span className="qmc-tag qmc-tag--state" title="Estimated from your ACTIVE observed rate (the what-if can only clear active residents, so the → move is computed on the active denominator). CMS uses a risk-adjusted 4-quarter average; directional, not the official refreshed score.">active est.</span>
                {nt && !ptsMoved && (
                  <span className="qmc-pts__hint">· {(nt.delta * 100).toFixed(1)}% {spec.higherIsBetter ? 'higher' : 'lower'} → +{nt.points - (curPts ?? 0)} pts</span>
                )}
                {spec.riskAdjusted && <span className="qmc-pts__hint qmc-text--amber" title="CMS risk-adjusts this measure; our observed rate approximates the adjusted rate.">· risk-adjusted (approx)</span>}
              </div>
            ) : (
              <div className="qmc-pts__hint" style={{ marginTop: '8px' }}>State-survey measure — not part of the Five-Star QM score.</div>
            )}
          </div>
          <div className="qmc-wif">
            <div className="qmc-wif__row">
              <span className="qmc-wif__label">What-if mode</span>
              <button type="button" role="switch" aria-checked={wif} onClick={toggleWif} /* NO_TRACK */
                className={`qmc-switch ${wif ? 'qmc-switch--on' : ''}`}><span className="qmc-switch__knob" /></button>
            </div>
            <span className="qmc-pts__hint">{wif ? 'on — mark Kept / Cleared below' : 'model clearing residents'}</span>
          </div>
        </div>
        {wif && (
          <div className="qmc-wif-note">
            {seed.length > 0 && (
              <div className="qmc-wif-note__row">
                <span className="qmc-wif-pill qmc-wif-pill--emerald">seeded</span>
                <span style={{ color: 'var(--slate-500)' }}>Pre-checked the {seed.length} resident{seed.length === 1 ? '' : 's'} whose trigger is a free MDS re-code — uncheck any you can't fix.</span>
              </div>
            )}
            {cleared.size === 0 && prevented.size === 0 && seed.length === 0 && (
              <span style={{ color: 'var(--slate-500)' }}>Mark <strong>Cleared</strong> on residents you'll clear before the cliff — this models the rate only; the clinical work (d/c the drug, heal the wound, query a Dx) still has to happen first.</span>
            )}
            {cleared.size > 0 && (
              <div className="qmc-wif-note__row">
                <span className="qmc-wif-pill qmc-wif-pill--emerald">{cleared.size} cleared</span>
                rate {ratePct(rate.num, rate.den).toFixed(1)}% → <span className="qmc-text--emerald" style={{ fontWeight: 600 }}>{projPct.toFixed(1)}%</span>
              </div>
            )}
            {prevented.size > 0 && (
              <div className="qmc-wif-note__row">
                <span className="qmc-wif-pill qmc-wif-pill--violet">{prevented.size} prevented</span>
                future hit{prevented.size === 1 ? '' : 's'} stopped before day-101 — <span style={{ color: 'var(--slate-400)' }}>today's rate unchanged</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status-grouped people */}
      <div className="qmc-worklist">
        {GROUP_DEFS.map((g) => {
          const rows = people.filter((p) => p.status === g.key);
          if (rows.length === 0) return null;
          return (
            <div key={g.key}>
              <div className="qmc-ghead">
                <span className={`qmc-dot qmc-dot--${g.tone}`} />
                <span className="qmc-group__label">{g.label}</span>
                <span className="qmc-group__count">{rows.length}</span>
                <span className="qmc-group__sub">· {g.sub}</span>
              </div>
              <div className="qmc-rows">
                {rows.map(({ patient, entry }) => {
                  // A clear-with-MDS row whose earliest clear date lands AFTER the
                  // quarter locks can't help this quarter's number — flag it.
                  const cd = entry.cliffInfo?.earliestClearDate ?? entry.clearGuidance?.clearDate;
                  const afterLock = g.key === 'clear_mds' && !!cd && cd.slice(0, 10) > qEnd.slice(0, 10);
                  return (
                    <PersonRow key={patient.patientId} patient={patient} entry={entry} wif={wif}
                      cleared={cleared.has(patient.patientId)} afterLock={afterLock} onToggle={(v) => toggleCleared(patient.patientId, v)}
                      onOpen={() => onOpenResident(patient, entry, measureId)} />
                  );
                })}
              </div>
            </div>
          );
        })}
        {[
          { rows: crossersThisQ, tone: 'violet', muted: false, label: 'Going to trigger soon',
            sub: `Not counting yet · cross day-101 before ${qLabel} locks` },
          { rows: crossersNextQ, tone: 'slate', muted: true, label: `Crosses after ${qLabel} locks`,
            sub: `counts in ${nextQuarterLabel(qEnd)} · today's rate unchanged` },
        ].map((grp) => grp.rows.length > 0 && (
          <div key={grp.label} className={grp.muted ? 'qmc-cross-next' : undefined}>
            <div className="qmc-ghead">
              <span className={`qmc-dot qmc-dot--${grp.tone}`} />
              <span className="qmc-group__label">{grp.label}</span>
              <span className="qmc-group__count">{grp.rows.length}</span>
              <span className="qmc-group__sub">· {grp.sub}</span>
            </div>
            <div className="qmc-rows">
              {grp.rows.map(({ patient, hit }) => (
                <CrosserRow key={patient.patientId} patient={patient} hit={hit} wif={wif}
                  prevented={prevented.has(patient.patientId)} onToggle={(v) => togglePrevented(patient.patientId, v)}
                  onOpen={() => { const d = crosserToDrill(patient, hit); onOpenResident(d.patient, d.entry, measureId); }} />
              ))}
            </div>
          </div>
        ))}
        {people.length === 0 && crossers.length === 0 && (
          <div className="qmc-allclear">No residents triggering {label}.</div>
        )}
      </div>

      {/* Denominator-roster modal — who's in / excluded / discharged-locked for
          this measure's windowed CMS denominator (same panel the tiles use). */}
      {showDenominator && denom && meta && (
        <DenominatorPanel open meta={meta} denom={denom} onClose={() => setShowDenominator(false)} />
      )}
    </div>
  );
}

function PersonRow({ patient, entry, wif, cleared, afterLock, onToggle, onOpen }) {
  const group = clearGroupForEntry(entry);
  const tone = CLEAR_GROUP[group].tone;
  // Only a resident with a path this stay (clear_mds or clinical) can be marked
  // Cleared. A locked resident is destined to count — letting them be "cleared"
  // would wrongly drop the projected rate (the bug this fixes).
  const rowClearable = group !== 'locked';
  const micro = clearMicrocopy(entry);
  const why0 = entry.evidence[0];
  const ard = patient.target?.ardDate;
  return (
    <div className={`qmc-prow ${cleared ? 'qmc-prow--cleared' : ''}`}>
      <span className={`qmc-prow__dot qmc-dot--${cleared ? 'emerald' : tone}`} />
      <button type="button" className="qmc-prow__main" onClick={onOpen} /* NO_TRACK */>
        <span className={`qmc-prow__name ${cleared ? 'qmc-prow__name--struck' : ''}`}>{fullName(patient)}</span>
        <span className="qmc-prow__meta">
          {stayDayLabel(patient)}{patient.payerClassification ? ` · ${patient.payerClassification}` : ''}{ard ? ` · MDS ${prettyDate(ard)}` : ''}
          {why0 ? <span style={{ color: 'var(--slate-500)' }}> · {why0.mdsItem} {displayMdsValue(why0.mdsItem, why0.value)}</span> : null}
        </span>
      </button>
      <span className={`qmc-prow__cta ${cleared ? '' : afterLock ? 'qmc-text--slate' : `qmc-text--${tone}`}`}>
        {cleared ? 'cleared' : micro}
        {afterLock && !cleared && <span className="qmc-prow__nextq">next quarter</span>}
      </span>
      {wif ? (
        rowClearable ? <ClearToggle cleared={cleared} onToggle={onToggle} onLabel="Cleared" />
                     : <span className="qmc-locked">Locked</span>
      ) : <ChevronRight className="qmc-row__chev" />}
    </div>
  );
}

function CrosserRow({ patient, hit, wif, prevented, onToggle, onOpen }) {
  const canPrevent = hit.bucket !== 'unavoidable';
  const why0 = hit.evidence[0];
  return (
    <div className={`qmc-prow ${prevented ? 'qmc-prow--cleared' : ''}`}>
      <span className={`qmc-prow__dot qmc-dot--${prevented ? 'emerald' : CROSSING.tone}`} />
      <button type="button" className="qmc-prow__main" onClick={onOpen} /* NO_TRACK */>
        <span className={`qmc-prow__name ${prevented ? 'qmc-prow__name--struck' : ''}`}>{fullName(patient)}</span>
        <span className="qmc-prow__meta">
          {stayDayLabel(patient)}<span className={`qmc-text--${CROSSING.tone}`}> · {hit.bucket}</span>
          {why0 ? <span style={{ color: 'var(--slate-500)' }}> · {why0.mdsItem} {displayMdsValue(why0.mdsItem, why0.value)}</span> : null}
        </span>
      </button>
      <span className={`qmc-prow__cta ${prevented ? '' : `qmc-text--${CROSSING.tone}`}`}>{prevented ? 'prevented' : `crosses ${prettyDate(hit.crossingDate)}`}</span>
      {wif ? (
        canPrevent ? <ClearToggle cleared={prevented} onToggle={onToggle} onLabel="Prevent" />
                   : <span className="qmc-locked">Unavoidable</span>
      ) : <ChevronRight className="qmc-row__chev" />}
    </div>
  );
}

function ClearToggle({ cleared, onToggle, onLabel }) {
  return (
    <div className="qmc-toggle">
      <button type="button" className={!cleared ? 'qmc-toggle--kept' : ''} onClick={() => onToggle(false)}>Kept</button> {/* NO_TRACK */}
      <button type="button" className={cleared ? 'qmc-toggle--on' : ''} onClick={() => onToggle(true)}>{onLabel}</button> {/* NO_TRACK */}
    </div>
  );
}
