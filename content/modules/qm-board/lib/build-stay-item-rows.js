/**
 * Merge a stay's admission + (optional) discharge observed breakdowns into the
 * ordered, labeled per-item rows the explorer modal renders. Pure — the service
 * computes the two DfsObservedScores; this just zips + labels + orders them.
 *
 * Only items present in either breakdown appear, so the resident's locomotion
 * mode is honored implicitly (walk → GG0170I/J present; wheel → GG0170R).
 *
 * Ported verbatim from qm-handoff/build-stay-item-rows.ts (types stripped).
 *
 * @typedef {Object} DfsStayItemRow
 * @property {string} code
 * @property {string} label
 * @property {number|null} admission
 * @property {boolean} admissionImputed
 * @property {number|null} discharge
 * @property {boolean} dischargeImputed
 * @property {number|null} delta  discharge − admission when both present (else null).
 */
import { DFS_GG_ORDER, dfsGgLabel } from './gg-item-labels.js';

/**
 * @param {{ admission: object|null, discharge: object|null }} input
 * @returns {DfsStayItemRow[]}
 */
export function buildDfsStayItemRows(input) {
  const adm = input.admission?.perItem ?? {};
  const dis = input.discharge?.perItem ?? {};

  const rows = [];
  for (const code of DFS_GG_ORDER) {
    const a = adm[code];
    const d = dis[code];
    if (!a && !d) continue; // item not scored for this stay (locomotion slot, etc.)

    const admission = a ? a.value : null;
    const discharge = d ? d.value : null;
    rows.push({
      code,
      label: dfsGgLabel(code),
      admission,
      admissionImputed: a?.source === 'imputed',
      discharge,
      dischargeImputed: d?.source === 'imputed',
      delta: admission !== null && discharge !== null ? discharge - admission : null,
    });
  }
  return rows;
}
