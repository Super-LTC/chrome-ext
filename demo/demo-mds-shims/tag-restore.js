/**
 * Demo stand-in for content/modules/mds-comments/tag-restore.js
 * (aliased in vite.demo.config.js).
 *
 * Same sessionStorage contract as the real module — the inbox writes a payload,
 * the destination page reads it, scrolls to the item and opens its thread. The
 * only real difference: `sectionUrlFor` points at the captured demo Section I
 * page instead of PCC's section.xhtml, and the multi-stage PCC state machine
 * (hydrateTagRestore) is not needed because the demo "arrives" in one hop —
 * PCCDemoApp consumes the payload directly on mount.
 */

const KEY = 'super:mds-tag:restore';
const VERSION = 1;
const TTL_MS = 10 * 60 * 1000;

export function writeRestore(payload) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ version: VERSION, expiresAt: Date.now() + TTL_MS, ...payload })
    );
    return true;
  } catch {
    return false;
  }
}

export function readRestore() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || payload.version !== VERSION) return null;
    if (!Number.isFinite(payload.expiresAt) || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export function clearRestore() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/** `I0200` → `I`, `GG0130B1` → `GG`. */
export function sectionCodeForItem(mdsItem) {
  const m = String(mdsItem || '')
    .toUpperCase()
    .match(/^([A-Z]+)/);
  return m ? m[1] : '';
}

export function sectionUrlFor() {
  return 'mds-section-i.html';
}
