import { createHash } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

export type NativeResponseEvidence = {
  requestedUrl: string;
  finalUrl: string;
  method: "GET" | "POST";
  status: number;
  body: Uint8Array | null;
  bodyState?: "not_read" | "read_failed";
  observedAt: string;
  context?: Record<string, string | number>;
};
export type NativeResponseObserver = (response: NativeResponseEvidence) => void;

/** Storage failure must never create another source request or retry. */
export class NativeEvidenceError extends Error {}

export function observeNativeResponse(observer: NativeResponseObserver | undefined, response: NativeResponseEvidence): void {
  try { observer?.(response); }
  catch (error) { throw new NativeEvidenceError(error instanceof Error ? error.message : "Native evidence capture failed."); }
}

/** Read the existing response once. Retaining its bytes does not fetch again. */
export async function readNativeResponseBytes(
  response: Pick<Response, "arrayBuffer"> & Partial<Pick<Response, "body" | "headers">>,
  maxBytes: number,
  timeoutMs: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("Invalid native response bound.");
  const declared = response.headers?.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Native response exceeds its byte limit.");
  }
  const reader = response.body?.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completed = false;
  const collect = async () => {
    if (!reader) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxBytes) throw new Error("Native response exceeds its byte limit.");
      return bytes;
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks, length);
      length += next.value.byteLength;
      if (length > maxBytes) throw new Error("Native response exceeds its byte limit.");
      chunks.push(next.value);
    }
  };
  try {
    const bytes = await Promise.race([collect(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Native response body timed out.")), timeoutMs);
    })]);
    completed = true;
    return bytes;
  } finally {
    clearTimeout(timer);
    if (reader) {
      if (completed) reader.releaseLock();
      else void reader.cancel().catch(() => {});
    }
  }
}

const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const within = (parent: string, child: string) => {
  const path = relative(parent, child);
  return !path || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
};
const validTime = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const hostname = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Native source evidence requires a public HTTPS identity.");
  return url.hostname.toLowerCase().replace(/^www\./, "");
};

export function createNativeSourceReviewEvidence(directory: string, options: {
  publisher: "native-venues" | "frederick-transit";
  sourceRevision: string;
  sourceRun?: string;
  sourceAttempt?: string;
  sources: { id: string; urls: string[]; selected: boolean }[];
  maxResponses: number;
  maxResponseBytes: number;
  maxTotalBytes: number;
  checkout?: string;
  now?: () => Date;
}) {
  const checkout = realpathSync(options.checkout ?? process.cwd());
  const root = resolve(realpathSync(dirname(resolve(directory))), basename(directory));
  if (within(checkout, root) || !/^[a-f0-9]{40}$/.test(options.sourceRevision)
    || ![options.maxResponses, options.maxResponseBytes, options.maxTotalBytes].every(value => Number.isSafeInteger(value) && value > 0)
    || !options.sources.length || new Set(options.sources.map(source => source.id)).size !== options.sources.length) throw new Error("Invalid private native evidence scope.");
  for (const source of options.sources) {
    if (!/^[a-z0-9-]+$/.test(source.id) || !source.urls.length) throw new Error("Invalid native source identity.");
    source.urls.forEach(hostname);
  }
  if ((options.sourceRun !== undefined && !/^[1-9]\d*$/.test(options.sourceRun))
    || (options.sourceAttempt !== undefined && !/^[1-9]\d*$/.test(options.sourceAttempt))) throw new Error("Invalid native run or attempt identity.");
  const run = options.sourceRun ?? null;
  const attempt = options.sourceAttempt ?? null;
  if ((run === null) !== (attempt === null)) throw new Error("Native run and attempt must be supplied together.");
  mkdirSync(root, { mode: 0o700 }); // Existing evidence is never overwritten.
  const now = options.now ?? (() => new Date());
  const selected = options.sources.filter(source => source.selected).map(source => source.id);
  const records: Record<string, unknown>[] = [];
  const outcomes: Record<string, unknown>[] = options.sources.filter(source => !source.selected).map(source => ({ source_id: source.id, status: "unselected" }));
  let bytes = 0, finished = false, captureFailed = false, outputsBound = false;
  const index: Record<string, unknown> = { schema_version: 1, publisher: options.publisher, source_revision: options.sourceRevision,
    source_run: run, source_attempt: attempt, started_at: now().toISOString(), selected_sources: selected,
    collection_complete: false, capture_failed: false, generated_outputs_bound: false, semantic_acceptance: false,
    records, source_outcomes: outcomes };
  const write = (file: string, content: string | Uint8Array) => {
    const fd = openSync(resolve(root, file), "wx", 0o600);
    try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
  };
  const saveIndex = () => {
    index.capture_failed = captureFailed;
    write("index.json.pending", JSON.stringify(index, null, 2) + "\n");
    renameSync(resolve(root, "index.json.pending"), resolve(root, "index.json"));
  };
  saveIndex();
  return {
    capture(sourceId: string, response: NativeResponseEvidence) {
      try {
        const source = options.sources.find(row => row.id === sourceId && row.selected);
        if (finished || !source || records.length >= options.maxResponses || !validTime(response.observedAt)
          || !["GET", "POST"].includes(response.method) || !Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599
          || !source.urls.some(url => hostname(url) === hostname(response.requestedUrl))
          || hostname(response.requestedUrl) !== hostname(response.finalUrl)) throw new Error("Native response identity or capture boundary changed.");
        const record: Record<string, unknown> = { source_id: sourceId, request_number: records.length + 1,
          requested_url: response.requestedUrl, final_url: response.finalUrl, method: response.method, status: response.status,
          request_context: response.context ?? {} };
        if (response.body === null) {
          Object.assign(record, { body_state: response.bodyState ?? "not_read", checked_at: response.observedAt });
        } else {
          if (response.body.byteLength > options.maxResponseBytes || bytes + response.body.byteLength > options.maxTotalBytes) throw new Error("Native evidence byte budget exceeded.");
          const hash = digest(response.body), file = `${String(records.length + 1).padStart(3, "0")}-${hash}.body`;
          write(file, response.body); bytes += response.body.byteLength;
          Object.assign(record, { body_state: "captured", observed_at: response.observedAt, source_sha256: hash, evidence_file: file, bytes: response.body.byteLength });
        }
        records.push(record); saveIndex();
      } catch (error) {
        captureFailed = true;
        try { saveIndex(); } catch { /* Original write failure remains held. */ }
        throw new NativeEvidenceError(error instanceof Error ? error.message : "Native evidence capture failed.");
      }
    },
    finish(result: { sourceId: string; status: "complete" | "failed"; observedAt: string }[]) {
      if (finished || captureFailed || result.length !== selected.length || new Set(result.map(row => row.sourceId)).size !== selected.length
        || result.some(row => !selected.includes(row.sourceId) || !validTime(row.observedAt)
          || !["complete", "failed"].includes(row.status)
          || (row.status === "complete" && !records.some(record => record.source_id === row.sourceId && record.body_state === "captured")))) throw new NativeEvidenceError("Native collection evidence is incomplete; publication stays held.");
      outcomes.push(...result.map(row => ({ source_id: row.sourceId, status: row.status,
        ...(row.status === "complete" ? { observed_at: row.observedAt } : { checked_at: row.observedAt }) })));
      finished = true; index.collection_complete = true; index.completed_at = now().toISOString(); saveIndex();
    },
    bindOutputs(paths: string[]) {
      if (!finished || captureFailed || outputsBound || !paths.length || new Set(paths).size !== paths.length) throw new NativeEvidenceError("Native outputs cannot bind incomplete or already bound evidence.");
      const outputs = paths.map(path => {
        const file = realpathSync(resolve(checkout, path));
        if (!within(resolve(checkout, "src/data"), file)) throw new NativeEvidenceError("Native output escaped the data artifact scope.");
        return { path, sha256: digest(readFileSync(file)) };
      });
      outputsBound = true;
      index.output_files = outputs; index.generated_outputs_bound = true; saveIndex();
    },
  };
}
