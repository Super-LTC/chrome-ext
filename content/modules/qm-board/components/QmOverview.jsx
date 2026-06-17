/**
 * Surface A — QM Command Center dashboard.
 *
 * Ported from web/components/quality-measures/qm-overview.tsx (PR #626),
 * adapted to Preact + the `qmc-` CSS tone system. Groups residents by the one
 * honest axis — ClearGroup (Clear with an MDS / Needs a clinical fix / Locked
 * this quarter) — via the pure view-model, NOT by raw cliff urgency.
 *
 * `upcoming` (day-101 crossers) is optional — the extension doesn't wire the
 * upcoming endpoint yet, so the "Coming soon" group is simply absent. All
 * crosser code paths degrade gracefully to empty.
 */
import { useMemo, useState } from 'preact/hooks';
import {
  clearGroupForEntry, clearGroupForRow, clearGroupForMechanism, clearGroupRank,
  rowClearsThisQuarter,
  isFiveStarMds, measureRate, ratePct,
  shortLabel, measureCode,
  measureInLens, rowForLens, crosserForLens,
} from '../lib/qm-view-model.js';
import { hasActiveQip, qipForState } from '../lib/qip-programs.js';
import {
  URGENCY, CROSSING, CLEAR_GROUP, entryUrgency, soonestCliffDays,
  crosserToDrill, fullName, prettyDate, quarterLabel, stayDayLabel,
  clearTiming, CLEAR_TONE, rowDaysUntilClearable,
} from '../lib/qm-tones.js';
import { ShieldCheck, CalendarClock, Activity, ChevronRight, ChevronDown, CircleCheck, Search, X, TrendingDown } from './icons.jsx';
import { FiveStarCard } from './FiveStarCard.jsx';
import { DfsTile } from './DfsTile.jsx';

// Per-row action verb — names what the prominent (in-group) measures need, so a
// green-group row reads "Clears [ADL Decline]" not a flat pile of mixed chips.
const ROW_VERB = {
  clear_mds: { label: 'Clears', tone: 'emerald' },
  clinical:  { label: 'Fix',    tone: 'amber' },
  locked:    { label: 'Locked', tone: 'slate' },
};

// Tile footer copy keyed by the measure's clear group.
const GROUP_FOOTER = {
  clear_mds: { tone: 'emerald', label: (n) => `${n} clearable` },
  clinical:  { tone: 'amber',   label: (n) => `${n} clinical` },
  locked:    { tone: 'slate',   label: () => 'locked' },
};

const SEGMENTS = [
  { key: 'clear_mds', label: CLEAR_GROUP.clear_mds.label, tone: CLEAR_GROUP.clear_mds.tone },
  { key: 'clinical',  label: CLEAR_GROUP.clinical.label,  tone: CLEAR_GROUP.clinical.tone },
  { key: 'locked',    label: CLEAR_GROUP.locked.label,    tone: CLEAR_GROUP.locked.tone },
  { key: 'clear',     label: 'Clear',                     tone: 'emerald' },
];

const WORK_GROUPS = [
  { key: 'clear_mds', label: CLEAR_GROUP.clear_mds.label, sub: CLEAR_GROUP.clear_mds.sub, tone: CLEAR_GROUP.clear_mds.tone },
  { key: 'clinical',  label: CLEAR_GROUP.clinical.label,  sub: CLEAR_GROUP.clinical.sub,  tone: CLEAR_GROUP.clinical.tone },
  { key: 'locked',    label: CLEAR_GROUP.locked.label,    sub: CLEAR_GROUP.locked.sub,    tone: CLEAR_GROUP.locked.tone },
];

export function QmOverview({
  data, upcoming, lens = 'five_star', onLensChange, prediction, dfs,
  onOpenMeasure, onOpenResident, signalCount = 0, onOpenSignals, onOpenFunctional, onOpenSimulator, onOpenDfs,
}) {
  const { summary } = data;
  const facilityState = data.facilityState;
  const facilityDate = data.facilityDate;
  const showLens = hasActiveQip(facilityState);
  const program = qipForState(facilityState);
  const setLens = onLensChange ?? (() => {}); // lens is owned by QMBoard (drives whole board + drill-in)
  const [seg, setSeg] = useState(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(new Set(['clinical', 'locked']));
  const [showClear, setShowClear] = useState(false);
  const [showCrossers, setShowCrossers] = useState(true);

  const q = query.trim().toLowerCase();
  const matchesQuery = (p) =>
    !q || fullName(p).toLowerCase().includes(q) || (p.externalPatientId ?? '').toLowerCase().includes(q);

  // The lens drives the WHOLE board: reduce every resident row + crosser to the
  // active measure-set BEFORE deriving the hero count, segments, worklist, pills,
  // and "Coming soon". A resident whose only triggers are state-survey noise
  // drops out under Five-Star. (v1 only filtered the tile grid — this is the fix.)
  const lensRows = useMemo(
    () => data.patients.map((p) => rowForLens(p, lens, facilityState)),
    [data.patients, lens, facilityState]
  );

  const crossers = useMemo(() => {
    const raw = upcoming?.upcomingPatients ?? [];
    return raw
      .map((c) => crosserForLens(c, lens, facilityState))
      .filter((c) => c.projectedHits.length > 0);
  }, [upcoming, lens, facilityState]);
  const crosserByMeasure = useMemo(() => {
    const m = {};
    for (const p of crossers) for (const h of p.projectedHits) m[h.id] = (m[h.id] ?? 0) + 1;
    return m;
  }, [crossers]);

  const residents = useMemo(() => {
    const out = [];
    for (const p of lensRows) {
      if (p.triggeringCount === 0) continue;
      out.push({ patient: p, status: clearGroupForRow(p), days: soonestCliffDays(p) });
    }
    return out;
  }, [lensRows]);

  const clearResidents = useMemo(
    () => lensRows.filter((p) => p.triggeringCount === 0),
    [lensRows]
  );

  const segCount = (k) =>
    k === 'clear' ? clearResidents.length : residents.filter((r) => r.status === k).length;

  // One sorted grid (web UX redesign dropped the state-survey divider — the
  // per-tile "state" tag still distinguishes them). Lens filter: state-survey
  // measures not in this state's QIP are dropped entirely.
  const tiles = useMemo(() => {
    return data.measuresEvaluated
      .map((meta) => {
        const counts = summary.byMeasure[meta.id] ?? { triggering: 0, excluded: 0, applicable: 0 };
        const urgencies = [];
        for (const p of data.patients) {
          const e = p.measures.find((m) => m.id === meta.id);
          if (e?.triggers) urgencies.push(entryUrgency(e));
        }
        return { meta, counts, urgencies };
      })
      // discharge_function is owned by the dedicated DfsTile + DFS page; keep it
      // out of the generic by-measure grid so it isn't listed twice.
      .filter((x) => x.meta.id !== 'discharge_function' && x.counts.applicable > 0 && measureInLens(x.meta.id, lens, facilityState))
      .sort((a, b) => b.counts.triggering - a.counts.triggering);
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

  // One clear group (clear_mds / clinical / locked). Returns null when a segment
  // filter excludes it or it has no rows. The green group is a FLAT list sorted
  // "Clearable now" first then by days-until-clearable (the per-row countdown
  // carries the timing); the amber/slate groups sort by soonest cliff.
  const renderGroup = (key) => {
    if (seg && seg !== key) return null;
    const g = WORK_GROUPS.find((x) => x.key === key);
    const rows = residents.filter((r) => r.status === key);
    if (key === 'clear_mds') {
      rows.sort((a, b) => rowDaysUntilClearable(a.patient, facilityDate) - rowDaysUntilClearable(b.patient, facilityDate) || a.days - b.days);
    } else {
      rows.sort((a, b) => a.days - b.days);
    }
    if (rows.length === 0) return null;
    const isCollapsed = !seg && collapsed.has(key);
    const renderRows = (list, offset = 0) => list.map((r, i) => (
      <ResidentRow key={r.patient.patientId} item={r} facilityDate={facilityDate} delay={Math.min(offset + i, 16) * 16} onOpenResident={onOpenResident} />
    ));
    // Green group: split by the quarter lock — "This quarter · do now" vs the
    // muted "Next quarter only" (locks in this quarter). Not hidden, just dimmed.
    const qEnd = summary.currentQuarterEnd;
    const thisQ = key === 'clear_mds' ? rows.filter((r) => rowClearsThisQuarter(r.patient, qEnd)) : rows;
    const nextQ = key === 'clear_mds' ? rows.filter((r) => !rowClearsThisQuarter(r.patient, qEnd)) : [];
    const split = key === 'clear_mds' && nextQ.length > 0;
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
          split ? (
            <>
              {thisQ.length > 0 && (
                <>
                  <div className="qmc-greensplit__head">This quarter · do now <span className="qmc-greensplit__count">{thisQ.length}</span></div>
                  <div className="qmc-rows">{renderRows(thisQ)}</div>
                </>
              )}
              <div className="qmc-greensplit__head qmc-greensplit__head--muted">Next quarter only · locks in this quarter <span className="qmc-greensplit__count">{nextQ.length}</span></div>
              <div className="qmc-rows qmc-rows--nextq">{renderRows(nextQ, thisQ.length)}</div>
            </>
          ) : (
            <div className="qmc-rows">{renderRows(rows)}</div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="qmc">
      {/* ── Measure-set lens (drives the WHOLE board) ───────────────────── */}
      {showLens && (
        <div className="qmc-measureset qmc-rise">
          <span className="qmc-measureset__label"><Activity /> Measure set</span>
          <div className="qmc-measureset__seg" role="tablist" aria-label="Measure set">
            {[['five_star', 'Five-Star', 'sky'], ['qip', 'QIP', 'emerald'], ['both', 'Both', 'slate']].map(([v, lbl, tone]) => (
              <button key={v} type="button" role="tab" aria-selected={lens === v} /* NO_TRACK */
                className={`qmc-measureset__btn ${lens === v ? `qmc-measureset__btn--on qmc-measureset__btn--${tone}` : ''}`}
                onClick={() => setLens(v)}>{lbl}</button>
            ))}
          </div>
          {lens !== 'five_star' && program && (
            <span className="qmc-measureset__note">
              <b>{program.programName}</b>
              {program.clinicalShare !== 'all' && <span className="qmc-measureset__caveat"> · clinical portion only</span>}
            </span>
          )}
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="qmc-hero qmc-rise">
        <div className="qmc-hero__top">
          <div>
            <div className="qmc-eyebrow"><ShieldCheck /> Quality Measures · {prettyDate(data.facilityDate)}</div>
            <div className="qmc-hero__big">
              {/* Lensed count — residents with ≥1 triggering measure in the active set,
                  NOT summary.patientsWithTriggers (which ignores the lens). */}
              <span className="qmc-hero__num">{residents.length}</span>
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

        {/* Clinical signals entry (hidden while a status segment filters the worklist) */}
        {!seg && onOpenSignals && signalCount > 0 && (
          <button type="button" data-track="qm_drill_in" data-track-prop-measure-code="signals" data-track-prop-view="signals" className="qmc-signals-btn" onClick={() => onOpenSignals()}>
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

      {/* ── Measure tiles (hidden while a status segment filters the worklist) ── */}
      {!seg && (
        <div>
          <div className="qmc-seclabel">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity /> By measure <small>· click for detail + what-if</small>
            </span>
          </div>
          <div className="qmc-tiles">
            {tiles.map((x, i) => (
              <MeasureTile key={x.meta.id} {...x} soon={crosserByMeasure[x.meta.id] ?? 0} delay={i * 22} onClick={() => onOpenMeasure(x.meta.id)} />
            ))}
            {/* DFS — informational rate tile, last; taps through to its own page */}
            {dfs?.available && lens !== 'qip' && onOpenDfs && (
              <DfsTile dfs={dfs} delay={tiles.length * 22} onClick={onOpenDfs} />
            )}
          </div>
        </div>
      )}

      {/* ── Predicted Five-Star QM — below the grid so the grid stays visible; hidden while filtering ── */}
      {!seg && prediction && lens !== 'qip' && (
        <FiveStarCard prediction={prediction} onOpenSimulator={onOpenSimulator} />
      )}

      {/* ── Worklist toolbar ────────────────────────────────────────────── */}
      <div className="qmc-toolbar">
        <div className="qmc-toolbar__title">
          <span>{q ? 'Search' : seg === 'clear' ? 'Clear residents' : seg ? CLEAR_GROUP[seg].label : 'Worklist'}</span>
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
          facilityDate={facilityDate}
          onOpenResident={onOpenResident}
        />
      ) : seg === 'clear' ? (
        <ClearList residents={clearResidents} />
      ) : (
        <div className="qmc-worklist">
          {/* Order: Clear with an MDS → Coming soon (surfaced, not buried) → Needs a clinical fix → Locked → Clear */}
          {renderGroup('clear_mds')}

          {!seg && (crossers.length > 0 || (upcoming?.beyondHorizon ?? 0) > 0) && (
            <div className="qmc-collapsible qmc-collapsible--violet">
              <button type="button" className="qmc-collapsible__head" onClick={() => setShowCrossers((s) => !s)}> {/* NO_TRACK */}
                {showCrossers ? <ChevronDown /> : <ChevronRight />}
                <span className="qmc-dot qmc-dot--violet" style={{ width: '8px', height: '8px' }} />
                Going to trigger soon · {crossers.length} <span className="qmc-text--slate" style={{ fontWeight: 400 }}>· short-stay coding that hits a long-stay measure at day-101</span>
                {(upcoming?.beyondHorizon ?? 0) > 0 && (
                  <span className="qmc-text--slate" style={{ marginLeft: 'auto', paddingLeft: '8px', fontWeight: 400, fontSize: '11px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    +{upcoming.beyondHorizon} cross later
                  </span>
                )}
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

          {renderGroup('clinical')}
          {renderGroup('locked')}

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
  const group = clearGroupForMechanism(meta.clearProfile?.clearMechanism);
  const rate = measureRate(counts);
  const code = measureCode(meta.id);
  const fiveStar = isFiveStarMds(meta.id);
  const footer = GROUP_FOOTER[group];
  const actionableCount = group === 'locked' ? 0 : counts.triggering;
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

function ResidentRow({ item, facilityDate, delay, onOpenResident }) {
  const r = item.patient;
  const tone = CLEAR_GROUP[item.status].tone;
  const entries = r.measures
    .filter((m) => m.triggers)
    .sort((a, b) => clearGroupRank(clearGroupForEntry(a)) - clearGroupRank(clearGroupForEntry(b)));
  // Lead with the measures THIS group acts on (clear-with-MDS in the green group);
  // demote the resident's other triggers to a muted "· also" so the row says what
  // actually clears, not a flat pile of mixed chips.
  const inGroup = entries.filter((m) => clearGroupForEntry(m) === item.status);
  const chips = inGroup.length ? inGroup : entries;
  const others = inGroup.length ? entries.filter((m) => clearGroupForEntry(m) !== item.status) : [];
  const verb = ROW_VERB[item.status];
  // One row-level timing badge (the soonest/most-actionable measure) instead of a
  // separate badge per measure — the per-pill timings were the wall of words.
  const time = entries[0] ? clearTiming(entries[0], r, facilityDate) : null;
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
          <span className={`qmc-row__verb qmc-text--${verb.tone}`}>{verb.label}</span>
          {chips.map((m, i) => {
            const t = CLEAR_GROUP[clearGroupForEntry(m)].tone;
            return (
              <span key={`${m.id}-${i}`} className={`qmc-chip qmc-chip--${t}`}>
                <span className={`qmc-dot qmc-dot--${t}`} style={{ width: '6px', height: '6px' }} />
                {shortLabel(m.id, m.label)}
              </span>
            );
          })}
          {others.length > 0 && (
            <span className="qmc-row__also">· also {others.map((m) => shortLabel(m.id, m.label)).join(', ')}</span>
          )}
        </div>
      </div>
      <div className="qmc-row__right">
        {time && <span className={`qmc-clearchip qmc-clearchip--${CLEAR_TONE[time.kind].badge}`}>{time.short}</span>}
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

function SearchResults({ residents, clear, crossers, query, facilityDate, onOpenResident }) {
  const total = residents.length + clear.length + crossers.length;
  if (total === 0) {
    return <div className="qmc-empty">No residents match “{query.trim()}”.</div>;
  }
  const sorted = residents.slice().sort((a, b) => clearGroupRank(a.status) - clearGroupRank(b.status) || a.days - b.days);
  return (
    <div className="qmc-rows">
      <div style={{ fontSize: '11px', color: 'var(--slate-400)' }}>{total} match{total === 1 ? '' : 'es'}</div>
      {sorted.map((r, i) => (
        <ResidentRow key={r.patient.patientId} item={r} facilityDate={facilityDate} delay={Math.min(i, 16) * 16} onOpenResident={onOpenResident} />
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
