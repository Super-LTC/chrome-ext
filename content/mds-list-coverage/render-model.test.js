import { describe, it, expect } from 'vitest';
import { toChips, interviewDetail, INTERVIEW_LABELS } from './render-model.js';

describe('toChips', () => {
  it('not_synced → single neutral chip, never an x', () => {
    const chips = toChips({ key: 'a', status: 'not_synced' });
    expect(chips).toEqual([{ kind: 'neutral', label: '–', title: expect.any(String) }]);
  });

  it('error → single error chip', () => {
    expect(toChips({ key: 'a', status: 'error' })[0].kind).toBe('error');
  });

  it('ok → one chip per interview, branched on all four statuses', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'bims', status: 'covered' },
      { type: 'phq', status: 'in_progress' },
      { type: 'gg', status: 'needed', recommendedScheduleDate: '2026-06-15' },
      { type: 'pain', status: 'upcoming', window: { start: '2026-07-01', end: '2026-07-08' } },
    ] } });
    expect(chips.map(c => c.label)).toEqual(['BIMS', 'PHQ-9', 'GG', 'Pain']);
    expect(chips.map(c => c.kind)).toEqual(['covered', 'in_progress', 'needed', 'upcoming']);
    expect(chips[2].sub).toBe('by 6/15');
  });

  it('maps the live "phq" type to PHQ-9', () => {
    expect(toChips({ key: 'a', status: 'ok', coverage: { interviews: [{ type: 'phq', status: 'covered' }] } })[0].label).toBe('PHQ-9');
  });

  it('unknown interview type falls back to upper-cased label', () => {
    expect(toChips({ key: 'a', status: 'ok', coverage: { interviews: [{ type: 'mood', status: 'covered' }] } })[0].label).toBe('MOOD');
  });

  it('labels cover the four known interviews', () => {
    expect(INTERVIEW_LABELS).toMatchObject({ bims: 'BIMS', phq: 'PHQ-9', gg: 'GG', pain: 'Pain' });
  });
});

describe('interviewDetail', () => {
  it('covered: shows the covering UDA name, completed date + locked, window — no "?"', () => {
    const d = interviewDetail({ type: 'bims', status: 'covered',
      window: { start: '2026-06-09', end: '2026-06-16' },
      coveringUda: { id: 'u1', description: 'GSHC BIMS Eval', date: '2026-06-10', state: 'locked' } });
    expect(d.heading).toBe('BIMS · Done');
    expect(d.lines).toEqual(['GSHC BIMS Eval', 'Completed 6/10 · locked', 'Window 6/9–6/16']);
    expect(d.lines.join(' ')).not.toContain('?');
    expect(d.udaId).toBe('u1'); // → deep-link target
  });

  it('covered with no UDA (older card): just the window, still no x', () => {
    const d = interviewDetail({ type: 'bims', status: 'covered', window: { start: '2026-06-09', end: '2026-06-16' } });
    expect(d.lines).toEqual(['Window 6/9–6/16']);
  });

  it('in_progress: UDA name + "not signed" + sign-by', () => {
    const d = interviewDetail({ type: 'phq', status: 'in_progress',
      window: { start: '2026-06-09', end: '2026-06-16' }, recommendedScheduleDate: '2026-06-16',
      inProgressUda: { id: 'u2', description: 'Social Service', date: '2026-06-11', state: 'open' } });
    expect(d.heading).toBe('PHQ-9 · In progress');
    expect(d.lines).toContain('Social Service');
    expect(d.lines).toContain('Started 6/11 · not signed');
    expect(d.lines).toContain('Sign by 6/16');
    expect(d.udaId).toBe('u2'); // → deep-link target
  });

  it('upcoming: window-opens line, no x, no deep-link', () => {
    const d = interviewDetail({ type: 'pain', status: 'upcoming', window: { start: '2026-07-01', end: '2026-07-08' } });
    expect(d.heading).toBe('Pain · Upcoming');
    expect(d.lines[0]).toBe('Window opens 7/1');
    expect(d.udaId).toBeUndefined();
  });

  it('needed: schedule-by + window + out-of-window note', () => {
    const d = interviewDetail({ type: 'pain', status: 'needed', recommendedScheduleDate: '2026-06-15',
      window: { start: '2026-06-09', end: '2026-06-16' }, outOfWindowUda: { id: 'oow1', date: '2026-03-12' } });
    expect(d.heading).toBe('Pain · Schedule');
    expect(d.lines[0]).toBe('Schedule by 6/15');
    expect(d.lines.some(l => /3\/12/.test(l) && /outside this window/i.test(l))).toBe(true);
    expect(d.udaId).toBe('oow1'); // can view the out-of-window form too
  });
});
