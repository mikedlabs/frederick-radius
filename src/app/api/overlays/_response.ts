import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { MapLineFC } from "@/components/map/types";

export function geoJsonOverlayResponse(
  request: Request,
  collection: MapLineFC,
  cacheSeconds: number,
  metadata: {
    checkedAt?: string;
    sourceAsOf?: string;
    status?: "current" | "stale";
    coverage?: "complete" | "partial";
  } = {},
): NextResponse {
  const body = JSON.stringify(collection);
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`,
    Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
    ...(metadata.checkedAt
      ? { "X-Radius-Source-Checked-At": metadata.checkedAt }
      : {}),
    ...(metadata.sourceAsOf
      ? { "X-Radius-Source-As-Of": metadata.sourceAsOf }
      : {}),
    ...(metadata.status
      ? { "X-Radius-Source-Status": metadata.status }
      : {}),
    ...(metadata.coverage
      ? { "X-Radius-Source-Coverage": metadata.coverage }
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

export function unavailableOverlayResponse(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "300",
      },
    },
  );
}
