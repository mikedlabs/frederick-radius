import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
      args: ['--use-gl=egl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => {
      logs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`);
  });
  
  await page.goto('http://localhost:3000/map', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Click the layers dock to open the drawer
  const hasDock = await page.$('text="Data Atlas"');
  if (!hasDock) {
     console.log("No Data Atlas button found!");
  } else {
     await page.click('text="Housing & Land Value"');
     await page.waitForTimeout(2000);
  }
  
  console.log("LOGS:");
  console.log(logs.join('\n'));
  
  await browser.close();
})();
