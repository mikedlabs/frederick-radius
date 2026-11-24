import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { chapterCssContractErrors, sharedPressCssContractErrors, validateBuiltCssContract } from "./built-css-contract.mjs";

// Exact small rule excerpts, not whole production bundles. Local BUILD_ID
// 8Kr1rsxeIT3VvJXS7JHbX, 401043-byte CSS SHA256:
// 1a1bb2cf82ad519cc1a710372a379c7e35f34d7ecfc332b7cc90746619db1411.
const COMPILED = ".content-chapter__label{letter-spacing:.14em;flex:none;font-size:.625rem}.content-chapter__rule{background:linear-gradient(90deg,var(--content-chapter-accent),var(--app-border));flex:1;min-width:1.5rem;height:1px}.content-chapter--plain .content-chapter__label{overflow-wrap:anywhere;min-width:0;font-family:var(--font-sans),system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;flex:0 auto;font-size:.6875rem;font-weight:750}.content-chapter--plain .content-chapter__rule{background:var(--app-border);min-width:0}";
// Owner-approved protected read, byte-identical to prior public CSS. Original
// 400984-byte SHA256 ff98fdd381f0866f0d1b94d77783007d0db7f956c3a802055458872089c23656.
// Provenance: today-css-delivery-20261017/approved-protected-comparison.json.
const OLD_COMPILED = ".content-chapter__label{letter-spacing:.14em;flex:none;font-size:.625rem}.content-chapter__rule{background:linear-gradient(90deg,var(--content-chapter-accent),var(--app-border));flex:1;min-width:1.5rem;height:1px}.content-chapter--plain .content-chapter__label{font-family:var(--font-sans),system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase;font-size:.6875rem;font-weight:750}.content-chapter--plain .content-chapter__rule{background:var(--app-border)}";
// Minified delivery fixture for the new shared controls. Both quoted and
// unquoted attribute values must survive the emitted-rule parser.
const PRESS_COMPILED = '[data-press-target]{transform:none;scale:1;cursor:pointer}[data-press-target][data-press-target]:is(:hover,:active,:focus-visible){transform:none;scale:1}[data-press-target]>[data-press-face]{transform-origin:50%;transition:transform var(--app-dur-fast) var(--app-ease-out),opacity var(--app-dur-fast) var(--app-ease-out)}[data-press-target]:where(:not(:disabled):not([aria-disabled="true"])):active>[data-press-face]{transform:scale(var(--press-scale,.985))}[data-press-target][data-press-target]:where(:not(:disabled):not([aria-disabled=true])):active{box-shadow:inset 0 0 0 2px var(--press-ack-color,var(--app-focus))}[data-press-target]:has(>[data-link-pending=true]){box-shadow:inset 0 0 0 2px var(--press-ack-color,var(--app-focus))}[data-press-target][data-press-target]:focus-visible{outline:2px solid var(--press-focus-color,var(--app-focus));outline-offset:var(--press-focus-offset,3px)}';
// Actual minifier merge: its :has(input:focus-visible) branch gives the
// global :is() specificity 0,2,1, above the former target-only 0,2,0 rule.
const GLOBAL_FOCUS_COMPETITOR = ":is(:focus-visible,.search-field-shell:has(input:focus-visible)){outline:2px solid var(--app-focus);outline-offset:2px}";
const PRESS_REDUCED = '@media (prefers-reduced-motion:reduce){[data-press-target],[data-press-target]>[data-press-face],[data-press-target]:active>[data-press-face]{transform:none;scale:1;transition:none}}';
const PRESS_CSS = PRESS_COMPILED + PRESS_REDUCED;
const pressErrors = (css) => sharedPressCssContractErrors([{ href: "/_next/static/chunks/test.css", css }]);
const errors = (css) => chapterCssContractErrors([{ href: "/_next/static/chunks/test.css", css }]);
const LABEL = ".content-chapter--plain .content-chapter__label";
const RULE = ".content-chapter--plain .content-chapter__rule";
const OWNER = { kind: "APP_PAGE", sourceRoute: "/(app)/today/page" };
const STYLE_LINK = '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>';

const fixtureSubjects = {
  walks: [{ downtown: "/images/seasons/summer/SUMMER CARROL CREEK.jpg", downtownHref: "/today/two-hours-downtown" }],
  places: { brunswick: { slug: "co-canal-lock-30-brunswick", src: "/history-photos/co-canal.jpg" } },
};
function documents(styles) {
  const photo = '<a href="/today/two-hours-downtown"><span data-today-feature-photo><img src="/images/seasons/summer/SUMMER CARROL CREEK.jpg" alt="Carroll Creek"></span></a>';
  const lock = '<a data-today-geographic-place="co-canal-lock-30-brunswick" href="/places/co-canal-lock-30-brunswick?in=brunswick"><img alt="Lock 30" src="/history-photos/co-canal.jpg"></a>';
  const map = area => `<a data-today-map-link href="/map?in=${area}"><figure data-county-locator><figcaption>${area === "nearme" ? "Frederick County" : "Town center: Mount Airy"}</figcaption><svg role="img">${area === "nearme" ? "" : '<g data-locator-selection="Town center"></g>'}</svg></figure></a>`;
  return [
    ["county", "/today", photo], ["brunswick", "/today", lock],
    ["mount-airy", "/today?in=mount-airy", map("mount-airy")], ["nearme", "/today?in=nearme", map("nearme")],
  ].map(([area, path, content]) => ({ area, path, html: `<!doctype html><html><head>${styles}</head><body><main><section data-today-local-discovery>${content}</section></main></body></html>` }));
}

function validate(root) {
  return validateBuiltCssContract(root, documents(readFileSync(join(root, "fixture-links.html"), "utf8")), fixtureSubjects);
}

function fixture(t, css = COMPILED, html = STYLE_LINK, { pressCss = PRESS_CSS } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "radius-built-css-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); return file; };
  const json = (path, value) => write(path, JSON.stringify(value));
  json(".next/required-server-files.json", { version: 1, config: { distDir: ".next" } });
  json(".next/prerender-manifest.json", { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [] });
  json(".next/app-path-routes-manifest.json", { [OWNER.sourceRoute]: "/today" });
  json(".next/server/app-paths-manifest.json", { [OWNER.sourceRoute]: "app/(app)/today/page.js" });
  write(".next/server/app/(app)/today/page.js", "// compiled APP_PAGE fixture");
  write("fixture-links.html", html);
  write(".next/static/chunks/current.css", css + pressCss);
  return { root, write, json };
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
  const result = validate(root);
  assert.equal(result.stylesheets.length, 1);
  assert.equal(result.stylesheets[0].href, "/_next/static/chunks/current.css");
  assert.equal(result.errors.length, 4);
});

test("reads current linked local CSS in HTML order, with repeated-selector overrides", (t) => {
  const { root, write } = fixture(t, COMPILED, '<link href="/_next/static/chunks/current.css" rel="stylesheet"/><link rel="stylesheet" href="/_next/static/chunks/last.css"/>');
  write(".next/static/chunks/last.css", `${LABEL}{flex-shrink:0}`);
  const result = validate(root);
  assert.equal(result.stylesheets.length, 2);
  assert.ok(result.errors.some((error) => error.includes("flex-shrink")));
});

test("real linked good bundle passes and preload/script/comment/print lookalikes do not", (t) => {
  const { root, write } = fixture(t);
  const result = validate(root);
  assert.deepEqual(result.errors, []);
  assert.match(result.stylesheets[0].sha256, /^[a-f0-9]{64}$/);
  write("fixture-links.html", '<!-- <link rel="stylesheet" href="/_next/static/chunks/current.css"/> --><script>"<link rel=\'stylesheet\' href=\'/_next/static/chunks/current.css\'>"</script><link rel="preload" as="style" href="/_next/static/chunks/current.css"/><link rel="stylesheet" media="print" href="/_next/static/chunks/current.css"/>');
  assert.ok(validate(root).errors.some((error) => error.includes("no unconditional stylesheet")));
});

for (const href of ["https://example.invalid/a.css", "//example.invalid/a.css", "/styles.css", "/_next/static/../outside.css", "/_next/static/%2e%2e/outside.css", "/_next/static/%2e%2e%2foutside.css", "/_next/static/%5coutside.css", "/_next/static/chunks/current.css?old=1", "/_next/static/chunks/current.css#old", "/_next/static/%ZZ.css"]) {
  test(`rejects unsafe/nonlocal stylesheet href ${href}`, (t) => {
    const { root } = fixture(t, COMPILED, `<link rel="stylesheet" href="${href}"/>`);
    assert.ok(validate(root).errors.length > 0);
  });
}

test("rejects linked CSS symlinks outside the current .next output", (t) => {
  const { root, write } = fixture(t);
  const outside = write("outside.css", COMPILED);
  rmSync(join(root, ".next/static/chunks/current.css"));
  symlinkSync(outside, join(root, ".next/static/chunks/current.css"));
  assert.ok(validate(root).errors.some((error) => error.includes("escapes current .next")));
});

test("records the manifest-derived APP_PAGE and four request-specific stylesheet lists", t => {
  const { root } = fixture(t);
  const result = validate(root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.owner, OWNER);
  assert.equal(result.layout, "request-rendered");
  assert.deepEqual(result.documents.map(doc => doc.area), ["county", "brunswick", "mount-airy", "nearme"]);
  assert.equal(result.stylesheets.length, 1);
  assert.ok(result.stylesheets[0].bytes > 0);
});

test("checks what the server served even when leftover static HTML links valid styles", t => {
  const { root, write } = fixture(t, OLD_COMPILED);
  write(".next/server/app/today.html", '<link rel="stylesheet" href="/_next/static/chunks/stale-good.css"/>');
  write(".next/static/chunks/stale-good.css", COMPILED + PRESS_CSS);
  assert.equal(validate(root).errors.length, 4);
});

for (const [name, manifest] of [
  ["static county page", { routes: { "/today": { dataRoute: "/today.rsc", initialRevalidateSeconds: 300 } }, dynamicRoutes: {}, notFoundRoutes: [] }],
  ["not found", { routes: {}, dynamicRoutes: {}, notFoundRoutes: ["/today"] }],
  ["catchall route", { routes: {}, dynamicRoutes: { "/today": {} }, notFoundRoutes: [] }],
  ["missing routes", {}],
]) {
  test(`rejects ${name} despite a good stylesheet`, t => {
    const { root, json } = fixture(t);
    json(".next/prerender-manifest.json", manifest);
    assert.match(validate(root).errors[0], /must render its exact request area/);
  });
}

test("the route owner must be unique and shared by both emitted manifests", t => {
  const { root, json } = fixture(t);
  json(".next/app-path-routes-manifest.json", { [OWNER.sourceRoute]: "/today", "/today/page": "/today" });
  assert.match(validate(root).errors[0], /one APP_PAGE owner/);
  json(".next/app-path-routes-manifest.json", { [OWNER.sourceRoute]: "/today" });
  json(".next/server/app-paths-manifest.json", { [OWNER.sourceRoute]: "app/other/page.js" });
  assert.match(validate(root).errors[0], /one APP_PAGE owner/);
});

for (const path of [".next/required-server-files.json", ".next/prerender-manifest.json", ".next/app-path-routes-manifest.json", ".next/server/app-paths-manifest.json", ".next/server/app/(app)/today/page.js"]) {
  test(`rejects a missing or escaped current build artifact: ${path}`, t => {
    const { root, write } = fixture(t);
    const outside = write("outside", "{}");
    rmSync(join(root, path));
    assert.match(validate(root).errors[0], /ENOENT/);
    symlinkSync(outside, join(root, path));
    assert.match(validate(root).errors[0], /escapes current .next/);
  });
}

test("only the exact emitted deployment token is allowed on local assets", t => {
  const { root, json } = fixture(t);
  json(".next/required-server-files.json", { config: { deploymentId: "dpl_test123" } });
  const response = suffix => validateBuiltCssContract(root, documents(STYLE_LINK.replace("current.css", `current.css${suffix}`)), fixtureSubjects);
  assert.deepEqual(response("?dpl=dpl_test123").errors, []);
  for (const suffix of ["?dpl=dpl_stale", "?x=1&dpl=dpl_test123", "?dpl=dpl_test123&v=1", "#dpl_test123"]) assert.ok(response(suffix).errors.length);
});

test("checks the actual runtime deployment token even after Next strips it from the build manifest", t => {
  const { root, json } = fixture(t);
  const config = { deploymentId: "", experimental: { runtimeServerDeploymentId: true } };
  const css = token => documents(STYLE_LINK.replace("current.css", `current.css?dpl=${token}`));
  json(".next/required-server-files.json", { config });
  for (const env of [{ NEXT_DEPLOYMENT_ID: "dpl_test" }, { VERCEL_DEPLOYMENT_ID: "dpl_test" }]) {
    assert.deepEqual(validateBuiltCssContract(root, css("dpl_test"), fixtureSubjects, env).errors, []);
    assert.ok(validateBuiltCssContract(root, css("dpl_stale"), fixtureSubjects, env).errors.length);
    assert.ok(validateBuiltCssContract(root, css("dpl_test&v=1"), fixtureSubjects, env).errors.length);
  }
  json(".next/required-server-files.json", { config: { ...config, supportsImmutableAssets: true } });
  assert.ok(validateBuiltCssContract(root, css("dpl_test"), fixtureSubjects, { NEXT_DEPLOYMENT_ID: "dpl_test" }).errors.length);
  assert.deepEqual(validateBuiltCssContract(root, documents(STYLE_LINK), fixtureSubjects, { NEXT_DEPLOYMENT_ID: "dpl_test" }).errors, []);
});

test("rejects stale, hidden, incomplete and cross-area page responses", t => {
  const { root } = fixture(t);
  const docs = documents(STYLE_LINK);
  const check = responses => assert.ok(validateBuiltCssContract(root, responses, fixtureSubjects).errors.length > 0);
  check(docs.slice(1));
  check([docs[0], docs[0], docs[2], docs[3]]);
  for (const [index, html] of [[1, docs[0].html], [2, docs[3].html], [3, docs[2].html],
    [2, docs[2].html.replace("Town center: Mount Airy", "Town center: Thurmont")],
    [0, docs[0].html.replace("<main>", "<main hidden>")],
    [0, docs[0].html.replace("<section data-today-local-discovery>", "<template><section data-today-local-discovery>")],
    [0, docs[0].html.replace("/images/seasons/summer/", "https://example.invalid/images/seasons/summer/")]]) {
    check(docs.map((doc, i) => i === index ? { ...doc, html } : doc));
  }
});

test("accepts a new published seasonal image and holiday destination as a pair", t => {
  const { root } = fixture(t);
  const docs = documents(STYLE_LINK);
  const holiday = { downtown: "/images/new-local-creek.jpg", downtownHref: "/today/two-hours-downtown?day=2026-11-26" };
  docs[0].html = docs[0].html.replace(fixtureSubjects.walks[0].downtown, holiday.downtown)
    .replace('href="/today/two-hours-downtown"', `href="${holiday.downtownHref}&amp;returnTo=%2Ftoday"`);
  assert.deepEqual(validateBuiltCssContract(root, docs, { ...fixtureSubjects, walks: [holiday] }).errors, []);
  assert.ok(validateBuiltCssContract(root, docs, fixtureSubjects).errors.length > 0);
});

test("a variant with missing or reversed CSS cannot be rescued by the default response", t => {
  const { root, write } = fixture(t);
  write(".next/static/chunks/reversed.css", `${LABEL}{flex-shrink:0}`);
  const docs = documents(STYLE_LINK);
  docs[1].html = docs[1].html.replace(STYLE_LINK, `${STYLE_LINK}<link rel="stylesheet" href="/_next/static/chunks/reversed.css">`);
  assert.match(validateBuiltCssContract(root, docs, fixtureSubjects).errors[0], /flex-shrink/);
  docs[1].html = docs[1].html.replace(/<head>.*?<\/head>/, "<head></head>");
  assert.match(validateBuiltCssContract(root, docs, fixtureSubjects).errors[0], /brunswick has no unconditional/);
});

test("accepts the complete minified shared-press delivery contract", () => {
  assert.deepEqual(pressErrors(PRESS_CSS), []);
});

test("rejects weak shared focus ownership beside the minified global focus competitor", () => {
  const weak = PRESS_CSS.replaceAll("[data-press-target][data-press-target]:focus-visible", "[data-press-target]:focus-visible");
  for (const css of [GLOBAL_FOCUS_COMPETITOR + weak, weak + GLOBAL_FOCUS_COMPETITOR]) {
    const failures = pressErrors(css);
    assert.equal(failures.length, 2);
    assert.ok(failures.some(error => error.includes("[data-press-target][data-press-target]:focus-visible outline ")));
    assert.ok(failures.some(error => error.includes("[data-press-target][data-press-target]:focus-visible outline-offset ")));
  }
});

test("accepts owned shared focus above the minified global competitor in either delivery order", () => {
  for (const css of [GLOBAL_FOCUS_COMPETITOR + PRESS_CSS, PRESS_CSS + GLOBAL_FOCUS_COMPETITOR]) {
    assert.deepEqual(pressErrors(css), []);
  }
});

test("linked weak focus cannot be rescued by a stronger unlinked stylesheet", t => {
  const weak = PRESS_CSS.replaceAll("[data-press-target][data-press-target]:focus-visible", "[data-press-target]:focus-visible");
  const { root, write } = fixture(t, COMPILED, undefined, { pressCss: GLOBAL_FOCUS_COMPETITOR + weak });
  write(".next/static/chunks/unlinked-owned-focus.css", PRESS_CSS);
  const failures = validate(root).errors;
  assert.equal(failures.length, 2);
  assert.ok(failures.every(error => error.includes("[data-press-target][data-press-target]:focus-visible outline")));
});

test("accepts Lightning CSS identity-transform lowering from the fresh emitted bundle", () => {
  // Fresh 1vlz4j-kozx3d.css folds both properties into transform:scale(1).
  const lowered = PRESS_CSS.replaceAll("transform:none;scale:1", "transform:scale(1)")
    .replaceAll("var(--app-dur-fast) var", "var(--app-dur-fast)var");
  assert.deepEqual(pressErrors(lowered), []);
  assert.ok(pressErrors(lowered + "[data-press-target]{scale:.97}").length > 0);
});

test("shared hooks in markup or comments do not establish emitted interaction rules", () => {
  assert.ok(pressErrors('/* [data-press-target]{transform:none} */ [data-something-else]{transform:none}').length > 0);
});

for (const [property, badValue] of [["transform:none", "transform:scale(.97)"], ["scale:1", "scale:.97"],
  ["transform:scale(var(--press-scale,.985))", "transform:none"],
  ["transition:none", "transition:transform 200ms"], ["outline:2px solid", "outline:0 solid"]]) {
  test(`rejects a shared-press property regression: ${badValue}`, () => {
    assert.ok(pressErrors(PRESS_CSS.replace(property, badValue)).length > 0);
  });
}

test("requires reduced-motion declarations, not a comment or wrong media condition", () => {
  assert.ok(pressErrors(PRESS_COMPILED).some(error => error.includes("Shared press reduced")));
  assert.ok(pressErrors(PRESS_CSS.replace("prefers-reduced-motion:reduce", "prefers-reduced-motion:no-preference")).length > 0);
  assert.ok(pressErrors(PRESS_COMPILED + `@supports(display:flex){${PRESS_REDUCED}}`).length > 0);
});

test("reduced-motion overrides must follow normal motion and respect importance", () => {
  assert.ok(pressErrors(PRESS_REDUCED + PRESS_COMPILED).some(error => error.includes("must override")));
  assert.ok(pressErrors(PRESS_CSS.replace("transform:scale(var(--press-scale,.985))", "transform:scale(var(--press-scale,.985))!important"))
    .some(error => error.includes("must override")));
});

test("later exact shared-press resets fail the contract", () => {
  assert.ok(pressErrors(PRESS_CSS + "[data-press-target]{all:unset}").length > 0);
  assert.ok(pressErrors(PRESS_CSS + "[data-press-target]:has(>[data-link-pending=true]){all:unset}").length > 0);
  assert.ok(pressErrors(PRESS_CSS + "@media(prefers-reduced-motion:reduce){[data-press-target]:active>[data-press-face]{transform:scale(.97)}}")
    .some(error => error.includes("transform")));
});

for (const condition of ["@media print", "@supports(display:flex)", "@container(width > 1px)", "@layer source-only"]) {
  test(`conditional shared-press rules cannot establish base delivery: ${condition}`, () => {
    assert.ok(pressErrors(`${condition}{${PRESS_COMPILED}}${PRESS_REDUCED}`).some(error => error.includes("Shared press base")));
  });
}

test("build rejects source-only shared-press styles even with updated markup hooks", t => {
  const { root, write } = fixture(t, COMPILED, '<link rel="stylesheet" href="/_next/static/chunks/current.css"/><button data-press-target="control"><span data-press-face>Save</span></button>', { pressCss: "" });
  write("src/app/globals.css", PRESS_CSS);
  assert.ok(validate(root).errors.some(error => error.includes("Shared press base")));
});

test("unlinked good shared-press chunks cannot rescue the linked bundle", t => {
  const { root, write } = fixture(t, COMPILED, undefined, { pressCss: "" });
  write(".next/static/chunks/unlinked-good.css", PRESS_CSS);
  assert.ok(validate(root).errors.some(error => error.includes("Shared press base")));
});

test("conditional stylesheet links cannot rescue missing shared-press base CSS", t => {
  const { root, write } = fixture(t, COMPILED, '<link rel="stylesheet" href="/_next/static/chunks/current.css"/><link rel="stylesheet" media="print" href="/_next/static/chunks/conditional.css"/>', { pressCss: "" });
  write(".next/static/chunks/conditional.css", PRESS_CSS);
  const result = validate(root);
  assert.equal(result.stylesheets.length, 1);
  assert.ok(result.errors.some(error => error.includes("Shared press base")));
});

test("shared-press rules may be split across unconditional linked stylesheets in delivery order", t => {
  const { root, write } = fixture(t, COMPILED, '<link rel="stylesheet" href="/_next/static/chunks/current.css"/><link rel="stylesheet" href="/_next/static/chunks/reduced.css"/>', { pressCss: PRESS_COMPILED });
  write(".next/static/chunks/reduced.css", PRESS_REDUCED);
  assert.deepEqual(validate(root).errors, []);
  write(".next/static/chunks/reduced.css", "");
  assert.match(validate(root).errors[0], /stylesheet is empty/);
  write(".next/static/chunks/reduced.css", "/* No reduced-motion rules */");
  assert.ok(validate(root).errors.some(error => error.includes("Shared press reduced")));
});
