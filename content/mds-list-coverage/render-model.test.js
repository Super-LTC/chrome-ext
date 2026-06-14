import { describe, it, expect } from 'vitest';
import { toChips, INTERVIEW_LABELS } from './render-model.js';

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

  it('needed with outOfWindowUda adds the out-of-window tooltip', () => {
    const chips = toChips({ key: 'a', status: 'ok', coverage: { interviews: [
      { type: 'pain', status: 'needed', recommendedScheduleDate: '2026-06-15',
        outOfWindowUda: { date: '2026-03-12' } },
    ] } });
    expect(chips[0].title).toMatch(/2026-03-12|3\/12/);
    expect(chips[0].title).toMatch(/out of range/i);
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
