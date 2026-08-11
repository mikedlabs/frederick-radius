import { describe, expect, it, vi } from "vitest";
import {
  fetchValidatedZip,
  hasZipSignature,
} from "../scripts/lib/fetch-validated-zip";

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
});
