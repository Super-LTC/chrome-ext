/**
 * Demo stand-in for content/modules/mds-comments/facility-switch.js
 * (aliased in vite.demo.config.js).
 *
 * The real module drives PCC's own facility chooser. The demo has one captured
 * Section I page, so "switching buildings" is a short beat for the toast to
 * read, then a navigation to that page — the tag-restore payload written by the
 * inbox before this call does the rest on arrival.
 */

function normalize(text) {
  return String(text || '')
    .replace(/\s*-\s*\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isAlreadyAtFacility(facilityName) {
  const here = window.SuperOverlay?.facilityName || 'SUNNY MEADOWS DEMO FACILITY';
  return normalize(facilityName) === normalize(here);
}

export async function switchToFacility() {
  // Let the "Switching to …" toast be seen before the page goes away.
  await new Promise((r) => setTimeout(r, 900));
  window.location.href = 'mds-section-i.html';
  return { ok: true };
}
