import { NativeEvidenceError, readNativeResponseBytes, type NativeResponseObserver } from "./native-source-review-evidence";

type FetchResponse = Pick<Response, "ok" | "status" | "arrayBuffer"> & Partial<Pick<Response, "url" | "body" | "headers">>;

type FetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<FetchResponse>;

type FetchValidatedZipOptions = {
  attempts?: number;
  deadlineMs?: number;
  fetchImpl?: FetchImpl;
  validateArchive?: (archive: Buffer) => void | Promise<void>;
  onRetry?: (message: string) => void;
  sleepImpl?: (ms: number) => Promise<void>;
  onResponse?: NativeResponseObserver;
  maxBytes?: number;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DEADLINE_MS = 30_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** ZIP files begin with a local-file, empty-archive, or spanning signature. */
export function hasZipSignature(archive: Uint8Array): boolean {
  if (archive.length < 4 || archive[0] !== 0x50 || archive[1] !== 0x4b) {
    return false;
  }
  return (
    (archive[2] === 0x03 && archive[3] === 0x04) ||
    (archive[2] === 0x05 && archive[3] === 0x06) ||
    (archive[2] === 0x07 && archive[3] === 0x08)
  );
}

/**
 * Download a ZIP without letting a transient HTML/error body replace a known
 * good generated snapshot. Callers may provide a real archive validator (for
 * example `unzip -tq`) so a truncated response is retried too.
 */
export async function fetchValidatedZip(
  url: string,
  options: FetchValidatedZipOptions = {},
): Promise<Buffer> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const deadlineMs = Math.max(1, options.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl =
    options.sleepImpl ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError = "unknown download failure";
  const observe: NativeResponseObserver = (response) => {
    try { options.onResponse?.(response); }
    catch (error) { throw new NativeEvidenceError(errorMessage(error)); }
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(deadlineMs),
        headers: { Accept: "application/zip, application/octet-stream;q=0.9" },
      });
      if (!response.ok) {
        observe({ requestedUrl: url, finalUrl: response.url || url, method: "GET", status: response.status,
          observedAt: new Date().toISOString(), body: null, context: { phase: "gtfs-archive", attempt } });
        throw new Error(`HTTP ${response.status}`);
      }

      let archive: Buffer;
      try { archive = await readNativeResponseBytes(response, options.maxBytes ?? 20_000_000, deadlineMs); }
      catch (error) {
        observe({ requestedUrl: url, finalUrl: response.url || url, method: "GET", status: response.status,
          observedAt: new Date().toISOString(), body: null, bodyState: "read_failed", context: { phase: "gtfs-archive", attempt } });
        throw error;
      }
      observe({ requestedUrl: url, finalUrl: response.url || url, method: "GET", status: response.status,
        observedAt: new Date().toISOString(), body: archive, context: { phase: "gtfs-archive", attempt } });
      if (!hasZipSignature(archive)) {
        throw new Error(`response is not a ZIP archive (${archive.length} bytes)`);
      }
      await options.validateArchive?.(archive);
      return archive;
    } catch (error) {
      if (error instanceof NativeEvidenceError) throw error;
      lastError = errorMessage(error);
      if (attempt === attempts) break;
      options.onRetry?.(
        `GTFS download attempt ${attempt} failed (${lastError}); retrying.`,
      );
      await sleepImpl(250 * attempt);
    }
  }

  throw new Error(
    `GTFS download failed after ${attempts} attempts: ${lastError}`,
  );
}
