/**
 * Bounded daily maintenance for Radius' private hybrid-search index.
 *
 * The initial fill advances in cost-capped slices; later runs only embed
 * places whose search content changed. The writer is content-hash based and
 * upserts by (kind, source_id), so duplicate cron delivery is idempotent.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import {
  RadiusSearchRefreshError,
  radiusSearchCronBatch,
  refreshRadiusSearchIndex,
} from "@/lib/ask/search-index-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (process.env.RADIUS_SEARCH_CRON !== "1") {
    return NextResponse.json({
      enabled: false,
      note:
        "Set RADIUS_SEARCH_CRON=1 to enable the bounded semantic-index refresh.",
    });
  }

  const batch = radiusSearchCronBatch(
    process.env.RADIUS_SEARCH_CRON_BATCH,
  );
  try {
    const result = await refreshRadiusSearchIndex({
      maxDocuments: batch,
    });
    return NextResponse.json({
      enabled: true,
      healthy: true,
      batch_limit: batch,
      ...result,
      note: result.current
        ? "The place search index is current."
        : `${result.remaining} changed place documents will continue on the next run.`,
    });
  } catch (error) {
    console.error("[cron/radius-search] refresh failed:", error);
    const known =
      error instanceof RadiusSearchRefreshError ? error : null;
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        error:
          known?.message ??
          "The Radius search index refresh failed. Check the function logs.",
        ...(known ? { code: known.code } : {}),
      },
      {
        status:
          known?.code === "embedding_failed" ||
          known?.code === "invalid_embedding"
            ? 502
            : 503,
      },
    );
  }
}
