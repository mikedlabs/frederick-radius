import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { chapterCssContractErrors, validateBuiltCssContract } from "./built-css-contract.mjs";

// Exact small rule excerpts, not whole production bundles. Local BUILD_ID
// 8Kr1rsxeIT3VvJXS7JHbX, 401043-byte CSS SHA256:
// 1a1bb2cf82ad519cc1a710372a379c7e35f34d7ecfc332b7cc90746619db1411.
const COMPILED = ".content-chapter__label{letter-spacing:.14em;flex:none;font-size:.625rem}.content-chapter__rule{background:linear-gradient(90deg,var(--content-chapter-accent),var(--app-border));flex:1;min-width:1.5rem;height:1px}.content-chapter--plain .content-chapter__label{overflow-wrap:anywhere;min-width:0;font-family:var(--font-sans),system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;flex:0 auto;font-size:.6875rem;font-weight:750}.content-chapter--plain .content-chapter__rule{background:var(--app-border);min-width:0}";
// Owner-approved protected read, byte-identical to prior public CSS. Original
// 400984-byte SHA256 ff98fdd381f0866f0d1b94d77783007d0db7f956c3a802055458872089c23656.
// Provenance: today-css-delivery-20261017/approved-protected-comparison.json.
const OLD_COMPILED = ".content-chapter__label{letter-spacing:.14em;flex:none;font-size:.625rem}.content-chapter__rule{background:linear-gradient(90deg,var(--content-chapter-accent),var(--app-border));flex:1;min-width:1.5rem;height:1px}.content-chapter--plain .content-chapter__label{font-family:var(--font-sans),system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;font-size:.6875rem;font-weight:750}.content-chapter--plain .content-chapter__rule{background:var(--app-border)}";
const errors = (css) => chapterCssContractErrors([{ href: "/_next/static/chunks/test.css", css }]);
const LABEL = ".content-chapter--plain .content-chapter__label";
const RULE = ".content-chapter--plain .content-chapter__rule";
const OWNER = { kind: "APP_PAGE", sourceRoute: "/(app)/today/page" };
// Exact key from the current full app's emitted today.meta and the independent
// installed-Next adapter fixture; this is not a duplicated hash algorithm.
const KEY = "/route-cache/APP_PAGE/00c17ba820f06f516bb2a4a6aa987ba7c9fa6ee5969bed7e86db819d47af9246/$/today";

function fixture(t, css = COMPILED, html = '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>', { scoped = false, output } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "radius-built-css-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); return file; };
  const json = (path, value) => write(path, JSON.stringify(value));
  const config = { distDir: ".next", ...(scoped ? { adapterPath: "<omitted but set>" } : {}), ...(output ? { output } : {}) };
  const prerender = { routeType: "page", response: "complete", compute: "static", dataRoute: "/today.rsc", srcRoute: "/today", initialRevalidateSeconds: 60 };
  const htmlPath = scoped && output !== "export" ? `.next/server${KEY}.html` : ".next/server/app/today.html";
  const metaPath = htmlPath.replace(/\.html$/, ".meta");
  json(".next/required-server-files.json", { version: 1, config });
  json(".next/prerender-manifest.json", { version: 4, routes: { "/today": prerender }, dynamicRoutes: {}, notFoundRoutes: [] });
  json(".next/app-path-routes-manifest.json", { [OWNER.sourceRoute]: "/today" });
  json(".next/server/app-paths-manifest.json", { [OWNER.sourceRoute]: "app/(app)/today/page.js" });
  json(metaPath, { routeCache: { key: KEY, owner: OWNER, isFallback: false } });
  write(htmlPath, html);
  write(".next/static/chunks/current.css", css);
  return { root, write, json, config, prerender, htmlPath, metaPath };
}

test("accepts the actual minified good excerpt, including flex:0 auto implicit shrink", () => {
  assert.deepEqual(errors(COMPILED), []);
});

test("rejects all four omissions in the actual old protected/public rule excerpt", () => {
  const failures = errors(OLD_COMPILED);
  assert.equal(failures.length, 4);
  assert.ok(failures.some((error) => error.includes("flex-shrink")));
  assert.ok(failures.some((error) => error.includes("overflow-wrap")));
  assert.equal(failures.filter((error) => error.includes("min-width")).length, 2);
});

test("handles comma-combined exact selectors and the expanded flex shorthand", () => {
  assert.deepEqual(errors(`${LABEL},.another{flex:0 1 auto;min-width:0px;overflow-wrap:anywhere}.another,${RULE}{min-width:0}`), []);
});

test("unrelated selector text cannot satisfy the exact plain chapter contract", () => {
  assert.equal(errors(COMPILED.replaceAll(".content-chapter--plain ", ".other ")).length, 4);
});

for (const condition of ["@media print", "@supports(display:flex)", "@container(width > 1px)", "@layer conditional-only"]) {
  test(`${condition} alone cannot establish unconditional base rules`, () => {
    assert.equal(errors(`${condition}{${COMPILED}}`).length, 4);
  });
}

test("later exact-rule resets and word-wrap alias overrides fail", () => {
  assert.ok(errors(COMPILED + `${LABEL}{flex:none}`).some((error) => error.includes("flex-shrink")));
  assert.ok(errors(COMPILED + `${LABEL}{word-wrap:normal}`).some((error) => error.includes("overflow-wrap")));
  assert.ok(errors(COMPILED + `${RULE}{min-width:1px}`).some((error) => error.includes("min-width")));
  assert.equal(errors(COMPILED + `${LABEL},${RULE}{all:unset}`).length, 4);
});

test("importance wins over later normal shorthand, and shorthand can reset shrink", () => {
  assert.ok(errors(COMPILED + `${LABEL}{flex-shrink:0!important;flex:0 auto}`).some((error) => error.includes("flex-shrink")));
  assert.deepEqual(errors(COMPILED + `${LABEL}{flex-shrink:1!important;flex:none}`), []);
  assert.ok(errors(COMPILED + `${LABEL}{flex-shrink:1;flex:0 0 auto}`).some((error) => error.includes("flex-shrink")));
});

test("invalid trailing-dot longhand cannot override flex:none into a passing shrink", () => {
  assert.ok(errors(COMPILED + `${LABEL}{flex:none;flex-shrink:1.}`).some((error) => error.includes("flex-shrink")));
});

test("invalid trailing-dot shorthand numbers cannot establish positive shrink", () => {
  for (const flex of ["0 1. auto", "1. auto"]) {
    assert.ok(errors(COMPILED + `${LABEL}{flex:none;flex:${flex}}`).some((error) => error.includes("flex-shrink")));
  }
});

test("valid fractional shrink still satisfies the emitted rule contract", () => {
  assert.deepEqual(errors(COMPILED + `${LABEL}{flex-shrink:.5}`), []);
  assert.deepEqual(errors(COMPILED + `${LABEL}{flex:0 0.5 auto}`), []);
});

test("malformed CSS and unresolved values cannot create a passing contract", () => {
  assert.ok(errors(COMPILED + ".broken{").some((error) => error.includes("Cannot parse")));
  assert.ok(errors(COMPILED + `${LABEL}{flex:var(--maybe)}`).some((error) => error.includes("flex-shrink")));
});

test("validates only CSS actually linked by Today, ignoring unreferenced good cache files", (t) => {
  const { root, write } = fixture(t, OLD_COMPILED);
  write(".next/static/chunks/stale-good.css", COMPILED);
  const result = validateBuiltCssContract(root);
  assert.equal(result.stylesheets.length, 1);
  assert.equal(result.stylesheets[0].href, "/_next/static/chunks/current.css");
  assert.equal(result.errors.length, 4);
});

test("reads current linked local CSS in HTML order, with repeated-selector overrides", (t) => {
  const { root, write } = fixture(t, COMPILED, '<link href="/_next/static/chunks/current.css" rel="stylesheet"/><link rel="stylesheet" href="/_next/static/chunks/last.css"/>');
  write(".next/static/chunks/last.css", `${LABEL}{flex-shrink:0}`);
  const result = validateBuiltCssContract(root);
  assert.equal(result.stylesheets.length, 2);
  assert.ok(result.errors.some((error) => error.includes("flex-shrink")));
});

test("real linked good bundle passes and preload/script/comment/print lookalikes do not", (t) => {
  const { root, write } = fixture(t);
  const result = validateBuiltCssContract(root);
  assert.deepEqual(result.errors, []);
  assert.match(result.stylesheets[0].sha256, /^[a-f0-9]{64}$/);
  write(".next/server/app/today.html", '<!-- <link rel="stylesheet" href="/_next/static/chunks/current.css"/> --><script>"<link rel=\'stylesheet\' href=\'/_next/static/chunks/current.css\'>"</script><link rel="preload" as="style" href="/_next/static/chunks/current.css"/><link rel="stylesheet" media="print" href="/_next/static/chunks/current.css"/>');
  assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("no unconditional stylesheet")));
});

for (const href of ["https://example.invalid/a.css", "//example.invalid/a.css", "/styles.css", "/_next/static/../outside.css", "/_next/static/%2e%2e/outside.css", "/_next/static/%2e%2e%2foutside.css", "/_next/static/%5coutside.css", "/_next/static/chunks/current.css?old=1", "/_next/static/chunks/current.css#old", "/_next/static/%ZZ.css"]) {
  test(`rejects unsafe/nonlocal stylesheet href ${href}`, (t) => {
    const { root } = fixture(t, COMPILED, `<link rel="stylesheet" href="${href}"/>`);
    assert.ok(validateBuiltCssContract(root).errors.length > 0);
  });
}

test("rejects linked CSS symlinks outside the current .next output", (t) => {
  const { root, write } = fixture(t);
  const outside = write("outside.css", COMPILED);
  rmSync(join(root, ".next/static/chunks/current.css"));
  symlinkSync(outside, join(root, ".next/static/chunks/current.css"));
  assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("escapes current .next")));
});

test("rejects an escaped Today HTML symlink and missing HTML without cache fallbacks", (t) => {
  const { root, write } = fixture(t);
  const outside = write("outside.html", '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>');
  rmSync(join(root, ".next/server/app/today.html"));
  assert.ok(validateBuiltCssContract(root).errors.length > 0);
  symlinkSync(outside, join(root, ".next/server/app/today.html"));
  assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("escapes current .next")));
});


test("legacy build records its manifest-derived Today owner and exact HTML", (t) => {
  const { root } = fixture(t);
  const result = validateBuiltCssContract(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.layout, "legacy-app");
  assert.deepEqual(result.owner, OWNER);
  assert.equal(result.routeCacheKey, KEY);
  assert.equal(result.htmlPath, join(root, ".next/server/app/today.html"));
});

test("adapter build reads only Next's exact scoped HTML with a redacted adapter marker", (t) => {
  const { root, htmlPath } = fixture(t, COMPILED, undefined, { scoped: true });
  const result = validateBuiltCssContract(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.layout, "scoped-route-cache");
  assert.deepEqual(result.owner, OWNER);
  assert.equal(result.routeCacheKey, KEY);
  assert.equal(result.htmlPath, join(root, htmlPath));
  assert.equal(result.stylesheets.length, 1);
});

test("unreferenced legacy good HTML and CSS cannot rescue bad selected scoped CSS", (t) => {
  const { root, write } = fixture(t, OLD_COMPILED, undefined, { scoped: true });
  write(".next/server/app/today.html", '<link rel="stylesheet" href="/_next/static/chunks/stale-good.css"/>');
  write(".next/static/chunks/stale-good.css", COMPILED);
  const result = validateBuiltCssContract(root);
  assert.equal(result.errors.length, 4);
  assert.equal(result.stylesheets[0].href, "/_next/static/chunks/current.css");
});

test("missing selected scoped HTML fails even when a legacy good HTML exists", (t) => {
  const { root, write, htmlPath } = fixture(t, COMPILED, undefined, { scoped: true });
  write(".next/server/app/today.html", '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>');
  rmSync(join(root, htmlPath));
  const result = validateBuiltCssContract(root);
  assert.ok(result.errors.some((error) => error.includes("ENOENT")));
  assert.equal(result.layout, "scoped-route-cache");
  assert.equal(result.stylesheets.length, 0);
});

test("non-adapter config cannot fall back to available scoped HTML", (t) => {
  const { root, json } = fixture(t, COMPILED, undefined, { scoped: true });
  json(".next/required-server-files.json", { version: 1, config: { distDir: ".next" } });
  const result = validateBuiltCssContract(root);
  assert.equal(result.layout, "legacy-app");
  assert.ok(result.errors.some((error) => error.includes("ENOENT")));
  assert.equal(result.stylesheets.length, 0);
});

test("export output does not select scoped layout even with an adapter configured", (t) => {
  const { root } = fixture(t, COMPILED, undefined, { scoped: true, output: "export" });
  const result = validateBuiltCssContract(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.layout, "legacy-app");
});

for (const invalid of ["missing", "malformed", "config-missing", "adapter-not-string"]) {
  test(`does not guess layout when emitted config is ${invalid}`, (t) => {
    const { root, write, json } = fixture(t);
    if (invalid === "missing") rmSync(join(root, ".next/required-server-files.json"));
    else if (invalid === "malformed") write(".next/required-server-files.json", "{");
    else json(".next/required-server-files.json", invalid === "config-missing" ? {} : { config: { adapterPath: {} } });
    const result = validateBuiltCssContract(root);
    assert.ok(result.errors.length > 0);
    assert.equal(result.stylesheets.length, 0);
  });
}

for (const [name, change] of [
  ["dynamic computation", { compute: "dynamic" }],
  ["partial response", { response: "partial" }],
  ["route-handler identity", { routeType: "route", dataRoute: null }],
  ["wrong RSC route", { dataRoute: "/other.rsc" }],
  ["wrong source", { srcRoute: "/other" }],
  ["zero revalidation", { initialRevalidateSeconds: 0 }],
]) {
  test(`rejects a Today prerender with ${name}`, (t) => {
    const { root, json, prerender } = fixture(t);
    json(".next/prerender-manifest.json", { routes: { "/today": { ...prerender, ...change } }, dynamicRoutes: {}, notFoundRoutes: [] });
    assert.ok(validateBuiltCssContract(root).errors.length > 0);
  });
}

test("notFound or dynamic Today records cannot pass via an existing good HTML", (t) => {
  const { root, json, prerender } = fixture(t);
  json(".next/prerender-manifest.json", { routes: { "/today": prerender }, notFoundRoutes: ["/today"] });
  assert.ok(validateBuiltCssContract(root).errors.length > 0);
  json(".next/prerender-manifest.json", { routes: { "/today": prerender }, dynamicRoutes: { "/today": {} } });
  assert.ok(validateBuiltCssContract(root).errors.length > 0);
});

test("owner must be unique and shared by both emitted app manifests", (t) => {
  const { root, json } = fixture(t);
  json(".next/app-path-routes-manifest.json", { [OWNER.sourceRoute]: "/today", "/today/page": "/today" });
  assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("one APP_PAGE owner")));
  json(".next/app-path-routes-manifest.json", { [OWNER.sourceRoute]: "/today" });
  json(".next/server/app-paths-manifest.json", { "/other/page": "app/other/page.js" });
  assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("one APP_PAGE owner")));
});

for (const [name, routeCache] of [
  ["wrong key", { key: KEY + "-stale", owner: OWNER, isFallback: false }],
  ["wrong owner", { key: KEY, owner: { kind: "APP_PAGE", sourceRoute: "/other/page" }, isFallback: false }],
  ["wrong kind", { key: KEY, owner: { ...OWNER, kind: "APP_ROUTE" }, isFallback: false }],
  ["fallback HTML", { key: KEY, owner: OWNER, isFallback: true }],
]) {
  test(`rejects scoped metadata with ${name}`, (t) => {
    const { root, json, metaPath } = fixture(t, COMPILED, undefined, { scoped: true });
    json(metaPath, { routeCache });
    assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("metadata must match")));
  });
}

for (const path of [".next/required-server-files.json", ".next/prerender-manifest.json", ".next/app-path-routes-manifest.json", ".next/server/app-paths-manifest.json"]) {
  test(`rejects manifest symlink outside current output: ${path}`, (t) => {
    const { root, write } = fixture(t);
    const outside = write("outside.json", "{}");
    rmSync(join(root, path));
    symlinkSync(outside, join(root, path));
    assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("escapes current .next")));
  });
}

test("scoped HTML and metadata remain contained in current output", (t) => {
  const { root, write, htmlPath, metaPath } = fixture(t, COMPILED, undefined, { scoped: true });
  const outsideHtml = write("outside.html", '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>');
  rmSync(join(root, htmlPath));
  symlinkSync(outsideHtml, join(root, htmlPath));
  assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("escapes current .next")));
  rmSync(join(root, htmlPath));
  write(htmlPath, '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>');
  const outsideMeta = write("outside.meta", JSON.stringify({ routeCache: { key: KEY, owner: OWNER, isFallback: false } }));
  rmSync(join(root, metaPath));
  symlinkSync(outsideMeta, join(root, metaPath));
  assert.ok(validateBuiltCssContract(root).errors.some((error) => error.includes("escapes current .next")));
});
