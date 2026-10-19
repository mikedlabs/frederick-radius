import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";

// Base64 avoids JSON escaping expansion in Next's two-megabyte Data Cache.
// Bound both the persisted entry and decompression before allocating output.
export const EVENT_ARCHIVE_CACHE_ENTRY_MAX_BYTES = 1_500_000;
export const EVENT_ARCHIVE_CACHE_DECODED_MAX_BYTES = 8 * 1024 * 1024;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

type EncodedArchiveEnvelope = {
  version: 1;
  encoding: "gzip-base64";
  decodedBytes: number;
  data: string;
};

export async function encodeArchiveEnvelope(value: unknown): Promise<EncodedArchiveEnvelope> {
  const json = JSON.stringify(value);
  if (typeof json !== "string") throw new Error("Archive envelope is not JSON");
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > EVENT_ARCHIVE_CACHE_DECODED_MAX_BYTES) throw new Error("Archive envelope exceeds decoded cache budget");
  const compressed = await gzipAsync(json, { level: 1 });
  const encoded: EncodedArchiveEnvelope = {
    version: 1, encoding: "gzip-base64", decodedBytes: bytes,
    data: compressed.toString("base64"),
  };
  if (Buffer.byteLength(JSON.stringify(encoded), "utf8") > EVENT_ARCHIVE_CACHE_ENTRY_MAX_BYTES) {
    throw new Error("Archive envelope exceeds encoded cache budget");
  }
  return encoded;
}

export async function decodeArchiveEnvelope(value: unknown): Promise<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid archive cache entry");
  const entry = value as Partial<EncodedArchiveEnvelope>;
  if (entry.version !== 1 || entry.encoding !== "gzip-base64" ||
      !Number.isSafeInteger(entry.decodedBytes) || Number(entry.decodedBytes) <= 0 ||
      Number(entry.decodedBytes) > EVENT_ARCHIVE_CACHE_DECODED_MAX_BYTES ||
      typeof entry.data !== "string" || entry.data.length === 0 || entry.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.data) ||
      Buffer.byteLength(JSON.stringify(value), "utf8") > EVENT_ARCHIVE_CACHE_ENTRY_MAX_BYTES) {
    throw new Error("Invalid archive cache entry");
  }
  const bytes = await gunzipAsync(Buffer.from(entry.data, "base64"), {
    maxOutputLength: EVENT_ARCHIVE_CACHE_DECODED_MAX_BYTES,
  });
  if (bytes.byteLength !== entry.decodedBytes) throw new Error("Archive cache byte count mismatch");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
