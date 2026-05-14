import { NextResponse } from "next/server";
import { ingestICal } from "@/lib/ingest/ical";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const SOURCES = [
  { source_slug: "dfp_ical", url: "https://downtownfrederick.org/upcoming-events?ical=1", defaultMunicipality: "frederick", defaultVenueLatLng: { lng: -77.4109, lat: 39.4143 } },
  { source_slug: "celebrate_frederick", url: "https://celebratefrederick.com/calendar-of-events?ical=1", defaultMunicipality: "frederick", defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 } },
  { source_slug: "frederick_county_calendar", url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml", defaultMunicipality: "frederick", defaultVenueLatLng: { lng: -77.4109, lat: 39.4143 } },
];

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const t0 = Date.now();
  const results = await Promise.all(SOURCES.map((s) => ingestICal(s)));
  return NextResponse.json({
    duration_ms: Date.now() - t0,
    totals: {
      records_in: results.reduce((a, r) => a + r.records_in, 0),
      records_upserted: results.reduce((a, r) => a + r.records_upserted, 0),
      records_failed: results.reduce((a, r) => a + r.records_failed, 0),
    },
    results,
  });
}
