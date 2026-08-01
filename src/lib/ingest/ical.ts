import { sql, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { CATEGORIES } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import { cutAtWordBoundary } from "@/lib/slug";
import { parseICalResult } from "@/lib/ingest/parser";
import { safeIngestWriteError } from "@/lib/ingest/write-outcome";

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
  // Honest catch-all rather than "arts": an event whose title doesn't
  // match any keyword bucket is almost always a community gathering
  // (fundraiser, holiday lighting, pancake breakfast, neighborhood
  // cleanup), not an art event. The "community" category exists in
  // src/data/categories.ts for exactly this fallback.
  return "community";
}

function slugify(s: string, extra?: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const base = cutAtWordBoundary(cleaned, 80);
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

export const ICAL_FETCH_TIMEOUT_MS = 15_000;

async function fetchICal(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ICAL_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "FrederickRadius/1.0 (+https://frederickradius.app; event index)",
      },
    });
    if (!response.ok) {
      throw new Error(`iCal fetch failed with HTTP ${response.status}`);
    }
    return await response.text();
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`iCal fetch timed out after ${ICAL_FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export type IngestStatus = "ok" | "partial" | "error";

export type IngestResult = {
  source_slug: string;
  records_in: number;
  records_upserted: number;
  records_failed: number;
  /** Present on results produced here; optional for legacy fan-out fallbacks. */
  status?: IngestStatus;
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
    return {
      source_slug,
      records_in: 0,
      records_upserted: 0,
      records_failed: 0,
      status: "error",
      error: "DATABASE_URL not configured",
    };
  }

  // Best-effort run telemetry. If this insert rejects (a DB hiccup), proceed
  // WITHOUT a run row rather than reject the whole function — the caller fans
  // several sources out and one down DB must not sink the others. Per-event
  // upserts below still record failures in the returned counts.
  let runId: string | undefined;
  try {
    const runRows = await db.insert(schema.ingestRuns).values({
      source_slug,
      status: "running",
      records_in: 0,
      records_upserted: 0,
      records_failed: 0,
    }).returning({ id: schema.ingestRuns.id });
    runId = runRows[0]?.id;
  } catch {
    runId = undefined;
  }

  let in_count = 0;
  let upserted = 0;
  let failed = 0;
  let status: IngestStatus = "ok";
  let error: string | undefined;
  let firstWriteError: string | undefined;

  try {
    // Use the same runtime-safe parser as the CivicEngage ingest. Third-party
    // iCal parser bundles have failed inside the serverless runtime; platform
    // fetch plus the result-bearing parser keeps fetching and parsing explicit
    // while preserving invalid-payload versus valid-empty.
    const parsed = parseICalResult(await fetchICal(url));
    if (!parsed.valid) {
      throw new Error(`iCal parse failed: ${parsed.error}`);
    }
    const events = parsed.events;
    in_count = events.length;
    const now = new Date();
    const futureWindow = new Date(now);
    futureWindow.setDate(futureWindow.getDate() - 1);

    for (const e of events) {
      try {
        const starts = new Date(e.startsAtUtc);
        const ends = e.endsAtUtc ? new Date(e.endsAtUtc) : new Date(starts.getTime() + 2 * 60 * 60 * 1000);
        if (starts < futureWindow) continue;

        const venue_name = (e.rawLocation ?? "").split(",")[0].trim() || "Frederick, MD";
        const address = e.rawLocation ?? "";
        const description = (e.description ?? "").trim();
        const title = (e.summary ?? "").trim();
        if (!title) {
          failed++;
          firstWriteError ??= "event title was empty";
          continue;
        }

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
          is_all_day: e.allDay,
          venue_name,
          address: address || "",
          municipality_slug,
          // Fallback was "arts", which silently mislabeled every keyword-
// less event (pancake breakfast, fundraiser, holiday tradition)
// as Arts & Culture. The new fallback is the honest catch-all
// declared in src/data/categories.ts.
category_slug: cat?.slug ?? "community",
          lng: defaultVenueLatLng.lng,
          lat: defaultVenueLatLng.lat,
          audience: [],
          is_free: !/\$|\bticket\b|\bpaid\b/i.test(description),
          ticket_url: e.sourceUrl ?? null,
          source: source_slug,
          source_record_id: e.uid || slug,
          source_fetched_at: new Date(),
          confidence: 0.7,
          is_verified: false,
          status: "scheduled",
        }).onConflictDoUpdate({
          target: schema.events.slug,
          set: {
            title, description: description || title,
            starts_at: starts, ends_at: ends,
            is_all_day: e.allDay,
            venue_name, address: address || "",
            municipality_slug, // Fallback was "arts", which silently mislabeled every keyword-
// less event (pancake breakfast, fundraiser, holiday tradition)
// as Arts & Culture. The new fallback is the honest catch-all
// declared in src/data/categories.ts.
category_slug: cat?.slug ?? "community",
            source_fetched_at: new Date(),
            ticket_url: e.sourceUrl ?? null,
            updated_at: new Date(),
          },
        });

        upserted++;
      } catch (err) {
        failed++;
        firstWriteError ??= safeIngestWriteError(err);
      }
    }

    if (failed > 0) {
      status = upserted > 0 ? "partial" : "error";
      const scope = upserted > 0 ? `${failed} of ${in_count}` : `all ${failed}`;
      error = `${scope} event write${failed === 1 ? "" : "s"} failed`;
      if (firstWriteError) error += `: ${firstWriteError}`;
    }

    if (runId) {
      await db.update(schema.ingestRuns)
        .set({
          ended_at: new Date(),
          status,
          records_in: in_count,
          records_upserted: upserted,
          records_failed: failed,
          error: error ?? null,
        })
        .where(eq(schema.ingestRuns.id, runId));
    }
    await db.update(schema.dataSources)
      .set({
        last_run_at: new Date(),
        last_status: status === "ok" ? "ok" : `${status}: ${error!.slice(0, 200)}`,
      })
      .where(eq(schema.dataSources.slug, source_slug));
  } catch (err) {
    status = "error";
    error = err instanceof Error ? err.message : String(err);
    // These error-telemetry writes hit the same DB that likely just failed, so
    // they can reject too. Swallow that: the function must still RETURN its
    // result (surfaced in the run totals) rather than reject and take the whole
    // fan-out down with it. The lost row is telemetry, not user data.
    try {
      if (runId) {
        await db.update(schema.ingestRuns)
          .set({
            ended_at: new Date(),
            status,
            records_in: in_count,
            records_upserted: upserted,
            records_failed: failed,
            error,
          })
          .where(eq(schema.ingestRuns.id, runId));
      }
      await db.update(schema.dataSources)
        .set({ last_run_at: new Date(), last_status: `error: ${error.slice(0, 200)}` })
        .where(eq(schema.dataSources.slug, source_slug));
    } catch {
      /* telemetry write failed too (DB down); keep the ingest result intact */
    }
  }

  return {
    source_slug,
    records_in: in_count,
    records_upserted: upserted,
    records_failed: failed,
    status,
    error,
  };
}

// Silence unused-import warning for sql template tag (kept for future raw queries).
export const _sql = sql;
