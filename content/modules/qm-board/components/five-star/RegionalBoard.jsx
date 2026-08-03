/**
 * The org-level Regional Five-Star board — the extension's QM landing.
 *
 * Ported from superltc `web/components/five-star/regional-board.tsx`, which is
 * itself a faithful conversion of the approved `.context/design/regional-v3.html`
 * mockup. That mockup was iterated to the pixel and is not to be "improved"
 * here. Two views over one payload:
 *
 *   grid  — one card per building, grouped by state. The reading order is
 *           published star → our QM projection → the three domain rows.
 *   table — eight columns, roll-up rows first.
 *
 * PURE PRESENTATION. Every judgement on screen (proximity to a cut point, which
 * pills belong on the rail, the roll-up means) is already decided by
 * `RegionalFiveStarService` and arrives on the payload. The one thing this file
 * computes is documented at `meanOf` below, and only because the wire shape has
 * no field for it.
 *
 * Three invariants worth not re-litigating:
 *   1. Stars are literal ★ glyphs via `<Stars>`, never digit chips.
 *   2. Green (`stars.proj`) is OUR projection and nothing else — so a green star
 *      always answers "what will CMS say next?".
 *   3. Nothing on this board assumes a clinical change. `unactionedUpside` still
 *      arrives on the payload but is NOT rendered: framing a measure as N
 *      "clearable" points implied a one-click fix, when the real work is a GDR
 *      over months, a wound healing, or a physician query.
 *
 * EXTENSION-ONLY ADDITION: the "You're here" chip and the pin ordering, so the
 * building the user has open in PCC reads first. See `lib/region-pin.js` for why
 * that is a chip rather than an auto-drop.
 */
import { useState, useMemo, useCallback } from 'preact/hooks';
import { Fragment } from 'preact';
import { stateName } from '../../lib/us-states.js';
import { pinCurrentFirst } from '../../lib/region-pin.js';
import {
  CutLadder, Pill, Stars, StarNum, Tag, Trend, avg1, glyphForTone, n, pts, toneForKind,
} from './primitives.jsx';

/* ── small helpers ────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-06-25` → `Jun 25, 2026`. Parsed by hand so a UTC date cannot slip a day. */
function fmtDate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * `dataStatus` is never allowed to render as a blank cell or a zero — a building
 * we cannot score has to say why. These are the human forms of the enum.
 */
const DATA_STATUS_LABEL = {
  ok: null,
  no_ccn: 'no CCN matched',
  ccn_excluded: 'CCN excluded',
  no_published_snapshot: 'awaiting CMS data',
  no_computed_window: 'no MDS window',
};

/** `CCN 455480 · 98 beds`, with em dashes rather than gaps when either is absent. */
const facilitySub = (f) =>
  `${f.ccn ? `CCN ${f.ccn}` : 'CCN —'} · ${f.certifiedBeds != null ? `${f.certifiedBeds} beds` : '— beds'}`;

/** CMS's published overall star. `overall.published` is authoritative when present. */
const publishedOverall = (f) => f.overall.published ?? f.published.overall;

/**
 * Tone for an attention entry.
 *
 * `unactioned` splits: plain available points sit MUTE (they are not a gain, and
 * dressing them amber would cry wolf on every card), and only
 * `unactioned_changes_star` escalates to amber + ⚠. That split is the mockup's,
 * and it is what makes the ⚠ mean something when it appears.
 */
function attnTone(a) {
  if (a.kind === 'unactioned') return a.code === 'unactioned_changes_star' ? 'warn' : 'mute';
  return toneForKind(a.kind);
}

const attnGlyph = (a) => {
  const tone = attnTone(a);
  return tone === 'mute' ? '' : glyphForTone(tone);
};

/**
 * Unweighted mean over the facilities that HAVE the value.
 *
 * Used only for roll-up cells the wire shape has no field for — `FiveStarRollup`
 * ships `avgSurveyScore` / `avgStaffingPoints` / `avg*Points` but no average STAR
 * for inspection, staffing, long-stay or short-stay. Same arithmetic the service
 * uses for its own `avg*` fields: raw and unweighted. Deliberately NOT
 * bed-weighted — a 52-bed building's star counts exactly as much as a 142-bed
 * one on this screen.
 */
function meanOf(facilities, pick) {
  const vals = facilities.map(pick).filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Max-point scales come off the ladders on the payload, never hardcoded here. */
function scalesFor(facilities) {
  const f = facilities[0];
  return {
    staffing: f?.staffing.ladder?.maxScore ?? 380,
    long: f?.qm.ladders.long.maxScore ?? 1150,
    short: f?.qm.ladders.short.maxScore ?? 1150,
    overall: f?.qm.ladders.overall.maxScore ?? 2300,
  };
}

/**
 * Ladders for the LIVE columns, tolerating payloads built before `liveLadders`
 * existed.
 *
 * The precompute stores a JSON BLOB. Adding a field to the type does not
 * retroactively add it to rows already cached, and those rows keep serving until
 * the sweep rebuilds them on its 6h cadence. Without this fallback the board
 * would throw on every pre-existing row.
 */
const liveLaddersOf = (qm) => qm.liveLadders ?? qm.ladders;

/** Enter/Space on a row or card behaves like the click. */
function activateOnKey(fn) {
  return (e) => {
    if (!fn) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
}

/* ── grid card ────────────────────────────────────────────────────────────── */

function FacilityCard({ facility: f, scales, isCurrent, onSelect }) {
  const hasRisk = f.attention.some((a) => a.kind === 'risk');
  const hasOpp = f.attention.some((a) => a.kind === 'opportunity');
  const statusLabel = DATA_STATUS_LABEL[f.dataStatus];

  const projStar = f.qm.projectedStars.overall;
  const delta = f.qm.starDelta;
  const projClass = delta == null || delta === 0 ? 'flat' : delta > 0 ? '' : 'dn';
  const projGlyph = delta == null || delta === 0 ? '→' : delta > 0 ? '▲' : '▼';

  const overall = publishedOverall(f);

  return (
    /* NO_TRACK — the card is a scope change; the facility view it opens emits
       its own event with the building on it. */
    <div
      className={`gcard ${hasRisk ? 'flagged' : hasOpp ? 'oppty' : ''} ${isCurrent ? 'here' : ''}`}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={activateOnKey(onSelect)}
    >
      <div className="gname">
        {f.name}
        {isCurrent ? <span className="herechip">You're here</span> : null}
      </div>
      <div className="gsub">{facilitySub(f)}</div>

      <div className="ghero">
        {/* One em dash, not two: the digit already says "nothing published". */}
        <span className="gnum">{overall ?? '—'}</span>
        {overall == null ? null : (
          <Stars value={overall} size="lg" label={`${overall} star overall, CMS published`} />
        )}
        <span className="gproj">
          <span className="l">QM proj EOQ</span>
          <span className={`v ${projClass}`}>
            {projStar == null ? '—' : <>{projGlyph} {projStar}★</>}
          </span>
        </span>
      </div>

      <div className="drow">
        <span className="dl">Inspection</span>
        <Stars value={f.inspection.publishedStar} size="sm" />
        <span className="dp">
          {f.inspection.surveyScore != null ? `${f.inspection.surveyScore} score` : '—'}
        </span>
      </div>
      <div className="drow">
        <span className="dl">Staffing</span>
        <Stars value={f.staffing.publishedStar} size="sm" />
        <span className="dp">{pts(f.staffing.points, scales.staffing)}</span>
      </div>
      <div className="drow">
        <span className="dl">Quality</span>
        <Stars value={f.qm.liveStars.overall} size="sm" />
        <span className="dp">{pts(f.qm.livePoints.overall, scales.overall)}</span>
      </div>

      <div className="gfoot">
        {f.attention.map((a, i) => (
          <Tag key={`${a.code}-${a.axis}-${i}`} tone={attnTone(a)}>
            {attnGlyph(a) ? `${attnGlyph(a)} ` : ''}
            {a.reason}
          </Tag>
        ))}
        {statusLabel ? <Tag tone="mute">{statusLabel}</Tag> : null}
      </div>
    </div>
  );
}

/* ── grid view ────────────────────────────────────────────────────────────── */

function GridView({ groups, membersOf, scales, currentLocationId, onSelectFacility }) {
  return (
    <>
      {groups.map((g) => {
        const members = membersOf(g.key);
        return (
          <div className="grid" key={g.key}>
            <div className="grouphead">
              <h3>{g.scope === 'state' ? stateName(g.key) : g.label}</h3>
              <span className="gs">
                {g.facilities} building{g.facilities === 1 ? '' : 's'} · avg{' '}
                {avg1(g.avgPublishedOverallStar)}★
              </span>
              <span className="line" />
            </div>
            {members.map((f) => (
              <FacilityCard
                key={f.locationId}
                facility={f}
                scales={scales}
                isCurrent={f.locationId === currentLocationId}
                onSelect={onSelectFacility ? () => onSelectFacility(f) : undefined}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/* ── table rows ───────────────────────────────────────────────────────────── */

function FacilityRow({ facility: f, scales, isCurrent, onSelect }) {
  const statusLabel = DATA_STATUS_LABEL[f.dataStatus];
  const hasRisk = f.attention.some((a) => a.kind === 'risk');
  const hasOpp = f.attention.some((a) => a.kind === 'opportunity');

  return (
    /* NO_TRACK — see FacilityCard. */
    <tr
      className={`f ${isCurrent ? 'here' : ''}`}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={activateOnKey(onSelect)}
    >
      <td className="fac">
        {f.name}
        {isCurrent ? <span className="herechip">You're here</span> : null}
        <span className="st">
          {facilitySub(f)}
          {statusLabel ? ` · ${statusLabel}` : ''}
        </span>
      </td>

      <td className="grp">
        <span className="cell"><Stars value={publishedOverall(f)} /></span>
      </td>

      <td className="grp">
        <span className="cell">
          <StarNum value={f.inspection.publishedStar} />
          <span className="pts">
            {f.inspection.surveyScore != null ? `${f.inspection.surveyScore} score` : '—'}
          </span>
        </span>
      </td>

      <td>
        <span className="cell hasPop" tabIndex={0}>
          <StarNum value={f.staffing.publishedStar} />
          <span className="pts">{pts(f.staffing.points, scales.staffing)}</span>
          <CutLadder ladder={f.staffing.ladder} />
        </span>
      </td>

      <td className="grp">
        <span className="cell hasPop" tabIndex={0}>
          <StarNum value={f.qm.liveStars.long} />
          <span className="pts">{pts(f.qm.livePoints.long, scales.long)}</span>
          <CutLadder ladder={liveLaddersOf(f.qm).long} />
        </span>
      </td>

      <td>
        <span className="cell hasPop" tabIndex={0}>
          <StarNum value={f.qm.liveStars.short} />
          <span className="pts">{pts(f.qm.livePoints.short, scales.short)}</span>
          <CutLadder ladder={liveLaddersOf(f.qm).short} />
        </span>
      </td>

      <td>
        <span className="cell hasPop" tabIndex={0}>
          <StarNum value={f.qm.liveStars.overall} />
          {hasRisk ? <span className="flagdot risk">▼</span> : hasOpp ? <span className="flagdot opp">↗</span> : null}
          <span className="pts">{pts(f.qm.livePoints.overall, scales.overall)}</span>
          <CutLadder ladder={liveLaddersOf(f.qm).overall} />
        </span>
      </td>

      <td className="grp">
        <span className="cell">
          <StarNum value={f.qm.projectedStars.overall} projected />
          <Trend delta={f.qm.starDelta} />
        </span>
      </td>
    </tr>
  );
}

/**
 * A roll-up row — the REGION band and the per-state bands.
 *
 * `variant: 'region'` carries the points sub-lines on every column; the state
 * bands are deliberately quieter (stars only, plus the three numbers that only
 * exist at the group level) so they read as separators rather than competing
 * with the facility rows they head.
 */
function RollupRow({ rollup: r, members, scales, variant }) {
  const isRegion = variant === 'region';
  const inspectionStar = meanOf(members, (f) => f.inspection.publishedStar);
  const staffingStar = meanOf(members, (f) => f.staffing.publishedStar);
  const longStar = meanOf(members, (f) => f.qm.liveStars.long);
  const shortStar = meanOf(members, (f) => f.qm.liveStars.short);
  const qmStar = meanOf(members, (f) => f.qm.liveStars.overall);
  const escalate = r.facilitiesWhereUpsideChangesStar > 0;

  return (
    <tr className={isRegion ? 'rollup' : 'grow'}>
      <td>
        {isRegion
          ? `${r.label.toUpperCase()} · ${r.facilities} buildings`
          : `${r.scope === 'state' ? stateName(r.key) : r.label} — ${r.facilities} building${r.facilities === 1 ? '' : 's'}`}
      </td>

      <td className="grp">
        <span className="cell">
          <Stars value={r.avgPublishedOverallStar} />
          <span className="pts">avg {avg1(r.avgPublishedOverallStar)}</span>
        </span>
      </td>

      <td className="grp">
        <span className="cell">
          <StarNum value={inspectionStar} />
          {isRegion ? (
            <span className="pts">
              {r.avgSurveyScore != null ? `${avg1(r.avgSurveyScore)} avg` : '—'}
            </span>
          ) : null}
        </span>
      </td>

      <td>
        <span className="cell">
          <StarNum value={staffingStar} />
          {isRegion ? <span className="pts">{pts(r.avgStaffingPoints, scales.staffing)}</span> : null}
        </span>
      </td>

      <td className="grp">
        <span className="cell">
          <StarNum value={longStar} />
          {isRegion ? <span className="pts">{pts(r.avgLongStayPoints, scales.long)}</span> : null}
        </span>
      </td>

      <td>
        <span className="cell">
          <StarNum value={shortStar} />
          {isRegion ? <span className="pts">{pts(r.avgShortStayPoints, scales.short)}</span> : null}
        </span>
      </td>

      <td>
        <span className="cell">
          <StarNum value={qmStar} />
          {isRegion ? <span className="pts">{pts(r.avgQmOverallPoints, scales.overall)}</span> : null}
        </span>
      </td>

      <td className="grp">
        <span className="cell">
          <StarNum value={r.avgProjectedQmStar} projected />
          {r.totalUnactionedPoints > 0 ? (
            <span className={`pts ${escalate ? 'warn' : ''}`}>
              {escalate ? `⚠ +${n(r.totalUnactionedPoints)} unact.` : `+${n(r.totalUnactionedPoints)} pts`}
            </span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

/* ── table view ───────────────────────────────────────────────────────────── */

function TableView({ region, groups, facilities, membersOf, scales, currentLocationId, onSelectFacility }) {
  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Facility</th>
            <th className="grp">Overall</th>
            <th className="grp">Inspection</th>
            <th>Staffing</th>
            <th className="grp">QM Long Stay</th>
            <th>QM Short Stay</th>
            <th>QM Overall</th>
            <th className="grp">QM Projected</th>
          </tr>
        </thead>
        <tbody>
          <RollupRow rollup={region} members={facilities} scales={scales} variant="region" />
          {groups.map((g) => {
            const members = membersOf(g.key);
            return (
              <Fragment key={g.key}>
                <RollupRow rollup={g} members={members} scales={scales} variant="group" />
                {members.map((f) => (
                  <FacilityRow
                    key={f.locationId}
                    facility={f}
                    scales={scales}
                    isCurrent={f.locationId === currentLocationId}
                    onSelect={onSelectFacility ? () => onSelectFacility(f) : undefined}
                  />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── board ────────────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {object} props.data              FiveStarRegionResponse
 * @param {string|null} [props.currentLocationId]  Best-effort match for the PCC
 *   building the user has open; drives the "You're here" chip and the pin order.
 *   Null is a normal state, not an error — see lib/region-pin.js.
 * @param {(facility: object) => void} [props.onSelectFacility]  Receives the whole
 *   facility row, not just an id: the downstream extension routes are keyed by
 *   facility NAME, so the caller needs more than a locationId.
 * @param {'grid'|'table'} [props.initialView]
 */
export function RegionalBoard({ data, currentLocationId = null, onSelectFacility, initialView = 'grid' }) {
  const [view, setView] = useState(initialView);

  const { facilities, region } = data;
  /**
   * The rail keeps the star-change warnings ("projected to LOSE 4★ QM") and drops
   * the "N pts clearable, unactioned" pills. A clinical measure is not something
   * you clear: an antipsychotic reduction is a GDR over months with physician
   * sign-off, so a points-available count reads as a to-do list that nobody can
   * actually action in a shift.
   */
  const needsALook = data.needsALook.filter((p) => p.kind !== 'unactioned');

  const { groups, membersOf } = useMemo(
    () => pinCurrentFirst(data.groups, facilities, currentLocationId),
    [data.groups, facilities, currentLocationId]
  );

  const scales = useMemo(() => scalesFor(facilities), [facilities]);
  const liveAt = fmtTime(data.generatedAt);

  const selectById = useCallback(
    (locationId) => {
      const f = facilities.find((x) => x.locationId === locationId);
      if (f && onSelectFacility) onSelectFacility(f);
    },
    [facilities, onSelectFacility]
  );

  return (
    <div className="fivestar">
      <div className="fs-frame">
        <div className="hero">
          <h1>All Buildings</h1>
          <div className="meta">
            <b>{region.facilities} facilit{region.facilities === 1 ? 'y' : 'ies'}</b>
            {' '}· avg <b>{avg1(region.avgPublishedOverallStar)}★</b> published →{' '}
            <b>{avg1(region.avgProjectedOverallStar)}★</b> projected.
            <br />
            Stars are CMS-published; the green row is our live projection.
            <br />
            <span className="staleline">
              CMS as of {fmtDate(data.cmsAsOf)}
              {liveAt ? ` · live ${liveAt}` : ''}
            </span>
          </div>

          <div className="viewtoggle" role="group" aria-label="View">
            <button type="button" className={view === 'grid' ? 'on' : ''} /* NO_TRACK */
              aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1 1h6.4v6.4H1zM8.6 1H15v6.4H8.6zM1 8.6h6.4V15H1zM8.6 8.6H15V15H8.6z" />
              </svg>
              Grid
            </button>
            <button type="button" className={view === 'table' ? 'on' : ''} /* NO_TRACK */
              aria-pressed={view === 'table'} onClick={() => setView('table')}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1 2h14v2.6H1zM1 6.7h14v2.6H1zM1 11.4h14V14H1z" />
              </svg>
              Table
            </button>
          </div>
        </div>

        {needsALook.length ? (
          <div className="attn">
            <span className="k">Needs a look</span>
            {needsALook.map((p, i) => {
              const tone = toneForKind(p.kind);
              const locationId = p.locationId;
              return (
                <Pill
                  key={`${p.code}-${locationId ?? 'region'}-${i}`}
                  tone={tone}
                  onClick={locationId && onSelectFacility ? () => selectById(locationId) : undefined}
                >
                  {glyphForTone(tone)} {p.shortName ? `${p.shortName} — ` : ''}
                  {p.reason}
                </Pill>
              );
            })}
          </div>
        ) : null}

        {facilities.length === 0 ? (
          <div className="panel">
            <div className="fs-empty">
              No buildings to score yet.
              <br />
              Five-Star appears once a location is matched to a CCN and CMS has published a snapshot.
            </div>
          </div>
        ) : view === 'grid' ? (
          <GridView
            groups={groups}
            membersOf={membersOf}
            scales={scales}
            currentLocationId={currentLocationId}
            onSelectFacility={onSelectFacility}
          />
        ) : (
          <TableView
            region={region}
            groups={groups}
            facilities={facilities}
            membersOf={membersOf}
            scales={scales}
            currentLocationId={currentLocationId}
            onSelectFacility={onSelectFacility}
          />
        )}

        <div className="foot">
          <b>Stars are CMS.</b> Survey and staffing only move on survey/PBJ events, so they carry
          forward between refreshes. The green projection is ours — live from every finalized MDS,
          already counting residents rolling off the 4-quarter window and crossers hitting day 101.
          It assumes no clinical change: every number is what happens if nothing is done.
        </div>
      </div>
    </div>
  );
}

export default RegionalBoard;
