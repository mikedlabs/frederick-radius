import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openToday(page: Page, width: number, height: number, enlarged: boolean) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (enlarged) {
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "html { font-size: 200% !important; }";
      document.documentElement.append(style);
    });
  }
  await page.addInitScript(() => {
    localStorage.setItem("fr:scope:v1", "county");
    document.cookie = "fr_scope=county; path=/";
  });
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("combobox", { name: "Choose your area" })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

const cases = [
  { width: 390, height: 844, enlarged: false, label: "390px" },
  { width: 320, height: 844, enlarged: true, label: "320px at 200% text" },
  { width: 1280, height: 800, enlarged: false, label: "1280px" },
] as const;

for (const { width, height, enlarged, label } of cases) {
  test(`Today Find stays one line and clear of the tab bar at ${label}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openToday(page, width, height, enlarged);

    const find = page.getByRole("link", {
      name: "Find a place, service, event, or answer", exact: true,
    });
    await expect(find).toBeVisible();
    const findBox = (await find.boundingBox())!;
    const prompt = find.locator("[data-find-prompt]");
    expect(await prompt.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
    expect(await find.evaluate((element) => getComputedStyle(element).minHeight)).not.toBe("auto");
    expect(findBox.height).toBeGreaterThanOrEqual(44);

    const visibleLabel = (await prompt.innerText()).replace(/\s+/g, " ").trim();
    if (enlarged) {
      expect(visibleLabel).toBe("Search");
      expect(findBox.height).toBeLessThan(140);
    } else {
      expect(visibleLabel).toBe("Find what you need");
      expect(findBox.height).toBeLessThan(80);
    }

    const arrowBox = (await find.locator("svg").last().boundingBox())!;
    expect(arrowBox.x + arrowBox.width).toBeLessThanOrEqual(findBox.x + findBox.width + 1);
    expect(arrowBox.y + arrowBox.height).toBeLessThanOrEqual(findBox.y + findBox.height + 1);
    expect(arrowBox.x).toBeGreaterThanOrEqual(findBox.x);

    const mainPad = await page.locator("#main-content").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        paddingBottom: styles.paddingBottom,
        tabbar: getComputedStyle(document.documentElement).getPropertyValue("--app-tabbar-h").trim(),
        reserve: element.getAttribute("data-bottom-nav-reserve"),
      };
    });

    if (width < 1024) {
      expect(mainPad.reserve).toBe("true");
      expect(mainPad.tabbar).toBe("68px");
      expect(parseFloat(mainPad.paddingBottom)).toBeCloseTo(68, 0);
      const nav = page.locator("[data-bottom-nav-shell]").getByRole("navigation", {
        name: "Primary", exact: true,
      });
      await expect(nav).toBeVisible();
      const navBox = (await nav.boundingBox())!;
      if (findBox.y + 1 < navBox.y) {
        expect(findBox.y + findBox.height, "Find must not wrap under the tab bar").toBeLessThanOrEqual(navBox.y + 1);
      }
      await find.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
      const scrolledFind = (await find.boundingBox())!;
      const scrolledNav = (await nav.boundingBox())!;
      expect(scrolledFind.y + scrolledFind.height).toBeLessThanOrEqual(scrolledNav.y + 1);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const end = await page.evaluate(() => {
        const main = document.getElementById("main-content");
        const tabs = document.querySelector("[data-bottom-nav-shell] nav");
        if (!main || !tabs) return null;
        let contentBottom = 0;
        for (const child of Array.from(main.children)) {
          contentBottom = Math.max(contentBottom, child.getBoundingClientRect().bottom);
        }
        return { contentBottom, navTop: tabs.getBoundingClientRect().y };
      });
      expect(end).not.toBeNull();
      expect(end!.contentBottom, "page content must clear the tab bar at the end of the document")
        .toBeLessThanOrEqual(end!.navTop + 1);
    } else {
      expect(mainPad.tabbar).toBe("0px");
      await expect(page.locator("[data-bottom-nav-shell]")).toBeHidden();
    }

    await page.screenshot({ path: testInfo.outputPath(`today-find-${width}${enlarged ? "-200pct" : ""}.png`), fullPage: false });
  });
}
