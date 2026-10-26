import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCatchAllRoutes } from "next/dist/build/normalize-catchall-routes";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths";
import DefaultAppChildren from "@/app/(app)/default";

const childrenDefault = "/(app)/default";
const modalResetPage = "/(app)/@modal/[...catchAll]/page";

function appFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? appFiles(filename) : [filename];
  });
}

/** Use the installed Next normalizer and real route tree, without a server or
 * generated manifest. The catch-all can cross a URL-transparent route group. */
function topology(includeChildrenDefault: boolean) {
  const directory = path.resolve("src/app");
  const files = appFiles(directory);
  const appPath = (filename: string) => `/${path.relative(directory, filename).replace(/\.(tsx|ts|jsx|js)$/, "")}`;
  const pages = files.filter(filename => /\/page\.(tsx|ts|jsx|js)$/.test(filename)).map(appPath);
  const defaults = files.filter(filename => /\/default\.(tsx|ts|jsx|js)$/.test(filename)).map(appPath)
    .filter(filename => includeChildrenDefault || filename !== childrenDefault);
  const routes: Record<string, string[]> = {};
  for (const page of pages) (routes[normalizeAppPath(page)] ??= []).push(page);
  const result = normalizeCatchAllRoutes(routes, { strictRouteMatching: true, defaultAppPaths: defaults });
  return { routes, pages, defaults, result };
}

describe("complete app routes with the Tools modal reset", () => {
  it("reproduces the outside-group loss when implicit children has no default", () => {
    const withoutDefault = topology(false);
    for (const route of ["/beta", "/concept/wlr", "/admin", "/auth/login", "/offline", "/report"]) {
      expect(withoutDefault.result.unmatchedAppPages).toContain(`${route}/page`);
      expect(withoutDefault.routes[route]).toBeUndefined();
    }
  });

  it("keeps all real pages reachable without changing ordinary app matchers", () => {
    const before = topology(false);
    const after = topology(true);
    expect(after.defaults).toContain(childrenDefault);
    expect(after.result.unmatchedAppPages).toEqual([]);
    expect(after.result.incompatibleParallelRouteSlots).toEqual([]);
    for (const page of after.pages.filter(page => !page.includes("/@"))) {
      const route = normalizeAppPath(page);
      expect(after.routes[route], page).toContain(page);
      if (page.startsWith("/(app)/")) expect(after.routes[route], route).toEqual(before.routes[route]);
    }
  });

  it("leaves unknown URLs with only a modal reset and an actual 404 fallback", () => {
    const { routes } = topology(true);
    // This matcher clears an open modal; it supplies no ordinary page. A null
    // children fallback here would accidentally create a blank valid route.
    expect(routes["/[...catchAll]"]).toEqual([modalResetPage]);
    expect(routes["/not-a-radius-destination"]).toBeUndefined();
    expect(routes["/not-a-radius-destination/nested"]).toBeUndefined();
    expect(DefaultAppChildren).toThrowError("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
