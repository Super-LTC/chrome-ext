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

  it('ok → one chip per interview, branched on all four statuses, no inline date', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'bims', status: 'covered' },
      { type: 'phq', status: 'in_progress' },
      { type: 'gg', status: 'needed', recommendedScheduleDate: '2026-06-15' },
      { type: 'pain', status: 'upcoming', window: { start: '2026-07-01', end: '2026-07-08' } },
    ] } });
    expect(chips.map(c => c.label)).toEqual(['BIMS', 'PHQ-9', 'GG', 'Pain']);
    expect(chips.map(c => c.kind)).toEqual(['covered', 'in_progress', 'needed', 'upcoming']);
    expect(chips.every(c => c.sub === undefined)).toBe(true); // dates moved to the popup
  });

  it('orders chips BIMS · PHQ-9 · GG · Pain regardless of backend order', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'pain', status: 'needed' },
      { type: 'gg', status: 'covered' },
      { type: 'bims', status: 'covered' },
    ] } });
    expect(chips.map(c => c.label)).toEqual(['BIMS', 'GG', 'Pain']);
  });

  it('maps the live "phq" type to PHQ-9', () => {
    expect(toChips({ key: 'a', status: 'ok', coverage: { interviews: [{ type: 'phq', status: 'covered' }] } })[0].label).toBe('PHQ-9');
  });

  it('labels cover the four known interviews', () => {
    expect(INTERVIEW_LABELS).toMatchObject({ bims: 'BIMS', phq: 'PHQ-9', gg: 'GG', pain: 'Pain' });
  });
});

describe('interviewDetail', () => {
  it('covered (non-GG): UDA name, Completed date + lock, Look back; deep-links via externalId', () => {
    const d = interviewDetail({ type: 'bims', status: 'covered',
      window: { start: '2026-06-09', end: '2026-06-16' },
      coveringUda: { id: 'internal1', externalId: '3079669', description: 'GSHC BIMS Eval', date: '2026-06-10', state: 'locked' } });
    expect(d.heading).toBe('BIMS · Done');
    expect(d.lines).toEqual(['GSHC BIMS Eval', 'Completed 6/10 · locked', 'Look back 6/9–6/16']);
    expect(d.lines.join(' ')).not.toContain('?');
    expect(d.udaId).toBe('3079669'); // externalId, NOT the internal id
  });

  it('covered GG: shows BOTH the observe window and the look back', () => {
    const d = interviewDetail({ type: 'gg', status: 'covered',
      window: { start: '2026-06-13', end: '2026-06-15' },
      coveringUda: { id: 'i2', externalId: '3079669', description: 'Functional Abilities and Goals - Interim - V 3',
        date: '2026-06-07', observedEndDate: '2026-06-09', lockedDate: '2026-06-09', state: 'locked' } });
    expect(d.lines).toContain('Observe window 6/7–6/9');
    expect(d.lines).toContain('Look back 6/13–6/15');
    expect(d.lines).toContain('Locked');
  });

  it('covered with no UDA (older card): just the look back, no x', () => {
    const d = interviewDetail({ type: 'bims', status: 'covered', window: { start: '2026-06-09', end: '2026-06-16' } });
    expect(d.lines).toEqual(['Look back 6/9–6/16']);
    expect(d.udaId).toBeUndefined();
  });

  it('in_progress: UDA name + "not signed" + sign-by + externalId link', () => {
    const d = interviewDetail({ type: 'phq', status: 'in_progress',
      window: { start: '2026-06-09', end: '2026-06-16' }, recommendedScheduleDate: '2026-06-16',
      inProgressUda: { id: 'i3', externalId: 'ext3', description: 'Social Service', date: '2026-06-11', state: 'open' } });
    expect(d.heading).toBe('PHQ-9 · In progress');
    expect(d.lines).toContain('Social Service');
    expect(d.lines).toContain('Started 6/11 · not signed');
    expect(d.lines).toContain('Sign by 6/16');
    expect(d.udaId).toBe('ext3');
  });

  it('upcoming: look-back-opens line, no x, no deep-link', () => {
    const d = interviewDetail({ type: 'pain', status: 'upcoming', window: { start: '2026-07-01', end: '2026-07-08' } });
    expect(d.heading).toBe('Pain · Upcoming');
    expect(d.lines[0]).toBe('Look back opens 7/1');
    expect(d.udaId).toBeUndefined();
  });

  it('needed: schedule-by + look back + out-of-window note (links the earlier form)', () => {
    const d = interviewDetail({ type: 'pain', status: 'needed', recommendedScheduleDate: '2026-06-15',
      window: { start: '2026-06-09', end: '2026-06-16' }, outOfWindowUda: { id: 'i4', externalId: 'oowExt', date: '2026-03-12' } });
    expect(d.heading).toBe('Pain · Schedule');
    expect(d.lines[0]).toBe('Schedule by 6/15');
    expect(d.lines.some(l => /3\/12/.test(l) && /outside this window/i.test(l))).toBe(true);
    expect(d.udaId).toBe('oowExt');
  });
});
