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

/** Best-effort removal used before deleting the corresponding database row. */
export async function deleteCommunityReportPhoto(value: string | null | undefined): Promise<boolean> {
  if (!isManagedCommunityReportPhoto(value)) return true;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  try {
    await del(value);
    return true;
  } catch (error) {
    console.warn(
      "[community-reports] blob deletion failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
