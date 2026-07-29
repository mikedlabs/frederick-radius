import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { tryFetchPoints, FC_LAYERS, type ArcGISPoint } from "@/lib/integrations/arcgis";
import { frederickCountySourceEnabled } from "@/lib/integrations/fcCountySource";
import { verifyCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function slugify(s: string, suffix?: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return suffix ? `${base}-${suffix}` : base;
}

async function upsertPoint(p: ArcGISPoint): Promise<"created" | "updated" | "skipped"> {
  const db = getDb();
  if (!db) return "skipped";
  const slug = slugify(p.name, p.source_record_id.slice(-6));
  await db.insert(schema.places).values({
    slug,
    name: p.name,
    category_slug: p.category_slug,
    short_blurb: p.short_blurb,
    description: p.description ?? null,
    address: p.address ?? "",
    city: p.city ?? "Frederick",
    state: "MD",
    postal_code: p.postal_code ?? "",
    municipality_slug: p.municipality_slug ?? "frederick",
    lng: p.lng,
    lat: p.lat,
    phone: p.phone ?? null,
    website: p.website ?? null,
    is_verified: true,
    feature_score: 6.5,
    source: p.source,
    source_record_id: p.source_record_id,
    source_fetched_at: new Date(),
    confidence: 0.95,
    status: "active",
  }).onConflictDoUpdate({
    target: schema.places.slug,
    set: {
      name: p.name,
      lng: p.lng,
      lat: p.lat,
      address: p.address ?? "",
      city: p.city ?? "Frederick",
      postal_code: p.postal_code ?? "",
      source_fetched_at: new Date(),
      updated_at: new Date(),
    },
  });
  return "created";
}

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (!frederickCountySourceEnabled("fc_county_facilities")) {
    return NextResponse.json(
      {
        error: "County facility reuse is not approved for this deployment.",
        configured: false,
      },
      { status: 409 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 500 });
  }

  const runRows = await db.insert(schema.ingestRuns).values({
    source_slug: "arcgis_county_facilities",
    status: "running",
  }).returning({ id: schema.ingestRuns.id });
  const runId = runRows[0]?.id;

  const t0 = Date.now();
  let upserted = 0;
  let failed = 0;
  let errorMessage: string | undefined;

  try {
    const points = await tryFetchPoints([
      { url: FC_LAYERS.parks, category_slug: "park", nameField: "PARK_NAME", addressField: "ADDRESS", cityField: "CITY" },
      { url: FC_LAYERS.libraries, category_slug: "library", nameField: "BRANCH_NAME", addressField: "ADDRESS", cityField: "CITY", zipField: "ZIP" },
      { url: FC_LAYERS.fire_stations, category_slug: "public-safety", nameField: "STATION_NAME", addressField: "ADDRESS", cityField: "CITY" },
    ]);

    for (const p of points) {
      try {
        await upsertPoint(p);
        upserted++;
      } catch {
        failed++;
      }
    }

    if (runId) {
      await db.update(schema.ingestRuns)
        .set({
          ended_at: new Date(),
          status: "ok",
          records_in: points.length,
          records_upserted: upserted,
          records_failed: failed,
        })
        .where(eq(schema.ingestRuns.id, runId));
    }

    return NextResponse.json({
      duration_ms: Date.now() - t0,
      records_in: points.length,
      records_upserted: upserted,
      records_failed: failed,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    if (runId) {
      await db.update(schema.ingestRuns)
        .set({ ended_at: new Date(), status: "error", error: errorMessage })
        .where(eq(schema.ingestRuns.id, runId));
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
