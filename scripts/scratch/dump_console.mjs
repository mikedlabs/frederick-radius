import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
      args: ['--use-gl=egl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/map');
  await page.waitForTimeout(1000);
  
  const hasWebGL = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!(gl && gl instanceof WebGLRenderingContext);
  });
  console.log("Has WebGL:", hasWebGL);
  
  await browser.close();
})();
