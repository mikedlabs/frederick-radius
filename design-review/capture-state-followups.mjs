import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3107";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const result = {};

async function context({ clearIntro = false, reducedMotion = "no-preference" } = {}) {
  const c = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    reducedMotion,
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });
  await c.addInitScript(({ clearIntro }) => {
    if (clearIntro) localStorage.removeItem("fr:beta-intro-dismissed:v10");
    else localStorage.setItem("fr:beta-intro-dismissed:v10", "true");
  }, { clearIntro });
  return c;
}

// Capture the real busy and error states within the form. The request stays
// local and is intercepted, so no email or external mutation occurs.
{
  const c = await context();
  const page = await c.newPage();
  await page.route("**/api/beta/email", async (route) => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_200));
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  });
  await page.goto(`${BASE}/beta`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  const email = page.getByLabel("Email for launch news").first();
  const form = email.locator("xpath=ancestor::form");
  await email.fill("design-review@example.invalid");
  await form.getByRole("button", { name: "Email me a code" }).click();
  const busy = form.getByRole("button", { name: "…" });
  await busy.waitFor();
  await form.screenshot({ path: resolve("design-review/screenshots/beta--mobile-375x812--primary-loading.png"), animations: "disabled" });
  const alert = form.getByRole("alert");
  await alert.waitFor({ timeout: 5_000 });
  await form.screenshot({ path: resolve("design-review/screenshots/beta--mobile-375x812--email-error.png"), animations: "disabled" });
  result.beta = {
    busyLabel: await busy.textContent().catch(() => null),
    errorText: await alert.innerText(),
    formWidthBusy: await form.evaluate((el) => el.getBoundingClientRect().width),
  };
  await c.close();
}

// The welcome strip lives near the end of Today, so capture the component
// itself instead of an unchanged first viewport.
{
  const c = await context({ clearIntro: true });
  const page = await c.newPage();
  await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const intro = page.locator('section[aria-label="Welcome to Frederick Radius"]');
  await intro.waitFor({ timeout: 10_000 });
  await intro.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await intro.screenshot({ path: resolve("design-review/screenshots/today--mobile-375x812--first-visit-intro.png"), animations: "disabled" });
  result.firstVisit = {
    text: (await intro.innerText()).replace(/\s+/g, " ").trim(),
    height: await intro.evaluate((el) => el.getBoundingClientRect().height),
  };
  await c.close();
}

await browser.close();
await writeFile(resolve("design-review/probes/state-followups.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
