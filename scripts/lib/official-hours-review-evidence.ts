import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MERCHANT_HOURS_SOURCES } from "../../src/lib/merchant-hours";
import type { OfficialPageReceipt } from "./fcpl-official-hours";

/** Bounded authenticated review artifact, separate from publishable data. This
 * wraps the existing transport; it never makes an additional request or retry.
 */
export function createOfficialHoursReviewEvidence(directory: string, options: { now?: Date; sourceRevision?: string } = {}) {
  const root = resolve(directory);
  // A repeat attempt must use a new directory, never overwrite older evidence.
  mkdirSync(root, { mode: 0o700 });
  const records: { source_url: string; slugs: string[]; status: "captured" | "unavailable" | "manual_not_read"; checked_at?: string; observed_at?: string; source_sha256?: string; evidence_file?: string; bytes?: number }[] = [];
  const checkedAt = (options.now ?? new Date()).toISOString();
  const sourceRevision = /^[a-f0-9]{40}$/.test(options.sourceRevision ?? "") ? options.sourceRevision : "unknown";
  const registeredUrls = new Set(MERCHANT_HOURS_SOURCES.map((source) => source.url));
  const writeIndex = () => writeFileSync(resolve(root, "index.json"), JSON.stringify({ schema_version: 1, source_revision: sourceRevision,
    // Complete means every registered native URL has an attempt outcome, never
    // that all sources succeeded or that their proposed facts were accepted.
    collection_complete: new Set(records.map((record) => record.source_url)).size === registeredUrls.size,
    records }, null, 2) + "\n", { mode: 0o600 });
  for (const source of MERCHANT_HOURS_SOURCES) {
    if ("collection" in source && source.collection === "manual") records.push({ source_url: source.url, slugs: [source.slug], status: "manual_not_read" });
  }
  writeIndex();
  const seen = new Set<string>();
  return async function capture(url: string, fetchPage: (url: string) => Promise<OfficialPageReceipt>): Promise<OfficialPageReceipt> {
    const sources = MERCHANT_HOURS_SOURCES.filter((source) => source.url === url && !("collection" in source && source.collection === "manual"));
    if (!sources.length || seen.has(url)) throw new Error("Review evidence requires one existing native source read per URL.");
    seen.add(url);
    try {
      const page = await fetchPage(url);
      const maxBytes = Math.max(...sources.map((source) => "max_response_bytes" in source ? source.max_response_bytes : 512_000));
      if (page.url !== url || typeof page.html !== "string" || Buffer.byteLength(page.html) > maxBytes
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(page.observedAt) || !Number.isFinite(Date.parse(page.observedAt))) throw new Error("Unusable native review receipt.");
      const hash = createHash("sha256").update(page.html).digest("hex");
      const file = `${createHash("sha256").update(url).digest("hex")}.html`;
      writeFileSync(resolve(root, file), page.html, { flag: "wx", mode: 0o600 });
      records.push({ source_url: url, slugs: sources.map((source) => source.slug), status: "captured", observed_at: page.observedAt, source_sha256: hash, evidence_file: file, bytes: Buffer.byteLength(page.html) });
      return page;
    }
    catch (error) {
      records.push({ source_url: url, slugs: sources.map((source) => source.slug), status: "unavailable", checked_at: checkedAt });
      throw error;
    } finally { writeIndex(); }
  };
}
