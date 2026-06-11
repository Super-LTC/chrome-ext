// content/modules/managed-care/lib/recert-utils.js
// Pure helpers — no DOM, no chrome.*, so they stay unit-testable.

export const IN_PROGRESS_STATUSES = [
  'pending', 'fetching_documents', 'extracting', 'all_documents_extracted', 'generating_defense',
];

export const STATUS_LABELS = {
  pending: 'Queued',
  fetching_documents: 'Fetching documents',
  extracting: 'Extracting',
  all_documents_extracted: 'Documents ready',
  generating_defense: 'Writing clinical update',
  completed: 'Done',
  failed: 'Failed',
};

const STUCK_AFTER_MS = 30 * 60 * 1000;

export function isInProgress(status) {
  return IN_PROGRESS_STATUSES.includes(status);
}

// "No server stall-sweep exists" — a crashed pipeline Lambda leaves the run
// in-progress forever, so staleness off updatedAt is the only signal we get.
export function isStuck(run, now = new Date()) {
  if (!isInProgress(run.status)) return false;
  const updated = new Date(run.updatedAt).getTime();
  return Number.isFinite(updated) && now.getTime() - updated > STUCK_AFTER_MS;
}

// Preset relativeDateWindow tokens: '-Nd', 'today', or an absolute YYYY-MM-DD.
export function resolveRelativeDate(token, now = new Date()) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  let days = null;
  if (token === 'today') days = 0;
  else {
    const m = /^-(\d+)d$/.exec(token);
    if (m) days = Number(m[1]);
  }
  if (days === null) return null;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function groupByDay(runs, now = new Date()) {
  const today = localDayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = localDayKey(y);

  const buckets = { Today: [], Yesterday: [], Earlier: [] };
  for (const run of runs) {
    const key = localDayKey(new Date(run.createdAt));
    if (key === today) buckets.Today.push(run);
    else if (key === yesterday) buckets.Yesterday.push(run);
    else buckets.Earlier.push(run);
  }
  return ['Today', 'Yesterday', 'Earlier']
    .filter((label) => buckets[label].length)
    .map((label) => ({ label, runs: buckets[label] }));
}

export function runBadgeCounts(runs, unseenIds) {
  let inFlight = 0, unseenDone = 0;
  for (const run of runs) {
    if (isInProgress(run.status)) inFlight += 1;
    // Failed runs count too — the tracker marks failures unseen so the badge
    // pulls the nurse back to retry, not just to view successes.
    else if ((run.status === 'completed' || run.status === 'failed') && unseenIds.has(run.id)) unseenDone += 1;
  }
  return { inFlight, unseenDone };
}
