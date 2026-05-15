/**
 * One-off: discover active CivicEngage iCal calendars for a domain.
 *
 *   npx tsx scripts/discover_catids.ts www.cityoffrederickmd.gov
 *   npx tsx scripts/discover_catids.ts            # all domains in DOMAINS
 *
 * Fetches /iCalendar.aspx, greps the subscribe links for
 * iCalendar.aspx?catID=N&feed=calendar, then pulls each feed and counts
 * VEVENTs so dormant calendars are obvious. Prints config-ready JSON.
 *
 * catIDs are stable — run this once per municipality, paste into
 * config/civicengage_sources.json. Never auto-discover at runtime.
 */

const UA = "FrederickRadius/1.0 (+https://frederickradius.app; civic event index)";

// Every CivicEngage municipality Mike listed. Brunswick (off CivicEngage,
// 302s) + Myersville (was unreachable) included so discovery surfaces their
// real state; the config marks them disabled if discovery finds nothing.
const DOMAINS: Array<{ municipality: string; domain: string }> = [
  { municipality: "Frederick", domain: "www.cityoffrederickmd.gov" },
  { municipality: "Frederick County", domain: "www.frederickcountymd.gov" },
  { municipality: "Thurmont", domain: "www.thurmont.com" },
  { municipality: "Mount Airy", domain: "www.mountairymd.gov" },
  { municipality: "Brunswick", domain: "www.brunswickmd.gov" },
  { municipality: "Middletown", domain: "www.middletown.md.us" },
  { municipality: "Walkersville", domain: "www.walkersvillemd.gov" },
  { municipality: "Myersville", domain: "www.myersvillemd.gov" },
  { municipality: "Emmitsburg", domain: "www.emmitsburgmd.gov" },
  { municipality: "New Market", domain: "www.newmarketmd.gov" },
  { municipality: "Burkittsville", domain: "www.burkittsville-md.gov" },
  { municipality: "Woodsboro", domain: "www.woodsboro.org" },
  { municipality: "Rosemont", domain: "www.rosemontmd.org" },
];

function feedUrl(domain: string, catID: number): string {
  return `https://${domain}/Common/Modules/iCalendar/iCalendar.aspx?catID=${catID}&feed=calendar`;
}

async function fetchText(url: string, timeoutMs = 12000): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    const text = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  } finally {
    clearTimeout(t);
  }
}

async function discover(domain: string): Promise<{ catID: number; count: number }[]> {
  const hub = await fetchText(`https://${domain}/iCalendar.aspx`);
  if (!hub.ok) return [];
  const ids = new Set<number>();
  for (const m of hub.text.matchAll(/iCalendar\.aspx\?catID=(\d+)&feed=calendar/gi)) {
    ids.add(parseInt(m[1], 10));
  }
  const out: { catID: number; count: number }[] = [];
  for (const catID of [...ids].sort((a, b) => a - b)) {
    const feed = await fetchText(feedUrl(domain, catID));
    const count = feed.ok ? (feed.text.match(/BEGIN:VEVENT/g) || []).length : 0;
    out.push({ catID, count });
    await new Promise((r) => setTimeout(r, 120)); // gentle
  }
  return out;
}

async function main() {
  const arg = process.argv[2];
  const targets = arg
    ? DOMAINS.filter((d) => d.domain === arg || d.domain.includes(arg))
    : DOMAINS;
  if (targets.length === 0) {
    console.error(`No domain matching "${arg}". Known:\n  ${DOMAINS.map((d) => d.domain).join("\n  ")}`);
    process.exit(1);
  }

  const config: unknown[] = [];
  for (const { municipality, domain } of targets) {
    process.stdout.write(`\n${municipality} (${domain})\n`);
    const found = await discover(domain);
    if (found.length === 0) {
      process.stdout.write(`  ✗ no CivicEngage feeds found (off-platform or unreachable) — mark disabled\n`);
      config.push({ municipality, domain, enabled: false, catids: [], category_map: {}, note: "discovery found no feeds" });
      continue;
    }
    const active = found.filter((f) => f.count > 0);
    for (const f of found) {
      process.stdout.write(`  catID=${f.catID}  ${f.count} events${f.count === 0 ? "  (dormant)" : ""}\n`);
    }
    config.push({
      municipality,
      domain,
      enabled: active.length > 0,
      catids: active.map((f) => f.catID),
      category_map: Object.fromEntries(active.map((f) => [String(f.catID), `catID ${f.catID}`])),
    });
  }

  process.stdout.write(`\n===== config/civicengage_sources.json =====\n`);
  process.stdout.write(JSON.stringify(config, null, 2) + "\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
