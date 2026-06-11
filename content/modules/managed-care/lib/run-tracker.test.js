// content/modules/managed-care/lib/run-tracker.test.js
import { describe, it, expect } from 'vitest';
import { diffTransitions } from './run-tracker.js';

describe('diffTransitions', () => {
  it('reports runs that newly reached a terminal status', () => {
    const prev = { a: 'extracting', b: 'generating_defense', c: 'completed' };
    const next = [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'failed' },
      { id: 'c', status: 'completed' },   // already terminal — not a transition
      { id: 'd', status: 'extracting' },  // still running
    ];
    expect(diffTransitions(prev, next)).toEqual([
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'failed' },
    ]);
  });
  it('first sighting already-terminal is not a transition (page reload case)', () => {
    expect(diffTransitions({}, [{ id: 'x', status: 'completed' }])).toEqual([]);
  });
});
