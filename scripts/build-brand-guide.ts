/** Export the printable HTML brand guide to a reviewed PDF artifact. */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

async function main() {
  const root = process.cwd();
  const source = path.join(root, "docs/brand/Frederick-Radius-Brand-Guide.html");
  const outDir = path.join(root, "output/pdf");
  const output = path.join(outDir, "Frederick-Radius-Brand-Guide.pdf");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(pathToFileURL(source).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
    });
    await page.pdf({
      path: output,
      printBackground: true,
      preferCSSPageSize: true,
      width: "13.333in",
      height: "7.5in",
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }
  console.log(`Built ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
