/**
 * QM denominator view-model — pure presentation logic for the windowed
 * (discharged-inclusive) measure rate + its resident roster.
 *
 * The CMS facility-level observed score uses the WINDOWED denominator (latest
 * episode per resident in the quarter, discharged/deceased included) — NOT the
 * point-in-time active-only count the measure tiles historically showed. The
 * windowed engine (`/qm-planner/quarter-rates`) already did all the counting;
 * this module reshapes its response into per-measure `{ headline num/den/rate,
 * roster }` for the tile + the denominator drill-in.
 *
 * Ported verbatim from core/services/qm-planner/qm-denominator-view.ts; TS types
 * stripped for the JS bundle. PURE — no Preact, no fetch, no Date.
 *
 * Denominator = `applicable && !excluded && !skipped`. The `skipped` flag (no
 * qualifying prior / pre-GG-era ARD / no 5-day baseline) takes a resident OUT of
 * the population entirely — ignoring it inflates the denominator vs the engine.
 * Headline num/den/rate come verbatim from `qr.rates` (NOT recomputed).
 *
 * @typedef {import('./quarter-rates-view.js').QmQuarterRatesView} QmQuarterRatesView
 *
 * @typedef {Object} RosterResident
 * @property {string} patientId
 * @property {string} name
 * @property {'short'|'long'|'unknown'} stayType
 * @property {number} cdif
 * @property {boolean} discharged
 * @property {boolean} [isNumerator]  In-denominator residents: trips the measure.
 * @property {string|null} [reason]   Excluded residents: the short exclusion reason.
 *
 * @typedef {Object} MeasureDenominator
 * @property {string} measureId
 * @property {number} numerator
 * @property {number} denominator
 * @property {number} rate
 * @property {{inDenominator: RosterResident[], excluded: RosterResident[]}} roster
 *
 * @typedef {Object} DenominatorView
 * @property {Map<string, MeasureDenominator>} byMeasure
 */

/**
 * Build the per-measure denominator view from a windowed quarter-rates response.
 *
 *   - applicable && !excluded && !skipped → inDenominator (isNumerator = triggers)
 *   - applicable &&  excluded && !skipped → excluded (carries the reason)
 *   - !applicable OR skipped              → omitted (not in the denominator)
 *
 * @param {QmQuarterRatesView} qr
 * @returns {DenominatorView}
 */
export function buildDenominatorView(qr) {
  const byMeasure = new Map();

  for (const rate of qr.rates) {
    const inDenominator = [];
    const excluded = [];

    for (const row of qr.rows) {
      const cell = row.measures.find((m) => m.measureId === rate.measureId);
      // Out of the denominator → omit. `skipped` matches the engine's exclusion;
      // without it the roster would over-count vs the headline rate.
      if (!cell || !cell.applicable || cell.skipped) continue;
      const discharged = row.dischargeStatus === 'discharged';
      if (cell.excluded) {
        excluded.push({
          patientId: row.patientId,
          name: row.name,
          stayType: row.stayType,
          cdif: row.cdif,
          discharged,
          reason: cell.reason,
        });
      } else {
        inDenominator.push({
          patientId: row.patientId,
          name: row.name,
          stayType: row.stayType,
          cdif: row.cdif,
          discharged,
          isNumerator: cell.triggers,
        });
      }
    }

    byMeasure.set(rate.measureId, {
      measureId: rate.measureId,
      numerator: rate.numerator,
      denominator: rate.denominator,
      rate: rate.rate,
      roster: { inDenominator, excluded },
    });
  }

  return { byMeasure };
}

/**
 * Windowed rate accessor for one measure — the authoritative `{ num, den, rate }`
 * the tile shows instead of the active-only `measureRate(counts)`. Returns null
 * when the measure isn't in the windowed response (tile falls back to active).
 *
 * @param {DenominatorView} view
 * @param {string} measureId
 * @returns {{num:number, den:number, rate:number}|null}
 */
export function windowedRate(view, measureId) {
  const m = view.byMeasure.get(measureId);
  if (!m) return null;
  return { num: m.numerator, den: m.denominator, rate: m.rate };
}
