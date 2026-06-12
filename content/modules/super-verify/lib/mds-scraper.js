/**
 * Orchestrates a full live MDS scrape from the section-listing page:
 * discover sections → fetch each section.xhtml (parallel, cap 5) → parse +
 * merge into the flat `{ sectionStatuses, answers }` blob the verify endpoint
 * wants.
 *
 * Concurrency cap mirrors super-scraper's Go implementation (weighted
 * semaphore of 5). All fetches are same-origin; no CSRF token needed.
 */

import { parseSectionHtml, parseSectionListing } from './mds-section-parser.js';

/** Merged answers map came back empty — refuse to POST (would wipe stored answers). */
export class EmptyScrapeError extends Error {
  constructor(message = 'No MDS answers could be read from this page.') {
    super(message);
    this.name = 'EmptyScrapeError';
  }
}

/** A section fetch landed on the PCC login page — the session has expired. */
export class SessionExpiredError extends Error {
  constructor(message = 'PointClickCare session expired.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

const SECTION_URL = (assessId, code) =>
  `/clinical/mds3/section.xhtml?ESOLassessid=${encodeURIComponent(assessId)}&sectioncode=${encodeURIComponent(code)}`;

function defaultFetch(url) {
  return fetch(url, { credentials: 'same-origin' }).then((r) => r.text());
}

// A redirect to the PCC sign-in page comes back as a login document.
function looksLikeLogin(html) {
  return (
    /<title[^>]*>\s*(login|sign[\s-]*in)/i.test(html) ||
    /accounts\.pointclickcare\.com/i.test(html)
  );
}

// Fixed-size promise pool — runs `worker` over `items`, at most `limit` at once.
async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(lanes);
  return results;
}

/**
 * @param {object}   opts
 * @param {string}   opts.assessId    PCC assessment id (ESOLassessid)
 * @param {Document} [opts.doc]       the live section-listing document (defaults to `document`)
 * @param {Function} [opts.fetchImpl] (url) => Promise<string html>  (injectable for tests)
 * @param {Function} [opts.onProgress] ({ done, total, section }) => void, called per completed section
 * @returns {Promise<{ sectionStatuses: Record<string,string>, answers: Record<string,{value:string,isLocked:boolean}> }>}
 */
export async function scrapeAssessmentAnswers({ assessId, doc, fetchImpl, onProgress } = {}) {
  const document_ = doc || (typeof document !== 'undefined' ? document : null);
  const fetchText = fetchImpl || defaultFetch;

  const sections = parseSectionListing(document_).filter((s) => !s.disabled);
  const total = sections.length;

  const sectionStatuses = {};
  const merged = {};
  let done = 0;

  await pool(sections, 5, async (section) => {
    const html = await fetchText(SECTION_URL(assessId, section.code));
    if (looksLikeLogin(html)) throw new SessionExpiredError();

    const { answers } = parseSectionHtml(html);
    Object.assign(merged, answers);
    sectionStatuses[section.code] = section.status;

    done += 1;
    if (onProgress) onProgress({ done, total, section: section.code });
  });

  if (Object.keys(merged).length === 0) throw new EmptyScrapeError();

  return { sectionStatuses, answers: merged };
}
