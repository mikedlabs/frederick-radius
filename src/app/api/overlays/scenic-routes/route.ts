import { NextResponse } from "next/server";
import appalachianTrail from "@/data/appalachian-trail.json";
import scenicByways from "@/data/scenic-byways.json";

export async function GET() {
  const combinedFeatures = [
    ...(appalachianTrail.features || []),
    ...(scenicByways.features || []),
  ];

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features: combinedFeatures,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
      },
    }
  );
}
