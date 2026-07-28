import { createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  normalizeRotorcraftSnapshot,
  type RawAdsbResponse,
} from "@/lib/aviation/rotorcraft";
import {
  ADSB_LOL_ATTRIBUTION,
  ADSB_LOL_LICENSE_URL,
  ADSB_LOL_URL,
  emptyFmhActivity,
  type RotorcraftApiResponse,
} from "@/lib/aviation/rotorcraft-public";
import { isRateLimited, isSameOriginRequest } from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One 22 nm query covers the complete Frederick County ring from a central
 * point. The normalized result is then clipped to the actual county polygon.
 */
const SOURCE =
  "https://api.adsb.lol/v2/point/39.47/-77.38/22";
const TTL_MS = 45_000;
const CDN_HEADERS = {
  "Cache-Control": "public, s-maxage=45",
};

/**
 * A deployment secret can stabilize IDs across server instances. When it is
 * absent, an ephemeral process secret still prevents reversing the public ID
 * back to the 24-bit ICAO address. IDs rotate with the UTC day either way.
 */
const OPAQUE_ID_SECRET =
  process.env.ROTORCRAFT_ID_SECRET?.trim() ||
  randomBytes(32).toString("base64url");

function createDailyOpaqueId(
  privateSourceKey: string,
  observedAtMs: number,
): string {
  const utcDay = new Date(observedAtMs).toISOString().slice(0, 10);
  return createHmac("sha256", OPAQUE_ID_SECRET)
    .update(`frederick-radius-rotorcraft:${utcDay}:${privateSourceKey}`)
    .digest("hex")
    .slice(0, 16);
}

type CachedSnapshot = {
  storedAt: number;
  response: RotorcraftApiResponse;
};

let cache: CachedSnapshot | null = null;

function envelope(
  input: Omit<
    RotorcraftApiResponse,
    "source" | "attribution" | "sourceUrl" | "licenseUrl" | "note"
  >,
): RotorcraftApiResponse {
  return {
    ...input,
    source: "ADSB.lol",
    attribution: ADSB_LOL_ATTRIBUTION,
    sourceUrl: ADSB_LOL_URL,
    licenseUrl: ADSB_LOL_LICENSE_URL,
    note:
      "Public ADS-B coverage is incomplete. No observation is not proof that a helicopter is grounded or absent. Trooper and FMH activity are aggregate only; FMH arrival and departure labels are trajectory-based possibilities, not confirmed landings.",
  };
}

async function fetchSnapshot(now: number): Promise<RotorcraftApiResponse> {
  const upstream = await fetch(SOURCE, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "frederick-radius/1.0 (+https://frederickradius.app; public rotorcraft map)",
    },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!upstream.ok) throw new Error(`ADSB.lol returned ${upstream.status}`);
  const raw = (await upstream.json()) as RawAdsbResponse;
  const normalized = normalizeRotorcraftSnapshot(
    raw,
    now,
    createDailyOpaqueId,
  );
  return envelope({
    observationCount: normalized.observationCount,
    signals: normalized.signals,
    trooperAirborneCount: normalized.trooperAirborneCount,
    fmhActivity: normalized.fmhActivity,
    observedAt: new Date(normalized.observedAtMs).toISOString(),
    receivedAt: new Date(now).toISOString(),
    available: true,
    coverage: "incomplete",
  });
}

export async function GET(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (await isRateLimited(req, "rotorcraft-live", 120, 60)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const now = Date.now();
  if (cache && now - cache.storedAt < TTL_MS) {
    return NextResponse.json(cache.response, { headers: CDN_HEADERS });
  }

  try {
    const response = await fetchSnapshot(now);
    cache = { storedAt: now, response };
    return NextResponse.json(response, { headers: CDN_HEADERS });
  } catch {
    return NextResponse.json(
      envelope({
        observationCount: 0,
        signals: [],
        trooperAirborneCount: 0,
        fmhActivity: emptyFmhActivity(),
        observedAt: null,
        receivedAt: new Date(now).toISOString(),
        available: false,
        coverage: "unavailable",
      }),
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5",
        },
      },
    );
  }
}
