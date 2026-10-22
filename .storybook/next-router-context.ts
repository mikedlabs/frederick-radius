import type { ContextType } from "react";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { ROOT_SEGMENT_REQUEST_KEY } from "next/dist/shared/lib/segment-cache/segment-value-encoding.js";

type CurrentLayout = NonNullable<ContextType<typeof LayoutRouterContext>>;
type StorybookLegacyLayout = Pick<CurrentLayout, "parentTree" | "url"> & {
  parentCacheNode: Pick<CurrentLayout["parentRenderTree"]["data"], "rsc" | "prefetchRsc">;
  loading: CurrentLayout["parentLoadingData"];
};

/** Storybook10.5.10 still supplies the pre-16.4 cache node. This workshop-only
 * bridge supplies Next16.4.2's typed render tree before its real boundary runs.
 * Navigation actions, pathname, params and redirect handling stay upstream.
 */
export function storybookLayoutContext(value: unknown, params: CurrentLayout["parentParams"]): CurrentLayout | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("Unsupported Storybook layout context.");
  if ("parentRenderTree" in value) {
    const current = value as CurrentLayout;
    if (!current.parentRenderTree?.data || !Number.isSafeInteger(current.parentRenderTree.data.bfcacheId)) throw new Error("Unsupported current Storybook render tree.");
    return current;
  }
  const legacy = value as StorybookLegacyLayout;
  if (!Array.isArray(legacy.parentTree) || typeof legacy.url !== "string" || !legacy.parentCacheNode
    || !("rsc" in legacy.parentCacheNode) || !("prefetchRsc" in legacy.parentCacheNode) || legacy.loading !== null) throw new Error("Unsupported legacy Storybook layout context.");
  // VaryPath's brand is type-only. This complete root path does not import the
  // live RSC cache writer into a component fixture or fetch any route data.
  const varyPath = { id: null, value: ROOT_SEGMENT_REQUEST_KEY, isRootParam: false, parent: null } as CurrentLayout["parentRenderTree"]["varyPath"];
  return {
    ...legacy,
    parentRenderTree: {
      requestKey: ROOT_SEGMENT_REQUEST_KEY,
      segment: legacy.parentTree[0],
      varyPath,
      shellVaryPath: varyPath,
      refreshState: null,
      data: { rsc: legacy.parentCacheNode.rsc, prefetchRsc: legacy.parentCacheNode.prefetchRsc, varyParams: null, scrollRef: null, bfcacheId: 0 },
      slots: null,
      prefetchHints: 0,
    },
    parentSegmentPath: null,
    parentParams: params,
    parentLoadingData: legacy.loading,
    debugNameContext: "storybook",
    isActive: true,
  };
}
