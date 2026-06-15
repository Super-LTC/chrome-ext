import { useState } from 'preact/hooks';
import { Combobox } from './Combobox.jsx';

/**
 * Confirm-create modal shown at Save when interviews need scheduling.
 *
 * Refined-clinical: calm card, status pills, a searchable combobox + editable
 * date per row, unmistakable actions. Self-contained inline styles — the
 * newmds.xhtml popup carries none of our bundled CSS.
 *
 * Every interview row is creatable (even covered / in-progress ones — the nurse
 * can schedule a fresh one anyway). Needed rows default ON; covered/in-progress
 * default OFF but can be turned on.
 *
 * Props:
 *   coverage: { description, interviews: [{type,status,window,recommendedScheduleDate,outOfWindowUda,coveringUda,inProgressUda}] }
 *   matches:  { bims, phq, gg, pain }  (each { id, label } | null)
 *   libraryOptions: [{ id, label }]
 *   isoToPccDate: (iso) => 'M/D/YYYY' | null
 *   onConfirm(picks, setProgress)  picks: [{ type, stdAssessmentId, assessDatePcc, label, assessmentLabel }]
 *   onSkip()
 */
const TYPE_LABEL = { bims: 'BIMS', phq: 'PHQ-9', gg: 'Section GG', pain: 'Pain (Section J)' };

const STATUS = {
  needed:      { text: 'Needed',      bg: '#fef2f2', fg: '#b91c1c', dot: '#ef4444' },
  in_progress: { text: 'In progress', bg: '#fffbeb', fg: '#b45309', dot: '#f59e0b' },
  covered:     { text: 'Covered',     bg: '#f0fdf4', fg: '#15803d', dot: '#22c55e' },
};

function _todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const S = {
  backdrop: 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
  card: 'background:#fff;border-radius:14px;max-width:600px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,0.4);box-sizing:border-box;',
  head: 'padding:20px 22px 14px;border-bottom:1px solid #eef2f6;',
  h2: 'margin:0 0 4px;font-size:17px;font-weight:700;color:#0f172a;letter-spacing:-.01em;',
  sub: 'margin:0;font-size:13px;color:#64748b;line-height:1.45;',
  body: 'padding:14px 22px;display:flex;flex-direction:column;gap:9px;',
  row: 'border:1px solid #e7ebf0;border-radius:10px;padding:11px 13px;background:#fbfcfe;',
  rowTop: 'display:flex;align-items:center;gap:9px;',
  check: 'width:16px;height:16px;margin:0;flex-shrink:0;cursor:pointer;accent-color:#4f46e5;',
  name: 'font-size:14px;font-weight:650;color:#0f172a;flex:1;cursor:pointer;',
  pill: (s) => `display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:650;background:${s.bg};color:${s.fg};`,
  dot: (s) => `width:6px;height:6px;border-radius:50%;background:${s.dot};`,
  last: 'margin:6px 0 0 25px;font-size:11.5px;color:#94a3b8;',
  fields: 'margin:10px 0 2px 25px;display:flex;flex-direction:column;gap:8px;',
  fieldRow: 'display:flex;gap:9px;align-items:center;',
  dateLabel: 'font-size:11.5px;color:#64748b;font-weight:600;flex-shrink:0;',
  date: 'padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px;color:#0f172a;font-family:inherit;',
  warn: 'margin:6px 0 0 25px;font-size:11.5px;color:#b45309;',
  foot: 'padding:14px 22px 18px;border-top:1px solid #eef2f6;display:flex;justify-content:flex-end;gap:10px;align-items:center;',
  note: 'flex:1;font-size:11.5px;color:#94a3b8;',
  btnGhost: 'padding:9px 16px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;',
  btnPrimary: 'padding:9px 18px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid #4338ca;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;box-shadow:0 2px 8px rgba(79,70,229,.3);',
  disabled: 'opacity:.5;cursor:default;box-shadow:none;',
  progress: 'margin:0 22px 14px;padding:10px 12px;border-radius:9px;background:#eff6ff;color:#1d4ed8;font-size:12.5px;font-weight:600;',
  progressErr: 'margin:0 22px 14px;padding:10px 12px;border-radius:9px;background:#fef2f2;color:#b91c1c;font-size:12.5px;font-weight:600;',
};

export function SchedulerModal({ coverage, matches, libraryOptions, isoToPccDate, onConfirm, onSkip }) {
  const interviews = coverage?.interviews || [];
  const options = libraryOptions || [];

  // Order: needed first, then in-progress, then covered.
  const order = { needed: 0, in_progress: 1, covered: 2 };
  const rows = [...interviews].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const defaultDate = (i) => i.recommendedScheduleDate || i.window?.end || _todayIso();

  const [state, setState] = useState(() =>
    Object.fromEntries(interviews.map((i) => [i.type, {
      create: i.status === 'needed',
      assessmentId: matches[i.type]?.id || '',
      dateIso: defaultDate(i),
    }]))
  );
  const [progress, setProgress] = useState(null);

  const busy = !!progress && progress.phase !== 'error';
  const set = (type, patch) => setState((s) => ({ ...s, [type]: { ...s[type], ...patch } }));
  const labelFor = (id) => options.find((o) => o.id === id)?.label || '';

  const picks = interviews
    .filter((i) => state[i.type].create && state[i.type].assessmentId)
    .map((i) => ({
      type: i.type,
      stdAssessmentId: state[i.type].assessmentId,
      assessDatePcc: isoToPccDate(state[i.type].dateIso),
      label: TYPE_LABEL[i.type] || i.type,
      assessmentLabel: labelFor(state[i.type].assessmentId),
    }));

  const neededCount = interviews.filter((i) => i.status === 'needed').length;
  const coveredCount = interviews.filter((i) => i.status === 'covered').length;

  return (
    <div style={S.backdrop}>
      <div style={S.card}>
        <div style={S.head}>
          <h2 style={S.h2}>Schedule MDS interviews</h2>
          <p style={S.sub}>
            {coverage?.description || 'This assessment'} needs <strong style="color:#b91c1c;">{neededCount}</strong>
            {coveredCount > 0 ? <> · <strong style="color:#15803d;">{coveredCount}</strong> covered</> : null}. Pick the assessment & date for each, then save.
          </p>
        </div>

        <div style={S.body}>
          {rows.map((i) => {
            const st = state[i.type];
            const s = STATUS[i.status] || STATUS.needed;
            const existing = i.coveringUda || i.inProgressUda || i.outOfWindowUda;
            const cbId = `super-mds-sched-${i.type}`;
            return (
              <div key={i.type} style={S.row}>
                <div style={S.rowTop}>
                  <input type="checkbox" id={cbId} style={S.check}
                    checked={st.create} disabled={busy}
                    onChange={() => set(i.type, { create: !st.create })} />
                  <label for={cbId} style={S.name}>{TYPE_LABEL[i.type] || i.type}</label>
                  <span style={S.pill(s)}><span style={S.dot(s)} />{s.text}</span>
                </div>

                {existing && (
                  <div style={S.last}>
                    {i.status === 'covered' && `Done ${isoToPccDate(existing.date) || existing.date}`}
                    {i.status === 'in_progress' && `Started ${isoToPccDate(existing.date) || existing.date} — not signed`}
                    {i.status === 'needed' && i.outOfWindowUda && `Last ${isoToPccDate(existing.date) || existing.date} · out of window`}
                  </div>
                )}

                {st.create && (
                  <div style={S.fields}>
                    <Combobox
                      options={options}
                      value={st.assessmentId}
                      disabled={busy}
                      onChange={(id) => set(i.type, { assessmentId: id })}
                    />
                    <div style={S.fieldRow}>
                      <span style={S.dateLabel}>Schedule date</span>
                      <input type="date" style={S.date} value={st.dateIso} disabled={busy}
                        onInput={(e) => set(i.type, { dateIso: e.target.value })} />
                    </div>
                    {!st.assessmentId && <div style={S.warn}>Pick an assessment above to schedule this.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {progress && (
          <div style={progress.phase === 'error' ? S.progressErr : S.progress}>
            {progress.phase === 'creating' && `Scheduling ${progress.label}… (${progress.index + 1}/${progress.total})`}
            {progress.phase === 'done' && `Scheduled ${progress.label} (${progress.index + 1}/${progress.total})`}
            {progress.phase === 'error' && `⚠ ${progress.label}: ${progress.error}`}
          </div>
        )}

        <div style={S.foot}>
          <span style={S.note}>{picks.length > 0 ? `${picks.length} to create` : 'Nothing selected'}</span>
          {/* NO_TRACK — fired as mds_interview_scheduler_skipped in orchestrator */}
          <button style={busy ? S.btnGhost + S.disabled : S.btnGhost} disabled={busy} onClick={onSkip}>
            Don't schedule
          </button>
          {/* NO_TRACK — fired as mds_interview_scheduler_confirmed in orchestrator */}
          <button style={busy ? S.btnPrimary + S.disabled : S.btnPrimary} disabled={busy}
            onClick={() => onConfirm(picks, setProgress)}>
            {picks.length > 0 ? `Create ${picks.length} & save MDS` : 'Save MDS'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight loading card shown the instant Save is clicked, while we fetch
 * coverage. Same backdrop so the transition into the modal is seamless.
 */
export function SchedulerLoading() {
  return (
    <div style={S.backdrop}>
      <style>{'@keyframes superMdsSpin{to{transform:rotate(360deg)}}'}</style>
      <div style={'background:#fff;border-radius:14px;padding:26px 30px;box-shadow:0 24px 60px rgba(0,0,0,.4);display:flex;align-items:center;gap:14px;'}>
        <span style={'width:22px;height:22px;border-radius:50%;border:3px solid #e0e7ff;border-top-color:#4f46e5;display:inline-block;animation:superMdsSpin .7s linear infinite;'} />
        <span style={'font:600 14px -apple-system,BlinkMacSystemFont,sans-serif;color:#334155;'}>Checking which interviews this MDS needs…</span>
      </div>
    </div>
  );
}
