import { useState } from 'preact/hooks';

/**
 * Confirm-create modal shown at Save when interviews need scheduling.
 *
 * Self-contained inline styles — the newmds.xhtml popup carries none of our
 * bundled CSS, and it's a cramped ~700x650 window, so we keep it compact.
 *
 * Per needed interview we render a checkbox + a dropdown of the WHOLE facility
 * library, pre-selected to our keyword match. Names vary per facility and the
 * match is a best-guess, so the nurse can always correct it (or pick one for a
 * row we couldn't match) before creating.
 *
 * Props:
 *   coverage: { description, interviews: [{type,status,window,recommendedScheduleDate,outOfWindowUda,coveringUda}] }
 *   matches:  { bims, phq, gg, pain }  (each { id, label } | null)
 *   libraryOptions: [{ id, label }]   the full std_assessment list
 *   isoToPccDate: (iso) => 'M/D/YYYY' | null
 *   onConfirm(picks, setProgress)  picks: [{ type, stdAssessmentId, assessDatePcc, label }]
 *   onSkip()
 */
const TYPE_LABEL = { bims: 'BIMS', phq: 'PHQ-9', gg: 'Section GG', pain: 'Pain (Section J)' };

const S = {
  backdrop: 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
  card: 'background:#fff;border-radius:12px;max-width:580px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,0.35);padding:20px 22px;box-sizing:border-box;',
  h2: 'margin:0 0 4px;font-size:17px;font-weight:700;color:#0f172a;',
  sub: 'margin:0 0 14px;font-size:13px;color:#475569;line-height:1.4;',
  list: 'list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:10px;',
  row: 'display:flex;gap:9px;align-items:flex-start;padding:11px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;',
  rowMain: 'flex:1;min-width:0;',
  rowTitle: 'font-size:13.5px;color:#0f172a;line-height:1.4;cursor:pointer;',
  meta: 'color:#475569;font-weight:400;',
  warn: 'color:#b45309;font-weight:400;',
  note: 'margin-top:3px;font-size:12px;color:#b45309;line-height:1.35;',
  select: 'margin-top:7px;width:100%;max-width:100%;box-sizing:border-box;font-size:12.5px;padding:5px 6px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#0f172a;',
  covered: 'padding:8px 12px;border-radius:8px;background:#f0fdf4;color:#15803d;font-size:13px;',
  inProgress: 'padding:8px 12px;border-radius:8px;background:#fffbeb;color:#b45309;font-size:13px;',
  progress: 'margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:13px;',
  progressErr: 'margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:13px;',
  actions: 'display:flex;justify-content:flex-end;gap:10px;',
  btn: 'padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;',
  btnPrimary: 'padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #4338ca;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;',
  btnDisabled: 'opacity:0.55;cursor:default;',
};

export function SchedulerModal({ coverage, matches, libraryOptions, isoToPccDate, onConfirm, onSkip }) {
  const interviews = coverage?.interviews || [];
  const needed = interviews.filter((i) => i.status === 'needed');
  const inProgress = interviews.filter((i) => i.status === 'in_progress');
  const covered = interviews.filter((i) => i.status === 'covered');
  const options = libraryOptions || [];

  // Per-type pick (std_assessment id) and whether to create it. Default to the
  // keyword match; checked on when we have a guess, off (await a pick) otherwise.
  const [selected, setSelected] = useState(
    Object.fromEntries(needed.map((i) => [i.type, matches[i.type]?.id || '']))
  );
  const [checked, setChecked] = useState(
    Object.fromEntries(needed.map((i) => [i.type, !!matches[i.type]]))
  );
  const [progress, setProgress] = useState(null); // {index,total,label,phase,error}

  const busy = !!progress && progress.phase !== 'error';
  const toggle = (t) => setChecked((c) => ({ ...c, [t]: !c[t] }));
  const pick = (t, id) => {
    setSelected((s) => ({ ...s, [t]: id }));
    // Auto-check when a real assessment is chosen; auto-uncheck on "manually".
    setChecked((c) => ({ ...c, [t]: !!id }));
  };

  const labelFor = (id) => options.find((o) => o.id === id)?.label || '';

  const picks = needed
    .filter((i) => checked[i.type] && selected[i.type])
    .map((i) => ({
      type: i.type,
      stdAssessmentId: selected[i.type],
      assessDatePcc: isoToPccDate(i.recommendedScheduleDate) || isoToPccDate(i.window?.end),
      label: TYPE_LABEL[i.type] || i.type,
      assessmentLabel: labelFor(selected[i.type]),
    }));

  return (
    <div style={S.backdrop}>
      <div style={S.card}>
        <h2 style={S.h2}>Schedule MDS interviews</h2>
        <p style={S.sub}>
          This {coverage?.description || 'assessment'} needs {needed.length} interview{needed.length === 1 ? '' : 's'}.
          {covered.length > 0 ? ` ${covered.length} already covered ✓.` : ''}
          {inProgress.length > 0 ? ` ${inProgress.length} in progress ◐.` : ''} Confirm or change the assessment for each, then save.
        </p>

        <ul style={S.list}>
          {needed.map((i) => (
            <li key={i.type} style={S.row}>
              <input
                type="checkbox"
                checked={!!checked[i.type]}
                disabled={!selected[i.type] || busy}
                onChange={() => toggle(i.type)}
                style="margin-top:3px;"
                id={`super-mds-sched-${i.type}`}
              />
              <div style={S.rowMain}>
                <label style={S.rowTitle} for={`super-mds-sched-${i.type}`}>
                  <strong>{TYPE_LABEL[i.type] || i.type}</strong>
                  <span style={S.meta}> — schedule by {isoToPccDate(i.recommendedScheduleDate) || '—'}</span>
                  {!matches[i.type] && <span style={S.warn}> · no library match — pick one below</span>}
                </label>
                {i.outOfWindowUda && (
                  <div style={S.note}>
                    You have one from {isoToPccDate(i.outOfWindowUda.date) || i.outOfWindowUda.date}, but this ARD's window pushed it out of range.
                  </div>
                )}
                <select
                  style={S.select}
                  disabled={busy}
                  value={selected[i.type] || ''}
                  onChange={(e) => pick(i.type, e.target.value)}
                >
                  <option value="">— schedule manually (don't create) —</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            </li>
          ))}
          {inProgress.map((i) => (
            <li key={i.type} style={S.inProgress}>
              ◐ {TYPE_LABEL[i.type] || i.type} in progress — started, not signed
              {i.inProgressUda?.date ? ` (${isoToPccDate(i.inProgressUda.date) || i.inProgressUda.date})` : ''}. Sign it to cover this MDS.
            </li>
          ))}
          {covered.map((i) => (
            <li key={i.type} style={S.covered}>
              {'✓'} {TYPE_LABEL[i.type] || i.type} already covered
              {i.coveringUda?.date ? ` (${isoToPccDate(i.coveringUda.date) || i.coveringUda.date})` : ''}
            </li>
          ))}
        </ul>

        {progress && (
          <div style={progress.phase === 'error' ? S.progressErr : S.progress}>
            {progress.phase === 'creating' && `Scheduling ${progress.label}… (${progress.index + 1}/${progress.total})`}
            {progress.phase === 'done' && `Scheduled ${progress.label} (${progress.index + 1}/${progress.total})`}
            {progress.phase === 'error' && `⚠ ${progress.label}: ${progress.error}`}
          </div>
        )}

        <div style={S.actions}>
          {/* NO_TRACK — fired as mds_interview_scheduler_skipped in orchestrator */}
          <button style={busy ? S.btn + S.btnDisabled : S.btn} disabled={busy} onClick={onSkip}>
            Skip &amp; Save
          </button>
          {/* NO_TRACK — fired as mds_interview_scheduler_confirmed in orchestrator */}
          <button
            style={busy ? S.btnPrimary + S.btnDisabled : S.btnPrimary}
            disabled={busy}
            onClick={() => onConfirm(picks, setProgress)}
            title={picks.length === 0 ? 'Nothing selected — this will just save the MDS' : ''}
          >
            {picks.length > 0 ? `Create ${picks.length} & Save` : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
