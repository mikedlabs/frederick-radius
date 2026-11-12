import { describe, expect, it, vi } from "vitest";
import {
  fetchValidatedZip,
  hasZipSignature,
} from "../scripts/lib/fetch-validated-zip";
import { NativeEvidenceError } from "../scripts/lib/native-source-review-evidence";

function response(body: Uint8Array, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => Uint8Array.from(body).buffer,
  };
}

describe("fetchValidatedZip", () => {
  it("recognizes the ZIP signatures accepted by unzip", () => {
    expect(hasZipSignature(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(hasZipSignature(Uint8Array.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    expect(hasZipSignature(new TextEncoder().encode("<!doctype html>"))).toBe(false);
  });

  it("retries a non-ZIP response and returns the next valid archive", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(new TextEncoder().encode("temporarily unavailable")))
      .mockResolvedValueOnce(response(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00])));
    const onRetry = vi.fn();

    const archive = await fetchValidatedZip("https://example.test/gtfs.zip", {
      fetchImpl,
      onRetry,
      sleepImpl: async () => {},
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(hasZipSignature(archive)).toBe(true);
  });

  it("retries a ZIP that fails the caller's archive integrity check", async () => {
    const archive = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const validateArchive = vi
      .fn()
      .mockRejectedValueOnce(new Error("truncated central directory"))
      .mockResolvedValueOnce(undefined);

    await expect(
      fetchValidatedZip("https://example.test/gtfs.zip", {
        fetchImpl: vi.fn().mockResolvedValue(response(archive)),
        validateArchive,
        sleepImpl: async () => {},
      }),
    ).resolves.toEqual(Buffer.from(archive));
    expect(validateArchive).toHaveBeenCalledTimes(2);
  });

  it("reports the last failure after the retry budget is exhausted", async () => {
    await expect(
      fetchValidatedZip("https://example.test/gtfs.zip", {
        attempts: 2,
        fetchImpl: vi.fn().mockResolvedValue(response(new Uint8Array(), 503)),
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow("GTFS download failed after 2 attempts: HTTP 503");
  });

  it.each(["success", "http-failure", "read-failure", "invalid-archive"])(
    "never retries a native observer storage failure during %s",
    async phase => {
      const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
      const item = response(phase === "invalid-archive" ? new TextEncoder().encode("not ZIP") : zip,
        phase === "http-failure" ? 503 : 200);
      if (phase === "read-failure") item.arrayBuffer = async () => { throw new Error("broken stream"); };
      const fetchImpl = vi.fn().mockResolvedValue(item);
      const onResponse = vi.fn(() => { throw new Error("private evidence disk full"); });
      const onRetry = vi.fn();
      const sleepImpl = vi.fn().mockResolvedValue(undefined);
      const validateArchive = vi.fn();

      await expect(fetchValidatedZip("https://example.test/gtfs.zip", {
        attempts: 3, fetchImpl, onResponse, onRetry, sleepImpl, validateArchive,
      })).rejects.toBeInstanceOf(NativeEvidenceError);

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(onResponse).toHaveBeenCalledOnce();
      expect(onRetry).not.toHaveBeenCalled();
      expect(sleepImpl).not.toHaveBeenCalled();
      expect(validateArchive).not.toHaveBeenCalled();
    },
  );

  it("retains every original archive attempt, including a non-ZIP body, without marking it accepted", async () => {
    const bad = new TextEncoder().encode("temporary official error page");
    const good = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(bad)).mockResolvedValueOnce(response(good));
    const onResponse = vi.fn();

    await fetchValidatedZip("https://example.test/gtfs.zip", {
      fetchImpl, onResponse, sleepImpl: async () => {},
    });

    expect(onResponse).toHaveBeenCalledTimes(2);
    expect(onResponse.mock.calls[0][0]).toMatchObject({ requestedUrl: "https://example.test/gtfs.zip",
      finalUrl: "https://example.test/gtfs.zip", method: "GET", status: 200,
      body: Buffer.from(bad), context: { phase: "gtfs-archive", attempt: 1 } });
    expect(onResponse.mock.calls[1][0]).toMatchObject({ body: Buffer.from(good), context: { attempt: 2 } });
    for (const [captured] of onResponse.mock.calls) expect(captured).not.toHaveProperty("semantic_acceptance");
  });

  it("reports unread HTTP errors as unknown bodies rather than zero bytes", async () => {
    const arrayBuffer = vi.fn();
    const onResponse = vi.fn();
    await expect(fetchValidatedZip("https://example.test/gtfs.zip", {
      attempts: 1, fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503, arrayBuffer }), onResponse,
    })).rejects.toThrow("HTTP 503");
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(onResponse.mock.calls[0][0]).toMatchObject({ body: null, status: 503 });
    expect(onResponse.mock.calls[0][0]).not.toHaveProperty("bytes");
  });

  it("enforces the native archive body limit before validation while preserving read-failure evidence", async () => {
    const onResponse = vi.fn();
    const validateArchive = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(response(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00])));
    await expect(fetchValidatedZip("https://example.test/gtfs.zip", {
      attempts: 1, maxBytes: 4, fetchImpl, onResponse, validateArchive,
    })).rejects.toThrow("byte limit");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(validateArchive).not.toHaveBeenCalled();
    expect(onResponse.mock.calls[0][0]).toMatchObject({ body: null, bodyState: "read_failed", context: { attempt: 1 } });
  });
});
