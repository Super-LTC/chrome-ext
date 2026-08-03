#!/usr/bin/env node
/**
 * Live shape probe for the Five-Star extension routes.
 *
 * Answers the one question fixtures cannot: does the REAL HTTP response match
 * the envelope and field shape the extension hooks read? Everything up to here
 * has been exercised through fixtures and by reading the route source.
 *
 * ── IT PRINTS NO VALUES ─────────────────────────────────────────────────────
 * The facility payload carries PHI: `crossers` and `clearables` hold resident
 * names and patient ids, and the region payload carries building names. This
 * script reports FIELD NAMES and TYPES only — never a value, never a name, never
 * a count of residents. That is deliberate: the point is to check a contract,
 * and a contract check that pastes PHI into a terminal (and from there into a
 * scrollback, a screenshot, or a bug report) is a worse trade than not running it.
 *
 * Usage:
 *   SUPER_TOKEN=<extension bearer token> \
 *   SUPER_ORG=<orgSlug> \
 *   SUPER_FACILITY="<pccFacilityName>" \
 *   node scripts/probe-five-star.mjs [--base http://localhost:3000]
 *
 * Getting a token: it is the `authToken` the extension stores after login —
 * chrome://extensions → Super LTC → service worker → Console →
 *   await chrome.storage.local.get('authToken')
 *
 * Exit code is 0 only if every checked field is present with the expected type.
 */

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'http://localhost:3000';
})();

const TOKEN = process.env.SUPER_TOKEN;
const ORG = process.env.SUPER_ORG;
const FACILITY = process.env.SUPER_FACILITY;

if (!TOKEN || !ORG) {
  console.error('Need SUPER_TOKEN and SUPER_ORG. See the header of this file.');
  process.exit(2);
}

let failures = 0;

const typeOf = (v) =>
  (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Report presence + type of a field. Never its value. */
function check(label, obj, field, expected) {
  const present = obj != null && Object.prototype.hasOwnProperty.call(obj, field);
  const actual = present ? typeOf(obj[field]) : 'MISSING';
  // `expected` may list several acceptable types — nullable columns are real.
  const ok = present && expected.split('|').includes(actual);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}.${field}  expected ${expected}, got ${actual}`);
}

async function call(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

/** Mirrors content/modules/qm-board/utils/api.js. */
const unwrap = (p) =>
  (p && typeof p === 'object' && 'success' in p && 'data' in p ? p.data : p);

async function probeRegion() {
  console.log('\n/api/extension/five-star/region');
  const { status, body } = await call(`/api/extension/five-star/region?orgSlug=${encodeURIComponent(ORG)}`);
  console.log(`  HTTP ${status}`);
  if (status !== 200) {
    failures += 1;
    console.log(`  FAIL non-200 — error: ${body?.error ?? '(no error field)'}`);
    return;
  }

  check('route', body, 'success', 'boolean');
  check('route', body, 'data', 'object');

  const read = unwrap(body);
  check('cacheRead', read, 'status', 'string');
  check('cacheRead', read, 'payload', 'object|null');

  if (read?.status === 'not_yet_computed') {
    console.log('  note: cache not built for this org yet — payload checks skipped.');
    check('cacheRead', read, 'reason', 'string');
    return;
  }

  const p = read?.payload;
  for (const f of [['organizationId', 'string'], ['generatedAt', 'string'],
    ['cmsAsOf', 'string|null'], ['facilities', 'array'], ['groups', 'array'],
    ['region', 'object'], ['needsALook', 'array']]) check('payload', p, f[0], f[1]);

  const f0 = p?.facilities?.[0];
  if (!f0) { console.log('  note: no facilities in payload — row checks skipped.'); return; }
  console.log(`  facility rows: ${p.facilities.length}`);
  for (const f of [['locationId', 'string'], ['name', 'string'],
    ['pccFacilityName', 'string|null'], ['state', 'string|null'], ['ccn', 'string|null'],
    ['dataStatus', 'string'], ['qm', 'object'], ['attention', 'array']]) check('facility[0]', f0, f[0], f[1]);

  // THE field the whole grid drill-in depends on. Report coverage as a count of
  // rows, which is not PHI — a name would be.
  const withAddr = p.facilities.filter((x) => x.pccFacilityName).length;
  const ok = withAddr === p.facilities.length;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'WARN'} pccFacilityName populated on ${withAddr}/${p.facilities.length} rows`);
  if (!ok) console.log('       → rows without it fall back to `name`; correct only where the two agree.');

  for (const f of [['ladders', 'object'], ['liveStars', 'object'],
    ['projectedStars', 'object'], ['livePoints', 'object']]) check('facility[0].qm', f0.qm, f[0], f[1]);
  console.log(`  note: qm.liveLadders ${f0.qm.liveLadders ? 'present' : 'ABSENT (falls back to ladders — expected on pre-bump cache rows)'}`);
}

async function probeFacility() {
  console.log('\n/api/extension/five-star/facility');
  if (!FACILITY) { console.log('  skipped — set SUPER_FACILITY to a pccFacilityName.'); return; }

  const qs = new URLSearchParams({ facilityName: FACILITY, orgSlug: ORG });
  const { status, body } = await call(`/api/extension/five-star/facility?${qs}`);
  console.log(`  HTTP ${status}`);
  if (status !== 200) {
    failures += 1;
    console.log(`  FAIL non-200 — error: ${body?.error ?? '(no error field)'}`);
    if (status === 404) console.log('       → 404 here usually means the name is the DISPLAY name, not pccFacilityName.');
    return;
  }

  check('route', body, 'success', 'boolean');
  // locationId sits on the ROUTE envelope, a layer shallower than the payload.
  check('route', body, 'locationId', 'string');

  const read = unwrap(body);
  check('cacheRead', read, 'status', 'string');
  if (read?.status === 'not_yet_computed') {
    console.log('  note: not computed for this building yet — payload checks skipped.');
    return;
  }

  const p = read?.payload;
  for (const f of [['locationId', 'string'], ['name', 'string'], ['dataStatus', 'string'],
    ['generatedAt', 'string'], ['cmsAsOf', 'string|null'], ['census', 'object'],
    ['published', 'object'], ['overall', 'object'], ['domains', 'object'],
    ['quarters', 'array'], ['measures', 'array'], ['totals', 'array'],
    ['action', 'object'], ['attention', 'array'], ['notes', 'array']]) check('payload', p, f[0], f[1]);

  for (const f of [['healthInspection', 'object'], ['staffing', 'object']]) check('payload.domains', p?.domains, f[0], f[1]);

  const q0 = p?.quarters?.[0];
  if (q0) for (const f of [['label', 'string'], ['displayLabel', 'string'], ['state', 'string'],
    ['stateLabel', 'string'], ['open', 'boolean'], ['computedPoints', 'number|null'],
    ['notes', 'array']]) check('quarters[0]', q0, f[0], f[1]);

  const m0 = p?.measures?.[0];
  if (m0) for (const f of [['key', 'string'], ['measureId', 'string|null'], ['label', 'string'],
    ['stay', 'string'], ['maxPoints', 'number'], ['computation', 'string'],
    ['brackets', 'array'], ['published', 'object|null'], ['live', 'object|null'],
    ['projected', 'object|null']]) check('measures[0]', m0, f[0], f[1]);

  const t0 = p?.totals?.[0];
  if (t0) for (const f of [['axis', 'string'], ['label', 'string'], ['maxPoints', 'number'],
    ['live', 'object'], ['projected', 'object']]) check('totals[0]', t0, f[0], f[1]);

  console.log(`  counts — quarters:${p?.quarters?.length ?? 0} measures:${p?.measures?.length ?? 0} totals:${p?.totals?.length ?? 0}`);
}

await probeRegion();
await probeFacility();

console.log(`\n${failures === 0 ? 'PASS — every checked field present with the expected type.' : `FAIL — ${failures} mismatch(es) above.`}`);
process.exit(failures === 0 ? 0 : 1);
