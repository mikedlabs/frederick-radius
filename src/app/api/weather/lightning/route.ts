import { NextResponse } from "next/server";
import {
  buildFrederickLightningMapUrl,
} from "@/lib/integrations/nowcoast-lightning";
import { getOfficialLightningSnapshot } from "@/lib/live/officialSignals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const lightning = await getOfficialLightningSnapshot();
  const capability = lightning.capability;
  const frameAt = capability?.latestFrameAt ?? undefined;
  const current =
    lightning.available &&
    !lightning.stale &&
    frameAt;

  return NextResponse.json(
    current
      ? {
          available: true,
          frameAt,
          imageUrl: buildFrederickLightningMapUrl({
            width: 1_024,
            height: 1_024,
            time: frameAt,
          }),
          densityWindowMinutes: capability?.densityWindowMinutes ?? 15,
          horizontalResolutionKm: capability?.horizontalResolutionKm ?? 8,
          individualStrikes: false,
          source: "NOAA nowCOAST",
        }
      : {
          available: false,
          frameAt: capability?.latestFrameAt ?? null,
          imageUrl: null,
          densityWindowMinutes: 15,
          horizontalResolutionKm: 8,
          individualStrikes: false,
          source: "NOAA nowCOAST",
        },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
