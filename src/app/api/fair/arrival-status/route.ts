import { NextResponse } from "next/server";

import { isFairArrivalDate } from "@/lib/fair/arrival-status";
import { getFairArrivalStatus } from "@/lib/fair/arrival-status-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArrivalMode = "overview" | "transit";

function arrivalMode(value: string | null): ArrivalMode | null {
  if (value === null || value === "overview") return "overview";
  return value === "transit" ? "transit" : null;
}

function invalidRequest(message: string) {
  return NextResponse.json(
    { error: message },
    {
      status: 400,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const selectedDate = url.searchParams.get("date") ?? "";
  const mode = arrivalMode(url.searchParams.get("mode"));
  if (!isFairArrivalDate(selectedDate)) {
    return invalidRequest("Choose a date inside the 2026 Great Frederick Fair.");
  }
  if (!mode) {
    return invalidRequest("Arrival mode must be overview or transit.");
  }

  const status = await getFairArrivalStatus({
    selectedDate,
    includeTransit: mode === "transit",
  });
  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "private, no-store",
      "Vercel-CDN-Cache-Control":
        mode === "transit"
          ? "public, s-maxage=15, stale-while-revalidate=30"
          : "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
