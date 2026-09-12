import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
      args: ['--use-gl=egl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('pageerror', error => logs.push(`[PAGE ERROR] ${error.message}\n${error.stack}`));
  page.on('console', msg => {
      logs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`);
  });
  
  await page.goto('http://localhost:3000/map', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  console.log("LOGS:");
  console.log(logs.join('\n'));
  
  await browser.close();
})();
