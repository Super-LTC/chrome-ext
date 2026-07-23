/**
 * Care-plan LIBRARY CRAWLER — produces the ingest-ready dump JSON for
 * CarePlanLibraryIngestService (superapp `scripts/careplan-ingest-run.ts`).
 *
 * The V3 rollout needs one library dump per org (per PCC login). The dumps that
 * onboarded Harmony / Four Cooks / Garden Springs / Tanabell were made with
 * ad-hoc console snippets that weren't kept; this module is that tool, kept.
 *
 * Usage (DevTools console, logged into the target org's PCC, on any RESIDENT'S
 * CARE PLAN page — the wizard endpoints are per-facility, so the driving
 * resident pins which facility's assignable libraries you see):
 *
 *   await CarePlanLibraryCrawler.crawl()                    // walk + download JSON
 *   await CarePlanLibraryCrawler.crawl({ facility: 'kingdavid' })  // nicer filename
 *
 * Output shape (exactly what the ingest service parses):
 *   { facility, generatedAt, drivingClientId, drivingCarePlanId,
 *     libraries: [{ id, name, categories: [{ id, name,
 *       focuses: [{ stdNeedId, text, etiologies: [], goals, interventions }] }] }],
 *     notes: [...] }
 *
 * Multi-library orgs: the wizard's library <select> IS PCC's assignable set for
 * the driving resident's facility — recorded in `notes` so the backend can seed
 * `care_plan_library_facilities` without hand-guessing (the Tanabell/Lister
 * wrong-voice lesson). Crawl once per DISTINCT login; for orgs where buildings
 * see different libraries, note the per-building assignable sets by re-running
 * on a resident of each building (fast — the walk dedupes already-crawled libs
 * via the `skipLibraryIds` option).
 *
 * Read-only against PCC (GET/POST of wizard pages PCC itself uses to render
 * the add-focus dialog; nothing is stamped). Throttled to be polite.
 */

const THROTTLE_MS = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function _download(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function _patientIdFromPage() {
  const m = window.location.search.match(/ESOLclientid=(\d+)/) || document.body.innerHTML.match(/ESOLclientid=(\d+)/);
  return m ? m[1] : null;
}

async function crawl({ facility = '', patientId = null, skipLibraryIds = [], throttleMs = THROTTLE_MS, download = true } = {}) {
  const D = window.CarePlanStampDiscover;
  if (!D) throw new Error('[cp-crawl] CarePlanStampDiscover not loaded — are you on PCC with the extension active?');

  const pid = patientId || _patientIdFromPage();
  if (!pid) throw new Error('[cp-crawl] Could not find ESOLclientid — run from a resident care-plan page or pass { patientId }');

  console.log(`[cp-crawl] driving resident ${pid} — discovering care plan…`);
  const full = await D.scrapeFullCarePlan(pid);
  const careplanId = full.careplanId;
  if (!careplanId) throw new Error('[cp-crawl] No ESOLcareplanid on this page — open the resident\'s Clinical > Care Plan tab');
  const miniToken = await D.discoverMiniToken(pid, careplanId);

  const notes = [];
  const skip = new Set((skipLibraryIds || []).map(String));
  const libs = await D.discoverLibraries(pid, careplanId);
  notes.push(`login sees ${libs.length} libraries for this facility: ${libs.map((l) => `${l.id}:${l.label}`).join(' | ')}`);
  console.log(`[cp-crawl] assignable libraries (${libs.length}):`, libs);

  const out = {
    facility: facility || document.title.replace(/\s+/g, ' ').trim().slice(0, 60),
    generatedAt: new Date().toISOString(),
    drivingClientId: pid,
    drivingCarePlanId: careplanId,
    libraries: [],
    notes,
  };

  for (const lib of libs) {
    if (skip.has(String(lib.id))) { notes.push(`library ${lib.id} (${lib.label}): skipped by option`); continue; }
    const libOut = { id: lib.id, name: lib.label, categories: [] };
    out.libraries.push(libOut);
    let cats;
    try {
      cats = await D.discoverCategoriesForLibrary(lib.id, pid, careplanId, miniToken);
    } catch (e) {
      notes.push(`library ${lib.id} (${lib.label}): category discovery FAILED — ${e.message}`);
      console.warn(`[cp-crawl] library ${lib.id} categories failed`, e);
      continue;
    }
    console.log(`[cp-crawl] library ${lib.id} "${lib.label}": ${cats.length} categories`);
    for (const cat of cats) {
      await sleep(throttleMs);
      let focuses;
      try {
        focuses = await D.discoverFocusesForCategory(lib.id, cat.id, pid, careplanId, miniToken);
      } catch (e) {
        notes.push(`category ${cat.id}/${lib.id} (${cat.label}): focus discovery FAILED — ${e.message}`);
        console.warn(`[cp-crawl] category ${cat.id} failed`, e);
        continue;
      }
      const catOut = { id: cat.id, name: cat.label, focuses: [] };
      libOut.categories.push(catOut);
      if (!focuses.length) {
        notes.push(`category ${cat.id}/${lib.id} (${cat.label}): no focuses (genuinely empty)`);
        continue;
      }
      for (const f of focuses) {
        await sleep(throttleMs);
        let contents = { goals: [], interventions: [] };
        try {
          contents = await D.discoverFocusContents(f.stdNeedId, pid, careplanId);
        } catch (e) {
          notes.push(`focus ${f.stdNeedId}: goal/intervention fetch FAILED — ${e.message}`);
        }
        catOut.focuses.push({
          stdNeedId: f.stdNeedId,
          text: f.text,
          // Etiology menus aren't exposed by the wizard pages we walk; the
          // engine derives r/t from the chart, so empty is safe (matches how
          // several prior dumps ingested). See ingest service LibraryDumpFocus.
          etiologies: [],
          goals: (contents.goals || []).map((g) => ({ id: g.stdId, text: g.text })),
          interventions: (contents.interventions || []).map((iv) => ({ id: iv.stdId, text: iv.text })),
        });
      }
      console.log(`[cp-crawl]   ${cat.label}: ${catOut.focuses.length} focuses`);
    }
  }

  const totalFocuses = out.libraries.reduce((n, l) => n + l.categories.reduce((m, c) => m + c.focuses.length, 0), 0);
  console.log(`[cp-crawl] DONE — ${out.libraries.length} libraries, ${totalFocuses} focuses. Notes:`, notes);
  if (download) {
    const slug = (facility || 'org').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    _download(out, `care_plan_library_${slug || 'dump'}.json`);
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.CarePlanLibraryCrawler = { crawl };
}
