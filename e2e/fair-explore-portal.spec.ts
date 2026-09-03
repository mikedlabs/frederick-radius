import { expect, test } from "@playwright/test";

const FAIR_PATH = "/moments/great-frederick-fair-2026#find";

test.describe("Fair Explore task portal", () => {
  test.use({
    locale: "en-US",
    timezoneId: "America/New_York",
    serviceWorkers: "block",
  });

  test("keeps search and four reviewed paths scannable at phone widths", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(FAIR_PATH, { waitUntil: "domcontentloaded" });
      await expect(page.locator("article[data-fair-app]")).toHaveAttribute(
        "data-fair-interaction-ready",
        "true",
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Explore the Fair" }),
      ).toBeVisible();

      const dayPicker = page.getByRole("combobox", {
        name: "Fair day to explore",
      });
      await dayPicker.selectOption("2026-09-18");

      const search = page.getByRole("searchbox", { name: "Search the Fair" });
      const portal = page.getByRole("region", {
        name: "Fair activity paths",
      });
      const grid = portal.locator("[data-fair-discovery-grid]");
      const choices = portal.locator("[data-fair-discovery-choice]");

      await expect(search).toBeVisible();
      await expect(portal).toBeVisible();
      await expect(grid).toBeVisible();
      await expect(choices).toHaveCount(4);
      await expect(
        portal.locator('[data-fair-discovery-choice="kid-zone"]'),
      ).toContainText("4 p.m.–9 p.m.");
      await expect(
        portal.locator('[data-fair-discovery-choice="food-program"]'),
      ).toBeDisabled();
      await expect(portal).not.toContainText(/\d+ options?/);

      const layout = await page.evaluate(() => {
        const searchField = document.querySelector<HTMLElement>(
          "#fair-unified-search",
        );
        const portalElement = document.querySelector<HTMLElement>(
          "[data-fair-discovery-choices]",
        );
        const gridElement = document.querySelector<HTMLElement>(
          "[data-fair-discovery-grid]",
        );
        const actionBar = document.querySelector<HTMLElement>(
          "[data-mobile-action-bar]",
        );
        const cardElements = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-fair-discovery-choice]",
          ),
        );
        if (!searchField || !portalElement || !gridElement || !actionBar) {
          return null;
        }
        const cardBoxes = cardElements.map((card) =>
          card.getBoundingClientRect(),
        );
        const gridBox = gridElement.getBoundingClientRect();
        const actionBarBox = actionBar.getBoundingClientRect();
        return {
          searchBeforePortal: Boolean(
            searchField.compareDocumentPosition(portalElement) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
          searchBottom: searchField.getBoundingClientRect().bottom,
          viewportHeight: window.innerHeight,
          columnCount: window
            .getComputedStyle(gridElement)
            .gridTemplateColumns.split(" ").length,
          rowCount: new Set(cardBoxes.map((box) => Math.round(box.top))).size,
          gridBottom: gridBox.bottom,
          actionBarTop: actionBarBox.top,
          portalClientWidth: portalElement.clientWidth,
          portalScrollWidth: portalElement.scrollWidth,
          cards: cardBoxes.map((box) => ({
            width: box.width,
            height: box.height,
            left: box.left,
            right: box.right,
          })),
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(layout).not.toBeNull();
      expect(layout?.searchBeforePortal).toBe(true);
      expect(layout?.searchBottom).toBeLessThanOrEqual(
        layout?.viewportHeight ?? 0,
      );
      expect(layout?.columnCount).toBe(2);
      expect(layout?.rowCount).toBe(2);
      expect(layout?.gridBottom).toBeLessThanOrEqual(
        layout?.actionBarTop ?? 0,
      );
      expect(layout?.portalScrollWidth).toBeLessThanOrEqual(
        (layout?.portalClientWidth ?? 0) + 1,
      );
      expect(layout?.documentScrollWidth).toBeLessThanOrEqual(
        (layout?.documentClientWidth ?? 0) + 1,
      );
      for (const card of layout?.cards ?? []) {
        expect(card.width).toBeGreaterThanOrEqual(44);
        expect(card.height).toBeGreaterThanOrEqual(88);
        expect(card.height).toBeLessThanOrEqual(92);
        expect(card.left).toBeGreaterThanOrEqual(0);
        expect(card.right).toBeLessThanOrEqual(width + 1);
      }

      const enlargedTextStyle = await page.addStyleTag({
        content: `
          [data-fair-discovery-copy] {
            font-size: 200% !important;
            line-height: 1.35 !important;
            letter-spacing: normal !important;
          }
        `,
      });
      const enlargedLayout = await page.evaluate(() => ({
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        cards: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-fair-discovery-choice]",
          ),
        ).map((card) => ({
          clientHeight: card.clientHeight,
          scrollHeight: card.scrollHeight,
          clientWidth: card.clientWidth,
          scrollWidth: card.scrollWidth,
        })),
      }));
      await enlargedTextStyle.evaluate((style) =>
        style.parentNode?.removeChild(style),
      );

      expect(enlargedLayout.documentScrollWidth).toBeLessThanOrEqual(
        enlargedLayout.documentClientWidth + 1,
      );
      for (const card of enlargedLayout.cards) {
        expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);
        expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
      }
    }
  });
});
