import { useState, useEffect, useCallback } from 'preact/hooks';
import {
  scrapeAssessmentAnswers,
  EmptyScrapeError,
  SessionExpiredError,
} from '../lib/mds-scraper.js';
import { parseSectionListing } from '../lib/mds-section-parser.js';
import { postVerify, BadScrapeError, PatientNotSyncedError } from '../lib/verify-api.js';
import { categorizeDetections, partitionMeasures } from '../lib/verify-derive.js';
import { track } from '../../../utils/analytics.js';

// Typed errors → user-facing copy + a stable `kind` for analytics.
function mapError(err) {
  if (err instanceof SessionExpiredError) {
    return {
      kind: 'session_expired',
      message: 'Your PointClickCare session expired — refresh the page and log in, then try again.',
      canRetry: false,
    };
  }
  if (err instanceof EmptyScrapeError || err instanceof BadScrapeError) {
    return {
      kind: 'bad_scrape',
      message: "Couldn't read the MDS answers on this page. Refresh the page and try again.",
      canRetry: true,
    };
  }
  if (err instanceof PatientNotSyncedError) {
    return {
      kind: 'patient_not_synced',
      message: "This resident hasn't synced to Super yet. Open their chart once, then retry.",
      canRetry: true,
    };
  }
  return {
    kind: 'generic',
    message: err?.message || 'Something went wrong. Please try again.',
    status: err?.status,
    canRetry: true,
  };
}

/**
 * Drives the Super Verify flow: scrape every section off the live page, POST to
 * the verify endpoint, expose progress + results.
 *
 * @returns {{
 *   phase: 'scraping'|'verifying'|'done'|'error',
 *   sections: Array<{code,name,status}>,   // enabled sections, for the checklist
 *   progress: {done:number,total:number,section:?string},
 *   completed: string[],                   // section codes already scraped
 *   data: object|null,                     // verify response (PDPM fields + qm)
 *   error: {kind,message,canRetry,status?}|null,
 *   retry: () => void,
 * }}
 */
export function useSuperVerify({ assessId, patientId }) {
  const [phase, setPhase] = useState('scraping');
  const [sections, setSections] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, section: null });
  const [completed, setCompleted] = useState([]);
  const [data, setData] = useState(null);
  const [nAnswers, setNAnswers] = useState(0);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(null);
      setData(null);
      setCompleted([]);
      setPhase('scraping');

      let stage = 'scraping';
      const startedAt = Date.now();

      try {
        // Discover sections up front so the checklist can render every row
        // before the fetches land. (Scraper re-parses internally; cheap.)
        const list = parseSectionListing(document).filter((s) => !s.disabled);
        if (cancelled) return;
        setSections(list);
        setProgress({ done: 0, total: list.length, section: null });

        const blob = await scrapeAssessmentAnswers({
          assessId,
          doc: document,
          onProgress: (e) => {
            if (cancelled) return;
            setProgress(e);
            setCompleted((prev) => (prev.includes(e.section) ? prev : [...prev, e.section]));
          },
        });
        if (cancelled) return;
        const nAns = Object.keys(blob.answers || {}).length;
        setNAnswers(nAns);
        track('super_verify_scrape_completed', {
          n_sections: list.length,
          n_answers: nAns,
          duration_ms: Date.now() - startedAt,
        });

        stage = 'verifying';
        setPhase('verifying');
        const result = await postVerify({ assessId, patientId, answersBlob: blob });
        if (cancelled) return;

        setData(result);
        setPhase('done');
        track('super_verify_results_viewed', {
          n_detections: categorizeDetections(result).items.length,
          n_qm_triggers: partitionMeasures(result.qm).firingCount,
          qm_available: !!result.qm,
        });
      } catch (err) {
        if (cancelled) return;
        const mapped = mapError(err);
        setError(mapped);
        setPhase('error');
        if (stage === 'scraping') {
          track('super_verify_scrape_failed', { error_kind: mapped.kind });
        } else {
          track('super_verify_failed', { status: err?.status || 0, error_kind: mapped.kind });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [assessId, patientId, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { phase, sections, progress, completed, data, nAnswers, error, retry };
}
