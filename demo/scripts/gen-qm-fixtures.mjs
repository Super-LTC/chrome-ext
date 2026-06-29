/**
 * gen-qm-fixtures.mjs — one-shot generator.
 *
 * Reads the captured QM responses from .context/network-log.har, anonymizes
 * resident names + the facility, and emits demo/demo-qm-real-fixtures.js with
 * the 5 QM endpoints the current QM Board hooks call:
 *   /qm-planner/board, /five-star, /dfs, /gg-decline-dashboard, /gg-aide-deviation
 *
 * Run from repo root:  node demo/scripts/gen-qm-fixtures.mjs
 *
 * Re-runnable: overwrites the output. Kept in-repo so the demo data can be
 * regenerated from a fresh HAR capture without redoing the anonymization by hand.
 */
import { readFileSync, writeFileSync } from 'fs';

const HAR = '.context/network-log.har';
const OUT = 'demo/demo-qm-real-fixtures.js';

const REAL_FACILITY = 'Eastbrook Healthcare Center';
const DEMO_FACILITY = 'Sunny Meadows Demo Facility';

// Deterministic fake-name pools. Indexed by first-seen order so the same real
// resident always maps to the same fake one across every endpoint (referential
// integrity for cross-payload patient ids stays intact — we only swap names).
const FAKE_FIRST = [
  'Margaret', 'Harold', 'Dorothy', 'Walter', 'Evelyn', 'Raymond', 'Gloria', 'Stanley',
  'Mildred', 'Eugene', 'Frances', 'Clarence', 'Bernice', 'Leonard', 'Doris', 'Herbert',
  'Lorraine', 'Howard', 'Irene', 'Melvin', 'Vivian', 'Arthur', 'Beatrice', 'Russell',
  'Geraldine', 'Vernon', 'Marjorie', 'Floyd', 'Phyllis', 'Chester', 'Eleanor', 'Roland',
  'Gladys', 'Wallace', 'Audrey', 'Norman', 'Lucille', 'Ralph', 'Estelle', 'Gilbert',
  'Hazel', 'Edmund', 'Pauline', 'Otis', 'Thelma', 'Roscoe', 'Verna', 'Cecil',
];
const FAKE_LAST = [
  'Hartwell', 'Pennington', 'Castellano', 'Whitfield', 'Brennan', 'Lindqvist', 'Okonkwo',
  'Delacroix', 'Vandermeer', 'Castillo', 'Ferraro', 'Goldstein', 'Nakamura', 'Abernathy',
  'Thibodeaux', 'Calloway', 'Mancini', 'Ellsworth', 'Rosenthal', 'Petrov', 'Sandoval',
  'Buchholz', 'Larkin', 'Yamamoto', 'Fitzgerald', 'Marchetti', 'Holloway', 'Esposito',
  'Winterbourne', 'Castellanos', 'Rourke', 'Lindgren', 'Achebe', 'Dubois', 'Steinberg',
  'Kowalczyk', 'Bellweather', 'Montoya', 'Hargrove', 'Nilsson', 'Cassidy', 'Ravenscroft',
  'Solberg', 'Underwood', 'Maddox', 'Quintero', 'Vasquez', 'Birkeland',
];

const firstMap = new Map();
const lastMap = new Map();
let fi = 0;
let li = 0;
function mapFirst(real) {
  if (!real) return real;
  const key = real.toLowerCase();
  if (!firstMap.has(key)) firstMap.set(key, FAKE_FIRST[fi++ % FAKE_FIRST.length]);
  return firstMap.get(key);
}
function mapLast(real) {
  if (!real) return real;
  const key = real.toLowerCase();
  if (!lastMap.has(key)) lastMap.set(key, FAKE_LAST[li++ % FAKE_LAST.length]);
  return lastMap.get(key);
}

const har = JSON.parse(readFileSync(HAR, 'utf8'));
const entries = har.log.entries.filter((e) => e.request.url.includes('/api/extension/qm-planner/'));

// PASS 1 — discover every (first,last) pair so single-token replacement is
// consistent and complete. We look at explicit firstName/lastName fields and at
// "Last, First" patterns embedded in name-ish string fields.
const NAME_FIELD = /name$/i;
function walkDiscover(node) {
  if (Array.isArray(node)) return node.forEach(walkDiscover);
  if (node && typeof node === 'object') {
    if (typeof node.firstName === 'string' && typeof node.lastName === 'string') {
      mapFirst(node.firstName);
      mapLast(node.lastName);
    }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && NAME_FIELD.test(k)) {
        const m = v.match(/^\s*([A-Z][a-zA-Z'-]+),\s*([A-Z][a-zA-Z'-]+)/);
        if (m) { mapLast(m[1]); mapFirst(m[2]); }
      } else {
        walkDiscover(v);
      }
    }
  }
}

const datas = entries.map((e) => {
  const body = JSON.parse(e.response.content.text);
  return { url: e.request.url, data: body.data ?? body };
});
datas.forEach((d) => walkDiscover(d.data));

// Build single-token regexes (longest-first to avoid partial overlaps).
const firstTokens = [...firstMap.entries()].sort((a, b) => b[0].length - a[0].length);
const lastTokens = [...lastMap.entries()].sort((a, b) => b[0].length - a[0].length);

function anonymizeString(s) {
  let out = s;
  // Facility + org first.
  out = out.split(REAL_FACILITY).join(DEMO_FACILITY);
  out = out.replace(/\beac\b/g, 'demo-org');
  // Names: word-boundary, case-insensitive, whole token. Real LTC names are
  // distinctive enough that collateral hits are negligible for a demo.
  for (const [real, fake] of lastTokens) {
    out = out.replace(new RegExp(`\\b${escapeRe(real)}\\b`, 'gi'), fake);
  }
  for (const [real, fake] of firstTokens) {
    out = out.replace(new RegExp(`\\b${escapeRe(real)}\\b`, 'gi'), fake);
  }
  return out;
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// PASS 2 — deep-clone with anonymization applied. Explicit firstName/lastName
// fields are mapped directly (preserves capitalization); all other strings go
// through token replacement.
function anonymize(node) {
  if (Array.isArray(node)) return node.map(anonymize);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'firstName' && typeof v === 'string') out[k] = mapFirst(v);
      else if (k === 'lastName' && typeof v === 'string') out[k] = mapLast(v);
      else if (typeof v === 'string') out[k] = anonymizeString(v);
      else out[k] = anonymize(v);
    }
    return out;
  }
  return node;
}

const result = {};
for (const { url, data } of datas) {
  const clean = anonymize(data);
  if (url.includes('/board')) result.board = clean;
  else if (url.includes('/five-star')) result.fiveStar = clean;
  else if (url.includes('/dfs')) result.dfs = clean;
  else if (url.includes('/gg-decline-dashboard')) result.ggDashboard = clean;
  else if (url.includes('/gg-aide-deviation')) {
    if (/[?&]aideId=/.test(url)) {
      const aideId = new URL(url).searchParams.get('aideId');
      result.ggAideDetail = result.ggAideDetail || {};
      result.ggAideDetail[aideId] = clean;
    } else {
      result.ggAideList = clean;
    }
  }
}

const banner = `/**
 * demo-qm-real-fixtures.js — GENERATED by demo/scripts/gen-qm-fixtures.mjs
 * from a real captured QM payload (.context/network-log.har), with resident
 * names + facility anonymized. Clinical numbers/shapes are real. DO NOT hand-edit;
 * re-run the generator instead.
 *
 * Facility: ${DEMO_FACILITY}  ·  orgSlug: demo-org
 * Endpoints mirrored: /qm-planner/{board,five-star,dfs,gg-decline-dashboard,gg-aide-deviation}
 */
`;

const body =
  `export const DEMO_QM_BOARD = ${JSON.stringify(result.board ?? null)};\n\n` +
  `export const DEMO_QM_FIVE_STAR = ${JSON.stringify(result.fiveStar ?? null)};\n\n` +
  `export const DEMO_QM_DFS = ${JSON.stringify(result.dfs ?? null)};\n\n` +
  `export const DEMO_QM_GG_DASHBOARD = ${JSON.stringify(result.ggDashboard ?? null)};\n\n` +
  `export const DEMO_QM_GG_AIDE_LIST = ${JSON.stringify(result.ggAideList ?? null)};\n\n` +
  `export const DEMO_QM_GG_AIDE_DETAIL = ${JSON.stringify(result.ggAideDetail ?? {})};\n`;

writeFileSync(OUT, banner + '\n' + body);

console.log(`Wrote ${OUT}`);
console.log('Endpoints:', Object.keys(result).join(', '));
console.log('Aide detail keys:', Object.keys(result.ggAideDetail || {}).join(', ') || '(none)');
console.log(`Mapped ${firstMap.size} first names, ${lastMap.size} last names.`);
