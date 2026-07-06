/**
 * Florida QIP — Official(CMS) vs Projected(ours) + coding-accuracy, ported from
 * the web app's QmFlQipView (web/components/quality-measures/qm-fl-qip-view.tsx).
 *
 * Official = CMS-published 4Q-avg (lagged ~1yr). Projected = our live MDS engine
 * for the current calendar year. Coding-accuracy = residents whose chart supports
 * an MDS code not yet entered (terminal prognosis / a real flu refusal) — coding
 * accuracy, not a math change.
 *
 * Self-contained inline styles (inside the `qmc` tone scope) so it renders without
 * new CSS. Data + mutations come from useFlQip.
 */
import { useState } from 'preact/hooks';
import { useFlQip, FL_QIP_PROGNOSIS_KIND, FL_QIP_FLU_KIND } from '../hooks/useFlQip.js';

const C = {
  ink: '#0f172a', body: '#334155', muted: '#64748b', faint: '#94a3b8', line: '#e2e8f0',
  soft: '#f1f5f9', softer: '#f8fafc', white: '#fff',
  emerald: '#059669', emeraldBg: '#ecfdf5', amber: '#b45309', amberBg: '#fffbeb',
  rose: '#e11d48', roseBg: '#fff1f2', orange: '#ea580c', indigo: '#4f46e5', indigoBg: '#eef2ff',
  violet: '#7c3aed', violetBg: '#f5f3ff', sky: '#0284c7', skyBg: '#f0f9ff',
};
const fmtPct = (r) => (r == null ? '—' : `${Number(r).toFixed(2)}%`);
const ptColor = (n) => (n >= 3 ? C.emerald : n >= 2 ? C.amber : n >= 1 ? C.orange : C.faint);
const nameOf = (c) => {
  const last = (c.lastName || '').trim(); const first = (c.firstName || '').trim();
  if (last) return first ? `${last}, ${first[0]}.` : last;
  return c.externalPatientId ? `#${c.externalPatientId}` : 'Resident';
};
const CONDITION_LABEL = { dementia: 'Dementia', parkinsons: "Parkinson's", cva: 'CVA' };
const MEASURE_SHORT = { adl_decline: 'ADL decline', antianxiety_hypnotic_rate: 'Antianxiety', walk_indep_worsened: 'Walk decline', weight_loss: 'Weight loss' };

function Pts({ n, muted }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 16, fontWeight: 800, color: muted ? C.faint : ptColor(n) }}>{n}</span>
      <span style={{ marginLeft: 2, fontSize: 10, fontWeight: 500, color: C.faint }}>{n === 1 ? 'pt' : 'pts'}</span>
    </span>
  );
}

function NotCoded() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, borderRadius: 4, background: C.amberBg, padding: '2px 6px', fontSize: 10, fontWeight: 700, color: C.amber }}>
      ⚠ Not coded
    </span>
  );
}

function ConditionBadges({ conditions }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {conditions.map((c) => (
        <span key={c.code} title={`Active diagnosis ${c.code}`} style={{ borderRadius: 10, background: C.violetBg, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: C.violet }}>
          {CONDITION_LABEL[c.condition] || c.condition}
        </span>
      ))}
    </span>
  );
}

function DxDetail({ conditions }) {
  return (
    <div style={{ padding: '6px 12px 6px 28px', background: C.softer, fontSize: 11 }}>
      {conditions.map((cond) => (
        <div key={cond.code} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontWeight: 600, color: C.body }}>{cond.description || cond.label}</span>
          <span style={{ borderRadius: 3, border: `1px solid ${C.line}`, background: C.white, padding: '0 4px', fontSize: 10, color: C.faint }}>{cond.code}</span>
          <span style={{ color: C.faint }}>{cond.addedDate ? `added to problem list ${cond.addedDate}` : 'date added unknown'}</span>
        </div>
      ))}
    </div>
  );
}

const PROG_GRID = '1.3fr 1.2fr 0.9fr 1.3fr auto';
const FLU_GRID = '1.3fr 1.3fr 0.9fr 0.9fr auto';

function DismissBtn({ onClick }) {
  return (
    <button type="button" /* NO_TRACK */ title="Dismiss — hide this resident (e.g. physician declined)"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: 3, borderRadius: 5, border: `1px solid ${C.line}`, background: C.white, padding: '2px 6px', fontSize: 10, fontWeight: 700, color: C.muted, cursor: 'pointer' }}>
      ✕ Dismiss
    </button>
  );
}

function ProgRow({ c, onDismiss }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${C.soft}` }}>
      <div role="button" onClick={() => setOpen((o) => !o)}
        style={{ display: 'grid', gridTemplateColumns: PROG_GRID, alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.body, minWidth: 0 }}>
          <span style={{ color: C.faint, fontSize: 10 }}>{open ? '▾' : '▸'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(c)}</span>
        </span>
        <ConditionBadges conditions={c.conditions} />
        <span><NotCoded /></span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {c.affectedMeasures.length === 0
            ? <span style={{ fontSize: 10, color: C.faint }}>— not in a scored measure</span>
            : c.affectedMeasures.map((a) => (
              <span key={a.measureId} title={a.inNumerator ? 'Currently pulling this rate down — excluding them helps' : 'In this measure but not counting against you'}
                style={{ borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, background: a.inNumerator ? C.roseBg : C.soft, color: a.inNumerator ? C.rose : C.muted }}>
                {MEASURE_SHORT[a.measureId] || a.measureId}
              </span>
            ))}
        </span>
        <DismissBtn onClick={onDismiss} />
      </div>
      {open && <DxDetail conditions={c.conditions} />}
    </div>
  );
}

function CoverageRow({ c, right }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${C.soft}` }}>
      <div role="button" onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.body, minWidth: 0 }}>
          <span style={{ color: C.faint, fontSize: 10 }}>{open ? '▾' : '▸'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(c)}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}><ConditionBadges conditions={c.conditions} />{right}</span>
      </div>
      {open && <DxDetail conditions={c.conditions} />}
    </div>
  );
}

/** Coverage modal — coded ✓ / not-coded ⚠ / dismissed for the prognosis cohort. */
function CoverageModal({ prognosis, onDismiss, onUndo, onClose }) {
  const total = prognosis.coded.length + prognosis.candidates.length + prognosis.dismissed.length;
  const pct = total ? Math.round((prognosis.coded.length / total) * 100) : 0;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2147483646, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', background: 'rgba(15,23,42,.4)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, borderRadius: 14, background: C.white, padding: 18, boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>Terminal prognosis — coding coverage</div>
            <div style={{ marginTop: 2, fontSize: 11, color: C.muted }}>
              Long-stay residents with dementia / Parkinson's / CVA on the diagnosis list. Coding J1400 (life
              expectancy under 6 months, when clinically true) excludes them from ADL-decline &amp; antianxiety.
            </div>
          </div>
          <button type="button" /* NO_TRACK */ onClick={onClose} style={{ flexShrink: 0, border: 'none', background: 'transparent', color: C.faint, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: C.body }}>{prognosis.coded.length} of {total} coded</span>
            <span style={{ color: C.faint }}>{pct}%</span>
          </div>
          <div style={{ marginTop: 4, height: 8, width: '100%', borderRadius: 999, background: C.soft, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: C.emerald, width: `${pct}%` }} />
          </div>
        </div>
        <div style={{ marginTop: 8, borderRadius: 8, background: C.softer, padding: '8px 12px', fontSize: 12, color: C.body }}>
          {prognosis.totalPotentialPoints > 0
            ? <>Coding the {prognosis.candidates.length} not-yet-coded could add up to <b style={{ color: C.emerald }}>+{prognosis.totalPotentialPoints}</b> pts.</>
            : "You're already in the top band on these measures — coding more won't move your score right now, but it keeps the MDS accurate."}
        </div>

        {prognosis.candidates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.amber }}>⚠ Not coded ({prognosis.candidates.length})</div>
            <div style={{ borderRadius: 8, border: `1px solid ${C.soft}`, overflow: 'hidden' }}>
              {prognosis.candidates.map((c) => <ProgRow key={c.patientId} c={c} onDismiss={() => onDismiss(c.patientId)} />)}
            </div>
          </div>
        )}
        {prognosis.coded.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.emerald }}>✓ Coded ({prognosis.coded.length})</div>
            <div style={{ borderRadius: 8, border: `1px solid ${C.soft}`, overflow: 'hidden' }}>
              {prognosis.coded.map((c) => <CoverageRow key={c.patientId} c={c} right={<span style={{ borderRadius: 4, background: C.emeraldBg, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: C.emerald }}>J1400 coded</span>} />)}
            </div>
          </div>
        )}
        {prognosis.dismissed.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.faint }}>Dismissed ({prognosis.dismissed.length})</div>
            <div style={{ borderRadius: 8, border: `1px solid ${C.soft}`, overflow: 'hidden' }}>
              {prognosis.dismissed.map((c) => <CoverageRow key={c.patientId} c={c} right={
                <button type="button" /* NO_TRACK */ onClick={() => onUndo(c.patientId)} style={{ border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: C.indigo, cursor: 'pointer' }}>↩ Undo</button>
              } />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DismissedStrip({ items, onUndo }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${C.soft}`, paddingTop: 8 }}>
      <button type="button" /* NO_TRACK */ onClick={() => setOpen((o) => !o)} style={{ border: 'none', background: 'transparent', fontSize: 11, fontWeight: 600, color: C.faint, cursor: 'pointer' }}>
        {open ? '▾' : '▸'} Dismissed ({items.length})
      </button>
      {open && items.map((it) => (
        <div key={it.patientId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 16, fontSize: 12 }}>
          <span style={{ color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ textDecoration: 'line-through' }}>{it.label}</span> {it.sub}</span>
          <button type="button" /* NO_TRACK */ onClick={() => onUndo(it.patientId)} style={{ border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: C.indigo, cursor: 'pointer', flexShrink: 0 }}>↩ Undo</button>
        </div>
      ))}
    </div>
  );
}

const card = { borderRadius: 12, border: `1px solid ${C.line}`, background: C.white, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };

function TrackCard({ title, subtitle, total, floor, qualifying, toQualify, accent }) {
  return (
    <div style={{ ...card, flex: 1, padding: 14, borderColor: accent || C.line }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.muted }}>{title}</div>
      <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: C.ink }}>{Number(total).toFixed(1)}</span>
        <span style={{ fontSize: 13, color: C.faint }}>/ floor {floor}</span>
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: C.muted }}>{subtitle}</div>
      <div style={{ marginTop: 6 }}>
        {qualifying
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 6, background: C.emeraldBg, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: C.emerald }}>✓ Qualifying</span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 6, background: C.roseBg, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: C.rose }}>⚠ {Number(toQualify).toFixed(1)} pts short</span>}
      </div>
    </div>
  );
}

/** The main Florida QIP view. Rendered inside a `.qmc` tone scope by the caller. */
export function FlQipView({ facilityName, orgSlug, onOpenMeasure }) {
  const { data, loading, error, saveInputs, setDismiss } = useFlQip({ facilityName, orgSlug });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [coverageOpen, setCoverageOpen] = useState(false);

  if (loading && !data) return <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: C.faint }}>Loading Florida QIP…</div>;
  if (error && !data) return <div style={{ borderRadius: 12, border: `1px solid ${C.roseBg}`, background: C.roseBg, padding: 16, fontSize: 13, color: C.rose }}>Couldn't load the Florida QIP comparison.</div>;
  if (!data) return null;

  const nonMds = data.nonMds || {};
  const coding = data.coding;

  const startEdit = () => {
    const i = data.inputs || {};
    setForm({
      hasAccreditation: !!i.hasAccreditation,
      directCareStaffingTier: i.directCareStaffingTier ?? null,
      socialWorkActivityStaffingTier: i.socialWorkActivityStaffingTier ?? null,
      hospitalizationsPer1000: i.hospitalizationsPer1000 ?? null,
      rnTurnoverSource: i.rnTurnoverSource || 'rn',
    });
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    try { await saveInputs(form); } catch { /* keep panel */ }
    setSaving(false); setEditing(false);
  };
  const mutate = async (patientId, kind, dismiss) => {
    try { await setDismiss(patientId, kind, dismiss); } catch { /* offline / not deployed yet */ }
  };

  const th = { padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.faint };
  const prog = coding?.prognosis;
  const flu = coding?.flu;
  const progCohort = prog ? prog.coded.length + prog.candidates.length + prog.dismissed.length : 0;
  const anyNumerator = prog ? prog.candidates.some((c) => c.affectedMeasures.some((a) => a.inNumerator)) : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: C.muted }}>
          <b style={{ color: C.body }}>Official</b> = CMS-published scoreboard (lagged ~1&nbsp;year).{' '}
          <b style={{ color: C.body }}>Projected</b> = our live estimate of where this year lands.
        </div>
      </div>

      {/* Official vs Projected cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <TrackCard title="Official (CMS)" subtitle={`As of ${data.officialAsOf || '—'} · prior-year care`}
          total={data.officialTotalPoints} floor={data.floor} qualifying={data.officialQualifying} toQualify={data.officialPointsToQualify} />
        <TrackCard title="Projected (ours)" accent={C.indigo}
          subtitle={`Live · ${(data.completedQuarters || []).join(', ') || '—'}${data.currentQuarter ? ` + ${data.currentQuarter}` : ''}`}
          total={data.projectedTotalPoints} floor={data.floor} qualifying={data.projectedQualifying} toQualify={data.projectedPointsToQualify} />
      </div>

      {/* Measure table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr', gap: 8, borderBottom: `1px solid ${C.line}`, background: C.softer, padding: '6px 12px' }}>
          <span style={th}>Measure</span><span style={th}>Official (CMS)</span><span style={th}>Projected (ours)</span>
        </div>
        {(data.measures || []).map((m) => {
          const official = m.officialUnavailable
            ? <span style={{ fontSize: 11, color: C.faint }}>not scored</span>
            : <><Pts n={m.officialPoints} /><span style={{ fontSize: 11, color: C.faint }}>{fmtPct(m.officialRate)}</span></>;
          const projected = <><Pts n={m.projectedPoints} muted={m.deferredToOfficial} /><span style={{ fontSize: 11, color: m.deferredToOfficial ? C.faint : C.muted }}>{fmtPct(m.projectedRate)}</span></>;
          const row = { display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.soft}`, padding: '8px 12px', fontFamily: 'inherit', width: '100%' };
          // Click a measure → the SAME MeasureDetail surface Five-Star opens
          // (residents + rate + what-if). onOpenMeasure is hosted by QMBoard.
          if (!onOpenMeasure) {
            return (
              <div key={m.measureId} style={row}>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>{official}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>{projected}</span>
              </div>
            );
          }
          return (
            <button key={m.measureId} type="button" data-track="qm_drill_in" data-track-prop-measure-code={m.measureId} data-track-prop-view="fl_qip"
              onClick={() => onOpenMeasure(m.measureId, { scoreContext: 'fl_qip' })} title="Open this measure's residents"
              style={{ ...row, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 13, fontWeight: 500, color: C.body }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                <span style={{ flexShrink: 0, fontSize: 12, color: C.faint }}>›</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>{official}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>{projected}</span>
            </button>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr 1fr', gap: 8, borderTop: `1px solid ${C.line}`, background: C.softer, padding: '8px 12px', fontSize: 13, fontWeight: 700, color: C.body }}>
          <span>Quality-measure points</span><span>{data.officialMdsPoints} pts</span><span>{data.projectedMdsPoints} pts</span>
        </div>
      </div>

      {/* Non-MDS panel */}
      <div style={{ ...card, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.faint }}>Other points (non-MDS) — {nonMds.total} pts</div>
          {!editing
            ? <button type="button" /* NO_TRACK */ onClick={startEdit} style={{ borderRadius: 6, border: `1px solid ${C.line}`, background: C.white, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer' }}>✎ Edit inputs</button>
            : <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" /* NO_TRACK */ onClick={() => setEditing(false)} style={{ border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer' }}>Cancel</button>
                <button type="button" /* NO_TRACK */ onClick={save} disabled={saving} style={{ borderRadius: 6, border: 'none', background: C.indigo, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: C.white, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
              </span>}
        </div>
        {!editing ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: C.body }}>
            <span>5-Star: <b>{nonMds.fiveStar}</b></span>
            <span>Accreditation: <b>{nonMds.accreditation}</b></span>
            <span>RN turnover ({data.rnTurnoverSource === 'rn' ? 'RN' : 'total'} {data.rnTurnoverPct ?? '—'}%): <b>{nonMds.rnTurnover}</b></span>
            <span>Hospitalizations: <b>{nonMds.hospitalizations}</b></span>
            <span>Direct-care staffing: <b>{nonMds.directCareStaffing}</b></span>
            <span>SW/Activity staffing: <b>{nonMds.socialWorkActivityStaffing}</b></span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: C.body }}>
              Accreditation (Gold Seal / Joint Commission)
              <input type="checkbox" checked={form.hasAccreditation} onChange={(e) => setForm({ ...form, hasAccreditation: e.target.checked })} />
            </label>
            {['directCareStaffingTier', 'socialWorkActivityStaffingTier'].map((k) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: C.body }}>
                {k === 'directCareStaffingTier' ? 'Direct-care staffing tier' : 'Social-work / activity staffing tier'}
                <select value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Not set</option><option value="1">Tier 1 (1 pt)</option><option value="2">Tier 2 (2 pts)</option><option value="3">Tier 3 (3 pts)</option>
                </select>
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: C.body }}>
              Hospitalizations per 1,000 days
              <input type="number" step="0.01" min="0" value={form.hospitalizationsPer1000 ?? ''} placeholder="—"
                onInput={(e) => setForm({ ...form, hospitalizationsPer1000: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: 90, textAlign: 'right' }} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: C.body }}>
              RN turnover figure
              <span style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', fontSize: 11, fontWeight: 700 }}>
                <button type="button" /* NO_TRACK */ onClick={() => setForm({ ...form, rnTurnoverSource: 'rn' })} style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', background: form.rnTurnoverSource === 'rn' ? C.ink : C.white, color: form.rnTurnoverSource === 'rn' ? C.white : C.muted }}>RN {data.rnTurnoverPctRn ?? '—'}%</button>
                <button type="button" /* NO_TRACK */ onClick={() => setForm({ ...form, rnTurnoverSource: 'total' })} style={{ padding: '3px 8px', border: 'none', cursor: 'pointer', background: form.rnTurnoverSource === 'total' ? C.ink : C.white, color: form.rnTurnoverSource === 'total' ? C.white : C.muted }}>Total {data.rnTurnoverPctTotal ?? '—'}%</button>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Total line */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 12, border: `1px solid ${C.indigo}`, background: C.indigoBg, padding: '10px 16px' }}>
        <div style={{ fontSize: 13, color: C.body }}>
          Quality-measure <b style={{ color: C.ink }}>{data.projectedMdsPoints}</b> <span style={{ color: C.faint, margin: '0 6px' }}>+</span> Other <b style={{ color: C.ink }}>{nonMds.total}</b> <span style={{ color: C.faint, margin: '0 6px' }}>=</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{data.projectedTotalPoints}</span>
          <span style={{ fontSize: 13, color: C.muted }}>projected total</span>
          {data.projectedQualifying
            ? <span style={{ borderRadius: 6, background: C.emeraldBg, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: C.emerald }}>✓ clears the {data.floor} floor</span>
            : <span style={{ borderRadius: 6, background: C.roseBg, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: C.rose }}>⚠ {Number(data.projectedPointsToQualify).toFixed(1)} below the {data.floor} floor</span>}
        </div>
      </div>

      {/* Coding accuracy */}
      {coding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.faint }}>Coding accuracy</div>
            {coding.totalPotentialPoints > 0 && <span style={{ fontSize: 12, color: C.muted }}>up to <b style={{ color: C.emerald }}>+{coding.totalPotentialPoints}</b> pts if fully coded</span>}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>Residents whose chart supports an MDS code that isn't entered yet. Coding it (when it's clinically true) takes them out of the measure.</div>

          {/* Prognosis */}
          <div style={{ ...card, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.body, marginBottom: 2 }}>Terminal prognosis exclusions</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
              {prog.candidateCount === 0 ? 'No residents with an uncoded qualifying prognosis.'
                : `${prog.candidateCount} resident${prog.candidateCount === 1 ? '' : 's'} with a qualifying diagnosis and no ≤6-month prognosis on the MDS.`}
            </div>
            {prog.candidates.length > 0 && (
              <div style={{ borderRadius: 8, border: `1px solid ${C.soft}`, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: PROG_GRID, gap: 8, background: C.softer, padding: '5px 12px' }}>
                  <span style={th}>Resident</span><span style={th}>Diagnosis</span><span style={th}>Prognosis (J1400)</span><span style={th}>In these measures</span><span />
                </div>
                {prog.candidates.map((c) => <ProgRow key={c.patientId} c={c} onDismiss={() => mutate(c.patientId, FL_QIP_PROGNOSIS_KIND, true)} />)}
              </div>
            )}
            {prog.candidates.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: C.faint }}>
                Coding J1400 removes them from ADL-decline &amp; antianxiety.{anyNumerator ? ' Rose = currently pulling that rate down.' : ' None are pulling a rate down right now, so it won\'t move points yet.'}
              </div>
            )}
            <DismissedStrip items={prog.dismissed.map((c) => ({ patientId: c.patientId, label: nameOf(c), sub: c.conditions.map((x) => x.label).join(', ') }))} onUndo={(id) => mutate(id, FL_QIP_PROGNOSIS_KIND, false)} />
            {progCohort > 0 && (
              <button type="button" /* NO_TRACK */ onClick={() => setCoverageOpen(true)}
                style={{ marginTop: 8, display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, border: `1px solid ${C.indigo}`, background: C.indigoBg, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: C.indigo, cursor: 'pointer' }}>
                <span>View full roster — {prog.coded.length} of {progCohort} coded ({Math.round((prog.coded.length / progCohort) * 100)}%)</span><span>▸</span>
              </button>
            )}
          </div>

          {/* Flu */}
          <div style={{ ...card, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.body, marginBottom: 2 }}>Flu documentation</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
              {flu.candidateCount > 0
                ? `${flu.candidateCount} resident${flu.candidateCount === 1 ? '' : 's'} failing flu whose immunization record shows a refusal or receipt not on the MDS${flu.impact.reaches100 && flu.impact.pointDelta > 0 ? ' — coding them reaches 100%' : ''}.`
                : flu.impact.liveFailures > 0
                  ? `${flu.impact.liveFailures} resident${flu.impact.liveFailures === 1 ? '' : 's'} failing flu, but no immunization record to code from — they need a vaccination, not a code.`
                  : 'All current residents are vaccinated or already coded.'}
            </div>
            {flu.candidates.length > 0 && (
              <div style={{ borderRadius: 8, border: `1px solid ${C.soft}`, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: FLU_GRID, gap: 8, background: C.softer, padding: '5px 12px' }}>
                  <span style={th}>Resident</span><span style={th}>Chart shows</span><span style={th}>On MDS (O0250)</span><span style={th}>Code</span><span />
                </div>
                {flu.candidates.map((c) => (
                  <div key={c.patientId} style={{ display: 'grid', gridTemplateColumns: FLU_GRID, alignItems: 'center', gap: 8, borderTop: `1px solid ${C.soft}`, padding: '6px 12px', fontSize: 13 }}>
                    <span style={{ color: C.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(c)}</span>
                    <span><span style={{ borderRadius: 10, background: C.skyBg, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: C.sky }}>{c.immStatus}{c.immDate ? ` · ${c.immDate}` : ''}</span></span>
                    <span><NotCoded /></span>
                    <span><span title={c.note} style={{ borderRadius: 4, background: C.emeraldBg, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: C.emerald }}>{c.suggestedCode}</span></span>
                    <DismissBtn onClick={() => mutate(c.patientId, FL_QIP_FLU_KIND, true)} />
                  </div>
                ))}
              </div>
            )}
            {flu.impact.genuineMisses > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: C.faint }}>{flu.impact.genuineMisses} other{flu.impact.genuineMisses === 1 ? '' : 's'} truly missed the vaccine — those need a vaccination, not a code.</div>
            )}
            <DismissedStrip items={flu.dismissed.map((c) => ({ patientId: c.patientId, label: nameOf(c), sub: c.immStatus }))} onUndo={(id) => mutate(id, FL_QIP_FLU_KIND, false)} />
          </div>
        </div>
      )}

      {coverageOpen && prog && (
        <CoverageModal prognosis={prog}
          onDismiss={(id) => mutate(id, FL_QIP_PROGNOSIS_KIND, true)}
          onUndo={(id) => mutate(id, FL_QIP_PROGNOSIS_KIND, false)}
          onClose={() => setCoverageOpen(false)} />
      )}
    </div>
  );
}
