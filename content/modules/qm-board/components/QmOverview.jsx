/**
 * Surface A — QM Command Center dashboard.
 *
 * Ported from web/components/quality-measures/qm-overview.tsx (PR #626),
 * adapted to Preact + the `qmc-` CSS tone system. Buckets residents by
 * actionability (at-risk / clearable / will-hit) via the pure view-model,
 * NOT by raw cliff urgency.
 *
 * `upcoming` (day-101 crossers) is optional — the extension doesn't wire the
 * upcoming endpoint yet, so the "Coming soon" group is simply absent. All
 * crosser code paths degrade gracefully to empty.
 */
import { useMemo, useState } from 'preact/hooks';
import {
  bucketForActionability, isFiveStarMds, isWhatIfClearable, measureRate, ratePct,
  shortLabel, measureCode, statusBucketForEntry, statusBucketForRow, statusRank, measureInLens,
} from '../lib/qm-view-model.js';
import { hasActiveQip, qipForState } from '../lib/qip-programs.js';
import {
  URGENCY, CROSSING, STATUS_BUCKET, entryUrgency, soonestCliffDays,
  crosserToDrill, fullName, prettyDate, quarterLabel, stayDayLabel,
} from '../lib/qm-tones.js';
import { ShieldCheck, CalendarClock, Activity, ChevronRight, ChevronDown, CircleCheck, Search, X, TrendingDown } from './icons.jsx';

// Tile footer copy keyed by the measure's actionability bucket.
const BUCKET_FOOTER = {
  clearable:   { tone: 'sky',    label: (n) => `${n} actionable` },
  trajectory:  { tone: 'sky',    label: (n) => `${n} clinical` },
  cant_clear:  { tone: 'slate',  label: () => 'time-based' },
  locked:      { tone: 'slate',  label: () => 'stay-locked' },
  coming_soon: { tone: 'violet', label: (n) => `${n} crossing` },
};

const SEGMENTS = [
  { key: 'at_risk',   label: STATUS_BUCKET.at_risk.label,   tone: 'rose' },
  { key: 'clearable', label: STATUS_BUCKET.clearable.label, tone: 'sky' },
  { key: 'will_hit',  label: STATUS_BUCKET.will_hit.label,  tone: 'slate' },
  { key: 'clear',     label: 'Clear',                       tone: 'emerald' },
];

const WORK_GROUPS = [
  { key: 'at_risk',   label: STATUS_BUCKET.at_risk.label,   sub: 'A lever still exists — act before the cliff',  tone: 'rose' },
  { key: 'clearable', label: STATUS_BUCKET.clearable.label, sub: 'A lever exists, with runway before the cliff', tone: 'sky' },
  { key: 'will_hit',  label: STATUS_BUCKET.will_hit.label,  sub: 'No lever this stay — FYI so iQIES never surprises', tone: 'slate' },
];

export function QmOverview({
  data, upcoming, onOpenMeasure, onOpenResident, signalCount = 0, onOpenSignals, onOpenFunctional,
}) {
  const { summary } = data;
  const facilityState = data.facilityState;
  const showLens = hasActiveQip(facilityState);
  const program = qipForState(facilityState);
  const [lens, setLens] = useState('five_star'); // QmLens — tiles only
  const [seg, setSeg] = useState(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(new Set(['clearable', 'will_hit']));
  const [showClear, setShowClear] = useState(false);
  const [showCrossers, setShowCrossers] = useState(true);

  const q = query.trim().toLowerCase();
  const matchesQuery = (p) =>
    !q || fullName(p).toLowerCase().includes(q) || (p.externalPatientId ?? '').toLowerCase().includes(q);

  const crossers = upcoming?.upcomingPatients ?? [];
  const crosserByMeasure = useMemo(() => {
    const m = {};
    for (const p of crossers) for (const h of p.projectedHits) m[h.id] = (m[h.id] ?? 0) + 1;
    return m;
  }, [crossers]);

  const residents = useMemo(() => {
    const out = [];
    for (const p of data.patients) {
      if (p.triggeringCount === 0) continue;
      out.push({ patient: p, status: statusBucketForRow(p), days: soonestCliffDays(p) });
    }
    return out;
  }, [data.patients]);

  const clearResidents = useMemo(
    () => data.patients.filter((p) => p.triggeringCount === 0),
    [data.patients]
  );

  const segCount = (k) =>
    k === 'clear' ? clearResidents.length : residents.filter((r) => r.status === k).length;

  const tiles = useMemo(() => {
    const withData = data.measuresEvaluated
      .map((meta) => {
        const counts = summary.byMeasure[meta.id] ?? { triggering: 0, excluded: 0, applicable: 0 };
        const urgencies = [];
        for (const p of data.patients) {
          const e = p.measures.find((m) => m.id === meta.id);
          if (e?.triggers) urgencies.push(entryUrgency(e));
        }
        return { meta, counts, urgencies };
      })
      // Lens filter: state-survey-only measures not in this state's QIP are
      // dropped from the tiles entirely (the worklist still shows them).
      .filter((x) => x.counts.applicable > 0 && measureInLens(x.meta.id, lens, facilityState));
    const sortFn = (a, b) => b.counts.triggering - a.counts.triggering;
    return {
      cms: withData.filter((x) => !x.meta.nonCms).sort(sortFn),
      non: withData.filter((x) => x.meta.nonCms).sort(sortFn),
    };
  }, [data.measuresEvaluated, summary.byMeasure, data.patients, lens, facilityState]);

  const qLabel = quarterLabel(summary.currentQuarterEnd);
  const qDays = summary.daysUntilQuarterEnd;
  const cliffFrac = Math.max(0.02, Math.min(1, qDays / 91));
  const cliffTone = qDays <= 14 ? 'rose' : qDays <= 30 ? 'amber' : 'sky';

  const toggleCollapse = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // One status group (at_risk / clearable / will_hit). Returns null when a
  // segment filter excludes it or it has no rows.
  const renderGroup = (key) => {
    if (seg && seg !== key) return null;
    const g = WORK_GROUPS.find((x) => x.key === key);
    const rows = residents.filter((r) => r.status === key).sort((a, b) => a.days - b.days);
    if (rows.length === 0) return null;
    const isCollapsed = !seg && collapsed.has(key);
    return (
      <div key={key}>
        <button type="button" className="qmc-group__head" disabled={!!seg} onClick={() => toggleCollapse(key)}> {/* NO_TRACK */}
          {!seg && (isCollapsed ? <ChevronRight className="qmc-group__chev" /> : <ChevronDown className="qmc-group__chev" />)}
          <span className={`qmc-dot qmc-dot--${g.tone}`} />
          <span className="qmc-group__label">{g.label}</span>
          <span className="qmc-group__count">{rows.length}</span>
          <span className="qmc-group__sub">· {g.sub}</span>
        </button>
        {!isCollapsed && (
          <div className="qmc-rows">
            {rows.map((r, i) => (
              <ResidentRow key={r.patient.patientId} item={r} delay={Math.min(i, 16) * 16} onOpenResident={onOpenResident} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="qmc">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="qmc-hero qmc-rise">
        <div className="qmc-hero__top">
          <div>
            <div className="qmc-eyebrow"><ShieldCheck /> Quality Measures · {prettyDate(data.facilityDate)}</div>
            <div className="qmc-hero__big">
              <span className="qmc-hero__num">{summary.patientsWithTriggers}</span>
              <span className="qmc-hero__sub">
                residents triggering<br />
                <small>of {summary.totalPatients} active · {summary.longStayPatients} long / {summary.shortStayPatients} short</small>
              </span>
            </div>
          </div>
          <div className="qmc-quarter">
            <div className="qmc-quarter__row">
              <div className="qmc-quarter__label"><CalendarClock /> {qLabel} locks {prettyDate(summary.currentQuarterEnd)}</div>
              <div className={`qmc-quarter__days qmc-text--${cliffTone}`}>{qDays}<span>d</span></div>
            </div>
            <div className="qmc-bar">
              <div className={`qmc-bar__fill qmc-bar__fill--${cliffTone} ${qDays <= 14 ? 'qmc-cliff-pulse' : ''}`}
                   style={{ width: `${cliffFrac * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Status segments */}
        <div className="qmc-segs">
          {SEGMENTS.map((s) => {
            const active = seg === s.key;
            return (
              <button key={s.key} type="button" onClick={() => setSeg(active ? null : s.key)} /* NO_TRACK */
                className={`qmc-seg ${active ? 'qmc-seg--active' : ''}`}>
                <span className={`qmc-seg__icon qmc-seg--${s.tone}`}><span className={`qmc-dot qmc-dot--${s.tone}`} /></span>
                <span>
                  <span className="qmc-seg__num">{segCount(s.key)}</span>
                  <span className="qmc-seg__label">{s.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Clinical signals entry */}
        {onOpenSignals && signalCount > 0 && (
          <button type="button" data-track="qm_drill_in" data-track-prop-measure-code="signals" data-track-prop-view="signals" className="qmc-signals-btn" onClick={onOpenSignals}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="qmc-signals-btn__icon"><Activity /></span>
              <span>
                <span className="qmc-signals-btn__title">{signalCount} clinical signal{signalCount === 1 ? '' : 's'}</span>
                <span className="qmc-signals-btn__sub">new orders, labs &amp; diagnoses that may trip a QM at the next MDS</span>
              </span>
            </span>
            <ChevronRight className="qmc-text--amber" />
          </button>
        )}

        {/* Functional Decline — its own screen inside the Command Center */}
        {onOpenFunctional && (
          <button type="button" data-track="qm_drill_in" data-track-prop-measure-code="gg_decline" data-track-prop-view="functional" className="qmc-signals-btn qmc-fd-entry" onClick={onOpenFunctional}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="qmc-fd-entry__icon"><TrendingDown /></span>
              <span>
                <span className="qmc-signals-btn__title">Functional Decline</span>
                <span className="qmc-signals-btn__sub">GG self-care &amp; mobility decline — therapy pickup + QM roster</span>
              </span>
            </span>
            <ChevronRight className="qmc-text--sky" />
          </button>
        )}
      </div>

      {/* ── Measure tiles (hidden while a segment filters) ──────────────── */}
      {!seg && (
        <div>
          <div className="qmc-seclabel qmc-seclabel--lens">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity /> By measure <small>· click for detail + what-if</small>
            </span>
            {showLens && (
              <div className="qmc-lens">
                {[['five_star', 'Five-Star'], ['qip', 'QIP'], ['both', 'Both']].map(([v, lbl]) => (
                  <button key={v} type="button" className={lens === v ? 'qmc-lens__btn qmc-lens__btn--on' : 'qmc-lens__btn'} onClick={() => setLens(v)}> {/* NO_TRACK */}
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showLens && lens !== 'five_star' && program && (
            <div className="qmc-qip-note">
              <b>{program.programName}</b>
              {program.clinicalShare !== 'all' && <span> · clinical portion only — staffing, survey &amp; $ are tracked elsewhere</span>}
            </div>
          )}
          <div className="qmc-tiles">
            {tiles.cms.map((x, i) => (
              <MeasureTile key={x.meta.id} {...x} soon={crosserByMeasure[x.meta.id] ?? 0} delay={i * 22} onClick={() => onOpenMeasure(x.meta.id)} />
            ))}
          </div>
          {tiles.non.length > 0 && (
            <>
              <div className="qmc-substate">State-survey only (not on iQIES Five-Star)</div>
              <div className="qmc-tiles">
                {tiles.non.map((x, i) => (
                  <MeasureTile key={x.meta.id} {...x} soon={crosserByMeasure[x.meta.id] ?? 0} delay={i * 22} onClick={() => onOpenMeasure(x.meta.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Worklist toolbar ────────────────────────────────────────────── */}
      <div className="qmc-toolbar">
        <div className="qmc-toolbar__title">
          <span>{q ? 'Search' : seg === 'clear' ? 'Clear residents' : seg ? STATUS_BUCKET[seg].label : 'Worklist'}</span>
          {seg && !q && (
            <button type="button" className="qmc-reset" onClick={() => setSeg(null)}> {/* NO_TRACK */}
              <X /> Show all measures
            </button>
          )}
        </div>
        <div className="qmc-search">
          <Search />
          <input value={query} onInput={(e) => setQuery(e.target.value)} placeholder="Search resident name or ID" />
          {query && (
            <button type="button" className="qmc-search__clear" onClick={() => setQuery('')} aria-label="Clear search"><X /></button> /* NO_TRACK */
          )}
        </div>
      </div>

      {/* ── Worklist body ───────────────────────────────────────────────── */}
      {q ? (
        <SearchResults
          residents={residents.filter((r) => matchesQuery(r.patient))}
          clear={clearResidents.filter((p) => matchesQuery(p))}
          crossers={crossers.filter((p) => matchesQuery(p))}
          query={query}
          onOpenResident={onOpenResident}
        />
      ) : seg === 'clear' ? (
        <ClearList residents={clearResidents} />
      ) : (
        <div className="qmc-worklist">
          {/* Order: At risk → Coming soon (surfaced, not buried) → Clearable → Will hit → Clear */}
          {renderGroup('at_risk')}

          {!seg && crossers.length > 0 && (
            <div className="qmc-collapsible qmc-collapsible--violet">
              <button type="button" className="qmc-collapsible__head" onClick={() => setShowCrossers((s) => !s)}> {/* NO_TRACK */}
                {showCrossers ? <ChevronDown /> : <ChevronRight />}
                <span className="qmc-dot qmc-dot--violet" style={{ width: '8px', height: '8px' }} />
                Coming soon · {crossers.length} crossing day-101 — short-stay coding that will trip a long-stay measure
              </button>
              {showCrossers && (
                <div className="qmc-collapsible__body qmc-rows">
                  {crossers.slice().sort((a, b) => a.daysUntilCrossing - b.daysUntilCrossing).map((p) => (
                    <CrosserResidentRow key={p.patientId} patient={p} onOpenResident={onOpenResident} />
                  ))}
                </div>
              )}
            </div>
          )}

          {renderGroup('clearable')}
          {renderGroup('will_hit')}

          {residents.length === 0 && (
            <div className="qmc-allclear">No residents triggering — all clear.</div>
          )}

          {!seg && clearResidents.length > 0 && (
            <div className="qmc-collapsible">
              <button type="button" className="qmc-collapsible__head" onClick={() => setShowClear((s) => !s)}> {/* NO_TRACK */}
                {showClear ? <ChevronDown /> : <ChevronRight />}
                <CircleCheck className="qmc-text--emerald" style={{ width: '14px', height: '14px' }} />
                {clearResidents.length} residents clear — no triggering measures
              </button>
              {showClear && <ClearGrid residents={clearResidents} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MeasureTile({ meta, counts, urgencies, soon, delay, onClick }) {
  const bucket = bucketForActionability(meta.clearProfile?.actionability);
  const rate = measureRate(counts);
  const code = measureCode(meta.id);
  const fiveStar = isFiveStarMds(meta.id);
  const footer = BUCKET_FOOTER[bucket];
  const actionableCount = isWhatIfClearable(bucket) ? counts.triggering : 0;
  const dots = urgencies.slice(0, 8);
  return (
    <button type="button" data-track="qm_tile_clicked" data-track-prop-measure-code={meta.id} className="qmc-tile qmc-rise" style={{ animationDelay: `${delay}ms` }} onClick={onClick}>
      <div className="qmc-tile__top">
        <div style={{ minWidth: 0 }}>
          <div className="qmc-tile__name">{shortLabel(meta.id, meta.label)}</div>
          <div className="qmc-tile__meta">
            {code && <span className="qmc-tile__code">{code}</span>}
            {fiveStar
              ? <span className="qmc-tag qmc-tag--star">5★</span>
              : <span className="qmc-tag qmc-tag--state">state</span>}
          </div>
        </div>
        <div className={`qmc-tile__count ${counts.triggering > 0 ? '' : 'qmc-tile__count--zero'}`}>{counts.triggering}</div>
      </div>
      <div className="qmc-tile__dots">
        {dots.map((u, i) => <span key={i} className={`qmc-dot qmc-dot--${URGENCY[u].tone}`} />)}
      </div>
      <div className="qmc-tile__foot">
        <span className={`qmc-tile__foot-action qmc-text--${footer.tone}`}>{footer.label(actionableCount)}</span>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {soon > 0 && <span className="qmc-soon-pill">+{soon} soon</span>}
          <span className="qmc-tile__rate">{rate.den > 0 ? `${ratePct(rate.num, rate.den).toFixed(1)}%` : '—'}</span>
        </div>
      </div>
    </button>
  );
}

function ResidentRow({ item, delay, onOpenResident }) {
  const r = item.patient;
  const tone = STATUS_BUCKET[item.status].tone;
  const entries = r.measures
    .filter((m) => m.triggers)
    .sort((a, b) => statusRank(statusBucketForEntry(a)) - statusRank(statusBucketForEntry(b)));
  return (
    <button type="button" data-track="qm_drill_in" data-track-prop-measure-code={entries[0]?.id || '—'} data-track-prop-view="resident"
      className="qmc-row qmc-rise" style={{ animationDelay: `${delay}ms` }} onClick={() => onOpenResident(r, entries[0])}>
      <span className={`qmc-row__dot qmc-dot--${tone}`} />
      <div className="qmc-row__body">
        <div className="qmc-row__name-line">
          <span className="qmc-row__name">{fullName(r)}</span>
          <span className="qmc-row__meta">
            {stayDayLabel(r)}{r.payerClassification ? ` · ${r.payerClassification}` : ''}{r.target ? ` · MDS ${prettyDate(r.target.ardDate)}` : ''}
          </span>
        </div>
        <div className="qmc-row__pills">
          {entries.map((m, i) => {
            const t = STATUS_BUCKET[statusBucketForEntry(m)].tone;
            return (
              <span key={`${m.id}-${i}`} className={`qmc-chip qmc-chip--${t}`}>
                <span className={`qmc-dot qmc-dot--${t}`} style={{ width: '6px', height: '6px' }} />
                {shortLabel(m.id, m.label)}
              </span>
            );
          })}
        </div>
      </div>
      <div className="qmc-row__right">
        {/* No per-row day countdown — the cliff is the shared quarter-end (hero). */}
        <span className="qmc-row__count">{r.triggeringCount}</span>
        <ChevronRight className="qmc-row__chev" />
      </div>
    </button>
  );
}

function CrosserResidentRow({ patient, onOpenResident }) {
  const open = () => {
    const d = crosserToDrill(patient, patient.projectedHits[0]);
    onOpenResident(d.patient, d.entry);
  };
  return (
    <button type="button" data-track="qm_drill_in" data-track-prop-measure-code="crosser" data-track-prop-view="resident" className="qmc-row" onClick={open}>
      <span className={`qmc-row__dot qmc-dot--${CROSSING.tone}`} />
      <div className="qmc-row__body">
        <div className="qmc-row__name-line">
          <span className="qmc-row__name">{fullName(patient)}</span>
          <span className="qmc-row__meta">{stayDayLabel(patient)}</span>
        </div>
        <div className="qmc-row__pills">
          {patient.projectedHits.map((h, i) => (
            <span key={`${h.id}-${i}`} className={`qmc-chip qmc-chip--${CROSSING.tone}`}>
              <span className={`qmc-dot qmc-dot--${CROSSING.tone}`} style={{ width: '6px', height: '6px' }} />
              {shortLabel(h.id, h.label)}
            </span>
          ))}
        </div>
      </div>
      <div className="qmc-row__right">
        <div className="qmc-crosser-days">
          <span className={`qmc-crosser-days__n qmc-text--${CROSSING.tone}`}>{patient.daysUntilCrossing}d</span>
          <span className="qmc-crosser-days__lbl">to day-101</span>
        </div>
        <ChevronRight className="qmc-row__chev" />
      </div>
    </button>
  );
}

function ClearGrid({ residents }) {
  return (
    <div className="qmc-cleargrid">
      {residents.map((p) => (
        <div key={p.patientId} className="qmc-clearitem">
          <span className="qmc-clearitem__dot" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(p)}</span>
          {p.target == null && <small>no MDS</small>}
        </div>
      ))}
    </div>
  );
}

function ClearList({ residents }) {
  return (
    <div>
      <div className="qmc-group__head" style={{ cursor: 'default' }}>
        <span className="qmc-dot qmc-dot--emerald" />
        <span className="qmc-group__label">Clear</span>
        <span className="qmc-group__count">{residents.length}</span>
        <span className="qmc-group__sub">· No triggering measures</span>
      </div>
      <div className="qmc-cleargrid" style={{ border: '1px solid var(--slate-200)', borderRadius: '12px', background: '#fff' }}>
        {residents.map((p) => (
          <div key={p.patientId} className="qmc-clearitem">
            <span className="qmc-clearitem__dot" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchResults({ residents, clear, crossers, query, onOpenResident }) {
  const total = residents.length + clear.length + crossers.length;
  if (total === 0) {
    return <div className="qmc-empty">No residents match “{query.trim()}”.</div>;
  }
  const sorted = residents.slice().sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.days - b.days);
  return (
    <div className="qmc-rows">
      <div style={{ fontSize: '11px', color: 'var(--slate-400)' }}>{total} match{total === 1 ? '' : 'es'}</div>
      {sorted.map((r, i) => (
        <ResidentRow key={r.patient.patientId} item={r} delay={Math.min(i, 16) * 16} onOpenResident={onOpenResident} />
      ))}
      {crossers.map((p) => (
        <CrosserResidentRow key={p.patientId} patient={p} onOpenResident={onOpenResident} />
      ))}
      {clear.length > 0 && (
        <div className="qmc-cleargrid" style={{ border: '1px solid var(--slate-200)', borderRadius: '12px', background: '#fff' }}>
          {clear.map((p) => (
            <div key={p.patientId} className="qmc-clearitem">
              <span className="qmc-clearitem__dot" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(p)}</span>
              <small>clear</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
