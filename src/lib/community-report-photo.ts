import "server-only";

import { del } from "@vercel/blob";

/** Only delete images created by /api/reports. Never pass arbitrary stored URLs
 * to Blob's delete API, even from an admin or cleanup path. */
export function isManagedCommunityReportPhoto(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith("/community-reports/")
    );
  } catch {
    return false;
  }
}

const BLOB_DELETE_TIMEOUT_MS = 5_000;

/** Best-effort removal after an expired report row has been deleted. The
 * request is abortable so retention cannot lose its final audit-heartbeat
 * headroom to a stalled Blob API call. */
export async function deleteCommunityReportPhoto(
  value: string | null | undefined,
  timeoutMs = BLOB_DELETE_TIMEOUT_MS,
): Promise<boolean> {
  if (!isManagedCommunityReportPhoto(value)) return true;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  try {
    const boundedTimeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.min(Math.floor(timeoutMs), BLOB_DELETE_TIMEOUT_MS)
        : BLOB_DELETE_TIMEOUT_MS;
    await del(value, {
      abortSignal: AbortSignal.timeout(boundedTimeoutMs),
    });
    return true;
  } catch (error) {
    console.warn(
      "[community-reports] blob deletion failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
