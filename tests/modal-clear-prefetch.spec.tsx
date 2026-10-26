import { describe, expect, it } from "vitest";
import * as clearingPage from "../src/app/(app)/@modal/[...catchAll]/page";
import { parseAppSegmentConfig } from "next/dist/build/segment-config/app/app-segment-config.js";
import { computeSegmentPrefetchHints, createRouteTreePrefetch, getMissingPrefetchHintPolicy } from "next/dist/server/app-render/create-transport-tree-from-loader-tree.js";
import { StaticPrefetchDisabled } from "next/dist/shared/lib/app-router-types.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module";

const leaf = (module: object): LoaderTree => ["__PAGE__", {}, { page: [async () => module, "fixture/page.tsx"] }, null];

describe("null modal clearing segment prefetch", () => {
  it("keeps the reset config-free and uses the ordinary framework prefetch policy", async () => {
    const { default: clear, ...config } = clearingPage;
    expect(clear()).toBeNull();
    // Schema parsing alone accepted a value that requires Cache Components.
    // Assert the actual exports too; this null reset needs no segment config.
    expect(Object.keys(config)).toEqual([]);
    expect(parseAppSegmentConfig(config, "/(app)/@modal/[...catchAll]")).toEqual({});
    const policy = getMissingPrefetchHintPolicy(false, false, false);
    expect(policy).toBe("none");
    for (const inlining of [false, true]) {
      const hints = await computeSegmentPrefetchHints(leaf(clearingPage), null, inlining, policy, false, false, undefined);
      const ordinaryHints = await computeSegmentPrefetchHints(leaf({ default: () => "normal destination" }), null, inlining, policy, false, false, undefined);
      expect(hints).toBe(ordinaryHints);
      expect(hints & StaticPrefetchDisabled).toBe(0);
    }
  });
  it("retains both clearing and sibling destinations in the normal server transport", async () => {
    const tree: LoaderTree = ["(app)", {
      children: leaf({ default: () => "normal destination" }),
      modal: leaf(clearingPage),
    }, { layout: [async () => ({ default: () => null }), "fixture/layout.tsx"] }, null];
    const transport = await createRouteTreePrefetch(tree, null, false, "none", false, () => null, undefined);
    expect((transport.h ?? 0) & StaticPrefetchDisabled).toBe(0);
    const children = transport.c!;
    expect((children.get("modal")!.h ?? 0) & StaticPrefetchDisabled).toBe(0);
    expect((children.get("children")!.h ?? 0) & StaticPrefetchDisabled).toBe(0);
    expect(children.get("modal")!.s).toBe("__PAGE__");
    expect(children.get("children")!.s).toBe("__PAGE__");
  });
});
