import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ del: vi.fn() }));

vi.mock("@vercel/blob", () => ({ del: mocks.del }));

import {
  MAX_LETTER_SCAN_DIMENSION,
  deleteLetterScan,
  imageDimensions,
  isManagedLetterScan,
  parseLetterScanDataUrl,
} from "@/lib/dear-frederick/letter-scan";
import { MAX_FIELD_PHOTO_BYTES } from "@/lib/field-photo";

const MANAGED =
  "https://store.public.blob.vercel-storage.com/dear-frederick-scans/letter.jpg";

function dataUrl(type: "image/jpeg" | "image/png" | "image/webp", bytes: Buffer) {
  return `data:${type};base64,${bytes.toString("base64")}`;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** A structurally valid-enough PNG: real signature, an IHDR carrying the given
 *  dimensions at the standard offsets, and the IEND trailer the parser checks. */
function buildPng(width: number, height: number): Buffer {
  const w = Buffer.alloc(4);
  w.writeUInt32BE(width);
  const h = Buffer.alloc(4);
  h.writeUInt32BE(height);
  return Buffer.concat([
    PNG_SIG,
    Buffer.from([0x00, 0x00, 0x00, 0x0d]), // IHDR length
    Buffer.from("IHDR", "ascii"),
    w,
    h,
    Buffer.from([0x08, 0x06, 0x00, 0x00, 0x00]), // depth, color type, etc.
    PNG_IEND,
  ]);
}

/** A minimal JPEG with an SOF0 marker carrying the given dimensions, and the
 *  FFD8…FFD9 envelope the signature check requires. */
function buildJpeg(width: number, height: number): Buffer {
  const h = Buffer.alloc(2);
  h.writeUInt16BE(height);
  const w = Buffer.alloc(2);
  w.writeUInt16BE(width);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xc0]), // SOF0
    Buffer.from([0x00, 0x11]), // segment length
    Buffer.from([0x08]), // sample precision
    h,
    w,
    Buffer.from([0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]), // component data
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

describe("imageDimensions", () => {
  it("reads PNG and JPEG dimensions from their headers", () => {
    expect(imageDimensions(buildPng(640, 480), "image/png")).toEqual({ width: 640, height: 480 });
    expect(imageDimensions(buildJpeg(1024, 768), "image/jpeg")).toEqual({ width: 1024, height: 768 });
  });

  it("returns null when the header is too short to locate dimensions", () => {
    expect(imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg")).toBeNull();
  });
});

describe("letter scan validation", () => {
  it("reports an absent scan when nothing is supplied", () => {
    expect(parseLetterScanDataUrl(undefined)).toEqual({ status: "absent" });
    expect(parseLetterScanDataUrl(null)).toEqual({ status: "absent" });
    expect(parseLetterScanDataUrl("")).toEqual({ status: "absent" });
  });

  it("accepts a genuine image within the size and dimension ceilings", () => {
    expect(parseLetterScanDataUrl(dataUrl("image/png", buildPng(800, 600)))).toMatchObject({
      status: "valid",
      contentType: "image/png",
      extension: "png",
    });
    expect(parseLetterScanDataUrl(dataUrl("image/jpeg", buildJpeg(1200, 900)))).toMatchObject({
      status: "valid",
      contentType: "image/jpeg",
      extension: "jpg",
    });
  });

  it("rejects a spoofed MIME label and an active format as scan-invalid", () => {
    // JPEG bytes labelled as PNG: the signature disagrees with the label.
    expect(parseLetterScanDataUrl(dataUrl("image/png", buildJpeg(10, 10)))).toEqual({
      status: "invalid",
      error: "scan-invalid",
    });
    expect(parseLetterScanDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({
      status: "invalid",
      error: "scan-invalid",
    });
  });

  it("rejects an oversize payload as scan-too-large", () => {
    const tooLarge = "A".repeat(Math.ceil(MAX_FIELD_PHOTO_BYTES / 3) * 4 + 4);
    expect(parseLetterScanDataUrl(`data:image/jpeg;base64,${tooLarge}`)).toEqual({
      status: "invalid",
      error: "scan-too-large",
    });
  });

  it("rejects an image whose declared dimensions exceed the ceiling", () => {
    const huge = MAX_LETTER_SCAN_DIMENSION + 1;
    expect(parseLetterScanDataUrl(dataUrl("image/png", buildPng(huge, 100)))).toEqual({
      status: "invalid",
      error: "scan-bad-dimensions",
    });
    expect(parseLetterScanDataUrl(dataUrl("image/jpeg", buildJpeg(100, huge)))).toEqual({
      status: "invalid",
      error: "scan-bad-dimensions",
    });
  });
});

describe("letter scan cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.del.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("only recognizes the dear-frederick-scans prefix on Vercel public Blob hosts", () => {
    expect(isManagedLetterScan(MANAGED)).toBe(true);
    expect(
      isManagedLetterScan(
        "https://store.public.blob.vercel-storage.com/field-photos/point.jpg",
      ),
    ).toBe(false);
    expect(
      isManagedLetterScan(
        "https://store.public.blob.vercel-storage.com.evil.example/dear-frederick-scans/letter.jpg",
      ),
    ).toBe(false);
    expect(isManagedLetterScan("not a url")).toBe(false);
  });

  it("deletes managed scans, ignores unrelated URLs, and fails closed without a token", async () => {
    await expect(deleteLetterScan(MANAGED)).resolves.toBe(true);
    expect(mocks.del).toHaveBeenCalledWith(MANAGED);

    mocks.del.mockClear();
    await expect(deleteLetterScan("https://example.com/dear-frederick-scans/letter.jpg")).resolves.toBe(true);
    expect(mocks.del).not.toHaveBeenCalled();

    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(deleteLetterScan(MANAGED)).resolves.toBe(false);
  });

  it("treats an already-deleted Blob as a successful retry", async () => {
    const missing = new Error("missing");
    missing.name = "BlobNotFoundError";
    mocks.del.mockRejectedValue(missing);

    await expect(deleteLetterScan(MANAGED)).resolves.toBe(true);
  });
});
