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
  const keysTitle = page.locator('[data-sports-team="keys"]')
    .getByRole("heading", { name: "The Frederick Keys", exact: true });
  const cowsTitle = page.locator('[data-sports-team="cows"] [data-sports-team-accent]');
  for (const { id, title } of [{ id: "keys", title: keysTitle }, { id: "cows", title: cowsTitle }]) {
    await expect(title).toBeVisible();
    const copy = title.locator("..");
    await copy.scrollIntoViewIfNeeded();
    const geometry = await copy.evaluate((element) => {
      const copyBox = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const textRects = [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
      const clipping: Array<{ tag: string; horizontal: boolean; vertical: boolean }> = [];
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clipsX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX);
        const clipsY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const box = ancestor.getBoundingClientRect();
        // The document's scrollport stays at viewport origin while its
        // bounding rect moves with document scroll.
        const isViewport = ancestor === document.documentElement;
        const left = isViewport ? 0 : box.left + ancestor.clientLeft;
        const top = isViewport ? 0 : box.top + ancestor.clientTop;
        const horizontal = clipsX && textRects.some((rect) => rect.left < left || rect.right > left + ancestor.clientWidth);
        const vertical = clipsY && textRects.some((rect) => rect.top < top || rect.bottom > top + ancestor.clientHeight);
        if (horizontal || vertical) clipping.push({ tag: ancestor.tagName, horizontal, vertical });
      }
      return {
        copyWidth: copyBox.width,
        textRects,
        clipping,
        outsideViewportX: textRects.some((rect) => rect.left < 0 || rect.right > innerWidth),
      };
    });
    expect(geometry.copyWidth, `${id} needs a readable full-width column at enlarged text size`).toBeGreaterThanOrEqual(120);
    expect(geometry.textRects.length, `${id} must render actual text`).toBeGreaterThan(0);
    // Page overflow can be zero while a rounded card clips its text. Check
    // real text against actual clipping ancestors, not its own line-height.
    expect(geometry.clipping, `${id} text must remain inside every clipping ancestor`).toEqual([]);
    expect(geometry.outsideViewportX, `${id} text must remain inside the phone viewport`).toBe(false);
    await testInfo.attach(`${id}-large-text-layout`, { contentType: "application/json", body: JSON.stringify({ width, ...geometry }) });
  }
  const cows = page.locator('[data-sports-team="cows"]');
  const schedule = cows.getByRole("link", { name: "Schedule and results", exact: true });
  await schedule.scrollIntoViewIfNeeded();
  await expect(schedule).toBeVisible();
  const actionGeometry = await schedule.evaluate((element) => {
    const card = element.closest<HTMLElement>('[data-sports-team="cows"]')!;
    const cardBox = card.getBoundingClientRect();
    const actionBox = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      card: { left: cardBox.left + card.clientLeft, right: cardBox.left + card.clientLeft + card.clientWidth,
        clientWidth: card.clientWidth, scrollWidth: card.scrollWidth },
      action: { left: actionBox.left, right: actionBox.right, width: actionBox.width, height: actionBox.height,
        contentLeft: actionBox.left + element.clientLeft, contentRight: actionBox.left + element.clientLeft + element.clientWidth,
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth },
      text: [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ left: rect.left, right: rect.right })),
      words: [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)
        .flatMap((node) => [...(node.textContent ?? "").matchAll(/\S+/g)].map((match) => {
          const wordRange = document.createRange();
          wordRange.setStart(node, match.index!);
          wordRange.setEnd(node, match.index! + match[0].length);
          return { word: match[0], lines: [...wordRange.getClientRects()]
            .filter((rect) => rect.width > 0 && rect.height > 0).length };
        })),
    };
  });
  expect(actionGeometry.card.scrollWidth, "The Cows card must not hide overflowing actions")
    .toBeLessThanOrEqual(actionGeometry.card.clientWidth);
  expect(actionGeometry.action.left).toBeGreaterThanOrEqual(actionGeometry.card.left);
  expect(actionGeometry.action.right).toBeLessThanOrEqual(actionGeometry.card.right);
  expect(actionGeometry.action.scrollWidth, "The full schedule label must fit inside its own control")
    .toBeLessThanOrEqual(actionGeometry.action.clientWidth);
  expect(actionGeometry.action.width).toBeGreaterThanOrEqual(44);
  expect(actionGeometry.action.height).toBeGreaterThanOrEqual(44);
  expect(actionGeometry.text.length).toBeGreaterThan(0);
  expect(actionGeometry.words.map(({ word }) => word)).toEqual(["Schedule", "and", "results"]);
  for (const word of actionGeometry.words) {
    expect(word.lines, `Keep the complete word ${word.word} readable on one line`).toBe(1);
  }
  for (const rect of actionGeometry.text) {
    expect(rect.left, "Every schedule label line must remain inside the control").toBeGreaterThanOrEqual(actionGeometry.action.contentLeft);
    expect(rect.right, "Every schedule label line must remain inside the control").toBeLessThanOrEqual(actionGeometry.action.contentRight);
  }
  await testInfo.attach("cows-schedule-large-text-fit", { contentType: "application/json", body: JSON.stringify({ width, ...actionGeometry }) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
}
