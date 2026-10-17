import { expect, test } from "@playwright/test";
import path from "node:path";
import { APPEARANCE_KEY } from "../src/lib/appearance";

const colleges = [
  { id: "hood", name: "Hood College Blazers official athletics calendar", primary: "rgb(19, 46, 83)", secondary: "rgb(164, 166, 164)" },
  { id: "mount", name: "Mount St. Mary's Mountaineers official athletics calendar", primary: "rgb(0, 40, 85)", secondary: "rgb(132, 117, 78)" },
  { id: "fcc", name: "Frederick Community College Cougars official athletics calendar", primary: "rgb(0, 99, 65)", secondary: "rgb(250, 171, 24)" },
] as const;

// Exercise the real built page and its actual CSS, without inventing games.
// Exact primary and secondary plates must survive both app appearances.
for (const appearance of ["light", "dark"] as const) {
  for (const width of [320, 375, 390, 430, 1366]) {
    test(`Sports keeps readable team identity and useful school links at ${width}px in ${appearance}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: APPEARANCE_KEY, value: appearance });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const response = await page.goto("/sports", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-appearance", appearance);
      await expect(page.getByRole("heading", { name: "Frederick plays here.", exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      for (const team of colleges) {
        const card = page.getByRole("link", { name: team.name, exact: true });
        await expect(card).toHaveAttribute("data-sports-team", team.id);
        await expect(card).toHaveCSS("background-color", team.primary);
        await expect(card).toHaveCSS("color", "rgb(255, 255, 255)");
        await expect(card.locator("[data-sports-team-accent]")).toHaveCSS("background-color", team.secondary);
        const fit = await card.evaluate((element) => ({ width: element.clientWidth, needs: element.scrollWidth, height: element.getBoundingClientRect().height }));
        expect(fit.needs).toBeLessThanOrEqual(fit.width + 1);
        expect(fit.height).toBeGreaterThanOrEqual(44);
        await expect(card).toHaveAttribute("href", /^https:\/\//);
      }
      const keys = page.locator('[data-sports-team="keys"]').filter({ has: page.getByRole("heading", { name: "The Frederick Keys", exact: true }) });
      await expect(keys).toHaveCSS("background-color", "rgb(0, 0, 0)");
      await expect(keys.locator("[data-sports-team-accent]")).toHaveCSS("background-color", "rgb(223, 70, 1)");
      const cows = page.locator('[data-sports-team="cows"]');
      await expect(cows.locator("[data-sports-team-accent]")).toHaveCSS("color", "rgb(250, 187, 203)");
      await page.locator(".sports-school-list > summary").click();
      const schools = page.locator(".sports-school-chips a");
      await expect(schools).toHaveCount(10);
      for (const school of await schools.all()) {
        await expect(school).toHaveAttribute("href", /^https:\/\//);
        expect((await school.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 390) {
        await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: unknown[] }> } }).axe;
          return (await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
            resultTypes: ["violations"],
          })).violations;
        });
        expect(violations).toEqual([]);
      }
      if (width === 390 && appearance === "light") {
        const grid = page.getByRole("link", { name: colleges[0].name, exact: true }).locator("..");
        await grid.screenshot({ path: testInfo.outputPath("sports-college-teams-390.png") });
      }
    });
  }
}

for (const width of [320, 390]) {
test(`Sports identity remains usable at 200% text size on a ${width}px phone`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/sports", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const team of colleges) {
    const card = page.getByRole("link", { name: team.name, exact: true });
    await expect(card).toBeVisible();
    expect(await card.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const copyWidth = (await card.locator("strong").locator("..").boundingBox())!.width;
    expect(copyWidth, "Enlarged team text needs a readable column, not one or two characters per line").toBeGreaterThanOrEqual(120);
    await testInfo.attach(`${team.id}-large-text-width`, { contentType: "application/json", body: JSON.stringify({ width, copyWidth }) });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
}
