/**
 * Manual ingest runner (the spec's "run the Edge Function manually").
 * Reuses the exact pipeline modules; bypasses serverless time limits.
 *
 *   npm run ingest                 # all enabled sources + geocode
 *   npm run ingest -- --only "Thurmont"
 *   npm run ingest -- --no-geocode
 */
import { getSql, closeDb } from "@/lib/db/client";
import { parseICal } from "@/lib/ingest/parser";
import { upsertEvent, emptyStats } from "@/lib/ingest/upsert";
import { geocodePending } from "@/lib/ingest/geocode";
import sources from "@/../config/civicengage_sources.json" with { type: "json" };

type Source = { municipality: string; domain: string; enabled: boolean; catids: number[]; category_map: Record<string, string> };
const UA = "FrederickRadius/1.0 (+https://frederickradius.app; civic event index)";
const feedUrl = (d: string, c: number) => `https://${d}/Common/Modules/iCalendar/iCalendar.aspx?catID=${c}&feed=calendar`;

async function fetchFeed(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const noGeo = args.includes("--no-geocode");
  const sql = getSql();
  if (!sql) { console.error("No DATABASE_URL"); process.exit(1); }

  const list = (sources as unknown as Source[]).filter(
    (s) => s.enabled && (!only || s.municipality.toLowerCase() === only.toLowerCase())
  );
  console.log(`Ingesting ${list.length} source(s)…\n`);
  const t0 = Date.now();

  for (const src of list) {
    try {
      const stats = emptyStats();
      let parsed = 0;
      for (const catID of src.catids) {
        const ics = await fetchFeed(feedUrl(src.domain, catID));
        if (!ics) { process.stdout.write(`  ${src.municipality} catID ${catID}: feed unavailable\n`); continue; }
        const events = parseICal(ics);
        parsed += events.length;
        for (const e of events) {
          await upsertEvent(sql, { sourceDomain: src.domain, municipality: src.municipality, category: src.category_map[String(catID)] ?? null }, e, stats);
        }
      }
      console.log(`✓ ${src.municipality}: parsed ${parsed} · raw +${stats.rawInserted}/~${stats.rawUpdated}/=${stats.rawUnchanged} · norm ${stats.normUpserted} · unparseable-loc ${stats.unparseableLocations}`);
    } catch (e) {
      console.log(`✗ ${src.municipality}: ${e instanceof Error ? e.message : "error"} (continuing)`);
    }
  }

  if (!noGeo) {
    console.log(`\nGeocoding…`);
    const g = await geocodePending(sql, 3000);
    console.log(`  cache-seeded ${g.seeded} · from-cache ${g.fromCache} · from-api ${g.fromApi} · failed ${g.failed}`);
  }

  const counts = await sql<{ municipality: string; n: number; geo: number }[]>`
    select municipality, count(*)::int as n,
           count(lat)::int as geo
    from ingested_events group by municipality order by n desc
  `;
  const tot = await sql<{ raw: number; norm: number; geo: number }[]>`
    select (select count(*) from raw_events)::int as raw,
           (select count(*) from ingested_events)::int as norm,
           (select count(*) from ingested_events where lat is not null)::int as geo
  `;
  console.log(`\n── Results (${((Date.now() - t0) / 1000).toFixed(0)}s) ──`);
  counts.forEach((c) => console.log(`  ${c.municipality}: ${c.n} events, ${c.geo} geocoded (${Math.round((c.geo / c.n) * 100)}%)`));
  console.log(`  TOTAL: raw ${tot[0].raw} · normalized ${tot[0].norm} · geocoded ${tot[0].geo} (${Math.round((tot[0].geo / tot[0].norm) * 100)}%)`);

  await closeDb();
  process.exit(0);
}
main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
