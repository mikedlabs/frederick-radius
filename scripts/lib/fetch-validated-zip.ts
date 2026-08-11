type FetchResponse = Pick<Response, "ok" | "status" | "arrayBuffer">;

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

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(deadlineMs),
        headers: { Accept: "application/zip, application/octet-stream;q=0.9" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const archive = Buffer.from(await response.arrayBuffer());
      if (!hasZipSignature(archive)) {
        throw new Error(`response is not a ZIP archive (${archive.length} bytes)`);
      }
      await options.validateArchive?.(archive);
      return archive;
    } catch (error) {
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
