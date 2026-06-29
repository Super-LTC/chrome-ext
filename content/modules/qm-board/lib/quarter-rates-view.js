/**
 * Wire-shape typedefs for the windowed quarter-rates + rolling APIs.
 *
 * The extension consumes the ALREADY-stripped, PHI-light responses the backend
 * routes return (server does the stripping via the web `quarter-rates-view.ts`).
 * There is no runtime logic to port here — this file only documents the shapes
 * so `qm-denominator-view.js` / `qm-quarter-trend-view.js` / the hooks read
 * against a single source of truth. Ported from
 * core/services/qm-planner/quarter-rates-view.ts (types only).
 *
 * @typedef {Object} QuarterRowMeasureView
 * @property {string} measureId
 * @property {boolean} applicable
 * @property {boolean} excluded
 * @property {boolean} skipped  Out of the denominator for a non-exclusion reason
 *   (no qualifying prior, pre-GG-era ARD, no 5-day baseline). The engine
 *   denominator is `applicable && !excluded && !skipped` — honor this or the
 *   roster diverges from the headline rate.
 * @property {boolean} triggers
 * @property {string|null} reason  Short human reason (exclusion or skip), if any.
 *
 * @typedef {Object} QuarterResidentRowView
 * @property {string} patientId
 * @property {string} name
 * @property {'active'|'discharged'} dischargeStatus
 * @property {'short'|'long'|'unknown'} stayType
 * @property {number} cdif  Cumulative days in facility.
 * @property {boolean} targetAccepted  false = counted on a not-yet-CMS-Accepted
 *   MDS (Accepted-first hybrid → we lead iQIES). Drives the "MDS In Progress" tag.
 * @property {string} targetArd  ARD (ISO) of the assessment that counts.
 * @property {QuarterRowMeasureView[]} measures
 *
 * @typedef {Object} QmFacilityRate
 * @property {string} measureId
 * @property {string} [label]
 * @property {number} numerator
 * @property {number} denominator
 * @property {number} rate
 * @property {boolean} [nonCms]
 *
 * @typedef {Object} QuarterWindowView
 * @property {string} label  e.g. "2026Q2"
 * @property {string} start
 * @property {string} end
 *
 * @typedef {Object} QmQuarterRatesView
 * @property {QuarterWindowView} quarter
 * @property {QmFacilityRate[]} rates
 * @property {QuarterResidentRowView[]} rows
 *
 * @typedef {Object} RollingRateView
 * @property {string} measureId
 * @property {number} totalNum
 * @property {number} totalDen
 * @property {number} weightedRate
 * @property {Array<{num:number,den:number}>} quarters
 *
 * @typedef {Object} RollingQuarterView
 * @property {string} label
 * @property {string} start
 * @property {string} end
 * @property {QmFacilityRate[]} rates
 *
 * @typedef {Object} QmRollingView
 * @property {RollingQuarterView[]} quarters  4 trailing quarters, oldest-first.
 * @property {RollingRateView[]} rolling
 * @property {Object} projection
 */

export {}; // types-only module
