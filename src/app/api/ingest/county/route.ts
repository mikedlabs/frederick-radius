import { NextResponse } from "next/server";
import { ingestICal } from "@/lib/ingest/ical";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;
  const result = await ingestICal({
    source_slug: "frederick_county_calendar",
    url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    defaultMunicipality: "frederick",
    defaultVenueLatLng: { lng: -77.4109, lat: 39.4143 },
  });
  return NextResponse.json(result);
}
