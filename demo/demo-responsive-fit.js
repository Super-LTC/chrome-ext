// demo-responsive-fit.js
//
// The demo runs on a real *captured* PointClickCare page, which is a fixed-width
// legacy layout (PCC's own UI doesn't reflow). On a narrower window the page
// would get cut off on the right. As a demo-only convenience we scale the whole
// document down to fit the viewport width — everything (page + Super overlays +
// the guided tour) shrinks together, so nothing is ever cut off and the tour
// spotlights stay aligned. On wide windows it's a no-op (zoom = 1).

// Width the captured layout needs to look right before we start scaling down.
const NATURAL_WIDTH = 1380;
const MIN_ZOOM = 0.55;

export function installResponsiveFit() {
  const apply = () => {
    const w = window.innerWidth || document.documentElement.clientWidth;
    const zoom = w >= NATURAL_WIDTH ? 1 : Math.max(MIN_ZOOM, w / NATURAL_WIDTH);
    // `zoom` (vs transform) keeps getBoundingClientRect coordinates consistent
    // in Chrome, so driver.js spotlights line up. The demo is Chrome-targeted.
    document.documentElement.style.zoom = String(zoom);
  };
  apply();
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(apply);
  });
}
