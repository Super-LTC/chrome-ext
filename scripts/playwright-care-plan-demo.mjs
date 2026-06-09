/**
 * Playwright diagnostic for care plan demo button wiring.
 * Run: node scripts/playwright-care-plan-demo.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5174';
const URL = `${BASE}/demo/clinical-care-plan-detail.html`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(line);
    if (msg.type() === 'error') consoleErrors.push(line);
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });

  console.log('Navigating to', URL);
  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('HTTP status:', resp?.status());

  await page.waitForTimeout(3000);

  const globals = await page.evaluate(() => ({
    demoMode: !!window.__DEMO_MODE,
    hasOpenCarePlan: typeof window.__demoOpenCarePlan === 'function',
    hasOpener: typeof window.__demoCarePlanOpener === 'function',
    hasRegister: typeof window.__demoRegisterCarePlanOpener === 'function',
    hasStampDiscover: !!window.CarePlanStampDiscover,
    hasDemoRoot: !!document.getElementById('super-demo-root'),
    aiBtnCount: document.querySelectorAll('[id^="super-cpas-btn-"]').length,
    bannerCount: document.querySelectorAll('.super-audit-banner').length,
    modalCount: document.querySelectorAll('.cpas-modal').length,
  }));
  console.log('Globals after load:', JSON.stringify(globals, null, 2));

  // Click AI Care Plan button
  const aiBtn = page.locator('[id^="super-cpas-btn-"]').first();
  const aiVisible = await aiBtn.isVisible().catch(() => false);
  console.log('AI button visible:', aiVisible);
  if (aiVisible) {
    await aiBtn.click();
    await page.waitForTimeout(2500);
  }

  const afterClick = await page.evaluate(() => ({
    modalCount: document.querySelectorAll('.cpas-modal').length,
    modalTitle: document.querySelector('.cpas-modal__title')?.textContent || null,
    stage: document.querySelector('.cpas-modal')?.innerText?.slice(0, 200) || null,
    hasOpener: typeof window.__demoCarePlanOpener === 'function',
  }));
  console.log('After AI click:', JSON.stringify(afterClick, null, 2));

  if (afterClick.modalCount === 0) {
    // Try audit banner CTA
    const cta = page.locator('.super-audit-banner__cta').first();
    if (await cta.isVisible().catch(() => false)) {
      console.log('Trying audit banner Review CTA...');
      await cta.click();
      await page.waitForTimeout(2500);
      const afterBanner = await page.evaluate(() => ({
        modalCount: document.querySelectorAll('.cpas-modal').length,
        modalTitle: document.querySelector('.cpas-modal__title')?.textContent || null,
      }));
      console.log('After banner click:', JSON.stringify(afterBanner, null, 2));
    }
  }

  if (consoleErrors.length) {
    console.log('\n--- Console errors ---');
    consoleErrors.forEach((e) => console.log(e));
  }

  const relevant = consoleLogs.filter((l) =>
    /PCC Demo|care-plan|cpas|error|demo/i.test(l)
  );
  if (relevant.length) {
    console.log('\n--- Relevant console ---');
    relevant.slice(-20).forEach((l) => console.log(l));
  }

  const ok = (await page.locator('.cpas-modal').count()) > 0;
  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('Playwright failed:', e);
  process.exit(2);
});
