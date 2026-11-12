import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceHistoryLayerUrl } from "./useReversibleHistoryLayer";

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
  const location = { href: "https://frederickradius.app/events?in=thurmont&lens=weekend" };
  const nativeReplace = vi.fn<Replace>((data, _unused, url) => {
    state = structuredClone(data);
    if (url != null) location.href = new URL(String(url), location.href).href;
  });
  const restoreUrl = vi.fn();
  const history = {
    get state() { return state; },
    replaceState: undefined as unknown as Replace,
  };
  const urlReplaced = vi.fn();
  const fakeWindow = { history, location, dispatchEvent: urlReplaced };
  history.replaceState = vm.runInNewContext(
    `${copies[0]}\n(${wrappers[0]})`,
    {
      window: fakeWindow,
      originalReplaceState: nativeReplace,
      applyUrlFromHistoryPushReplace: restoreUrl,
    },
  ) as Replace;
  vi.stubGlobal("window", fakeWindow);
  return { history, location, nativeReplace, restoreUrl, urlReplaced };
}

afterEach(() => vi.unstubAllGlobals());

describe("filter URL writes composed with the installed Next History wrapper", () => {
  it.each([false, true])("updates query context and preserves owner/Next keys with legacy marker=%s", legacy => {
    const original = Object.freeze({
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["events"] },
      __frederickRadiusLayer: "events-filters",
      __frederickRadiusLayerScrollY: 480,
      custom: "retained",
      ...(legacy ? { _N: true } : {}),
    });
    const h = installedNextHistory(original);
    const url = "/events?in=thurmont&lens=weekend&free=true";
    replaceHistoryLayerUrl(url);
    expect(h.restoreUrl).toHaveBeenCalledExactlyOnceWith(url);
    expect(h.nativeReplace).toHaveBeenCalledOnce();
    expect(h.history.state).toMatchObject({
      __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["events"] },
      __frederickRadiusLayer: "events-filters", __frederickRadiusLayerScrollY: 480, custom: "retained",
    });
    expect(h.history.state).not.toHaveProperty("_N");
    expect(h.urlReplaced).toHaveBeenCalledOnce();
    expect(new URL(h.location.href).searchParams.get("free")).toBe("true");
    expect(original).toHaveProperty("__NA", true);
  });

  it.each([null, "unexpected", 7, ["unexpected"]])("does not spread non-record prior state %j", state => {
    const h = installedNextHistory(state);
    replaceHistoryLayerUrl("/events?in=county");
    expect(h.nativeReplace).toHaveBeenCalledOnce();
    expect(h.restoreUrl).toHaveBeenCalledOnce();
    expect(h.history.state).toEqual({});
  });
});
