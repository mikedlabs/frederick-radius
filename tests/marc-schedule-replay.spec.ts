import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMarcSchedule, buildMarcScheduleFromZip, GTFS_URL, MissingOptionalMarcFile, validateMarcOriginal } from "../scripts/lib/marc-schedule-build";
import { main, marcBuildArguments, marcCurlEvidence } from "../scripts/build-marc-schedule";

const AT = "2026-11-01T08:00:00.123Z", NOW = new Date("2026-11-02T15:00:00.000Z");
const archive = Buffer.from(readFileSync(new URL("./fixtures/marc-retained-gtfs.base64", import.meta.url), "utf8").trim(), "base64");
const sha = createHash("sha256").update(archive).digest("hex");
const original = { observedAt: AT, sourceSha256: sha };
let root: string, zip: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marc-replay-fixture-")); zip = join(root, "declared-fixture.zip"); writeFileSync(zip, archive);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Source request forbidden in retained replay"); }));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("MARC retained original replay", () => {
  it("replays a portable fictional ZIP and keeps original source/output clocks and hash", () => {
    const result = buildMarcScheduleFromZip(zip, original, NOW);
    expect(result).toMatchObject({ source: GTFS_URL, generatedAt: "2026-11-01", feedDate: "declared-fixture-v1", stations: 8, departures: 8,
      staticFeed: { sourceUrl: GTFS_URL, fetchedOn: "2026-11-01", observedAt: AT, sourceSha256: sha, serviceWindowStart: "2026-01-01", serviceWindowEnd: "2027-12-31" } });
    expect(buildMarcScheduleFromZip(zip, original, new Date("2026-11-03T15:00:00Z"))).toEqual(result);
    expect(readFileSync(zip)).toEqual(archive); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects duplicate known ZIP members rather than concatenating conflicting exceptions", () => {
    const duplicate = Buffer.from(readFileSync(new URL("./fixtures/marc-duplicate-optional.base64", import.meta.url), "utf8").trim(), "base64");
    writeFileSync(zip, duplicate);
    expect(() => buildMarcScheduleFromZip(zip, { ...original, sourceSha256: createHash("sha256").update(duplicate).digest("hex") }, NOW)).toThrow("Duplicate MARC GTFS ZIP member");
  });
  it("permits actual optional absence while rejecting failed reads of present exception files", () => {
    const read = (file: string) => execFileSync("unzip", ["-p", zip, file], { encoding: "utf8" });
    const missing = (file: string) => {
      if (file === "feed_info.txt" || file === "calendar_dates.txt") throw new MissingOptionalMarcFile(file);
      return read(file);
    };
    const result = buildMarcSchedule(missing, original, NOW);
    expect(result.feedDate).toBeNull(); expect(result.exceptions).toEqual({}); expect(result.departures).toBe(8);
    expect(() => buildMarcSchedule(file => {
      if (file === "calendar_dates.txt") throw new Error("Declared present exception-file CRC/read failure");
      return read(file);
    }, original, NOW)).toThrow("present exception-file");
    expect(() => buildMarcSchedule(file => file === "calendar_dates.txt" ? "wrong_header\n" : read(file), original, NOW)).toThrow("CSV headers");
    expect(() => buildMarcSchedule(file => {
      if (file === "feed_info.txt") throw new Error("Declared present feed-info read failure");
      return read(file);
    }, original, NOW)).toThrow("present feed-info");
  });
  it("writes only an explicit fresh private output during offline replay", () => {
    const output = join(root, "private-preview.json"); vi.spyOn(console, "log").mockImplementation(() => {});
    main([`--input-zip=${zip}`, `--observed-at=${AT}`, `--source-sha256=${sha}`, `--output=${output}`]);
    expect(JSON.parse(readFileSync(output, "utf8")).staticFeed).toMatchObject({ observedAt: AT, sourceSha256: sha });
    expect(() => main([`--input-zip=${zip}`, `--observed-at=${AT}`, `--source-sha256=${sha}`, `--output=${output}`])).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects missing or changed originals without a fallback source request", () => {
    expect(() => buildMarcScheduleFromZip(join(root, "absent.zip"), original, NOW)).toThrow();
    expect(() => buildMarcScheduleFromZip(zip, { ...original, sourceSha256: "0".repeat(64) }, NOW)).toThrow("bytes/hash");
    writeFileSync(zip, "Declared invalid archive");
    const invalid = readFileSync(zip), invalidSha = createHash("sha256").update(invalid).digest("hex");
    expect(() => buildMarcScheduleFromZip(zip, { ...original, sourceSha256: invalidSha }, NOW)).toThrow();
    expect(readFileSync(zip)).toEqual(invalid); expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the existing age gate instead of restamping an old observation", () => {
    expect(() => buildMarcScheduleFromZip(zip, { ...original, observedAt: "2026-09-17T08:00:00.000Z" }, NOW)).toThrow("stale_snapshot");
    expect(() => validateMarcOriginal(archive, { ...original, observedAt: "2026-11-03T08:00:00.000Z" }, NOW)).toThrow("non-future");
  });
  it("does not let a private-looking symlink write back into the source checkout", () => {
    const alias = join(root, "checkout-alias"); symlinkSync(process.cwd(), alias, "dir");
    expect(() => marcBuildArguments([`--input-zip=${zip}`, `--observed-at=${AT}`, `--source-sha256=${sha}`, `--output=${join(alias, "src/data/declared-preview.json")}`])).toThrow("outside the checkout");
  });
  it("requires original proof and a private output rather than writing the canonical file", () => {
    expect(() => marcBuildArguments([`--input-zip=${zip}`])).toThrow("original observed-at");
    expect(() => marcBuildArguments([`--input-zip=${zip}`, `--observed-at=${AT}`, `--source-sha256=${sha}`, `--output=${resolve("src/data/marc-schedule.json")}`])).toThrow("outside the checkout");
    expect(() => marcBuildArguments([`--observed-at=${AT}`])).toThrow("retained input ZIP");
  });
});

describe("same-curl MARC diagnostics", () => {
  it("retains reported failed HTTP status and final URL without inventing success", () => {
    const result = marcCurlEvidence({ exitCode: 0, observedAt: AT, stderr: "", metadata: {
      http_code: 503, url_effective: GTFS_URL, content_type: "text/html", num_redirects: 1,
    } });
    expect(result).toMatchObject({ http_status: 503, final_url: GTFS_URL, content_type: "text/html", redirects: 1, observed_at: AT });
  });
  it("leaves missing response metadata unknown after a failed transfer", () => {
    expect(marcCurlEvidence({ exitCode: 28, observedAt: AT, stderr: "Declared timeout", metadata: {} })).toMatchObject({
      http_status: null, final_url: null, content_type: null, curl_exit_code: 28, observed_at: AT,
    });
  });
});
