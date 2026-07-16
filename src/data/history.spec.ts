import { describe, expect, it } from "vitest";
import { HISTORY } from "./history";

describe("history image attribution", () => {
  const images = HISTORY.flatMap((entry) => (entry.image ? [{ slug: entry.slug, ...entry.image }] : []));

  it("gives every displayed image a creator, exact source, license, and change notice", () => {
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.creator, image.slug).not.toBe("");
      expect(new URL(image.source_url).hostname, image.slug).toBe("commons.wikimedia.org");
      expect(image.source_url, image.slug).toContain("/wiki/File:");
      expect(image.license.label, image.slug).not.toBe("");
      expect(new URL(image.license.url).protocol, image.slug).toBe("https:");
      expect(image.modifications, image.slug).toMatch(/resized|crop/i);
    }
  });

  it("links every Creative Commons license to its matching deed", () => {
    for (const image of images.filter((item) => item.license.label.startsWith("CC "))) {
      const expected = image.license.label
        .toLowerCase()
        .replace("cc ", "")
        .replace(" 1.0", "/1.0/")
        .replace(" 2.0", "/2.0/")
        .replace(" 3.0", "/3.0/")
        .replace(" 4.0", "/4.0/")
        .replace("cc0/1.0/", "publicdomain/zero/1.0/")
        .replace("by-sa/", "licenses/by-sa/")
        .replace("by/", "licenses/by/");
      expect(image.license.url, image.slug).toContain(expected);
    }
  });
});
