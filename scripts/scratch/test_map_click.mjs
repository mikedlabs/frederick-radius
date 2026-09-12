import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
      args: ['--use-gl=egl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));
  
  await page.goto('http://localhost:3000/map', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  try {
      const checkbox = await page.waitForSelector('input[type="checkbox"]', { state: 'attached' });
      const checkboxes = await page.$$('input[type="checkbox"]');
      for (const cb of checkboxes) {
         // just toggle all checkboxes in the drawer to ensure we hit it
         await cb.click({ force: true });
      }
      await page.waitForTimeout(3000);
  } catch (e) {
      console.log("Could not click checkboxes:", e.message);
  }
  
  console.log("LOGS:");
  console.log(logs.join('\n'));
  
  await browser.close();
})();
