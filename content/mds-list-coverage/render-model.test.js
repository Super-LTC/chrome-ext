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

  it('ok → one chip per required interview, in array order', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'bims', status: 'covered' },
      { type: 'gg', status: 'needed', recommendedScheduleDate: '2026-06-15' },
    ] } });
    expect(chips.map(c => c.label)).toEqual(['BIMS', 'GG']);
    expect(chips[0].kind).toBe('covered');
    expect(chips[1].kind).toBe('needed');
    expect(chips[1].sub).toBe('by 6/15');
  });

  it('covered chip title shows the window with no year', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'bims', status: 'covered', window: { start: '2026-06-09', end: '2026-06-16' } },
    ] } });
    expect(chips[0].title).toBe('BIMS done · window 6/9–6/16');
    expect(chips[0].title).not.toMatch(/2026/);
  });

  it('unknown interview type falls back to upper-cased label', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'mood', status: 'covered' },
    ] } });
    expect(chips[0].label).toBe('MOOD');
  });

  it('labels cover the four known interviews', () => {
    expect(INTERVIEW_LABELS).toMatchObject({ bims: 'BIMS', phq9: 'PHQ-9', gg: 'GG', pain: 'Pain' });
  });
});

describe('interviewDetail', () => {
  it('covered: shows the window, never a "completed ?" line', () => {
    const d = interviewDetail({ type: 'bims', status: 'covered', window: { start: '2026-06-09', end: '2026-06-16' } });
    expect(d.heading).toBe('BIMS · Done');
    expect(d.lines).toEqual(['In window 6/9–6/16']);
    expect(d.lines.join(' ')).not.toContain('?');
  });

  it('covered with a source UDA shows its name + date (no question mark)', () => {
    const d = interviewDetail({ type: 'bims', status: 'covered',
      window: { start: '2026-06-09', end: '2026-06-16' },
      coveringUda: { description: 'GSHC BIMS Eval', date: '2026-06-10' } });
    expect(d.lines).toContain('GSHC BIMS Eval · 6/10');
  });

  it('needed: schedule-by + window + out-of-window note', () => {
    const d = interviewDetail({ type: 'pain', status: 'needed', recommendedScheduleDate: '2026-06-15',
      window: { start: '2026-06-09', end: '2026-06-16' }, outOfWindowUda: { date: '2026-03-12' } });
    expect(d.heading).toBe('Pain · Schedule');
    expect(d.lines[0]).toBe('Schedule by 6/15');
    expect(d.lines.some(l => /3\/12/.test(l) && /outside this window/i.test(l))).toBe(true);
  });
});
