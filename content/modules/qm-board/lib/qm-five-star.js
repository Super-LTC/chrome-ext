/**
 * CMS Five-Star QM scoring — re-export shim.
 *
 * The scoring tables moved into `five-star-scoring.js` (mirrors the web move into
 * core/ so the five-star predictor can import them). This thin re-export keeps
 * existing importers (MeasureDetail, the what-if card) working unchanged. New
 * code should import from './five-star-scoring.js'.
 */
export * from './five-star-scoring.js';
