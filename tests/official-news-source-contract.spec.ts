import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CIVIC_PRESS_SOURCES } from "@/data/civic-press-sources";
import { KEYLESS_FEEDS } from "@/lib/integrations/feed-registry";
import GENERATED from "@/data/source-registry.generated.json" with { type: "json" };

describe("mounted official newsroom source contract", () => {
  it("joins each exact runtime endpoint to an active owned registry row and its consumer", () => {
    const manifest = parse(readFileSync(resolve("data/sources.yaml"), "utf8")).sources as { id: string; contact: string }[];
    const configured = KEYLESS_FEEDS.flatMap((feed) => feed.sourceIds ?? []);
    for (const feed of CIVIC_PRESS_SOURCES) {
      expect(GENERATED.find((source) => source.id === feed.id)).toMatchObject({ id: feed.id, url: feed.url,
        status: "active", collection: "runtime", transformFile: "src/lib/integrations/civic-press.ts", publicationApplicability: "required" });
      expect(configured).toContain(feed.id);
      expect(manifest.find((source) => source.id === feed.id)?.contact).toBe(`https://www.${feed.host}/Rss.aspx`);
    }
  });
});
