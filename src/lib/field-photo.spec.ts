import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ del: vi.fn() }));

vi.mock("@vercel/blob", () => ({ del: mocks.del }));

import {
  MAX_FIELD_PHOTO_BYTES,
  deleteFieldPhoto,
  isManagedFieldPhoto,
  parseFieldPhotoDataUrl,
} from "@/lib/field-photo";

const MANAGED =
  "https://store.public.blob.vercel-storage.com/field-photos/point.jpg";

function dataUrl(type: "image/jpeg" | "image/png" | "image/webp", bytes: Buffer) {
  return `data:${type};base64,${bytes.toString("base64")}`;
}

describe("field photo validation", () => {
  it("accepts the allowed MIME types when their file signatures agree", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const webp = Buffer.alloc(16);
    webp.write("RIFF", 0, "ascii");
    webp.writeUInt32LE(webp.length - 8, 4);
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8L", 12, "ascii");

    expect(parseFieldPhotoDataUrl(dataUrl("image/jpeg", jpeg))).toMatchObject({
      status: "valid",
      contentType: "image/jpeg",
      extension: "jpg",
    });
    expect(parseFieldPhotoDataUrl(dataUrl("image/png", png))).toMatchObject({
      status: "valid",
      contentType: "image/png",
      extension: "png",
    });
    expect(parseFieldPhotoDataUrl(dataUrl("image/webp", webp))).toMatchObject({
      status: "valid",
      contentType: "image/webp",
      extension: "webp",
    });
  });

  it("rejects spoofed MIME labels, malformed base64, and active formats", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);

    expect(parseFieldPhotoDataUrl(dataUrl("image/png", jpeg))).toEqual({
      status: "invalid",
      error: "invalid-photo",
    });
    expect(parseFieldPhotoDataUrl("data:image/jpeg;base64,%%%=")).toEqual({
      status: "invalid",
      error: "invalid-photo",
    });
    expect(parseFieldPhotoDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({
      status: "invalid",
      error: "invalid-photo",
    });
  });

  it("rejects an encoded payload before decoding when it exceeds 4 MiB", () => {
    const tooLarge = "A".repeat(Math.ceil(MAX_FIELD_PHOTO_BYTES / 3) * 4 + 4);
    expect(parseFieldPhotoDataUrl(`data:image/jpeg;base64,${tooLarge}`)).toEqual({
      status: "invalid",
      error: "photo-too-large",
    });
  });
});

describe("field photo cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.del.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("only recognizes the field-photo prefix on Vercel public Blob hosts", () => {
    expect(isManagedFieldPhoto(MANAGED)).toBe(true);
    expect(
      isManagedFieldPhoto(
        "https://store.public.blob.vercel-storage.com/community-reports/point.jpg",
      ),
    ).toBe(false);
    expect(
      isManagedFieldPhoto(
        "https://store.public.blob.vercel-storage.com.evil.example/field-photos/point.jpg",
      ),
    ).toBe(false);
    expect(isManagedFieldPhoto("not a url")).toBe(false);
  });

  it("deletes managed photos, ignores unrelated URLs, and fails closed without a token", async () => {
    await expect(deleteFieldPhoto(MANAGED)).resolves.toBe(true);
    expect(mocks.del).toHaveBeenCalledWith(MANAGED);

    mocks.del.mockClear();
    await expect(deleteFieldPhoto("https://example.com/field-photos/point.jpg")).resolves.toBe(true);
    expect(mocks.del).not.toHaveBeenCalled();

    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(deleteFieldPhoto(MANAGED)).resolves.toBe(false);
  });

  it("treats an already-deleted Blob as a successful retry", async () => {
    const missing = new Error("missing");
    missing.name = "BlobNotFoundError";
    mocks.del.mockRejectedValue(missing);

    await expect(deleteFieldPhoto(MANAGED)).resolves.toBe(true);
  });
});
