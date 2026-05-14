import { sql, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { CATEGORIES } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";

const CATEGORY_KEYWORDS: Array<{ slug: string; words: string[] }> = [
  { slug: "music", words: ["concert", "band", "music", "dj", "open mic", "acoustic"] },
  { slug: "arts", words: ["art", "exhibit", "gallery", "first friday", "mural"] },
  { slug: "theater", words: ["theater", "play", "stage", "broadway", "show", "comedy"] },
  { slug: "market", words: ["market", "vendor", "farmers", "makers", "fair"] },
  { slug: "family", words: ["kids", "family", "children", "story time", "all ages"] },
  { slug: "outdoors", words: ["hike", "trail", "outdoor", "park", "ranger", "nature"] },
  { slug: "food", words: ["food truck", "dinner", "brunch", "tasting", "wine", "beer", "brewery"] },
  { slug: "bar", words: ["trivia", "pub", "bar"] },
  { slug: "civic", words: ["council", "meeting", "public hearing", "town hall", "voting"] },
];

function inferCategory(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  for (const { slug, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return slug;
  }
  return "arts";
}

function slugify(s: string, extra?: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return extra ? `${base}-${extra}` : base;
}

function dedupeKey(title: string, venue: string, starts: Date): string {
  const day = starts.toISOString().slice(0, 10);
  const time = starts.toISOString().slice(11, 16);
  return slugify(`${title}-${venue}-${day}-${time}`);
}

function inferMunicipality(address: string | undefined, fallback: string): string {
  if (!address) return fallback;
  const lower = address.toLowerCase();
  for (const m of MUNICIPALITIES) {
    if (lower.includes(m.name.toLowerCase())) return m.slug;
  }
  return fallback;
}

type ICalEvent = {
  type: "VEVENT";
  summary: string;
  description?: string;
  start: Date;
  end?: Date;
  location?: string;
  uid?: string;
  url?: string;
};

function pickEvents(parsed: Record<string, unknown>): ICalEvent[] {
  const out: ICalEvent[] = [];
  for (const v of Object.values(parsed)) {
    const item = v as { type?: string };
    if (item?.type === "VEVENT") out.push(v as unknown as ICalEvent);
  }
  return out;
}

export type IngestResult = {
  source_slug: string;
  records_in: number;
  records_upserted: number;
  records_failed: number;
  error?: string;
};

export async function ingestICal({
  source_slug,
  url,
  defaultMunicipality,
  defaultVenueLatLng,
}: {
  source_slug: string;
  url: string;
  defaultMunicipality: string;
  defaultVenueLatLng: { lng: number; lat: number };
}): Promise<IngestResult> {
  const db = getDb();
  if (!db) {
    return { source_slug, records_in: 0, records_upserted: 0, records_failed: 0, error: "DATABASE_URL not configured" };
  }

  const runRows = await db.insert(schema.ingestRuns).values({
    source_slug,
    status: "running",
    records_in: 0,
    records_upserted: 0,
    records_failed: 0,
  }).returning({ id: schema.ingestRuns.id });
  const runId = runRows[0]?.id;

  let in_count = 0;
  let upserted = 0;
  let failed = 0;
  let error: string | undefined;

  try {
    const ical = await import("node-ical");
    const parsed = await ical.async.fromURL(url);
    const events = pickEvents(parsed as unknown as Record<string, unknown>);
    in_count = events.length;
    const now = new Date();
    const futureWindow = new Date(now);
    futureWindow.setDate(futureWindow.getDate() - 1);

    for (const e of events) {
      try {
        const starts = new Date(e.start);
        const ends = e.end ? new Date(e.end) : new Date(starts.getTime() + 2 * 60 * 60 * 1000);
        if (starts < futureWindow) continue;

        const venue_name = (e.location ?? "").split(",")[0].trim() || "Frederick, MD";
        const address = e.location ?? "";
        const description = (e.description ?? "").trim();
        const title = (e.summary ?? "").trim();
        if (!title) { failed++; continue; }

        const slug = slugify(title, dedupeKey(title, venue_name, starts).split("-").slice(-3).join(""));
        const category_slug = inferCategory(title, description);
        const municipality_slug = inferMunicipality(address, defaultMunicipality);
        const cat = CATEGORIES.find((c) => c.slug === category_slug);

        await db.insert(schema.events).values({
          slug,
          title,
          description: description || title,
          starts_at: starts,
          ends_at: ends,
          timezone: "America/New_York",
          venue_name,
          address: address || "",
          municipality_slug,
          category_slug: cat?.slug ?? "arts",
          lng: defaultVenueLatLng.lng,
          lat: defaultVenueLatLng.lat,
          audience: [],
          is_free: !/\$|\bticket\b|\bpaid\b/i.test(description),
          ticket_url: e.url ?? null,
          source: source_slug,
          source_record_id: e.uid ?? slug,
          source_fetched_at: new Date(),
          confidence: 0.7,
          is_verified: false,
          status: "scheduled",
        }).onConflictDoUpdate({
          target: schema.events.slug,
          set: {
            title, description: description || title,
            starts_at: starts, ends_at: ends,
            venue_name, address: address || "",
            municipality_slug, category_slug: cat?.slug ?? "arts",
            source_fetched_at: new Date(),
            ticket_url: e.url ?? null,
            updated_at: new Date(),
          },
        });

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
          records_in: in_count,
          records_upserted: upserted,
          records_failed: failed,
        })
        .where(eq(schema.ingestRuns.id, runId));
    }
    await db.update(schema.dataSources)
      .set({ last_run_at: new Date(), last_status: "ok" })
      .where(eq(schema.dataSources.slug, source_slug));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    if (runId) {
      await db.update(schema.ingestRuns)
        .set({ ended_at: new Date(), status: "error", error: error })
        .where(eq(schema.ingestRuns.id, runId));
    }
    await db.update(schema.dataSources)
      .set({ last_run_at: new Date(), last_status: `error: ${error.slice(0, 200)}` })
      .where(eq(schema.dataSources.slug, source_slug));
  }

  return { source_slug, records_in: in_count, records_upserted: upserted, records_failed: failed, error };
}

// Silence unused-import warning for sql template tag (kept for future raw queries).
export const _sql = sql;
