import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import {
  refreshVisitFrederickSnapshot,
} from "@/lib/integrations/visitfrederick-refresh";
import {
  finishIngestRun,
  startIngestRun,
} from "@/lib/ingest/run-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isRecoveryInfrastructureUnavailable(
  result: Awaited<ReturnType<typeof refreshVisitFrederickSnapshot>>,
): boolean {
  return (
    result.storage?.stored === false ||
    result.reason ===
      "The daily Firecrawl recovery limit has been reached." ||
    result.reason === "The Firecrawl budget could not be reserved." ||
    result.reason?.endsWith(
      "scheduled recovery is not configured",
    ) === true
  );
}

/** Refresh the durable Visit Frederick facts outside every visitor request. */
export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  let result: Awaited<ReturnType<typeof refreshVisitFrederickSnapshot>>;
  try {
    result = await refreshVisitFrederickSnapshot();
  } catch {
    const runId = await startIngestRun("visit-frederick-snapshot");
    await finishIngestRun(runId, {
      status: "error",
      records_in: 0,
      records_upserted: 0,
      records_failed: 1,
      error: "Visit Frederick snapshot refresh failed unexpectedly.",
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Visit Frederick snapshot refresh failed.",
      },
      { status: 500 },
    );
  }

  // A duplicate scheduler delivery or an approval-gated route is not a new
  // source heartbeat. Logging it after the real owner would let a fast loser
  // become the dashboard's "latest" run and hide the eventual success.
  if (result.skipped) {
    return NextResponse.json(
      {
        ok: result.ok,
        skipped: true,
        updated: false,
        via: result.via,
        events: result.events,
        source_status: result.status,
        reason: result.reason,
        budget: result.budget,
        storage: result.storage,
      },
      { status: 200 },
    );
  }

  const runId = await startIngestRun("visit-frederick-snapshot");
  if (result.updated) {
    revalidateTag("visit-frederick", "max");
    revalidateTag("events", "max");
    revalidatePath("/today");
    revalidatePath("/events");
    revalidatePath("/map");
  }

  await finishIngestRun(runId, {
    status: result.ok
      ? "ok"
      : result.events > 0
        ? "partial"
        : "error",
    records_in: result.events,
    records_upserted: result.updated ? result.events : 0,
    records_failed: result.ok ? 0 : 1,
    error: result.ok
      ? null
      : "Visit Frederick snapshot refresh did not complete.",
  });

  return NextResponse.json(
    {
      ok: result.ok,
      skipped: result.skipped,
      updated: result.updated,
      via: result.via,
      events: result.events,
      source_status: result.status,
      reason: result.reason,
      budget: result.budget,
      storage: result.storage,
    },
    {
      status:
        result.ok || result.skipped
          ? 200
          : isRecoveryInfrastructureUnavailable(result)
            ? 503
            : 502,
    },
  );
}
