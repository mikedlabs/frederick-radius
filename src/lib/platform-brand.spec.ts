import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { GET as getServiceWorker } from "@/app/sw.js/route";
import { BRAND, RIPPLE_GEOMETRY } from "./brand";
import { PLATFORM_BRAND } from "./platform-brand";

const ROOT = process.cwd();
const withoutVersion = (value: string) => value.split("?")[0];
const publicFile = (url: string) =>
  path.join(ROOT, "public", withoutVersion(url).replace(/^\//, ""));
const platformFile = (url: string) =>
  withoutVersion(url) === "/apple-icon.png"
    ? path.join(ROOT, "src/app/apple-icon.png")
    : publicFile(url);

describe("platform brand surfaces", () => {
  it("keeps the install manifest linked to the canonical brand", () => {
    const value = manifest();
    expect(value.name).toBe(BRAND.name);
    expect(value.short_name).toBe(PLATFORM_BRAND.shortName);
    expect(value.description).toBe(PLATFORM_BRAND.description);
    expect(value.background_color).toBe(BRAND.colors.cream);
    expect(value.theme_color).toBe(BRAND.colors.cream);
    expect(value.icons?.map((icon) => icon.src)).toEqual([
      PLATFORM_BRAND.icons.anySvg,
      PLATFORM_BRAND.icons.maskableSvg,
      PLATFORM_BRAND.icons.any192,
      PLATFORM_BRAND.icons.any512,
      PLATFORM_BRAND.icons.maskable512,
      PLATFORM_BRAND.icons.apple180,
    ]);
    expect(value.icons?.every((icon) => icon.src.includes("?v="))).toBe(true);
  });

  it("ships every declared icon at its advertised size", async () => {
    const expected = [
      [PLATFORM_BRAND.icons.any192, 192],
      [PLATFORM_BRAND.icons.any512, 512],
      [PLATFORM_BRAND.icons.maskable512, 512],
      [PLATFORM_BRAND.icons.badge, 72],
      [PLATFORM_BRAND.icons.apple180, 180],
    ] as const;

    for (const [url, size] of expected) {
      const metadata = await sharp(platformFile(url)).metadata();
      expect([metadata.width, metadata.height], url).toEqual([size, size]);
    }

    const browserIcon = await sharp(path.join(ROOT, "src/app/icon.png")).metadata();
    expect([browserIcon.width, browserIcon.height]).toEqual([32, 32]);
  });

  it("draws install SVGs from the canonical Ripple and palette", async () => {
    const [icon, maskable] = await Promise.all([
      readFile(publicFile(PLATFORM_BRAND.icons.anySvg), "utf8"),
      readFile(publicFile(PLATFORM_BRAND.icons.maskableSvg), "utf8"),
    ]);
    for (const source of [icon, maskable]) {
      expect(source).toContain(BRAND.colors.brick);
      expect(source).toContain(BRAND.colors.cream);
      for (const geometry of RIPPLE_GEOMETRY.full.paths) {
        expect(source).toContain(geometry);
      }
      expect(source).not.toMatch(/#16352B|#E14328|#EEE6D4/i);
    }
  });

  it("embeds valid local brand fonts for OG and Apple splash rendering", async () => {
    const files = [
      "libre-caslon-display-400.woff",
      "public-sans-400.woff",
      "public-sans-600.woff",
      "public-sans-700.woff",
    ];
    for (const file of files) {
      const data = await readFile(path.join(ROOT, "src/app/api/og/fonts", file));
      expect(data.subarray(0, 4).toString("ascii"), file).toBe("wOFF");
    }
  });

  it("keeps notification artwork on the same versioned icon contract", async () => {
    const worker = await getServiceWorker().text();
    expect(worker).toContain(`icon: payload.icon || "${PLATFORM_BRAND.icons.push}"`);
    expect(worker).toContain(`badge: payload.badge || "${PLATFORM_BRAND.icons.badge}"`);
  });

  it("keeps a 16, 32, and 48px multi-image favicon", async () => {
    const ico = await readFile(path.join(ROOT, "src/app/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([ico.readUInt8(6), ico.readUInt8(22), ico.readUInt8(38)]).toEqual([16, 32, 48]);
  });
});
