import { NextResponse } from "next/server";
import { getRegisterSites } from "@/lib/integrations/historicSites";

export async function GET() {
  const sites = await getRegisterSites();
  const bridges = sites.filter(s => s.isCoveredBridge);

  const features = bridges.map(b => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [b.lng, b.lat],
    },
    properties: {
      id: b.id,
      name: b.name,
      municipality: b.municipality,
      year: b.year,
      type: "covered_bridge",
    },
  }));

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
      },
    }
  );
}
