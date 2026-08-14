import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { buildFoodTruckSchedule } from "@/lib/food-trucks/schedule";
import {
  reconcileFoodTruckSchedule,
  readStoredFoodTruckScheduleArtifact,
  writeFoodTruckSchedule,
  type FoodTruckScheduleWriteResult,
} from "@/lib/food-trucks/schedule-store";
import { verifyCronAuth } from "../../ingest/_auth";
import { monitorCronResponse } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Refresh the public eight-day food-truck board from official sources. */
export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  return monitorCronResponse(
    "food-truck-schedules",
    {
      schedule: "15 */4 * * *",
      checkinMarginMinutes: 10,
      maxRuntimeMinutes: 2,
    },
    runFoodTruckScheduleRefresh,
  );
}

async function runFoodTruckScheduleRefresh() {
  const previousRead = await readStoredFoodTruckScheduleArtifact();
  const previous = previousRead.status === "found"
    ? previousRead.snapshot
    : null;
  const collected = await buildFoodTruckSchedule(new Date());
  // Use the reconciled artifact for response counts as well as storage so the
  // operator sees retained last-known-good stops from failed or suspicious
  // sources.
  const initialView = reconcileFoodTruckSchedule(collected, previous);
  // The writer reconciles the raw collection against a fresh origin read at
  // the atomic boundary. Passing the earlier retained view could resurrect a
  // stop that a concurrent newer run legitimately removed.
  const write: FoodTruckScheduleWriteResult = await writeFoodTruckSchedule(
    collected,
    previousRead,
  ).catch(() => ({
    stored: false,
    preservedPrevious: previousRead.status !== "absent",
    superseded: false,
    reason: "The schedule could not be written to durable storage",
  }));
  const { publishedSnapshot, ...storage } = write;
  // Health and response counts must describe the artifact that actually won
  // the atomic boundary, not the earlier view assembled before a racing run.
  const schedule = publishedSnapshot ?? initialView;
  const failedSources = schedule.sources.filter((source) => !source.ok);
  const suspiciousSources = schedule.sources.filter(
    (source) => source.suspiciousZero || source.suspiciousDrop,
  );
  const invalidSourceSet = schedule.sources.length === 0;
  const allSourcesFailed = invalidSourceSet
    || failedSources.length === schedule.sources.length;
  const persistenceFailed = !write.stored && !write.superseded;

  if (write.stored) {
    revalidatePath("/food-trucks");
    revalidatePath("/today");
    revalidateTag("food-truck-source", "max");
  }

  const completed = !allSourcesFailed && !persistenceFailed;
  const healthy =
    completed && failedSources.length === 0 && suspiciousSources.length === 0;

  return NextResponse.json(
    {
      // A partial refresh may be safe to preserve without asking Vercel to
      // retry the write. It is still not healthy. monitorCronResponse reads
      // this semantic result and records the Sentry check-in as red.
      ok: healthy,
      completed,
      healthy,
      degraded:
        invalidSourceSet
        || failedSources.length > 0
        || suspiciousSources.length > 0,
      retryable: !completed,
      stops: schedule.stops.length,
      source_anomalies: suspiciousSources.length,
      prior_artifact: previousRead.status,
      sources: schedule.sources,
      storage,
    },
    {
      status: allSourcesFailed ? 502 : persistenceFailed ? 503 : 200,
    },
  );
}
