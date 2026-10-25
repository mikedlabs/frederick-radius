import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNativeSourceReviewEvidence,
  NativeEvidenceError,
  observeNativeResponse,
  readNativeResponseBytes,
  type NativeResponseEvidence,
} from "../scripts/lib/native-source-review-evidence";
import { fetchValidatedZip } from "../scripts/lib/fetch-validated-zip";

const AT = "2026-10-24T22:00:00.000Z";
const REVISION = "a".repeat(40);
const SOURCE = "official-venue";
const URL = "https://official.example.test/events";
const roots: string[] = [];
const hash = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "radius-native-evidence-test-"));
  roots.push(root);
  const checkout = join(root, "checkout");
  mkdirSync(join(checkout, "src/data"), { recursive: true });
  return { root, checkout, directory: join(root, "private-evidence") };
}

function fixture(overrides: Partial<Parameters<typeof createNativeSourceReviewEvidence>[1]> = {}) {
  const scope = sandbox();
  const options = {
    publisher: "native-venues" as const,
    sourceRevision: REVISION,
    sourceRun: "12345",
    sourceAttempt: "2",
    sources: [
      { id: SOURCE, urls: [URL], selected: true },
      { id: "another-venue", urls: ["https://another.example.test/events"], selected: false },
    ],
    maxResponses: 4,
    maxResponseBytes: 64,
    maxTotalBytes: 128,
    checkout: scope.checkout,
    now: () => new Date(AT),
    ...overrides,
  };
  const evidence = createNativeSourceReviewEvidence(scope.directory, options);
  const index = () => JSON.parse(readFileSync(join(scope.directory, "index.json"), "utf8"));
  return { ...scope, evidence, index, options };
}

function response(overrides: Partial<NativeResponseEvidence> = {}): NativeResponseEvidence {
  return { requestedUrl: URL, finalUrl: URL, method: "GET", status: 200,
    body: Buffer.from("official original"), observedAt: AT, ...overrides };
}

function complete(scope: ReturnType<typeof fixture>) {
  scope.evidence.capture(SOURCE, response());
  scope.evidence.finish([{ sourceId: SOURCE, status: "complete", observedAt: AT }]);
}

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("native response observer boundary", () => {
  it("passes the same captured response to its observer without a second body read", () => {
    const item = response();
    const observer = vi.fn();
    observeNativeResponse(observer, item);
    expect(observer).toHaveBeenCalledOnce();
    expect(observer.mock.calls[0][0]).toBe(item);
    expect(() => observeNativeResponse(undefined, item)).not.toThrow();
  });

  it.each([new Error("disk full"), new NativeEvidenceError("held capture"), "untyped failure"])(
    "normalizes observer failure into the fatal no-retry evidence type %#", failure => {
      expect(() => observeNativeResponse(() => { throw failure; }, response())).toThrow(NativeEvidenceError);
    },
  );
});

describe("native source review evidence", () => {
  it("retains exact native identities, byte hashes and unselected sources without semantic approval", () => {
    const scope = fixture();
    scope.evidence.capture(SOURCE, response({ context: { page: 2, venueFilter: "weinberg-center" } }));
    const index = scope.index();
    expect(index).toMatchObject({ publisher: "native-venues", source_revision: REVISION,
      source_run: "12345", source_attempt: "2", started_at: AT, selected_sources: [SOURCE],
      collection_complete: false, capture_failed: false, generated_outputs_bound: false, semantic_acceptance: false,
      source_outcomes: [{ source_id: "another-venue", status: "unselected" }] });
    expect(index.records[0]).toMatchObject({ source_id: SOURCE, request_number: 1, requested_url: URL,
      final_url: URL, method: "GET", status: 200, body_state: "captured", observed_at: AT,
      source_sha256: hash("official original"), bytes: 17, request_context: { page: 2, venueFilter: "weinberg-center" } });
    expect(readFileSync(join(scope.directory, index.records[0].evidence_file))).toEqual(Buffer.from("official original"));
    expect(statSync(scope.directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(scope.directory, "index.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(scope.directory, index.records[0].evidence_file)).mode & 0o777).toBe(0o600);
    expect(readdirSync(scope.checkout)).toEqual(["src"]);
  });

  it("records unread/read-failed bodies as unknown rather than a captured empty response", () => {
    const scope = fixture();
    scope.evidence.capture(SOURCE, response({ status: 503, body: null }));
    scope.evidence.capture(SOURCE, response({ body: null, bodyState: "read_failed" }));
    for (const row of scope.index().records) {
      expect(row.checked_at).toBe(AT);
      expect(row).not.toHaveProperty("observed_at");
      expect(row).not.toHaveProperty("bytes");
      expect(row).not.toHaveProperty("source_sha256");
      expect(row).not.toHaveProperty("evidence_file");
    }
    expect(scope.index().records.map((row: { body_state: string }) => row.body_state)).toEqual(["not_read", "read_failed"]);
    expect(() => scope.evidence.finish([{ sourceId: SOURCE, status: "complete", observedAt: AT }])).toThrow(NativeEvidenceError);
    scope.evidence.finish([{ sourceId: SOURCE, status: "failed", observedAt: AT }]);
    expect(scope.index().source_outcomes[1]).toEqual({ source_id: SOURCE, status: "failed", checked_at: AT });
    expect(scope.index().semantic_acceptance).toBe(false);
  });

  it("distinguishes a truly observed zero-byte body from an unread response", () => {
    const scope = fixture();
    scope.evidence.capture(SOURCE, response({ body: Buffer.alloc(0) }));
    expect(scope.index().records[0]).toMatchObject({ body_state: "captured", bytes: 0,
      source_sha256: hash(Buffer.alloc(0)), observed_at: AT });
    scope.evidence.finish([{ sourceId: SOURCE, status: "complete", observedAt: AT }]);
    expect(scope.index().collection_complete).toBe(true);
    expect(scope.index().semantic_acceptance).toBe(false);
  });

  it.each([
    { label: "unknown revision", override: { sourceRevision: "unknown" } },
    { label: "short revision", override: { sourceRevision: "abc123" } },
    { label: "missing attempt", override: { sourceAttempt: undefined } },
    { label: "missing run", override: { sourceRun: undefined } },
    { label: "zero run", override: { sourceRun: "0" } },
    { label: "noninteger attempt", override: { sourceAttempt: "1.5" } },
    { label: "zero response cap", override: { maxResponses: 0 } },
    { label: "infinite response cap", override: { maxResponseBytes: Infinity } },
    { label: "negative total cap", override: { maxTotalBytes: -1 } },
    { label: "no sources", override: { sources: [] } },
    { label: "duplicate source IDs", override: { sources: [{ id: SOURCE, urls: [URL], selected: true }, { id: SOURCE, urls: [URL], selected: false }] } },
  ])("rejects $label before creating evidence", ({ override }) => {
    expect(() => fixture(override)).toThrow();
  });

  it("allows an explicitly local bundle while retaining unknown hosted run identity", () => {
    const scope = fixture({ sourceRun: undefined, sourceAttempt: undefined });
    expect(scope.index()).toMatchObject({ source_run: null, source_attempt: null });
  });

  it.each(["http://official.example.test/events", "https://user:secret@official.example.test/events"])("rejects unsafe source identity %s", url => {
    expect(() => fixture({ sources: [{ id: SOURCE, urls: [url], selected: true }] })).toThrow();
  });

  it("refuses a public/checkout evidence directory, including a private-parent symlink into checkout", () => {
    const scope = fixture();
    expect(() => createNativeSourceReviewEvidence(join(scope.checkout, "evidence"), scope.options)).toThrow();
    symlinkSync(scope.checkout, join(scope.root, "looks-private"));
    expect(() => createNativeSourceReviewEvidence(join(scope.root, "looks-private", "capture"), scope.options)).toThrow();
  });

  it("never overwrites an existing capture bundle", () => {
    const scope = fixture();
    const previous = readFileSync(join(scope.directory, "index.json"));
    expect(() => createNativeSourceReviewEvidence(scope.directory, scope.options)).toThrow();
    expect(readFileSync(join(scope.directory, "index.json"))).toEqual(previous);
  });

  it.each([
    { label: "foreign requested host", fields: { requestedUrl: "https://foreign.example.test/events" } },
    { label: "foreign final host", fields: { finalUrl: "https://foreign.example.test/events" } },
    { label: "insecure final URL", fields: { finalUrl: "http://official.example.test/events" } },
    { label: "credentialed response URL", fields: { finalUrl: "https://user:secret@official.example.test/events" } },
    { label: "invalid status", fields: { status: 0 } },
    { label: "invalid observed clock", fields: { observedAt: "unknown" } },
    { label: "clock without actual timezone", fields: { observedAt: "2026-10-24T22:00:00" } },
    { label: "impossible calendar date", fields: { observedAt: "2026-02-31T22:00:00.000Z" } },
  ])("holds $label without writing accepted bytes", ({ fields }) => {
    const scope = fixture();
    expect(() => scope.evidence.capture(SOURCE, response(fields))).toThrow(NativeEvidenceError);
    expect(scope.index()).toMatchObject({ capture_failed: true, collection_complete: false, records: [] });
    expect(readdirSync(scope.directory)).toEqual(["index.json"]);
    expect(() => scope.evidence.finish([{ sourceId: SOURCE, status: "failed", observedAt: AT }])).toThrow(NativeEvidenceError);
  });

  it.each(["unknown-venue", "another-venue"])("holds unknown or unselected source %s", id => {
    const scope = fixture();
    expect(() => scope.evidence.capture(id, response())).toThrow(NativeEvidenceError);
    expect(scope.index().capture_failed).toBe(true);
  });

  it.each([
    { label: "response bytes", limits: { maxResponseBytes: 3 }, bodies: ["1234"] },
    { label: "cumulative bytes", limits: { maxTotalBytes: 5 }, bodies: ["123", "456"] },
    { label: "response count", limits: { maxResponses: 1 }, bodies: ["123", "456"] },
  ])("holds the bundle when $label exceeds its bound", ({ limits, bodies }) => {
    const scope = fixture(limits);
    for (const body of bodies.slice(0, -1)) scope.evidence.capture(SOURCE, response({ body: Buffer.from(body) }));
    expect(() => scope.evidence.capture(SOURCE, response({ body: Buffer.from(bodies.at(-1)!) }))).toThrow(NativeEvidenceError);
    expect(scope.index().capture_failed).toBe(true);
    expect(scope.index().records).toHaveLength(bodies.length - 1);
    expect(() => scope.evidence.finish([{ sourceId: SOURCE, status: "complete", observedAt: AT }])).toThrow(NativeEvidenceError);
  });

  it("keeps source failure held if body storage fails before its index entry", () => {
    const scope = fixture();
    mkdirSync(join(scope.directory, `001-${hash("official original")}.body`));
    expect(() => scope.evidence.capture(SOURCE, response())).toThrow(NativeEvidenceError);
    expect(scope.index()).toMatchObject({ capture_failed: true, records: [], collection_complete: false });
    expect(() => scope.evidence.bindOutputs(["src/data/output.json"])).toThrow(NativeEvidenceError);
  });

  it("never promotes a stale index when index persistence fails after body capture", () => {
    const scope = fixture();
    mkdirSync(join(scope.directory, "index.json.pending"));
    expect(() => scope.evidence.capture(SOURCE, response())).toThrow(NativeEvidenceError);
    expect(scope.index()).toMatchObject({ collection_complete: false, generated_outputs_bound: false });
    expect(() => scope.evidence.finish([{ sourceId: SOURCE, status: "complete", observedAt: AT }])).toThrow(NativeEvidenceError);
    expect(() => scope.evidence.bindOutputs(["src/data/output.json"])).toThrow(NativeEvidenceError);
  });

  it("propagates actual private index storage failure through ZIP collection without another source attempt", async () => {
    const scope = fixture();
    mkdirSync(join(scope.directory, "index.json.pending"));
    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200,
      arrayBuffer: async () => zip.buffer });
    const onRetry = vi.fn();
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const validateArchive = vi.fn();
    await expect(fetchValidatedZip(URL, {
      attempts: 3, fetchImpl, onRetry, sleepImpl, validateArchive,
      onResponse: observed => scope.evidence.capture(SOURCE, observed),
    })).rejects.toBeInstanceOf(NativeEvidenceError);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(validateArchive).not.toHaveBeenCalled();
    expect(scope.index()).toMatchObject({ collection_complete: false, generated_outputs_bound: false });
    expect(() => scope.evidence.finish([{ sourceId: SOURCE, status: "complete", observedAt: AT }])).toThrow(NativeEvidenceError);
  });

  it.each([
    { result: [] },
    { result: [{ sourceId: "another-venue", status: "complete" as const, observedAt: AT }] },
    { result: [{ sourceId: SOURCE, status: "complete" as const, observedAt: AT }, { sourceId: SOURCE, status: "complete" as const, observedAt: AT }] },
    { result: [{ sourceId: SOURCE, status: "complete" as const, observedAt: "unknown" }] },
  ])("requires complete, unique selected-source reconciliation %#", ({ result }) => {
    const scope = fixture();
    scope.evidence.capture(SOURCE, response());
    expect(() => scope.evidence.finish(result)).toThrow(NativeEvidenceError);
    expect(scope.index().collection_complete).toBe(false);
  });

  it("binds exact generated output bytes only after complete source reconciliation", () => {
    const scope = fixture();
    const output = "src/data/reviewed-output.json";
    writeFileSync(join(scope.checkout, output), '{"events":[]}\n');
    expect(() => scope.evidence.bindOutputs([output])).toThrow(NativeEvidenceError);
    complete(scope);
    scope.evidence.bindOutputs([output]);
    expect(scope.index()).toMatchObject({ collection_complete: true, generated_outputs_bound: true,
      semantic_acceptance: false, output_files: [{ path: output, sha256: hash('{"events":[]}\n') }] });
    expect(() => scope.evidence.capture(SOURCE, response())).toThrow(NativeEvidenceError);
  });

  it("does not replace frozen output bindings under the original source run", () => {
    const scope = fixture();
    complete(scope);
    const output = "src/data/reviewed-output.json";
    writeFileSync(join(scope.checkout, output), "first generated output");
    scope.evidence.bindOutputs([output]);
    const previous = readFileSync(join(scope.directory, "index.json"));
    writeFileSync(join(scope.checkout, output), "later unrelated output");
    expect(() => scope.evidence.bindOutputs([output])).toThrow(NativeEvidenceError);
    expect(readFileSync(join(scope.directory, "index.json"))).toEqual(previous);
  });

  it("refuses missing, duplicate, outside-data and escaping-symlink output paths", () => {
    const scope = fixture();
    complete(scope);
    writeFileSync(join(scope.checkout, "outside.json"), "private outside artifact");
    symlinkSync(join(scope.checkout, "outside.json"), join(scope.checkout, "src/data/escape.json"));
    for (const paths of [[], ["src/data/missing.json"], ["outside.json"], ["src/data/escape.json"], ["src/data/missing.json", "src/data/missing.json"]]) {
      expect(() => scope.evidence.bindOutputs(paths)).toThrow();
      expect(scope.index().generated_outputs_bound).toBe(false);
    }
  });
});

describe("bounded native response reads", () => {
  it.each([[0, 10], [10, 0], [1.5, 10], [10, Infinity]])("rejects invalid limits before reading (%s, %s)", async (max, deadline) => {
    const arrayBuffer = vi.fn();
    await expect(readNativeResponseBytes({ arrayBuffer }, max, deadline)).rejects.toThrow("Invalid native response bound");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects oversized declared bodies before reading and cancels their existing stream", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const getReader = vi.fn();
    const arrayBuffer = vi.fn();
    const body = { cancel, getReader } as unknown as NonNullable<Response["body"]>;
    await expect(readNativeResponseBytes({ body, arrayBuffer, headers: new Headers({ "content-length": "101" }) }, 100, 20)).rejects.toThrow("byte limit");
    expect(cancel).toHaveBeenCalledOnce();
    expect(getReader).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("bounds streamed bytes even when content-length is absent or understated", async () => {
    const reader = { read: vi.fn().mockResolvedValueOnce({ value: new Uint8Array(3), done: false })
      .mockResolvedValueOnce({ value: new Uint8Array(4), done: false }), cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn() };
    const arrayBuffer = vi.fn();
    await expect(readNativeResponseBytes({ arrayBuffer, headers: new Headers({ "content-length": "1" }),
      body: { getReader: () => reader } as unknown as NonNullable<Response["body"]> }, 6, 20)).rejects.toThrow("byte limit");
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("preserves exact chunk bytes at the limit and releases the reader after completion", async () => {
    const reader = { read: vi.fn().mockResolvedValueOnce({ value: Uint8Array.from([1, 2]), done: false })
      .mockResolvedValueOnce({ value: Uint8Array.from([3, 4]), done: false }).mockResolvedValueOnce({ done: true }),
    cancel: vi.fn(), releaseLock: vi.fn() };
    const actual = await readNativeResponseBytes({ arrayBuffer: vi.fn(), body: { getReader: () => reader } as unknown as NonNullable<Response["body"]> }, 4, 20);
    expect(actual).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(reader.cancel).not.toHaveBeenCalled();
  });

  it("times out a stalled reader and cancels without issuing a second body read", async () => {
    vi.useFakeTimers();
    const reader = { read: vi.fn(() => new Promise(() => {})), cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn() };
    const pending = readNativeResponseBytes({ arrayBuffer: vi.fn(), body: { getReader: () => reader } as unknown as NonNullable<Response["body"]> }, 8, 20);
    const rejected = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(21);
    await rejected;
    expect(reader.read).toHaveBeenCalledOnce();
    expect(reader.cancel).toHaveBeenCalledOnce();
  });

  it("caps the compatibility arrayBuffer path and never calls it twice", async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new Uint8Array(5).buffer);
    await expect(readNativeResponseBytes({ arrayBuffer }, 4, 20)).rejects.toThrow("byte limit");
    expect(arrayBuffer).toHaveBeenCalledOnce();
  });
});
