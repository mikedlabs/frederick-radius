import React, { type ContextType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppRouterContext, LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { PathParamsContext, PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { RedirectBoundary as ActualRedirectBoundary } from "next/dist/client/components/redirect-boundary.js";
import { useParams, usePathname, useRouter, useSearchParams } from "next/dist/client/components/navigation.js";
import { RedirectBoundary } from "../.storybook/next-router-boundary";
import { storybookLayoutContext } from "../.storybook/next-router-context";
import workshop from "../.storybook/main";

const legacy = () => ({ parentTree: ["/map", {}], parentCacheNode: { rsc: null, prefetchRsc: null }, loading: null, url: "/map" });
const router = () => ({ back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), bfcacheId: "workshop" });
const legacyAsContext = (value: ReturnType<typeof legacy>) => value as unknown as ContextType<typeof LayoutRouterContext>;

function Probe() {
  const navigation = useRouter();
  return <output>{usePathname()}|{useSearchParams()?.get("place")}|{useParams()?.slug}|{navigation.bfcacheId}</output>;
}
function mount(boundary: typeof RedirectBoundary, child = <Probe />) {
  const Boundary = boundary;
  return renderToString(<AppRouterContext.Provider value={router()}><PathnameContext.Provider value="/map"><PathParamsContext.Provider value={{ slug: "carroll-creek" }}><SearchParamsContext.Provider value={new URLSearchParams("place=carroll-creek")}><LayoutRouterContext.Provider value={legacyAsContext(legacy())}><Boundary>{child}</Boundary></LayoutRouterContext.Provider></SearchParamsContext.Provider></PathParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>);
}

describe("workshop-only Next16.4 App Router compatibility", () => {
  it("reproduces the actual upstream boundary crash under the framework’s legacy context and repairs only that context", () => {
    expect(() => mount(ActualRedirectBoundary)).toThrow(/reading 'data'/);
    expect(mount(RedirectBoundary).replaceAll("<!-- -->", "")).toContain("/map|carroll-creek|carroll-creek|_b_0_");
  });
  it("preserves exact upstream router actions, null context behavior and new context identity", () => {
    const original = legacy(), params = { slug: "carroll-creek" };
    const snapshot = structuredClone(original);
    const current = storybookLayoutContext(original, params)!;
    expect(original).toEqual(snapshot);
    expect(current.parentTree).toBe(original.parentTree);
    expect(current.parentParams).toBe(params);
    expect(current.parentRenderTree.data).toMatchObject({ bfcacheId: 0, rsc: null, prefetchRsc: null, scrollRef: null });
    expect(storybookLayoutContext(current, {})).toBe(current);
    expect(storybookLayoutContext(null, {})).toBeNull();
    const actions = router();
    function Actions() {
      const actual = useRouter();
      expect(actual.push).toBe(actions.push); expect(actual.replace).toBe(actions.replace); expect(actual.back).toBe(actions.back); expect(actual.prefetch).toBe(actions.prefetch);
      actual.push("/events");
      return <output>{actual.bfcacheId}</output>;
    }
    renderToString(<AppRouterContext.Provider value={actions}><LayoutRouterContext.Provider value={legacyAsContext(original)}><RedirectBoundary><Actions /></RedirectBoundary></LayoutRouterContext.Provider></AppRouterContext.Provider>);
    expect(actions.push).toHaveBeenCalledWith("/events");
  });
  it("does not hide an absent App Router, malformed context or unrelated render failure", () => {
    expect(() => renderToString(<RedirectBoundary><Probe /></RedirectBoundary>)).toThrow(/expected app router/);
    expect(() => storybookLayoutContext({}, {})).toThrow(/Unsupported legacy/);
    expect(() => storybookLayoutContext({ parentRenderTree: {} }, {})).toThrow(/Unsupported current/);
    function Broken(): React.JSX.Element { throw new Error("real story failure"); }
    expect(() => mount(RedirectBoundary, <Broken />)).toThrow("real story failure");
  });
  it("adds only the exact workshop import alias while preserving existing Vite aliases", async () => {
    const input = { resolve: { alias: { "existing-alias": "/existing-target" } } };
    const output = await workshop.viteFinal!(input, {} as never);
    const aliases = output.resolve!.alias as { find: string | RegExp; replacement: string }[];
    expect(aliases[0].find).toBeInstanceOf(RegExp);
    const match = aliases[0].find as RegExp;
    expect(match.test("next/dist/client/components/redirect-boundary.js")).toBe(true);
    expect(match.test("../node_modules/next/dist/client/components/redirect-boundary.js")).toBe(false);
    expect(match.test("next/dist/client/components/redirect-boundary")).toBe(false);
    expect(match.test("next/navigation")).toBe(false);
    expect(aliases[0].replacement).toMatch(/\.storybook\/next-router-boundary\.tsx$/);
    expect(aliases[1]).toEqual({ find: "existing-alias", replacement: "/existing-target" });
  });
});
