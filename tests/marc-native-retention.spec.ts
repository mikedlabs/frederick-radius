import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const command = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFileSync: command }));
import { main } from "../scripts/build-marc-schedule";
import { GTFS_URL, MARC_GTFS_DOWNLOAD_URL } from "../scripts/lib/marc-schedule-build";
const AT = "2026-11-02T15:00:00.123Z";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let root: string, evidence: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marc-native-fixture-")); evidence = join(root, "evidence"); command.mockReset();
  vi.stubEnv("MARC_REVIEW_EVIDENCE_DIR", evidence); vi.stubEnv("GITHUB_SHA", "a".repeat(40));
  vi.stubEnv("GITHUB_RUN_ID", "12345"); vi.stubEnv("GITHUB_RUN_ATTEMPT", "1");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(AT));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.useRealTimers(); });
const index = () => JSON.parse(readFileSync(join(evidence, "index.json"), "utf8"));
function transfer(body: Buffer, metadata: Record<string, unknown>, failed = false) {
  command.mockImplementation((name: string, args: string[]) => {
    expect(name).toBe("curl"); expect(args.filter(arg => arg === GTFS_URL)).toHaveLength(1);
    expect(args).toContain("--location"); expect(args).not.toContain("--retry");
    expect(args[args.indexOf("--max-redirs") + 1]).toBe("1");
    expect(args[args.indexOf("--proto-redir") + 1]).toBe("=https");
    writeFileSync(args[args.indexOf("--output") + 1], body);
    writeFileSync(args[args.indexOf("--dump-header") + 1], "Declared fixture HTTP headers\r\n");
    if (failed) throw Object.assign(new Error("Declared fixture transfer failure"), { status: 28, stdout: JSON.stringify(metadata) });
    return JSON.stringify(metadata);
  });
}
describe("MARC one-transfer failure evidence", () => {
  it("retains the exact reviewed S3 response and redirect headers even if ZIP parsing then fails", () => {
    const body = Buffer.from("Declared invalid ZIP original");
    transfer(body, { http_code: 200, url_effective: MARC_GTFS_DOWNLOAD_URL, content_type: "application/zip", num_redirects: 1 });
    const nativeTransfer = command.getMockImplementation()!;
    command.mockImplementation((name: string, args: string[]) => {
      if (name === "unzip") throw new Error("Declared ZIP parsing failure");
      return nativeTransfer(name, args);
    });
    expect(() => main([])).toThrow("Declared ZIP parsing failure");
    expect(command.mock.calls.filter(([name]) => name === "curl")).toHaveLength(1);
    expect(index()).toMatchObject({ semantic_acceptance: false, generated_outputs_bound: false,
      records: [expect.objectContaining({ requested_url: GTFS_URL, final_url: MARC_GTFS_DOWNLOAD_URL, source_sha256: digest(body) })] });
    expect(readFileSync(join(evidence, "response-headers.txt"), "utf8")).toBe("Declared fixture HTTP headers\r\n");
  });

  it("retains a failed HTTP original and actual status without a source retry or generated output", () => {
    const body = Buffer.from("Declared HTTP503 fixture original");
    transfer(body, { http_code: 503, url_effective: GTFS_URL, content_type: "text/html", num_redirects: 0 });
    expect(() => main([])).toThrow("native transfer failed");
    expect(command).toHaveBeenCalledOnce();
    expect(index()).toMatchObject({ publisher: "marc-transit", semantic_acceptance: false, generated_outputs_bound: false,
      source_outcomes: [{ source_id: "marc-static-gtfs", status: "failed", checked_at: AT }],
      records: [expect.objectContaining({ status: 503, observed_at: AT, source_sha256: digest(body), bytes: body.length })] });
    expect(readFileSync(join(evidence, index().records[0].evidence_file))).toEqual(body);
  });
  it("preserves a partial original as incomplete when no actual HTTP response status was retained", () => {
    const body = Buffer.from("Declared partial ZIP fixture");
    transfer(body, { http_code: 0, url_effective: GTFS_URL }, true);
    expect(() => main([])).toThrow("native transfer failed"); expect(command).toHaveBeenCalledOnce();
    expect(index()).toMatchObject({ records: [], generated_outputs_bound: false,
      source_outcomes: [{ source_id: "marc-static-gtfs", status: "failed", checked_at: AT }] });
    expect(JSON.parse(readFileSync(join(evidence, "curl-transfer.json"), "utf8"))).toMatchObject({ http_status: null, curl_exit_code: 28, source_sha256: digest(body) });
    expect(readFileSync(join(evidence, "incomplete-transport-original.zip"))).toEqual(body);
  });
  it("retains unknown-status body bytes even when curl write-out is not an object", () => {
    const body = Buffer.from("Declared unknown-status original");
    command.mockImplementation((name: string, args: string[]) => {
      expect(name).toBe("curl"); writeFileSync(args[args.indexOf("--output") + 1], body); return "null";
    });
    expect(() => main([])).toThrow("native transfer failed"); expect(command).toHaveBeenCalledOnce();
    expect(index()).toMatchObject({ records: [], generated_outputs_bound: false });
    expect(readFileSync(join(evidence, "incomplete-transport-original.zip"))).toEqual(body);
  });
  it("retains an unexpected-host original as rejected evidence while holding the strict native identity guard", () => {
    const body = Buffer.from("Declared unexpected-host original");
    transfer(body, { http_code: 200, url_effective: "https://unexpected.example.test/marc", content_type: "application/zip", num_redirects: 1 });
    expect(() => main([])).toThrow("identity"); expect(command).toHaveBeenCalledOnce();
    expect(index()).toMatchObject({ capture_failed: true, collection_complete: false, generated_outputs_bound: false });
    expect(readFileSync(join(evidence, "rejected-transport-original.zip"))).toEqual(body);
  });
  it("refuses to make a transfer without a new private evidence directory", () => {
    vi.stubEnv("MARC_REVIEW_EVIDENCE_DIR", ""); expect(() => main([])).toThrow("MARC_REVIEW_EVIDENCE_DIR");
    expect(command).not.toHaveBeenCalled(); expect(existsSync(evidence)).toBe(false);
  });
  it("never resets or reuses another attempt's evidence directory", () => {
    mkdirSync(evidence); writeFileSync(join(evidence, "prior-proof"), "unchanged");
    expect(() => main([])).toThrow(); expect(command).not.toHaveBeenCalled();
    expect(readFileSync(join(evidence, "prior-proof"), "utf8")).toBe("unchanged");
  });
});
