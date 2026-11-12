import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareVisualFixtureArtifact } from "./visual-fixture-artifact.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ6kAAAAASUVORK5CYII=", "base64");
const CASES = [
  ["today-map-visual-depth-county-arrival-photo", "today390-arrival-fixture.png"],
  ["today-map-visual-depth-selected-map-photo", "map320-owned-photo-metadata-pending-fixture.png"],
  ["events-nearby-visual-cards-local-discovery-photo", "events-390-discovery.png"],
];
const temporary = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture(engine = "chromium", retries = false) {
  const root = mkdtempSync(join(tmpdir(), "fr-visual-evidence-"));
  temporary.push(root);
  mkdirSync(join(root, "test-results"));
  const files = [];
  for (const [name, png] of CASES) {
    for (const retry of retries ? ["", "-retry1"] : [""]) {
      const folder = join(root, "test-results", `${name}-${engine}${retry}`);
      mkdirSync(folder);
      const path = join(folder, png);
      writeFileSync(path, PNG);
      files.push(path);
    }
  }
  return { root, files };
}
function outputFiles(root) {
  return readdirSync(root, { recursive: true }).filter((name) => lstatSync(join(root, name)).isFile());
}

test("copies only the three exact regular PNGs, never logs, receipts or traces", () => {
  const { root, files } = fixture();
  for (const name of ["runtime.json", "trace.zip", "console.log", ".env"]) writeFileSync(join(root, "test-results", name), "private non-image fixture");
  writeFileSync(join(root, "test-results", CASES[0][0] + "-chromium", "receipt.json"), "private receipt");
  const result = prepareVisualFixtureArtifact(root, "chromium");
  assert.equal(result.count, 3);
  assert.equal(result.bytes, PNG.length * 3);
  assert.deepEqual(outputFiles(result.output).map((path) => path.split(/[\\/]/).at(-1)).sort(), CASES.map((entry) => entry[1]).sort());
  for (const source of files) {
    const relative = source.slice(join(root, "test-results").length + 1);
    assert.deepEqual(readFileSync(join(result.output, relative)), PNG);
  }
});

test("allows six PNGs with one retry and preserves the attempt directories", () => {
  const { root } = fixture("webkit-mobile", true);
  const result = prepareVisualFixtureArtifact(root, "webkit-mobile");
  assert.equal(result.count, 6);
  assert.equal(outputFiles(result.output).filter((name) => name.includes("-retry1")).length, 3);
});

test("accepts changed title/hash text without changing the three basename allowlist", () => {
  const { root } = fixture("chromium", true);
  for (const suffix of ["", "-retry1"]) {
    renameSync(join(root, "test-results", CASES[0][0] + "-chromium" + suffix),
      join(root, "test-results", "today-map-visual-depth-new-human-title-9c3ab-chromium" + suffix));
  }
  assert.equal(prepareVisualFixtureArtifact(root, "chromium").count, 6);
});

for (const attempt of ["", "-retry1"]) {
  test(`rejects another case stem claiming the same basename (${attempt || "normal"})`, () => {
    const { root } = fixture("chromium", Boolean(attempt));
    const duplicate = join(root, "test-results", "today-map-visual-depth-another-case-chromium" + attempt);
    mkdirSync(duplicate);
    writeFileSync(join(duplicate, CASES[0][1]), PNG);
    assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /Multiple case stems/);
  });
}

test("requires normal and retry captures of each basename to share one case stem", () => {
  const { root } = fixture("chromium", true);
  renameSync(join(root, "test-results", CASES[0][0] + "-chromium-retry1"),
    join(root, "test-results", "today-map-visual-depth-different-retry-case-chromium-retry1"));
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /Multiple case stems/);
});

test("keeps exact engine and spec ownership while ignoring unrelated captures", () => {
  const { root } = fixture();
  for (const name of ["unrelated-spec-case-chromium", "today-map-visual-depth-case-webkit-mobile"]) {
    const folder = join(root, "test-results", name);
    mkdirSync(folder); writeFileSync(join(folder, CASES[0][1]), PNG);
  }
  const unrelated = join(root, "test-results", "today-map-visual-depth-other-picture-chromium");
  mkdirSync(unrelated); writeFileSync(join(unrelated, "today320-enlarged-native-scroll-fixture.png"), PNG);
  assert.equal(prepareVisualFixtureArtifact(root, "chromium").count, 3);
});

test("rejects a known PNG basename under the wrong owning spec", () => {
  const { root } = fixture();
  const wrong = join(root, "test-results", "events-nearby-visual-cards-wrong-photo-chromium");
  mkdirSync(wrong); writeFileSync(join(wrong, CASES[0][1]), PNG);
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /owning spec prefix/);
});

test("accepts a passed retry when the earlier attempt failed before capture", () => {
  const { root, files } = fixture("chromium", true);
  rmSync(files[0]);
  assert.equal(prepareVisualFixtureArtifact(root, "chromium").count, 5);
});

test("requires each expected basename, even if two other cases have retries", () => {
  const { root, files } = fixture("chromium", true);
  rmSync(files[0]); rmSync(files[1]);
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /Missing expected fixture PNG/);
  assert.equal(readdirSync(root).includes("ci-visual-fixtures"), false);
});

test("rejects unknown engine, basename and extra attempts rather than widening selection", () => {
  const { root, files } = fixture();
  assert.throws(() => prepareVisualFixtureArtifact(root, "firefox"), /Unknown evidence engine/);
  writeFileSync(join(root, "test-results", CASES[0][0] + "-chromium", "unknown.png"), PNG);
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /Unknown PNG basename/);
  rmSync(join(root, "test-results", CASES[0][0] + "-chromium", "unknown.png"));
  mkdirSync(join(root, "test-results", CASES[0][0] + "-chromium-retry2"));
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /maximum one retry/);
  assert.equal(readFileSync(files[0]).equals(PNG), true);
});

for (const kind of ["results directory", "case directory", "PNG file"]) {
  test(`rejects a symlink at the ${kind}`, () => {
    const { root, files } = fixture();
    const target = kind === "results directory" ? join(root, "test-results")
      : kind === "case directory" ? join(root, "test-results", CASES[0][0] + "-chromium") : files[0];
    const backup = join(root, "preserved-original");
    if (kind === "PNG file") { writeFileSync(backup, PNG); rmSync(target); }
    else { rmSync(target, { recursive: true }); mkdirSync(backup); }
    symlinkSync(backup, target);
    assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /symlink/i);
  });
}

test("rejects a directory masquerading as a PNG", () => {
  const { root, files } = fixture();
  rmSync(files[0]); mkdirSync(files[0]);
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /regular file/);
});

test("rejects renamed non-PNG bytes before creating upload output", () => {
  const { root, files } = fixture();
  writeFileSync(files[0], "not a PNG; must never be uploaded");
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /identified PNG/);
  assert.equal(readdirSync(root).includes("ci-visual-fixtures"), false);
});

for (const [engine, budget] of [["chromium", 2 * 1024 * 1024], ["webkit-mobile", 10 * 1024 * 1024]]) {
  test(`enforces the aggregate ${engine} byte budget before reading/copying oversized bytes`, () => {
    const { root, files } = fixture(engine);
    writeFileSync(files[2], Buffer.alloc(budget - PNG.length * 2 + 1));
    assert.throws(() => prepareVisualFixtureArtifact(root, engine), /byte budget exceeded/);
    assert.equal(readdirSync(root).includes("ci-visual-fixtures"), false);
  });
}

test("never overwrites old evidence or follows an output-directory symlink", () => {
  const { root } = fixture();
  const result = prepareVisualFixtureArtifact(root, "chromium");
  assert.throws(() => prepareVisualFixtureArtifact(root, "chromium"), /EEXIST/);
  assert.equal(outputFiles(result.output).length, 3);
  const second = fixture();
  symlinkSync(join(root, "ci-visual-fixtures"), join(second.root, "ci-visual-fixtures"));
  assert.throws(() => prepareVisualFixtureArtifact(second.root, "chromium"), /symlink/i);
});
