export type IngestWriteStatus = "ok" | "partial" | "error";

const MAX_ERROR_LENGTH = 240;

/**
 * Keep enough of a database error to diagnose a broken ingest without putting
 * connection strings, credentials, or API tokens into ingest_runs or a JSON
 * response. Only the Error message is considered; driver detail/query fields
 * can contain row data and are deliberately ignored.
 */
export function safeIngestWriteError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "database write failed";

  const clean = raw
    .replace(
      /\b(DATABASE_URL|POSTGRES_URL|SUPABASE_DB_URL|authorization|api[_-]?key|password|passwd|secret|token)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=[redacted]",
    )
    .replace(
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s"'`<>]+/gi,
      "[redacted connection URL]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /([?&](?:access_token|api[_-]?key|key|password|secret|signature|token)=)[^&#\s]*/gi,
      "$1[redacted]",
    )
    .replace(/\b(?:sk|pk|tvly|fc)-[A-Za-z0-9_-]{12,}\b/g, "[redacted token]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const useful = clean || "database write failed";
  return useful.length > MAX_ERROR_LENGTH
    ? `${useful.slice(0, MAX_ERROR_LENGTH - 3)}...`
    : useful;
}

export function summarizeIngestWriteFailures({
  attempted,
  failed,
  firstError,
}: {
  attempted: number;
  failed: number;
  firstError?: string;
}): { status: IngestWriteStatus; error?: string } {
  const safeAttempted = Math.max(0, Math.floor(attempted));
  const safeFailed = Math.max(0, Math.floor(failed));
  if (safeFailed === 0) return { status: "ok" };

  const allFailed = safeAttempted === 0 || safeFailed >= safeAttempted;
  const status: IngestWriteStatus = allFailed ? "error" : "partial";
  const scope = allFailed ? `all ${safeFailed}` : `${safeFailed} of ${safeAttempted}`;
  const error = `${scope} event write${safeFailed === 1 ? "" : "s"} failed${
    firstError ? `: ${firstError}` : ""
  }`;
  return { status, error };
}
