/**
 * Synchronous care-plan button wiring for the demo.
 *
 * The captured clinical-care-plan-detail.html bakes in extension markup
 * (audit banner, AI Care Plan buttons) with no click handlers. This runs
 * immediately on module load — before Preact mounts — so clicks are never
 * lost. Opens are queued until PCCDemoApp registers __demoCarePlanOpener.
 */

const pendingOpens = [];

export function installCarePlanDemoWire() {
  // clinical-care-plan-detail.html installs an inline wire before the module
  // bundle loads — don't register a second capture listener.
  if (typeof window.__demoOpenCarePlan === 'function') return;
  if (installCarePlanDemoWire._done) return;
  installCarePlanDemoWire._done = true;
  window.__demoOpenCarePlan = (opts) => {
    if (typeof window.__demoCarePlanOpener === 'function') {
      window.__demoCarePlanOpener(opts);
      return;
    }
    pendingOpens.push(opts);
  };

  window.__demoRegisterCarePlanOpener = (opener) => {
    window.__demoCarePlanOpener = opener;
    while (pendingOpens.length) opener(pendingOpens.shift());
  };

  document.addEventListener('click', (e) => {
    const dismiss = e.target.closest?.('.super-audit-banner__dismiss');
    if (dismiss) {
      dismiss.closest('.super-audit-banner')?.remove();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const auditCta = e.target.closest?.('.super-audit-banner__cta');
    const aiBtn = e.target.closest?.('[id^="super-cpas-btn-"]');
    if (!auditCta && !aiBtn) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const hasFocuses = document.querySelectorAll('a[href*="editNeed("]').length > 0;
    const defaultMode = auditCta ? 'comprehensive' : (hasFocuses ? 'comprehensive' : 'initial');
    window.__demoOpenCarePlan({ defaultMode });
  }, true);
}

export function isCarePlanDemoPage() {
  const href = window.location.href || '';
  const path = window.location.pathname || '';
  return href.includes('careplandetail_rev.jsp')
    || path.includes('clinical-care-plan-detail')
    || !!document.getElementById('idNewCustomFocusBtn');
}
