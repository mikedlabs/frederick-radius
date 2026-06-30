import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { ingestICal } from "@/lib/ingest/ical";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const SOURCES = [
  // dfp_ical REMOVED (June 9 automation audit): downtownfrederick.org
  // turned off every machine-readable export — the old
  // /upcoming-events?ical=1 404s, /events/?ical=1 serves HTML, the TEC
  // REST API returns rest_no_route, and the page embeds no Event JSON-LD.
  // The daily cron had been failing this source on every run. (The
  // request-time ical-live DFP feed is likewise gated off behind
  // DFP_ICAL_URL.) Downtown coverage flows via Ticketmaster/Bandsintown,
  // the Weinberg/venue lineups, and curated seeds; add a source back here
  // if DFP re-enables an export.
  {
    source_slug: "celebrate_frederick",
    // Old host/path (celebratefrederick.com/calendar-of-events?ical=1)
    // stopped resolving; this is the SAME working URL the request-time
    // ical-live feed uses, verified parsing ~20 events.
    url: "https://www.celebratefrederick.com/events/?ical=1",
    defaultMunicipality: "frederick",
    defaultVenueLatLng: { lng: -77.4109, lat: 39.4137 },
  },
  {
    source_slug: "frederick_county_calendar",
    url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=58&CID=All-calendar.xml",
    defaultMunicipality: "frederick",
    defaultVenueLatLng: { lng: -77.4109, lat: 39.4143 },
  },
];

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const t0 = Date.now();
  const results = await Promise.all(SOURCES.map((s) => ingestICal(s)));
  // isr-1: only bust the event caches when rows ACTUALLY changed (skips the
  // no-op case where DATABASE_URL is unset and ingestICal early-returns having
  // written nothing). Refreshes the DB-backed loader (ingested-events) AND the
  // assembled /today + /events + /map surfaces (events) immediately.
  const upserted = results.reduce((a, r) => a + r.records_upserted, 0);
  if (upserted > 0) {
    revalidateTag("ingested-events", "max");
    revalidateTag("events", "max");
  }
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
