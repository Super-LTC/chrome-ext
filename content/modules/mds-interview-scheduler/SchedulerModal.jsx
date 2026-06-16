import { useState } from 'preact/hooks';
import { Combobox } from './Combobox.jsx';

/**
 * Confirm-create modal shown at Save when interviews need scheduling.
 *
 * Refined-clinical, compact: fixed header / scrolling rows / fixed footer so the
 * actions are ALWAYS visible without scrolling. Self-contained inline styles —
 * the newmds.xhtml popup carries none of our bundled CSS.
 *
 * Every interview row is creatable (even covered / in-progress — schedule a fresh
 * one anyway). Needed default ON; covered/in-progress default OFF, collapsed to a
 * one-liner naming the covering assessment + date (with an Open link).
 *
 * Props:
 *   coverage, matches, libraryOptions, isoToPccDate, openUda(uda), onConfirm, onSkip,
 *   onDismiss()  — "Don't show this again": hide + close our modal (no save)
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
  card: 'background:#fff;border-radius:14px;max-width:600px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.4);overflow:hidden;',
  head: 'flex-shrink:0;padding:16px 20px 12px;border-bottom:1px solid #eef2f6;',
  h2: 'margin:0 0 3px;font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-.01em;',
  sub: 'margin:0;font-size:12.5px;color:#64748b;line-height:1.4;',
  body: 'flex:1;overflow-y:auto;padding:12px 20px;display:flex;flex-direction:column;gap:8px;',
  row: 'border:1px solid #e7ebf0;border-radius:9px;padding:9px 11px;background:#fbfcfe;',
  rowTop: 'display:flex;align-items:center;gap:8px;',
  check: 'width:15px;height:15px;margin:0;flex-shrink:0;cursor:pointer;accent-color:#4f46e5;',
  name: 'font-size:13.5px;font-weight:650;color:#0f172a;flex:1;cursor:pointer;',
  pill: (s) => `display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:650;background:${s.bg};color:${s.fg};white-space:nowrap;`,
  dot: (s) => `width:5px;height:5px;border-radius:50%;background:${s.dot};`,
  meta: 'margin:5px 0 0 23px;font-size:11.5px;color:#94a3b8;line-height:1.4;',
  metaStrong: 'color:#64748b;',
  open: 'color:#4f46e5;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap;',
  fields: 'margin:8px 0 1px 23px;display:flex;gap:8px;align-items:center;',
  cbWrap: 'flex:1;min-width:0;',
  date: 'flex-shrink:0;width:138px;padding:7px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px;color:#0f172a;font-family:inherit;box-sizing:border-box;',
  warn: 'margin:5px 0 0 23px;font-size:11px;color:#b45309;',
  // Covered/in-progress rows: a faint, NON-interactive "done" tick — never a
  // checkbox (a checkbox implies "will be created"). A real checked box only
  // appears once you explicitly opt in to creating another.
  doneMark: 'width:16px;height:16px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:#cbd5e1;',
  nameDone: 'font-size:13.5px;font-weight:650;color:#475569;flex:1;',
  addLink: 'margin:6px 0 0 23px;font-size:11.5px;color:#4f46e5;font-weight:700;cursor:pointer;display:inline-block;',
  addUndo: 'margin:6px 0 0 23px;font-size:11.5px;color:#94a3b8;font-weight:600;cursor:pointer;display:inline-block;',
  progress: 'flex-shrink:0;margin:0 20px 10px;padding:9px 11px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:600;',
  progressErr: 'flex-shrink:0;margin:0 20px 10px;padding:9px 11px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:600;',
  foot: 'flex-shrink:0;padding:12px 20px;border-top:1px solid #eef2f6;display:flex;justify-content:flex-end;gap:9px;align-items:center;background:#fff;',
  dismiss: 'flex:1;font-size:11.5px;color:#94a3b8;cursor:pointer;text-decoration:underline;text-underline-offset:2px;',
  btnGhost: 'padding:9px 15px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;white-space:nowrap;',
  btnPrimary: 'padding:9px 17px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid #4338ca;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;box-shadow:0 2px 8px rgba(79,70,229,.3);white-space:nowrap;',
  disabled: 'opacity:.5;cursor:default;box-shadow:none;',
};

export function SchedulerModal({ coverage, matches, libraryOptions, isoToPccDate, openUda, onConfirm, onSkip, onDismiss }) {
  const interviews = coverage?.interviews || [];
  const options = libraryOptions || [];
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

  const ExistingLine = ({ i }) => {
    const uda = i.coveringUda || i.inProgressUda || i.outOfWindowUda;
    if (!uda) return null;
    const date = isoToPccDate(uda.date) || uda.date;
    const prefix = i.status === 'covered' ? 'Done' : i.status === 'in_progress' ? 'Started' : 'Last';
    const suffix = i.status === 'in_progress' ? ' · not signed' : i.status === 'needed' ? ' · out of window' : '';
    return (
      <div style={S.meta}>
        {prefix} {date}{suffix} · <span style={S.metaStrong}>{uda.description}</span>
        {openUda && uda.id ? <> · <a style={S.open} onClick={() => openUda(uda)}>View ↗</a></> : null}
      </div>
    );
  };

  return (
    <div style={S.backdrop}>
      <div style={S.card}>
        <div style={S.head}>
          <h2 style={S.h2}>Would you like to auto-schedule these assessments?</h2>
          <p style={S.sub}>
            {coverage?.description || 'This assessment'} · <strong style="color:#b91c1c;">{neededCount} needed</strong>
            {coveredCount > 0 ? <>, <strong style="color:#15803d;">{coveredCount} covered</strong></> : null}. Pick assessment & date, then save.
          </p>
        </div>

        <div style={S.body}>
          {rows.map((i) => {
            const st = state[i.type];
            const s = STATUS[i.status] || STATUS.needed;
            const cbId = `super-mds-sched-${i.type}`;
            const isNeeded = i.status === 'needed';
            const toggle = () => !busy && set(i.type, { create: !st.create });
            return (
              <div key={i.type} style={S.row}>
                <div style={S.rowTop}>
                  {(isNeeded || st.create) ? (
                    /* A checked box ONLY when this row will actually be created. */
                    <input type="checkbox" id={cbId} style={S.check}
                      checked={st.create} disabled={busy}
                      onChange={() => set(i.type, { create: !st.create })} />
                  ) : (
                    /* Already covered, nothing to do: a faint "done" tick, not a control. */
                    <span style={S.doneMark} aria-hidden="true">✓</span>
                  )}
                  <label for={(isNeeded || st.create) ? cbId : undefined}
                    style={(isNeeded || st.create) ? S.name : S.nameDone}>{TYPE_LABEL[i.type] || i.type}</label>
                  <span style={S.pill(s)}><span style={S.dot(s)} />{s.text}</span>
                </div>

                <ExistingLine i={i} />

                {/* Covered/in-progress: explicit opt-in (or undo) for adding another. */}
                {!isNeeded && (
                  st.create
                    ? <div style={S.addUndo} onClick={toggle}>✕ Don't create — keep the existing one</div>
                    : <div style={S.addLink} onClick={toggle}>＋ Create a new one anyway</div>
                )}

                {st.create && (
                  <>
                    <div style={S.fields}>
                      <div style={S.cbWrap}>
                        <Combobox options={options} value={st.assessmentId} disabled={busy}
                          onChange={(id) => set(i.type, { assessmentId: id })} />
                      </div>
                      <input type="date" style={S.date} title="Schedule date" value={st.dateIso} disabled={busy}
                        onInput={(e) => set(i.type, { dateIso: e.target.value })} />
                    </div>
                    {!st.assessmentId && <div style={S.warn}>Pick an assessment to schedule this.</div>}
                  </>
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
          <span style={busy ? S.dismiss + 'opacity:.5;cursor:default;' : S.dismiss}
            title="Stop showing this (you can turn it back on); closes this box so you can save normally"
            onClick={() => !busy && onDismiss?.()}>
            Don't show this again
          </span>
          {picks.length > 0 && (
            /* NO_TRACK — fired as mds_interview_scheduler_skipped in orchestrator */
            <button style={busy ? S.btnGhost + S.disabled : S.btnGhost} disabled={busy} onClick={onSkip}>
              Just create MDS
            </button>
          )}
          {/* NO_TRACK — fired as mds_interview_scheduler_confirmed in orchestrator */}
          <button style={busy ? S.btnPrimary + S.disabled : S.btnPrimary} disabled={busy}
            onClick={() => onConfirm(picks, setProgress)}>
            {picks.length > 0 ? `Create ${picks.length} assessment${picks.length > 1 ? 's' : ''} + MDS` : 'Create MDS'}
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
