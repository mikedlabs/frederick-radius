import "server-only";

import { del } from "@vercel/blob";

export const MAX_FIELD_PHOTO_BYTES = 4 * 1024 * 1024;

export type ParsedFieldPhoto =
  | { status: "absent" }
  | {
      status: "valid";
      bytes: Buffer;
      contentType: "image/jpeg" | "image/png" | "image/webp";
      extension: "jpg" | "png" | "webp";
    }
  | { status: "invalid"; error: "invalid-photo" | "photo-too-large" };

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_BASE64_CHARS = Math.ceil(MAX_FIELD_PHOTO_BYTES / 3) * 4;

function hasJpegSignature(bytes: Buffer): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function hasPngSignature(bytes: Buffer): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length + PNG_END.length &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    bytes.subarray(bytes.length - PNG_END.length).equals(PNG_END)
  );
}

function hasWebpSignature(bytes: Buffer): boolean {
  if (bytes.length < 16) return false;
  const chunkType = bytes.toString("ascii", 12, 16);
  return (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    (chunkType === "VP8 " || chunkType === "VP8L" || chunkType === "VP8X") &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  );
}

/**
 * Decode the field tool's data URL and verify that its declared MIME type
 * matches basic file signatures. SVG and other active formats are deliberately
 * excluded; a filename or browser-provided MIME label alone is not trusted.
 */
export function parseFieldPhotoDataUrl(raw: unknown): ParsedFieldPhoto {
  if (raw === undefined || raw === null || raw === "") return { status: "absent" };
  if (typeof raw !== "string") return { status: "invalid", error: "invalid-photo" };

  const match = DATA_URL.exec(raw);
  if (!match) return { status: "invalid", error: "invalid-photo" };

  const encoded = match[2];
  if (encoded.length > MAX_BASE64_CHARS) {
    return { status: "invalid", error: "photo-too-large" };
  }
  // Browser FileReader emits canonical padded base64. Requiring that form
  // avoids Buffer.from's intentionally permissive handling of junk bytes.
  if (encoded.length % 4 !== 0) {
    return { status: "invalid", error: "invalid-photo" };
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0) return { status: "invalid", error: "invalid-photo" };
  if (bytes.length > MAX_FIELD_PHOTO_BYTES) {
    return { status: "invalid", error: "photo-too-large" };
  }

  const contentType = match[1] as "image/jpeg" | "image/png" | "image/webp";
  const signatureMatches =
    contentType === "image/jpeg"
      ? hasJpegSignature(bytes)
      : contentType === "image/png"
        ? hasPngSignature(bytes)
        : hasWebpSignature(bytes);
  if (!signatureMatches) return { status: "invalid", error: "invalid-photo" };

  return {
    status: "valid",
    bytes,
    contentType,
    extension: contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg",
  };
}

/** Only URLs created by /api/collect may be removed by its cleanup paths. */
export function isManagedFieldPhoto(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith("/field-photos/") &&
      url.pathname.length > "/field-photos/".length
    );
  } catch {
    return false;
  }
}

/**
 * Delete one managed field photo. Unmanaged/empty URLs are intentionally a
 * no-op; false means a managed Blob could not be removed and its DB row should
 * be retained so the operation can be retried.
 */
export async function deleteFieldPhoto(value: string | null | undefined): Promise<boolean> {
  if (!isManagedFieldPhoto(value)) return true;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  try {
    await del(value);
    return true;
  } catch (error) {
    // A prior retry may already have removed the Blob while its database row
    // survived a transient DB failure. Treat "already gone" as success so the
    // retained row can still be cleared/deleted on the next attempt.
    if (error instanceof Error && error.name === "BlobNotFoundError") return true;
    console.warn("[field-photos] managed Blob deletion failed");
    return false;
  }
}
