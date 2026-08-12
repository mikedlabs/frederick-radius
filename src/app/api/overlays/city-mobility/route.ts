import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getFrederickCityMobility } from "@/lib/integrations/frederickCityMobility";
import {
  CITY_MOBILITY_EXTENT,
  CITY_MOBILITY_MAX_STREET_AREA_DEGREES,
  cityMobilityBoundsIntersect,
  parseCityMobilityBounds,
} from "@/lib/map/cityMobility";

function invalidAreaMessage(reason: string): string {
  if (reason === "missing-area") {
    return "Choose a map viewport or a user area before requesting City walking records.";
  }
  if (reason === "area-too-large") {
    return "This map area is too large for detailed walking records. Zoom in and try again.";
  }
  return "The requested map area is invalid.";
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const detailRaw = searchParams.get("detail") ?? "network";
  if (detailRaw !== "network" && detailRaw !== "street") {
    return NextResponse.json(
      { error: "The requested mobility detail level is invalid." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const area = parseCityMobilityBounds(searchParams);
  if (!area.ok) {
    return NextResponse.json(
      { error: invalidAreaMessage(area.reason), reason: area.reason },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  if (!cityMobilityBoundsIntersect(area.bounds, CITY_MOBILITY_EXTENT)) {
    return NextResponse.json(
      {
        error: "This map area is outside the City walking-record coverage.",
        reason: "outside-coverage",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const areaDegrees =
    (area.bounds.east - area.bounds.west) *
    (area.bounds.north - area.bounds.south);
  if (
    detailRaw === "street" &&
    areaDegrees > CITY_MOBILITY_MAX_STREET_AREA_DEGREES
  ) {
    return NextResponse.json(
      {
        error:
          "This area is too large for detailed sidewalk-ramp records. Zoom in and try again.",
        reason: "area-too-large",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const collection = await getFrederickCityMobility(area.bounds, {
    includeRamps: detailRaw === "street",
  });
  if (collection.radius.status === "unavailable") {
    return NextResponse.json(
      {
        error: "City walking records are temporarily unavailable.",
        radius: collection.radius,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "300",
          "X-Radius-Source-Status": "unavailable",
          "X-Radius-Source-Coverage": "partial",
          "X-Radius-Bike-Paths-Status": "unavailable",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const body = JSON.stringify(collection);
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  const cacheSeconds = collection.radius.status === "stale" ? 60 : 600;
  const headers = {
    ETag: etag,
    "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${
      collection.radius.status === "stale" ? 300 : 3600
    }`,
    Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
    "X-Radius-Source-Status": collection.radius.status,
    "X-Radius-Source-Coverage": collection.radius.coverage,
    "X-Radius-Bike-Paths-Status": "unavailable",
    ...(collection.radius.checkedAt
      ? { "X-Radius-Source-Checked-At": collection.radius.checkedAt }
      : {}),
  };

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/geo+json; charset=utf-8",
    },
  });
}
