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
  bucketForActionability, isFiveStarMds, isWhatIfClearable, measureRate,
  projectedNum, ratePct, shortLabel, measureCode, statusBucketForEntry, displayMdsValue,
} from '../lib/qm-view-model.js';
import { fiveStarMeasure, pointsForRate, nextTier } from '../lib/qm-five-star.js';
import { CROSSING, STATUS_BUCKET, clearMicrocopy, crosserToDrill, fullName, prettyDate, quarterLabel } from '../lib/qm-tones.js';
import { ChevronLeft, ChevronRight } from './icons.jsx';

const GROUP_DEFS = [
  { key: 'at_risk',   label: STATUS_BUCKET.at_risk.label,   sub: STATUS_BUCKET.at_risk.sub,   tone: 'rose' },
  { key: 'clearable', label: STATUS_BUCKET.clearable.label, sub: STATUS_BUCKET.clearable.sub, tone: 'sky' },
  { key: 'will_hit',  label: STATUS_BUCKET.will_hit.label,  sub: STATUS_BUCKET.will_hit.sub,  tone: 'slate' },
];

export function MeasureDetail({ currentlyTriggering: data, measureId, onBack, onOpenResident, upcoming }) {
  const [wif, setWif] = useState(false);
  const [cleared, setCleared] = useState(() => new Set());
  const [prevented, setPrevented] = useState(() => new Set());

  const meta = data.measuresEvaluated.find((m) => m.id === measureId);
  const bucket = bucketForActionability(meta?.clearProfile?.actionability);
  const clearable = isWhatIfClearable(bucket);
  const fiveStar = isFiveStarMds(measureId);
  const counts = data.summary.byMeasure[measureId] ?? { triggering: 0, excluded: 0, applicable: 0 };
  const rate = measureRate(counts);

  const people = useMemo(() => {
    const out = [];
    for (const p of data.patients) {
      const entry = p.measures.find((m) => m.id === measureId);
      if (!entry?.triggers) continue;
      out.push({ patient: p, entry, status: statusBucketForEntry(entry) });
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

  const projNum = projectedNum(rate.num, cleared.size);
  const moved = wif && cleared.size > 0;
  const projPct = ratePct(projNum, rate.den);

  const spec = fiveStarMeasure(measureId);
  const curPts = spec ? pointsForRate(spec, rate.rate) : undefined;
  const projPts = spec && rate.den > 0 ? pointsForRate(spec, projNum / rate.den) : curPts;
  const nt = spec ? nextTier(spec, rate.rate) : null;
  const ptsMoved = moved && spec != null && projPts !== curPts;

  const toggleSet = (setter) => (id, value) => setter((prev) => {
    const next = new Set(prev);
    if (value) next.add(id); else next.delete(id);
    return next;
  });
  const toggleCleared = toggleSet(setCleared);
  const togglePrevented = toggleSet(setPrevented);

  function toggleWif() {
    if (wif) { setCleared(new Set()); setPrevented(new Set()); }
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
            <div className="qmc-mhead__rate-line">
              <span className={`qmc-rate ${moved ? 'qmc-rate--struck' : ''}`}>{ratePct(rate.num, rate.den).toFixed(1)}%</span>
              {moved && <span className="qmc-rate__proj">→ {projPct.toFixed(1)}%</span>}
              <span className="qmc-rate__sub">
                {moved ? projNum : rate.num} of {rate.den} residents · {qLabel} locks {prettyDate(data.summary.currentQuarterEnd)}
              </span>
            </div>
            {spec ? (
              <div className="qmc-pts">
                <span className="qmc-pts__main">
                  ≈ {curPts}{ptsMoved && <span className="qmc-text--emerald"> → {projPts}</span>}
                  <span style={{ fontWeight: 400, color: 'var(--slate-400)' }}> / {spec.maxPoints} CMS pts</span>
                </span>
                <span className="qmc-tag qmc-tag--state" title="Estimated from your current observed rate; CMS uses a risk-adjusted 4-quarter average. Directional, not the official refreshed score.">est.</span>
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
            {cleared.size === 0 && prevented.size === 0 && (
              <span style={{ color: 'var(--slate-500)' }}>Mark <strong>Cleared</strong> on residents you'll clear before the cliff — the rate updates live.</span>
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
                {rows.map(({ patient, entry }) => (
                  <PersonRow key={patient.patientId} patient={patient} entry={entry} wif={wif} clearable={clearable}
                    cleared={cleared.has(patient.patientId)} onToggle={(v) => toggleCleared(patient.patientId, v)}
                    onOpen={() => onOpenResident(patient, entry)} />
                ))}
              </div>
            </div>
          );
        })}
        {crossers.length > 0 && (
          <div>
            <div className="qmc-ghead">
              <span className="qmc-dot qmc-dot--violet" />
              <span className="qmc-group__label">Going to trigger soon</span>
              <span className="qmc-group__count">{crossers.length}</span>
              <span className="qmc-group__sub">· Not counting yet · starts when they cross day-101</span>
            </div>
            <div className="qmc-rows">
              {crossers.map(({ patient, hit }) => (
                <CrosserRow key={patient.patientId} patient={patient} hit={hit} wif={wif}
                  prevented={prevented.has(patient.patientId)} onToggle={(v) => togglePrevented(patient.patientId, v)}
                  onOpen={() => { const d = crosserToDrill(patient, hit); onOpenResident(d.patient, d.entry); }} />
              ))}
            </div>
          </div>
        )}
        {people.length === 0 && crossers.length === 0 && (
          <div className="qmc-allclear">No residents triggering {label}.</div>
        )}
      </div>
    </div>
  );
}

function PersonRow({ patient, entry, wif, clearable, cleared, onToggle, onOpen }) {
  const tone = STATUS_BUCKET[statusBucketForEntry(entry)].tone;
  const micro = clearMicrocopy(entry);
  const why0 = entry.evidence[0];
  const ard = patient.target?.ardDate;
  return (
    <div className={`qmc-prow ${cleared ? 'qmc-prow--cleared' : ''}`}>
      <span className={`qmc-prow__dot qmc-dot--${cleared ? 'emerald' : tone}`} />
      <button type="button" className="qmc-prow__main" onClick={onOpen} /* NO_TRACK */>
        <span className={`qmc-prow__name ${cleared ? 'qmc-prow__name--struck' : ''}`}>{fullName(patient)}</span>
        <span className="qmc-prow__meta">
          {patient.stayType} · d{patient.cdif}{patient.payerClassification ? ` · ${patient.payerClassification}` : ''}{ard ? ` · MDS ${prettyDate(ard)}` : ''}
          {why0 ? <span style={{ color: 'var(--slate-500)' }}> · {why0.mdsItem} {displayMdsValue(why0.mdsItem, why0.value)}</span> : null}
        </span>
      </button>
      <span className={`qmc-prow__cta ${cleared ? '' : `qmc-text--${tone}`}`}>{cleared ? 'cleared' : micro}</span>
      {wif ? (
        clearable ? <ClearToggle cleared={cleared} onToggle={onToggle} onLabel="Cleared" />
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
          short · d{patient.cdif}<span className={`qmc-text--${CROSSING.tone}`}> · {hit.bucket}</span>
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
