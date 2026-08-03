import { describe, it, expect } from 'vitest';
import { standing, standingText, orderFacilities } from '../qip-rollup-view.js';

const FLOOR = 16.5;

const fac = (over = {}) => ({
  locationId: 'a',
  name: 'A Building',
  floor: FLOOR,
  projected: { points: 20 },
  official: { points: 18 },
  ceiling: 20,
  missingPoints: 0,
  missingInputs: [],
  insufficientData: false,
  error: null,
  gaps: [],
  ...over,
});

describe('standing', () => {
  it('reads a comfortable building as safe', () => {
    expect(standing(fac({ projected: { points: 25 } }), FLOOR)).toEqual({ kind: 'safe', gap: 8.5 });
  });

  it('calls anything within 2 pts of the floor the bubble', () => {
    expect(standing(fac({ projected: { points: 18.5 } }), FLOOR).kind).toBe('bubble');
    // Ties go to at-risk, matching the Five-Star board.
    expect(standing(fac({ projected: { points: 18.5 } }), FLOOR).gap).toBeCloseTo(2);
    expect(standing(fac({ projected: { points: 18.6 } }), FLOOR).kind).toBe('safe');
  });

  it('exactly on the floor is not below it', () => {
    expect(standing(fac({ projected: { points: FLOOR } }), FLOOR).kind).toBe('bubble');
  });

  // The split that stops a data-entry gap being read as a care gap.
  it('separates "short on data entry" from "short on care"', () => {
    const pending = fac({ projected: { points: 14 }, ceiling: 18, missingPoints: 4 });
    expect(standing(pending, FLOOR).kind).toBe('pending');

    const short = fac({ projected: { points: 14 }, ceiling: 15 });
    expect(standing(short, FLOOR).kind).toBe('short');
  });

  it('treats a ceiling exactly at the floor as could-clear', () => {
    expect(standing(fac({ projected: { points: 14 }, ceiling: FLOOR }), FLOOR).kind).toBe('pending');
  });

  // The single most important rule on this board.
  it('refuses to rank a building with no MDS, however many points it computed', () => {
    // An empty denominator makes every adverse measure a flawless 0%, so a
    // building with no assessments posts ~24 points and would top the board.
    const ghost = fac({ projected: { points: 24 }, insufficientData: true });
    expect(standing(ghost, FLOOR)).toEqual({ kind: 'unscored', gap: 0 });
  });

  it('puts an errored build ahead of every distance reading too', () => {
    expect(standing(fac({ error: 'boom', projected: { points: 30 } }), FLOOR))
      .toEqual({ kind: 'error', gap: 0 });
  });

  it('lets an error outrank insufficient data', () => {
    const both = fac({ error: 'boom', insufficientData: true });
    expect(standing(both, FLOOR).kind).toBe('error');
  });
});

describe('standingText', () => {
  it('says "could clear", never "clears", for a pending building', () => {
    // The ceiling credits every un-entered input at the BEST tier — an upper
    // bound, not a forecast. Promising the clear is the optimism the split
    // exists to remove.
    const text = standingText('pending', -2.5, FLOOR);
    expect(text).toContain('could clear');
    expect(text).not.toMatch(/\bclears\b/);
  });

  it('names the floor when a building is genuinely short', () => {
    expect(standingText('short', -3, FLOOR)).toBe('3.0 pts below the 16.5 floor');
  });

  it('explains an unscored building rather than showing a distance', () => {
    expect(standingText('unscored', 0, FLOOR)).toContain('no MDS');
    expect(standingText('unscored', 0, FLOOR)).not.toContain('0.0 pts');
  });

  it('flags the bubble explicitly', () => {
    expect(standingText('bubble', 1.2, FLOOR)).toContain('on the bubble');
  });
});

describe('orderFacilities', () => {
  it('opens on the worst standing', () => {
    const out = orderFacilities([
      fac({ locationId: 'safe', name: 'Safe', projected: { points: 30 } }),
      fac({ locationId: 'short', name: 'Short', projected: { points: 10 }, ceiling: 11 }),
      fac({ locationId: 'bubble', name: 'Bubble', projected: { points: 17 } }),
    ]);
    expect(out.map((f) => f.locationId)).toEqual(['short', 'bubble', 'safe']);
  });

  it('sinks unscored and failed buildings below every scored one', () => {
    // Even though the ghost "scored" 24 — sorting it by its phantom points is
    // the same bug as ranking it.
    const out = orderFacilities([
      fac({ locationId: 'ghost', name: 'Ghost', projected: { points: 24 }, insufficientData: true }),
      fac({ locationId: 'broken', name: 'Broken', error: 'boom' }),
      fac({ locationId: 'real', name: 'Real', projected: { points: 30 } }),
    ]);
    expect(out.map((f) => f.locationId)).toEqual(['real', 'ghost', 'broken']);
  });

  it('orders the unrankable ones by name so the list is stable', () => {
    const out = orderFacilities([
      fac({ locationId: 'z', name: 'Zulu', insufficientData: true }),
      fac({ locationId: 'a', name: 'Alpha', insufficientData: true }),
    ]);
    expect(out.map((f) => f.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('does not mutate the input array', () => {
    const input = [fac({ locationId: 'b', projected: { points: 10 } }), fac({ locationId: 'a', projected: { points: 30 } })];
    orderFacilities(input);
    expect(input.map((f) => f.locationId)).toEqual(['b', 'a']);
  });
});
