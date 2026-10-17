import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function fixture(t, css = COMPILED, html = '<link rel="stylesheet" href="/_next/static/chunks/current.css"/>') {
  const root = mkdtempSync(join(tmpdir(), "radius-built-css-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); return file; };
  write(".next/server/app/today.html", html);
  write(".next/static/chunks/current.css", css);
  return { root, write };
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
