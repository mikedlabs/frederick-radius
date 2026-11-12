import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

import {
  DATA_RELEASE_STREAMS,
  PLACE_RELEASE_ARTIFACTS,
  dataReleaseId,
  inspectArtifact,
  loadDataRelease,
  refreshDataReleaseStream,
  repositoryRootFromModule,
  validateDataRelease,
} from "./data-release.mjs";

const FIXED_PROMOTION = "2026-08-12T12:00:00Z";

test("every primary and gallery-only owned photograph is protected by the places release", () => {
  const source = readFileSync(new URL("../../src/lib/owned-place-photos.ts", import.meta.url), "utf8");
  const file = ts.createSourceFile("owned-place-photos.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const photos = new Set();
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(file).replace(/['"]/g, "") === "src") {
      assert.ok(ts.isStringLiteral(node.initializer), "Owned photo src must be a reviewable literal local path.");
      const src = node.initializer.text;
      assert.ok(src.startsWith("/images/") && !src.includes("..") && !src.includes("?"));
      photos.add(`public${src}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(photos.size > 0);
  assert.deepEqual([...photos].filter(path => !PLACE_RELEASE_ARTIFACTS.includes(path)), []);
});

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "radius-data-release-"));
  for (const paths of Object.values(DATA_RELEASE_STREAMS)) {
    for (const path of paths) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(
        absolute,
        path.endsWith(".json")
          ? `${JSON.stringify([{ path }])}\n`
          : path.endsWith(".jpg")
            ? Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9])
            : `export const fixture = ${JSON.stringify(path)};\n`,
      );
    }
  }
  return root;
}

function fixtureManifest(root) {
  let manifest = { schema_version: 1, streams: {} };
  for (const streamName of Object.keys(DATA_RELEASE_STREAMS)) {
    manifest = refreshDataReleaseStream(
      manifest,
      streamName,
      root,
      FIXED_PROMOTION,
    );
  }
  return manifest;
}

test("checked-in promoted data manifest matches every protected artifact", () => {
  const root = repositoryRootFromModule();
  const result = validateDataRelease(loadDataRelease(root), root);
  assert.deepEqual(result.errors, []);
  assert.match(result.dataVersion, /^sha256:[0-9a-f]{64}$/);
});

test("the recorded public data version must match the protected artifacts", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const result = validateDataRelease(
    { ...manifest, data_version: "sha256:stale" },
    root,
  );

  assert.equal(result.dataVersion, null);
  assert.ok(result.errors.some((error) => /data_version differs/.test(error)));
});

test("the place release covers canonical server and place-page inputs", () => {
  const required = [
    "src/data/places.ts",
    "src/data/places-dfp.json",
    "src/data/places-discovered.json",
    "src/data/places-enrichment.json",
    "src/data/places-overrides.json",
    "src/data/place-status-overrides.json",
    "src/data/place-visit-details.json",
    "src/data/places-official-hours.json",
    "src/data/categories.ts",
    "src/data/municipalities.ts",
    "src/data/events.ts",
    "src/lib/relevance.ts",
    "src/lib/integrations/closures.ts",
    "src/lib/integrations/wikimedia.ts",
    "src/data/credited-local-place-photos.ts",
    "public/place-photos/civil-war-medicine-frontage.jpg",
    "public/history-photos/schifferstadt.jpg",
    "public/history-photos/hessian-barracks.jpg",
    "public/history-photos/co-canal.jpg",
    "public/place-photos/delaplaine-exterior.jpg",
    "public/place-photos/weinberg-exterior.jpg",
    "public/place-photos/c-burr-artz-exterior.jpg",
    "public/history-photos/new-market-antiques.jpg",
    "public/history-photos/catoctin-mountain-park.jpg",
    "public/place-photos/brewers-alley-2004.jpg",
    "src/lib/owned-place-photos.ts",
    "public/images/places/visitation-hotel-sunset.jpg",
    "public/images/places/visitation-hotel-detail.jpg",
    "public/images/places/carroll-creek-aerial.jpg",
    "public/images/places/baker-park-sunset.jpg",
    "public/images/places/baker-park-detail.jpg",
    "public/images/places/carillon-sunset.jpg",
    "public/images/places/church-street-sunset.jpg",
    "public/images/places/weinberg-patrick-street.jpg",
    "public/images/seasons/winter/IMG_2732.jpg",
    "public/images/seasons/spring/010.jpg",
    "public/images/seasons/fall/001.jpg",
    "public/images/seasons/fall/018.jpg",
    "public/images/seasons/fall/021.jpg",
    "public/images/seasons/winter/013.jpg",
    "public/images/seasons/winter/PG134 Replacement.jpg",
    "public/images/seasons/spring/016.jpg",
    "public/images/seasons/winter/WINTER NEW 7.jpg",
    "public/images/seasons/spring/aerial-view-baseball-field.jpg",
    "public/images/fair/fairgrounds-night-mike-d-1920.jpg",
    "src/data/business-info.json",
    "src/data/field-notes.json",
    "src/data/course-info.json",
    "src/data/tags.ts",
    "src/data/loc-archive.ts",
    "public/images/seasons/aerial-manifest.json",
    "src/data/places-client.json",
    "src/data/copy-scores.json",
  ];

  assert.deepEqual(
    required.filter((path) => !PLACE_RELEASE_ARTIFACTS.includes(path)),
    [],
  );
});

test("a changed derived copy scorecard invalidates the protected places release", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const target = resolve(root, "src/data/copy-scores.json");
  writeFileSync(target, JSON.stringify({ counts: { none: 1 }, bySlug: { seasonal: "none" } }));
  const result = validateDataRelease(manifest, root);
  assert.equal(result.dataVersion, null);
  assert.ok(result.errors.some(error => error.includes("src/data/copy-scores.json") && error.includes("digest differs")));
});

test("the published amenity map is a dedicated protected release stream", () => {
  assert.deepEqual(DATA_RELEASE_STREAMS.amenities, [
    "src/data/amenities.json",
  ]);

  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const target = resolve(root, DATA_RELEASE_STREAMS.amenities[0]);
  writeFileSync(target, `${readFileSync(target, "utf8").trim()} `);

  const result = validateDataRelease(manifest, root);
  assert.equal(result.dataVersion, null);
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("src/data/amenities.json") &&
        error.includes("digest differs"),
    ),
  );
});

test("TypeScript data modules are digest-protected without fake record counts", () => {
  const root = fixtureRoot();
  const artifact = inspectArtifact(root, "src/data/places.ts");

  assert.equal(artifact.records, null);
  assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
  assert.ok(artifact.bytes > 0);
});

test("release ids are deterministic across manifest key order", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const reversed = {
    ...manifest,
    streams: Object.fromEntries(
      Object.entries(manifest.streams)
        .reverse()
        .map(([name, stream]) => [
          name,
          { ...stream, artifacts: [...stream.artifacts].reverse() },
        ]),
    ),
  };
  assert.equal(dataReleaseId(reversed), dataReleaseId(manifest));
});

test("validation fails when a promoted artifact changes on disk", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const target = resolve(root, DATA_RELEASE_STREAMS.places[0]);
  writeFileSync(target, `${readFileSync(target, "utf8").trim()} `);

  const result = validateDataRelease(manifest, root);
  assert.equal(result.dataVersion, null);
  assert.ok(result.errors.some((error) => /digest differs/.test(error)));
});

test("refreshing one stream preserves the other stream promotions", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const updated = refreshDataReleaseStream(
    manifest,
    "places",
    root,
    "2026-08-13T12:00:00Z",
  );

  assert.equal(updated.streams.places.promoted_at, "2026-08-13T12:00:00Z");
  assert.equal(updated.streams["venue-events"].promoted_at, FIXED_PROMOTION);
  assert.equal(updated.data_version, dataReleaseId(updated));
});


test("official hours count canonical branches rather than metadata fields", () => {
  const root = fixtureRoot();
  const path = "src/data/places-official-hours.json";
  writeFileSync(join(root, path), JSON.stringify({ schema_version: 1, places: [{ slug: "a" }, { slug: "b" }], closures: { exceptions: [] } }));
  assert.equal(inspectArtifact(root, path).records, 2);
});


for (const recordsPath of ["src/data/credited-local-place-photos.ts", "src/lib/owned-place-photos.ts"]) {
  test(`local image records ${recordsPath} require promotion even when their adapter is unchanged`, () => {
    const root = fixtureRoot();
    const manifest = fixtureManifest(root);
    const adapterPath = "src/lib/integrations/wikimedia.ts";
    const originalAdapter = inspectArtifact(root, adapterPath);
    const target = resolve(root, recordsPath);
    writeFileSync(target, `${readFileSync(target, "utf8")}export const changedPhotoRecord = true;\n`);

    const result = validateDataRelease(manifest, root);
    assert.equal(result.dataVersion, null);
    assert.ok(result.errors.some((error) => error.includes(recordsPath) && error.includes("digest differs")));
    assert.deepEqual(inspectArtifact(root, adapterPath), originalAdapter);
    assert.ok(result.errors.every((error) => error.includes(recordsPath)));

    const promoted = refreshDataReleaseStream(manifest, "places", root, "2026-08-13T12:00:00Z");
    assert.deepEqual(validateDataRelease(promoted, root).errors, []);
    assert.notEqual(promoted.data_version, manifest.data_version);
    assert.equal(promoted.streams.places.artifacts.find((artifact) => artifact.path === recordsPath).records, null);
    for (const [name, stream] of Object.entries(manifest.streams)) {
      if (name !== "places") assert.deepEqual(promoted.streams[name], stream);
    }
    assert.deepEqual(
      promoted.streams.places.artifacts.filter((artifact) => artifact.path !== recordsPath),
      manifest.streams.places.artifacts.filter((artifact) => artifact.path !== recordsPath),
    );
  });
}


for (const photoPath of PLACE_RELEASE_ARTIFACTS.filter((path) => path.endsWith(".jpg"))) {
  test(`changing reviewed local photo bytes ${photoPath} invalidates the places promotion without a metadata edit`, () => {
    const root = fixtureRoot();
    const manifest = fixtureManifest(root);
    const metadataPath = "src/data/credited-local-place-photos.ts";
    const metadata = inspectArtifact(root, metadataPath);
    const target = resolve(root, photoPath);
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from([0x01])]));

    const result = validateDataRelease(manifest, root);
    assert.equal(result.dataVersion, null);
    assert.ok(result.errors.some((error) => error.includes(photoPath) && error.includes("digest differs")));
    assert.deepEqual(inspectArtifact(root, metadataPath), metadata);
    assert.ok(result.errors.every((error) => error.includes(photoPath)));

    const promoted = refreshDataReleaseStream(manifest, "places", root, "2026-08-13T12:00:00Z");
    assert.deepEqual(validateDataRelease(promoted, root).errors, []);
    assert.notEqual(promoted.data_version, manifest.data_version);
    assert.equal(promoted.streams.places.artifacts.find((artifact) => artifact.path === photoPath).records, null);
    for (const [name, stream] of Object.entries(manifest.streams)) {
      if (name !== "places") assert.deepEqual(promoted.streams[name], stream);
    }
    assert.deepEqual(
      promoted.streams.places.artifacts.filter((artifact) => artifact.path !== photoPath),
      manifest.streams.places.artifacts.filter((artifact) => artifact.path !== photoPath),
    );
  });
}


test("unregistered JPEG paths and unsupported formats are still rejected", () => {
  const root = fixtureRoot();
  for (const photoPath of ["public/place-photos/unreviewed.jpg", "public/unreviewed.jpg", "public/place-photos/unreviewed.png"]) {
    const target = join(root, photoPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    assert.throws(() => inspectArtifact(root, photoPath), /unsupported release artifact type/);
  }
});


for (const imagePath of [
  "public/history-photos/schifferstadt.jpg",
  "public/history-photos/hessian-barracks.jpg",
  "public/history-photos/co-canal.jpg",
  "public/place-photos/delaplaine-exterior.jpg",
  "public/place-photos/weinberg-exterior.jpg",
  "public/place-photos/c-burr-artz-exterior.jpg",
  "public/history-photos/new-market-antiques.jpg",
  "public/history-photos/catoctin-mountain-park.jpg",
  "public/images/seasons/fall/021.jpg",
  "public/images/seasons/winter/013.jpg",
  "public/images/seasons/winter/IMG_2732.jpg",
  "public/images/seasons/spring/010.jpg",
  "public/images/seasons/fall/001.jpg",
  "public/place-photos/civil-war-medicine-frontage.jpg"
]) {
  test(`reviewed local photo bytes ${imagePath} require their own places promotion`, () => {
    const root = fixtureRoot();
    const manifest = fixtureManifest(root);
    const target = resolve(root, imagePath);
    writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from([0x01])]));
    const result = validateDataRelease(manifest, root);
    assert.equal(result.dataVersion, null);
    assert.ok(result.errors.some(error => error.includes(imagePath) && error.includes("digest differs")));
    assert.ok(result.errors.every(error => error.includes(imagePath)));
    const promoted = refreshDataReleaseStream(manifest, "places", root, "2026-08-13T12:00:00Z");
    assert.deepEqual(validateDataRelease(promoted, root).errors, []);
    assert.notEqual(promoted.data_version, manifest.data_version);
    for (const [name, stream] of Object.entries(manifest.streams)) {
      if (name !== "places") assert.deepEqual(promoted.streams[name], stream);
    }
  });
}
