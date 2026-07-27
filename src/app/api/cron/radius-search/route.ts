/**
 * Bounded daily maintenance for Radius' private local-search index.
 *
 * The initial full-text fill advances in bounded slices. Optional OpenAI
 * embeddings use the same limit when configured; later runs only revisit
 * changed content or rows that still need a vector. The writer is
 * content-hash based and idempotent by (kind, source_id).
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
        "Set RADIUS_SEARCH_CRON=1 to enable the bounded local-search refresh.",
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
        : `${result.remaining} place search documents will continue on the next run.`,
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
