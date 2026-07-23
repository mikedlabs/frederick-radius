import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { buildFoodTruckSchedule } from "@/lib/food-trucks/schedule";
import {
  readStoredFoodTruckSchedule,
  writeFoodTruckSchedule,
} from "@/lib/food-trucks/schedule-store";
import { verifyCronAuth } from "../../ingest/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Refresh the public eight-day food-truck board from official sources. */
export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const previous = await readStoredFoodTruckSchedule();
  const schedule = await buildFoodTruckSchedule(new Date());
  const write = await writeFoodTruckSchedule(schedule, previous);
  const allSourcesFailed = schedule.sources.every((source) => !source.ok);

  if (write.stored) {
    revalidatePath("/food-trucks");
    revalidatePath("/today");
    revalidateTag("food-truck-source", "max");
  }

  return NextResponse.json(
    {
      ok: !allSourcesFailed,
      stops: schedule.stops.length,
      sources: schedule.sources,
      storage: write,
    },
    { status: allSourcesFailed ? 502 : 200 },
  );
}
