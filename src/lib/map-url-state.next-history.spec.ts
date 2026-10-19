import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceMapUrl, replaceMapUrlSilently } from "./map-url-state";
import {
  isMapSelectionHistoryState,
  markMapSelectionHistoryState,
} from "@/components/map/mapSelectionHistory";

const require = createRequire(import.meta.url);
const routerPath = require.resolve("next/dist/client/components/app-router.js");
const routerSource = readFileSync(routerPath, "utf8");
const routerAst = ts.createSourceFile(
  routerPath, routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS,
);
const copies: string[] = [];
const wrappers: string[] = [];
function findInstalledHistoryNodes(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "copyNextJsInternalHistoryState") {
    copies.push(node.getText(routerAst));
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    node.left.getText(routerAst) === "window.history.replaceState" &&
    ts.isFunctionExpression(node.right)
  ) wrappers.push(node.right.getText(routerAst));
  ts.forEachChild(node, findInstalledHistoryNodes);
}
findInstalledHistoryNodes(routerAst);
if (copies.length !== 1 || wrappers.length !== 1) {
  throw new Error("Installed Next History API changed; review the actual integration before updating this contract.");
}

type Replace = (state: unknown, unused: string, url?: string | URL | null) => void;
function installedNextHistory(initialState: unknown) {
  let state = initialState;
  const location = { href: "https://frederickradius.app/map?c=-77.4105,39.4143,13.40&place=gravel-and-grind-frederick&q=Gravel&show=transit&layers=parks" };
  const nativeReplace = vi.fn<Replace>((data, _unused, url) => {
    state = structuredClone(data);
    if (url != null) location.href = new URL(String(url), location.href).href;
  });
  const restoreUrl = vi.fn();
  const history = {
    get state() { return state; },
    replaceState: undefined as unknown as Replace,
  };
  const fakeWindow = { history, location };
  history.replaceState = vm.runInNewContext(
    `${copies[0]}\n(${wrappers[0]})`,
    {
      window: fakeWindow,
      originalReplaceState: nativeReplace,
      applyUrlFromHistoryPushReplace: restoreUrl,
    },
  ) as Replace;
  vi.stubGlobal("window", fakeWindow);
  return { history, location, nativeReplace, restoreUrl };
}

function selectedState(overlay = false) {
  const state = markMapSelectionHistoryState({
    __NA: true,
    __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["map"], preserved: true },
  }, {
    kind: "place",
    value: { slug: "gravel-and-grind-frederick", geom: { lng: -77.4092, lat: 39.4217 } },
  });
  if (overlay) {
    state.__frederickRadiusLayer = "place-sheet:test:1";
    state.__frederickRadiusLayerScrollY = 270;
  }
  return Object.freeze(state);
}

const camera = "-77.4092,39.4217,15.00";
afterEach(() => vi.unstubAllGlobals());

describe("map URL writes composed with the installed Next History wrapper", () => {
  it("retains the existing default reset and reproduces the old camera ownership loss", () => {
    const h = installedNextHistory(selectedState());
    replaceMapUrl((params) => params.set("c", camera));
    expect(h.restoreUrl).toHaveBeenCalledOnce();
    expect(h.nativeReplace).toHaveBeenCalledOnce();
    expect(isMapSelectionHistoryState(h.history.state)).toBe(false);
    expect(h.history.state).toEqual({
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["map"], preserved: true },
    });
    expect(new URL(h.location.href).searchParams.get("place")).toBe("gravel-and-grind-frederick");
  });

  for (const overlay of [false, true]) {
    it(`preserves camera ownership and canonical synchronization${overlay ? " while Details is active" : ""}`, () => {
      const original = selectedState(overlay);
      const before = structuredClone(original);
      const h = installedNextHistory(original);
      const next = replaceMapUrl((params) => params.set("c", camera), {
        preserveHistoryState: true,
      });
      expect(h.restoreUrl).toHaveBeenCalledExactlyOnceWith(next);
      expect(h.nativeReplace).toHaveBeenCalledOnce();
      expect(h.history.state).toEqual(before);
      expect(h.history.state).not.toBe(original);
      expect(original).toEqual(before);
      expect(isMapSelectionHistoryState(h.history.state)).toBe(true);
      const params = new URL(h.location.href).searchParams;
      expect(params.get("c")).toBe(camera);
      expect(params.get("place")).toBe("gravel-and-grind-frederick");
      expect(params.get("q")).toBe("Gravel");
      expect(params.get("show")).toBe("transit");
      expect(params.get("layers")).toBe("parks");
    });
  }

  it("also omits the legacy _N bypass marker from the external update payload", () => {
    const h = installedNextHistory(Object.freeze({ ...selectedState(), _N: true }));
    replaceMapUrl((params) => params.set("c", camera), { preserveHistoryState: true });
    expect(h.restoreUrl).toHaveBeenCalledOnce();
    expect(isMapSelectionHistoryState(h.history.state)).toBe(true);
    expect(h.history.state).toHaveProperty("__NA", true);
    expect(h.history.state).toHaveProperty("__PRIVATE_NEXTJS_INTERNALS_TREE");
    expect(h.history.state).not.toHaveProperty("_N");
  });

  it("keeps the silent helper's ownership-preserving router bypass distinct", () => {
    const original = selectedState(true);
    const h = installedNextHistory(original);
    replaceMapUrlSilently((params) => params.set("c", camera));
    expect(h.restoreUrl).not.toHaveBeenCalled();
    expect(h.nativeReplace).toHaveBeenCalledOnce();
    expect(h.history.state).toEqual(original);
  });

  it("does not retain stale ownership when an intentional selection clear uses the default", () => {
    const h = installedNextHistory(selectedState(true));
    replaceMapUrl((params) => {
      for (const key of ["place", "event", "result", "selection"]) params.delete(key);
      params.set("q", "restroom");
    });
    expect(h.restoreUrl).toHaveBeenCalledOnce();
    expect(isMapSelectionHistoryState(h.history.state)).toBe(false);
    expect(h.history.state).not.toHaveProperty("__frederickRadiusLayer");
    expect(h.history.state).not.toHaveProperty("__frederickRadiusLayerScrollY");
    expect(new URL(h.location.href).searchParams.has("place")).toBe(false);
    expect(new URL(h.location.href).searchParams.get("q")).toBe("restroom");
  });

  for (const state of [null, "unexpected", 7, ["unexpected"]]) {
    it(`fails safe for non-record prior state ${JSON.stringify(state)}`, () => {
      const h = installedNextHistory(state);
      replaceMapUrl((params) => params.set("c", camera), { preserveHistoryState: true });
      expect(h.restoreUrl).toHaveBeenCalledOnce();
      expect(h.nativeReplace).toHaveBeenCalledOnce();
      expect(h.history.state).toEqual({});
    });
  }
});
