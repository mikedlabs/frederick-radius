import { ImageResponse } from "next/og";
import { PLACE_BY_SLUG } from "@/data/places";
import { EVENT_BY_SLUG } from "@/data/events";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { COLLECTION_BY_SLUG } from "@/data/collections";
import { momentBySlug } from "@/data/civic-moments";
import {
  FREDERICK_LAT,
  FREDERICK_LNG,
  daylightDelta,
  moonPhase,
  sunTimes,
} from "@/lib/almanac";
import { easternDayKey } from "@/lib/tz";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";

// Token → hex mapping for the OG image runtime, which has no DOM
// and so can't resolve CSS variables. Keep in sync with globals.css.
// New collection accent tokens should be added here when introduced.
const COLLECTION_ACCENT_HEX: Record<string, string> = {
  "var(--app-brand)": "#E14328",
  "var(--app-brand-2)": "#16352B",
  "var(--app-cool)": "#20506A",
  "var(--app-accent)": "#C0871F",
  "var(--app-sage)": "#859076",
};

// NOTE: deliberately the Node runtime, NOT edge. This route imports
// the full composed place/event datasets (PLACE_BY_SLUG / EVENT_BY_SLUG)
// for the title + kicker; on the edge runtime the whole dataset is
// bundled into the function and exceeds Vercel's 1 MB edge limit
// ("Edge Function api/og size is 1.09 MB"). Node serverless functions
// have a far larger limit and next/og's ImageResponse runs there too,
// so this fixes the deploy error with zero loss of functionality.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "site";
  const slug = url.searchParams.get("slug") ?? "";
  // Portrait 1080×1920 variant for Instagram / Facebook Stories sharing
  // (?format=story). The default 1200×630 stays the link-preview card.
  const story = (url.searchParams.get("format") ?? "") === "story";

  let title = "Frederick Radius";
  // The homepage share card. Says what the product does rather than the
  // old generic "smarter way to experience" line. Deliberately NOT
  // time-baked (no "today" or a specific event): social platforms cache
  // the card at share time, so a dated card would go stale in a feed
  // within a day. The kicker has to read true a week from now.
  let kicker = "What's open, what's happening, and what's worth your time";
  // `blurb` is the editorial one-liner shown below the title on place
  // and municipality cards. Stable per-record (not time-bound), so it
  // survives OG-image edge caching without going stale — which is why
  // we don't try to bake open-status into the card here. The card has
  // to read true a day from now.
  let blurb: string | null = null;
  let accent = "#E14328";
  // Almanac stat row (type=almanac only) — replaces the italic blurb with
  // label/value pairs. The DAY is baked into the URL by the sharer, so each
  // calendar day is a distinct URL and social caches can never serve a stale
  // "today" (the same rule the other cards solve by not being time-bound).
  let stats: { label: string; value: string }[] | null = null;

  if (type === "place") {
    const p = PLACE_BY_SLUG[slug];
    if (p) {
      title = p.name;
      kicker = `${CATEGORY_BY_SLUG[p.category]?.name ?? p.category} · ${p.city}, MD`;
      blurb = p.short_blurb || null;
      accent = CATEGORY_BY_SLUG[p.category]?.color ?? accent;
    }
  } else if (type === "event") {
    const e = EVENT_BY_SLUG[slug];
    if (e) {
      title = e.title;
      kicker = `${e.venue_name} · ${new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" })}`;
      accent = CATEGORY_BY_SLUG[e.category]?.color ?? accent;
    }
  } else if (type === "municipality") {
    const m = MUNICIPALITY_BY_SLUG[slug];
    if (m) {
      title = m.name;
      kicker = `Frederick County, Maryland · pop. ${m.population.toLocaleString()}`;
      blurb = m.hero_blurb || null;
    }
  } else if (type === "category") {
    const c = CATEGORY_BY_SLUG[slug];
    if (c) {
      title = c.name;
      kicker = "Across Frederick County";
      accent = c.color;
    }
  } else if (type === "collection") {
    // Editorial collections (/collections/[slug]). The blurb already
    // carries the editorial voice, so it reads true a day from now
    // without time-baked context. Accent comes from the collection's
    // own definition. The kicker is fixed ("A Frederick collection")
    // because each card already carries its title as the headline.
    const c = COLLECTION_BY_SLUG[slug];
    if (c) {
      title = c.title;
      kicker = "A Frederick collection";
      blurb = c.blurb;
      // The collection's `accent` is a CSS variable reference, which
      // doesn't resolve inside the OG image runtime (no DOM, no
      // computed styles). Map known accent tokens back to hex so the
      // card renders the same color the in-app card does. Unknown
      // tokens fall through to the default brick.
      accent = COLLECTION_ACCENT_HEX[c.accent] ?? accent;
    }
  } else if (type === "beta") {
    // The Facebook tease card. Not time-baked (social caches at share time),
    // so it reads true whenever it surfaces in a feed.
    title = "You're early.";
    kicker = "Private beta · Frederick Radius";
    blurb = "Downtown Frederick and the county, connected. What's open, what's on, and what's worth your time.";
    accent = "#E14328";
  } else if (type === "almanac") {
    // The daily almanac card — the one share card that IS time-bound, made
    // cache-safe by requiring the Eastern day in the URL. /today's metadata
    // regenerates the URL each ISR pass, so sharing /today always previews
    // the current day's card.
    const rawDay = url.searchParams.get("day") ?? "";
    const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : easternDayKey(new Date());
    // Noon ET of that calendar day: same UTC calendar day year-round, so the
    // USNO sun math and the ET date label agree on which day this is.
    const anchor = new Date(`${day}T16:00:00Z`);

    title = anchor.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    kicker = "The daily almanac · Frederick County";

    const fmtTime = (d: Date) =>
      d
        .toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
        })
        .toLowerCase()
        .replace(" ", "");

    const sun = sunTimes(anchor, FREDERICK_LAT, FREDERICK_LNG);
    const delta = daylightDelta(anchor, FREDERICK_LAT, FREDERICK_LNG);
    const moon = moonPhase(anchor);

    // Today's public event count, timeout-raced: the loader is warm-cron'd
    // every 5 minutes so this almost always resolves instantly, but a cold
    // cache must never make a crawler wait — the card just omits the stat.
    let eventsToday: number | null = null;
    if (day === easternDayKey(new Date())) {
      eventsToday = await Promise.race<number | null>([
        assembleUnifiedEvents(new Date())
          .then(
            (u) =>
              u.publicEvents.filter((e) => easternDayKey(new Date(e.starts_at)) === day)
                .length,
          )
          .catch(() => null),
        new Promise<number | null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
    }

    // Four stats maximum — five clips the 1200px canvas and a wrapped row
    // orphans whichever stat lands alone. The sun pair and the moon always
    // sit; the fourth seat goes to the event count (the social hook) when
    // the day has one, else to the daylight delta (the season's pulse).
    stats = [];
    if (sun) {
      stats.push({ label: "Sunrise", value: fmtTime(sun.sunrise) });
      stats.push({ label: "Sunset", value: fmtTime(sun.sunset) });
    }
    if (eventsToday !== null && eventsToday > 0) {
      stats.push({ label: "On today", value: `${eventsToday} events` });
    } else if (delta) {
      const d = delta.deltaMinutes;
      stats.push({
        label: "Daylight",
        value: d === 0 ? "steady" : `${d > 0 ? "+" : "-"}${Math.abs(d)} min`,
      });
    }
    stats.push({ label: "Moon", value: moon.name.toLowerCase() });
  } else if (type === "moment") {
    // Civic-moment hubs (/moments/[slug]) — the most-shared, timely content.
    // Not time-baked to a specific clock (social caches at share time); the
    // subtitle reads true across the whole window. Accent token → hex via the
    // shared map so the card matches the in-app hue. (audit)
    const m = momentBySlug(slug);
    if (m) {
      title = m.title;
      kicker = "A Frederick moment";
      blurb = m.subtitle;
      accent = COLLECTION_ACCENT_HEX[m.accent] ?? accent;
    }
  }

  // OG card palette — Brand Book No. 01 (May 2026): paper cream
  // ground, warm ink, almanac brick, hairline rule, ink-2 mid-grey
  // for kicker + footer. Serif fallback stack so the social card
  // reads as field-guide print, not SaaS dashboard. Newsreader +
  // Instrument Serif aren't loaded here yet — that needs woff2
  // bundling (follow-up). For now the fallback serif chain renders
  // a respectable system serif on Vercel's @vercel/og runtime.
  const PAPER = "#F8F2E6";
  const PAPER_2 = "#EEE6D4";
  const INK = "#16140E";
  const INK_2 = "#423E34";
  const INK_3 = "#6A6862";
  const HAIRLINE = "#DBD2BF";
  const SERIF = "Newsreader, 'Iowan Old Style', Georgia, 'Times New Roman', serif";
  const ITALIC = "'Instrument Serif', Newsreader, Georgia, serif";

  // Story (portrait) scales type + padding up for the taller 1080×1920
  // canvas; the landscape 1200×630 keeps its tuned sizes.
  const PAD = story ? 88 : 80;
  const MAST = story ? 30 : 24;
  const KICK = story ? 28 : 24;
  const TITLE = story ? 104 : 88;
  const BLURB = story ? 40 : 32;
  const FOOT = story ? 26 : 22;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: PAD,
          background: `linear-gradient(135deg, ${PAPER} 0%, ${PAPER_2} 100%)`,
          fontFamily: SERIF,
        }}
      >
        {/* Masthead — wordmark + brick dot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: MAST,
            fontWeight: 600,
            color: accent,
            letterSpacing: -0.5,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: PAPER,
              }}
            />
          </div>
          Frederick Radius
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Kicker — mono-ish editorial eyebrow, widely tracked
              and uppercased. The Brand Book uses Public Sans / mono
              here, but on the OG card the all-caps tracked treatment
              reads as field-guide kicker regardless of fallback. */}
          <div
            style={{
              fontSize: KICK,
              color: INK_3,
              letterSpacing: 3,
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {kicker}
          </div>
          {/* Title — serif display, the page's editorial weight. */}
          <div
            style={{
              fontFamily: SERIF,
              fontSize: TITLE,
              fontWeight: 700,
              color: INK,
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {title}
          </div>
          {/* Editorial one-liner — answers the audit's "object state /
              one useful reason" ask without baking time-of-day into a
              cached image. Stable per-record, so it reads true a day
              from now. Set in Instrument Serif italic — the Brand
              Book voice for taglines + pull-quotes. */}
          {blurb && (
            <div
              style={{
                fontFamily: ITALIC,
                fontStyle: "italic",
                fontSize: BLURB,
                color: INK_2,
                lineHeight: 1.25,
                maxWidth: 900,
              }}
            >
              {blurb.length > 110 ? blurb.slice(0, 107) + "…" : blurb}
            </div>
          )}
          {/* Almanac stat row — label/value plates separated by hairlines,
              the engraved-masthead language at share-card scale. */}
          {stats && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: story ? 32 : 34,
                rowGap: 24,
                marginTop: story ? 16 : 8,
              }}
            >
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingLeft: i === 0 ? 0 : story ? 32 : 34,
                    borderLeft: i === 0 ? "none" : `1px solid ${HAIRLINE}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: story ? 22 : 18,
                      color: INK_3,
                      letterSpacing: 2.5,
                      textTransform: "uppercase",
                      fontWeight: 500,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: story ? 44 : 36,
                      fontWeight: 600,
                      color: INK_2,
                      lineHeight: 1,
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Footer — hairline rule + domain + type chip */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ width: "100%", height: 1, background: HAIRLINE }} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              fontSize: FOOT,
              color: INK_2,
            }}
          >
            <div>frederickradius.app</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: INK_3 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
              {type === "place" ? "Place" : type === "event" ? "Event" : type === "municipality" ? "Town" : type === "category" ? "Category" : type === "collection" ? "Collection" : type === "almanac" ? "Almanac" : "Field guide"}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: story ? 1080 : 1200,
      height: story ? 1920 : 630,
      // June-9 deep audit P2: this route returned max-age=0 and paid a
      // full render on EVERY share/crawler hit. OG content only changes
      // when the underlying record changes (deploys), so cache at the
      // edge for a day and serve stale while revalidating for a week.
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
