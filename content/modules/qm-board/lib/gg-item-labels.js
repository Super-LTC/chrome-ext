/**
 * Human labels + display order for the DFS GG items, for the per-resident
 * drill-in. These are the 10 scored items (self-care + mobility); GG0170I/J are
 * the walk slots and GG0170R is the wheel slot (shown only in the resident's
 * resolved locomotion mode).
 *
 * Ported verbatim from qm-handoff/gg-item-labels.ts (types stripped).
 */

export const DFS_GG_LABELS = {
  GG0130A: 'Eating',
  GG0130B: 'Oral hygiene',
  GG0130C: 'Toileting hygiene',
  GG0170A: 'Roll left and right',
  GG0170C: 'Lying to sitting on side of bed',
  GG0170D: 'Sit to stand',
  GG0170E: 'Chair/bed-to-chair transfer',
  GG0170F: 'Toilet transfer',
  GG0170I: 'Walk 10 feet',
  GG0170J: 'Walk 50 feet with two turns',
  GG0170R: 'Wheel 50 feet with two turns',
};

/** Canonical display order (self-care first, then mobility). */
export const DFS_GG_ORDER = [
  'GG0130A',
  'GG0130B',
  'GG0130C',
  'GG0170A',
  'GG0170C',
  'GG0170D',
  'GG0170E',
  'GG0170F',
  'GG0170I',
  'GG0170J',
  'GG0170R',
];

export function dfsGgLabel(code) {
  return DFS_GG_LABELS[code] ?? code;
}
