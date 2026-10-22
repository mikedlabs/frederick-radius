import { describe, expect, it } from "vitest";
import * as clearingPage from "../src/app/(app)/@modal/[...catchAll]/page";
import { parseAppSegmentConfig } from "next/dist/build/segment-config/app/app-segment-config.js";
import { computeSegmentPrefetchHints, createRouteTreePrefetch, getMissingPrefetchHintPolicy } from "next/dist/server/app-render/create-transport-tree-from-loader-tree.js";
import { StaticPrefetchDisabled } from "next/dist/shared/lib/app-router-types.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module";

const leaf = (module: object): LoaderTree => ["__PAGE__", {}, { page: [async () => module, "fixture/page.tsx"] }, null];

describe("null modal clearing segment prefetch", () => {
  it("uses a supported Next segment option without Cache Components and still clears the slot", async () => {
    expect(clearingPage.default()).toBeNull();
    expect(parseAppSegmentConfig(clearingPage, "/(app)/@modal/[...catchAll]").prefetch).toBe("force-disabled");
    const policy = getMissingPrefetchHintPolicy(false, false, false);
    expect(policy).toBe("none");
    for (const inlining of [false, true]) {
      const hints = await computeSegmentPrefetchHints(leaf(clearingPage), null, inlining, policy, false, false, undefined);
      expect(hints & StaticPrefetchDisabled).toBe(StaticPrefetchDisabled);
    }
  });
  it("emits the actual server transport opt-out only on the clearing leaf, preserving sibling prefetches", async () => {
    const tree: LoaderTree = ["(app)", {
      children: leaf({ default: () => "normal destination" }),
      modal: leaf(clearingPage),
    }, { layout: [async () => ({ default: () => null }), "fixture/layout.tsx"] }, null];
    const transport = await createRouteTreePrefetch(tree, null, false, "none", false, () => null, undefined);
    expect((transport.h ?? 0) & StaticPrefetchDisabled).toBe(0);
    const children = transport.c!;
    expect((children.get("modal")!.h ?? 0) & StaticPrefetchDisabled).toBe(StaticPrefetchDisabled);
    expect((children.get("children")!.h ?? 0) & StaticPrefetchDisabled).toBe(0);
    expect(children.get("modal")!.s).toBe("__PAGE__");
  });
});
