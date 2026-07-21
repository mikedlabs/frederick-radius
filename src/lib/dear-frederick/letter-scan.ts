import "server-only";

import { del } from "@vercel/blob";
import { parseFieldPhotoDataUrl } from "@/lib/field-photo";

/**
 * Validation + Blob helpers for a Dear Frederick letter scan.
 *
 * The submit endpoint is PUBLIC, so the uploaded scan is fully untrusted. This
 * reuses the /collect photo validator (`parseFieldPhotoDataUrl`) for the
 * load-bearing checks — the declared MIME must be jpeg/png/webp AND its file
 * signature must agree (a filename/label is never trusted), the base64 must be
 * canonical, and the decoded bytes must sit under the 4 MiB ceiling — then adds
 * a best-effort maximum-dimension guard so a crafted header cannot declare an
 * absurd canvas. Dimensions are only enforced when they can be parsed: a parse
 * gap never rejects a genuine image, since the signature already proved the
 * format.
 *
 * A downscaled letter scan (the client shrinks to ~2000px JPEG before upload)
 * is well under every ceiling here; the ceilings exist to bound abuse, not to
 * gate a real letter.
 */

/** Sanity ceiling on either dimension. Nothing a phone or scanner produces
 *  approaches this; it caps a crafted-header decompression-bomb declaration. */
export const MAX_LETTER_SCAN_DIMENSION = 10_000;

export type ParsedLetterScan =
  | { status: "absent" }
  | {
      status: "valid";
      bytes: Buffer;
      contentType: "image/jpeg" | "image/png" | "image/webp";
      extension: "jpg" | "png" | "webp";
    }
  | { status: "invalid"; error: "scan-invalid" | "scan-too-large" | "scan-bad-dimensions" };

/**
 * Read the pixel dimensions from a decoded image's header. Returns null when
 * the header is too short or the format's dimension fields cannot be located;
 * the caller treats null as "cannot enforce" rather than "reject". Pure.
 */
export function imageDimensions(
  bytes: Buffer,
  contentType: "image/jpeg" | "image/png" | "image/webp",
): { width: number; height: number } | null {
  if (contentType === "image/png") return pngDimensions(bytes);
  if (contentType === "image/webp") return webpDimensions(bytes);
  return jpegDimensions(bytes);
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  // 8-byte signature, then the IHDR chunk: length(4) + "IHDR"(4) + width(4) + height(4).
  if (bytes.length < 24) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  // Walk the marker segments looking for a Start-Of-Frame (SOFn) marker; its
  // payload carries height then width.
  let offset = 2; // skip SOI (0xFFD8)
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1; // resync past fill bytes / corruption
      continue;
    }
    let marker = bytes[offset + 1];
    // Skip any run of 0xFF padding bytes before the marker code.
    let markerPos = offset + 1;
    while (marker === 0xff && markerPos + 1 < bytes.length) {
      markerPos += 1;
      marker = bytes[markerPos];
    }
    // Standalone markers (no length): SOI, EOI, TEM, RSTn.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = markerPos + 1;
      continue;
    }
    const segStart = markerPos + 1;
    if (segStart + 1 >= bytes.length) return null;
    const segLen = bytes.readUInt16BE(segStart);
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) hold the frame dimensions.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (segStart + 7 >= bytes.length) return null;
      const height = bytes.readUInt16BE(segStart + 3);
      const width = bytes.readUInt16BE(segStart + 5);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }
    if (segLen < 2) return null;
    offset = segStart + segLen;
  }
  return null;
}

function webpDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const format = bytes.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    // Lossy: 3-byte frame tag, then start code 9d 01 2a, then 14-bit w/h LE.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }
  if (format === "VP8L") {
    // Lossless: signature byte 0x2f, then 14-bit width and height packed.
    if (bytes[20] !== 0x2f) return null;
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (format === "VP8X") {
    // Extended: 24-bit (little-endian) width-minus-one then height-minus-one.
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  return null;
}

/**
 * Validate a public letter-scan data URL. `absent` when nothing was supplied
 * (the route treats a scan as required); `valid` with decoded bytes ready for
 * Blob; `invalid` with a specific reason otherwise.
 */
export function parseLetterScanDataUrl(raw: unknown): ParsedLetterScan {
  const parsed = parseFieldPhotoDataUrl(raw);
  if (parsed.status === "absent") return { status: "absent" };
  if (parsed.status === "invalid") {
    return {
      status: "invalid",
      error: parsed.error === "photo-too-large" ? "scan-too-large" : "scan-invalid",
    };
  }

  // Content-type + size are proven above. Add a best-effort dimension ceiling.
  const dims = imageDimensions(parsed.bytes, parsed.contentType);
  if (dims && (dims.width > MAX_LETTER_SCAN_DIMENSION || dims.height > MAX_LETTER_SCAN_DIMENSION)) {
    return { status: "invalid", error: "scan-bad-dimensions" };
  }

  return {
    status: "valid",
    bytes: parsed.bytes,
    contentType: parsed.contentType,
    extension: parsed.extension,
  };
}

/** Only URLs created by the submit route may be removed by its cleanup path. */
export function isManagedLetterScan(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith("/dear-frederick-scans/") &&
      url.pathname.length > "/dear-frederick-scans/".length
    );
  } catch {
    return false;
  }
}

/**
 * Delete one managed letter scan. Unmanaged/empty URLs are intentionally a
 * no-op; false means a managed Blob could not be removed. Used only to
 * compensate when the DB insert fails after the scan was already stored.
 */
export async function deleteLetterScan(value: string | null | undefined): Promise<boolean> {
  if (!isManagedLetterScan(value)) return true;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  try {
    await del(value);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "BlobNotFoundError") return true;
    console.warn("[dear-frederick] managed Blob deletion failed");
    return false;
  }
}
