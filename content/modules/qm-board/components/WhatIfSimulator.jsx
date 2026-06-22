/**
 * Five-Star what-if simulator (web UX redesign) — the full lever view.
 *
 * Every triggering long-stay five-star measure is one collapsible group, LED BY
 * ITS LEVER — "N movable · up to +Y pts" — so cause→effect is legible. Movable
 * current triggers are emerald Triggering⇄Cleared switches; day-101 crossers that
 * can still be prevented are a visually distinct amber Kept⇄Prevented sub-block;
 * everything locked drops into a collapsed "N carry over this quarter" tail.
 * Rows are just name · faint timing · switch (no per-row badge / guidance prose).
 *
 * Headline = "Projected at quarter-close" (today's triggers + day-101 crossers)
 * so every switch moves the star; Advanced mode reveals the per-measure
 * rate→points math + the anchor-midpoint+Δ→band derivation. All recompute is
 * client-side via the pure predictStars / starProgress — no server round-trip.
 *
 * Ported from qm-what-if-simulator.reference.tsx, adapted to Preact + qmf-sim CSS.
 */
import { useMemo, useState } from 'preact/hooks';
import { predictStars, starProgress } from '../lib/five-star-predictor.js';
import { fiveStarMeasure, pointsForRate, QM_RATING_THRESHOLDS } from '../lib/five-star-scoring.js';
import { groupLever } from '../lib/qm-simulator-view.js';
import { clearGroupForEntry, isFiveStarMds, shortLabel } from '../lib/qm-view-model.js';
import { clearTiming, fullName } from '../lib/qm-tones.js';
import { Stars, TrendArrow, RangeStars, rangeLabel } from './FiveStarCard.jsx';
import { ChevronLeft, RotateCcw, Search, Lock, Star } from './icons.jsx';

const pct = (r) => `${(r * 100).toFixed(1)}%`;

/** One per-domain points-forward row — projected star + projected pts + CMS anchor +
 *  "{pointsToNext} pts to {nextStar}★". Mirrors the card's DomainRow wording; muted
 *  when that axis has no MDS coverage (score null). */
function DomainProgress({ label, axis, pred, cmsStar }) {
  const prog = pred.score != null ? starProgress(axis, pred.score) : null;
  return (
    <span className="qmf-sim__dom">
      <span className="qmf-sim__dom-label">{label}</span>
      {pred.score != null ? (
        <>
          <span className="qmf-sim__dom-star">{pred.predictedStar ?? '—'}★</span>
          <span className="qmf-sim__dom-pts">{Math.round(pred.score)} pts</span>
          {cmsStar != null && <span className="qmf-sim__dom-cms">(CMS {cmsStar}★)</span>}
          {prog && (prog.nextStar != null
            ? <span className="qmf-sim__dom-prog">· <b>{prog.pointsToNext} pts</b> to {prog.nextStar}★</span>
            : <span className="qmc-text--emerald" style={{ fontWeight: 600 }}>· top band</span>)}
        </>
      ) : (
        <span className="qmf-sim__dom-nodata">not enough MDS data yet</span>
      )}
    </span>
  );
}

/** A two-state sliding switch with a state word beside it. Tone separates the two
 *  semantics: emerald = clearing a current trigger, amber = preventing a crosser. */
function Switch({ on, onClick, offLabel, onLabel, tone = 'emerald' }) {
  return (
    <span className="qmf-sw">
      <button type="button" className={`qmf-sw__track ${on ? `qmf-sw__track--on qmf-sw__track--${tone}` : ''}`} onClick={onClick}> {/* NO_TRACK */}
        <span className={`qmf-sw__knob ${on ? 'qmf-sw__knob--on' : ''}`} />
      </button>
      <span className={`qmf-sw__label ${on ? (tone === 'amber' ? 'qmc-text--amber' : 'qmc-text--emerald') : 'qmc-text--slate'}`}>{on ? onLabel : offLabel}</span>
    </span>
  );
}

export function WhatIfSimulator({ prediction, data, upcoming, onBack, onOpenResident }) {
  // `on` holds the flipped toggles: `c:…` = a current trigger cleared, `p:…` = a crosser prevented.
  const [on, setOn] = useState(new Set());
  const [collapsed, setCollapsed] = useState(new Set());
  const [lockedOpen, setLockedOpen] = useState(new Set());
  const [query, setQuery] = useState('');
  const [advanced, setAdvanced] = useState(false);

  const available = prediction?.available;
  const today = data.facilityDate;

  const perMeasure = useMemo(
    () => (available
      ? [...prediction.perMeasure].sort((a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts) || a.label.localeCompare(b.label))
      : []),
    [available, prediction]
  );
  const perMeasureIds = useMemo(() => new Set(perMeasure.map((m) => m.id)), [perMeasure]);

  const leversByMeasure = useMemo(() => {
    const map = new Map();
    if (!available) return map;
    for (const p of data.patients) {
      for (const m of p.measures) {
        if (!m.triggers || !isFiveStarMds(m.id) || !perMeasureIds.has(m.id)) continue;
        const group = clearGroupForEntry(m);
        const timing = clearTiming(m, p, today);
        const arr = map.get(m.id) ?? [];
        arr.push({
          key: `c:${p.patientId}:${m.id}`,
          name: fullName(p) || p.externalPatientId || p.patientId,
          measureId: m.id,
          group,
          when: timing.short,
          locked: group === 'locked',
          patient: p,
          entry: m,
        });
        map.set(m.id, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [available, data.patients, perMeasureIds, today]);

  const crossersByMeasure = useMemo(() => {
    const map = new Map();
    if (!available || !upcoming) return map;
    for (const p of upcoming.upcomingPatients) {
      const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.externalPatientId || p.patientId;
      for (const hit of p.projectedHits) {
        if (!perMeasureIds.has(hit.id)) continue;
        const arr = map.get(hit.id) ?? [];
        arr.push({
          key: `p:${p.patientId}:${hit.id}`,
          name,
          measureId: hit.id,
          days: hit.daysUntilCrossing,
          preventable: !!hit.preventDeadline,
        });
        map.set(hit.id, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.days - b.days);
    return map;
  }, [available, upcoming, perMeasureIds]);

  // Projected rate for a measure at quarter-close: current triggers (minus cleared)
  // plus the crossers who'll land (carries always; preventable unless prevented).
  function measureSim(pm) {
    const crossers = crossersByMeasure.get(pm.id) ?? [];
    let cleared = 0;
    let prevented = 0;
    for (const k of on) {
      const parts = k.split(':');
      if (parts[2] !== pm.id) continue;
      if (parts[0] === 'c') cleared++;
      else if (parts[0] === 'p') prevented++;
    }
    const counting = crossers.length - prevented;
    const numProj = Math.max(0, pm.numNow - cleared) + counting;
    const denProj = pm.denNow + crossers.length;
    const rateNow = denProj > 0 ? numProj / denProj : 0;
    const spec = fiveStarMeasure(pm.id);
    const ptsNow = spec ? pointsForRate(spec, rateNow) : pm.pointsNow;
    return { rateNow, ptsNow, maxPoints: spec?.maxPoints ?? 100, delta: ptsNow - pm.pointsAtAnchor };
  }

  const sim = useMemo(() => {
    if (!available) return null;
    const pairs = prediction.perMeasure.map((pm) => {
      const crossers = crossersByMeasure.get(pm.id) ?? [];
      let cleared = 0;
      let prevented = 0;
      for (const k of on) {
        const parts = k.split(':');
        if (parts[2] !== pm.id) continue;
        if (parts[0] === 'c') cleared++;
        else if (parts[0] === 'p') prevented++;
      }
      const numProj = Math.max(0, pm.numNow - cleared) + (crossers.length - prevented);
      const denProj = pm.denNow + crossers.length;
      return { id: pm.id, rateNow: denProj > 0 ? numProj / denProj : 0, rateAtAnchor: pm.rateAtAnchor };
    });
    const anchor = {
      qm: prediction.anchor.qm,
      ls: prediction.anchor.ls,
      ss: prediction.anchor.ss,
      overall: prediction.anchor.overall,
    };
    return predictStars(anchor, pairs);
  }, [available, on, prediction, crossersByMeasure]);

  if (!available || !sim) {
    return (
      <div className="qmc" style={{ gap: '16px' }}>
        <BackBtn onBack={onBack} />
        <div className="qmc-empty">
          No predicted Five-Star yet for this facility — match it to CMS in Admin → Quality Measures → Facility Matching.
        </div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  // Points-forward readout (mirrors the points-first card): overall hero + per-domain.
  const ovProg = sim.overall.score != null ? starProgress('overall', sim.overall.score) : null;
  const ovDelta = sim.overall.pointsDelta;
  const toggle = (k) => setOn((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const toggleGroup = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleLocked = (id) => setLockedOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="qmc" style={{ gap: '16px' }}>
      <BackBtn onBack={onBack} />

      {/* Live readout */}
      <div className="qmf-fs qmc-rise">
        <div className="qmf-sim__readout">
          <div>
            <div className="qmf-fs__eyebrow">
              <Star className="qmf-star qmf-star--on" fill="currentColor" /> Five-Star what-if simulator
            </div>
            <div className="qmf-fs__headline">
              <div className="qmf-fs__col">
                <span className="qmf-fs__caplabel">CMS now</span>
                <Stars n={prediction.anchor.qm} />
              </div>
              <TrendArrow trend={sim.overall.trend} />
              <div className="qmf-fs__col">
                <span className="qmf-fs__caplabel">Projected at quarter-close</span>
                <Stars n={sim.overall.predictedStar} size="lg" />
              </div>
            </div>
            {/* Hero actionable line — overall points-to-next, live as toggles change */}
            <div className="qmf-fs__hero">
              {ovProg ? (
                ovProg.nextStar != null ? (
                  <span><span className="qmc-text--amber" style={{ fontWeight: 700 }}>{ovProg.pointsToNext} points</span> to {ovProg.nextStar}★ overall</span>
                ) : (
                  <span className="qmc-text--emerald">Overall is in the top band</span>
                )
              ) : (
                <span className="qmc-text--slate">Overall projection pending MDS data</span>
              )}
            </div>
            {/* Per-domain points-forward rows — Long-stay + Short-stay */}
            <div className="qmf-sim__doms">
              <DomainProgress label="Long-stay" axis="long" pred={sim.ls} cmsStar={prediction.anchor.ls} />
              <DomainProgress label="Short-stay" axis="short" pred={sim.ss} cmsStar={prediction.anchor.ss} />
            </div>
            {prediction.starRange && rangeLabel(prediction.starRange.overall) !== '—' && (
              <div className="qmf-sim__absolute">
                <span className="qmc-text--slate">Absolute projection:</span>
                <RangeStars range={prediction.starRange.overall} />
                <b>{rangeLabel(prediction.starRange.overall)}</b>
                <span className="qmc-text--slate">— claims measures not public</span>
              </div>
            )}
          </div>
          <div className="qmf-sim__applied">
            <div className="qmf-sim__applied-n">{on.size}</div>
            <div className="qmf-sim__applied-lbl">what-ifs applied</div>
            {/* Net overall points moved by the current toggles, vs CMS — live */}
            <div className="qmf-sim__netpts">
              {ovDelta > 0 ? <span className="qmc-text--emerald">+{ovDelta} pts vs CMS</span>
                : ovDelta < 0 ? <span className="qmc-text--rose">{ovDelta} pts vs CMS</span>
                : <span className="qmc-text--slate">±0 pts vs CMS</span>}
              {ovProg?.nextStar != null && <span className="qmf-sim__netpts-next">· {ovProg.pointsToNext} to {ovProg.nextStar}★</span>}
            </div>
            {on.size > 0 && (
              <button type="button" className="qmf-sim__reset" onClick={() => setOn(new Set())}><RotateCcw /> Reset</button> /* NO_TRACK */
            )}
          </div>
        </div>
        <p className="qmf-fs__caption">
          What-if mode — flip a switch to model <b>clearing</b> a current trigger or <b>preventing</b> a resident
          crossing day-101, and watch the projected star move. Nothing here changes the chart.
        </p>
      </div>

      {/* Toolbar */}
      <div className="qmf-sim__toolbar">
        <div className="qmc-search qmf-sim__search">
          <Search />
          <input value={query} onInput={(e) => setQuery(e.target.value)} placeholder="Filter residents…" />
        </div>
        <button type="button" className="qmf-sim__tbtn" onClick={() => setCollapsed(new Set())}>Expand all</button> {/* NO_TRACK */}
        <button type="button" className="qmf-sim__tbtn" onClick={() => setCollapsed(new Set(perMeasure.map((m) => m.id)))}>Collapse all</button> {/* NO_TRACK */}
        <label className="qmf-sim__adv">
          <input type="checkbox" checked={advanced} onInput={(e) => setAdvanced(e.target.checked)} /> <b>Advanced mode</b> (show the math)
        </label>
      </div>

      {/* Advanced: how the long-stay star is calculated */}
      {advanced && (
        <div className="qmf-sim__adv-box">
          <div className="qmf-sim__adv-title">How the long-stay star is calculated</div>
          <table className="qmf-sim__adv-table">
            <thead>
              <tr><th>Measure (category)</th><th className="qmf-sim__r">CMS-window rate → pts</th><th className="qmf-sim__r">Projected rate → pts</th><th className="qmf-sim__r">Δ pts</th></tr>
            </thead>
            <tbody>
              {perMeasure.map((pm) => {
                const s = measureSim(pm);
                return (
                  <tr key={pm.id}>
                    <td>{shortLabel(pm.id, pm.label)}</td>
                    <td className="qmf-sim__r qmc-text--slate">{pct(pm.rateAtAnchor)} → {pm.pointsAtAnchor}</td>
                    <td className="qmf-sim__r">{pct(s.rateNow)} → {s.ptsNow}</td>
                    <td className={`qmf-sim__r ${s.delta > 0 ? 'qmc-text--emerald' : s.delta < 0 ? 'qmc-text--rose' : 'qmc-text--slate'}`} style={{ fontWeight: 600 }}>{s.delta > 0 ? '+' : ''}{s.delta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="qmf-sim__adv-note">
            {(() => {
              const midpoint = (sim.ls.score ?? 0) - sim.ls.pointsDelta;
              const band = QM_RATING_THRESHOLDS.long.find((b) => b.stars === (sim.ls.predictedStar ?? 0));
              return (
                <>
                  Long-stay score = <b>CMS anchor</b> ({sim.ls.anchorStar}★ → band midpoint {midpoint}) <b>+ Δ from your projected MDS measures</b> ({sim.ls.pointsDelta >= 0 ? '+' : ''}{sim.ls.pointsDelta}) = <b>{sim.ls.score}</b> → <span className="qmf-sim__starnum">{sim.ls.predictedStar}★</span>
                  {band && <> (band {band.min}–{band.max})</>}. Projected = today's long-stay triggers + residents crossing day-101 this corridor. Claims &amp; short-stay are held at the CMS value.
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Grouped — one collapsible section per measure, led by its lever */}
      <div className="qmf-sim__groups">
        {perMeasure.map((pm) => {
          const allRows = leversByMeasure.get(pm.id) ?? [];
          const allCrossers = crossersByMeasure.get(pm.id) ?? [];
          // Lever (movable count + points freed) is group-wide — unaffected by search.
          const spec = fiveStarMeasure(pm.id);
          const lever = groupLever({
            numNow: pm.numNow,
            denNow: pm.denNow,
            movableCurrent: allRows.filter((l) => !l.locked).length,
            crossersTotal: allCrossers.length,
            crossersPreventable: allCrossers.filter((c) => c.preventable).length,
            pointsAt: (r) => (spec ? pointsForRate(spec, r) : 0),
          });

          // Displayed rows honor the search filter.
          const rows = q ? allRows.filter((l) => l.name.toLowerCase().includes(q)) : allRows;
          const crossers = q ? allCrossers.filter((c) => c.name.toLowerCase().includes(q)) : allCrossers;
          if (rows.length === 0 && crossers.length === 0) return null;

          const movableRows = rows.filter((l) => !l.locked);
          const preventable = crossers.filter((c) => c.preventable);
          const lockedItems = [
            ...rows.filter((l) => l.locked).map((l) => ({ key: l.key, name: l.name, note: 'carries over' })),
            ...crossers.filter((c) => !c.preventable).map((c) => ({ key: c.key, name: c.name, note: `carries at day-101 · ${c.days}d` })),
          ];

          const open = !collapsed.has(pm.id);
          const lockedExpanded = lockedOpen.has(pm.id);
          const s = measureSim(pm);

          return (
            <div key={pm.id} className="qmf-sim__group">
              {/* header — leads with the lever, live projection on the right */}
              <button type="button" className="qmf-sim__ghead" onClick={() => toggleGroup(pm.id)}> {/* NO_TRACK */}
                <span className="qmf-sim__ghead-left">
                  <span className={`qmf-sim__caret ${open ? 'qmf-sim__caret--open' : ''}`}>▸</span>
                  <span className="qmf-sim__gname">{shortLabel(pm.id, pm.label)}</span>
                  {lever.movableCount > 0 ? (
                    <span className="qmf-sim__lever">{lever.movableCount} movable{lever.potentialPts > 0 ? ` · up to +${lever.potentialPts} pts` : ''}</span>
                  ) : (
                    <span className="qmf-sim__lever qmf-sim__lever--none">locked this quarter</span>
                  )}
                </span>
                <span className="qmf-sim__ghead-right">
                  <span className="qmf-sim__grate">CMS {pct(pm.rateAtAnchor)} → <b>{pct(s.rateNow)}</b></span>
                  <span className="qmf-sim__gpts">
                    {s.delta !== 0 ? (
                      <><b>{s.ptsNow}</b>{' '}
                        <span className={s.delta > 0 ? 'qmc-text--emerald' : 'qmc-text--rose'} style={{ fontWeight: 600 }}>({s.delta > 0 ? '+' : ''}{s.delta})</span></>
                    ) : (<b>{s.ptsNow}</b>)}{' '}pts
                  </span>
                </span>
              </button>

              {open && (
                <div className="qmf-sim__body">
                  {/* movable current triggers — emerald clear switches, name + faint timing */}
                  {movableRows.map((l) => {
                    const isOn = on.has(l.key);
                    return (
                      <div key={l.key} className={`qmf-sim__row ${isOn ? 'qmf-sim__row--on' : ''}`}>
                        <button type="button" className="qmf-sim__namebtn" onClick={() => onOpenResident?.(l.patient, l.entry)}>{l.name}</button> {/* NO_TRACK */}
                        <div className="qmf-sim__rowright">
                          <span className="qmf-sim__when">{l.when}</span>
                          <Switch on={isOn} onClick={() => toggle(l.key)} offLabel="Triggering" onLabel="Cleared" tone="emerald" />
                        </div>
                      </div>
                    );
                  })}

                  {/* preventable crossers — amber prevent switches, visually distinct */}
                  {preventable.length > 0 && (
                    <>
                      <div className="qmf-sim__subhead qmf-sim__subhead--amber">Crossing into long-stay — preventable</div>
                      {preventable.map((c) => {
                        const isOn = on.has(c.key);
                        return (
                          <div key={c.key} className={`qmf-sim__row ${isOn ? 'qmf-sim__row--amber' : ''}`}>
                            <span className="qmf-sim__crossname">{c.name}</span>
                            <div className="qmf-sim__rowright">
                              <span className="qmf-sim__crosspill">Crossing in {c.days}d</span>
                              <Switch on={isOn} onClick={() => toggle(c.key)} offLabel="Kept" onLabel="Prevented" tone="amber" />
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* locked tail — out of the switch flow, collapsed by default */}
                  {lockedItems.length > 0 && (
                    <div className="qmf-sim__lockwrap">
                      <button type="button" className="qmf-sim__locktoggle" onClick={() => toggleLocked(pm.id)}> {/* NO_TRACK */}
                        <Lock /> {lockedItems.length} carry over this quarter <span className="qmf-sim__lockcaret">{lockedExpanded ? '▾' : '▸'}</span>
                      </button>
                      {lockedExpanded && (
                        <div className="qmf-sim__lockgrid">
                          {lockedItems.map((it) => (
                            <div key={it.key} className="qmf-sim__lockitem">{it.name} <span className="qmc-text--slate">· {it.note}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BackBtn({ onBack }) {
  return (
    <div className="qmc-bc">
      <button type="button" className="qmc-bc__back" onClick={onBack}><ChevronLeft /> Back to board</button> {/* NO_TRACK */}
    </div>
  );
}
