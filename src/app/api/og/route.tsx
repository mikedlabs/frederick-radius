import { ImageResponse } from "next/og";
import { PLACE_BY_SLUG } from "@/data/places";
import { EVENT_BY_SLUG } from "@/data/events";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { COLLECTION_BY_SLUG } from "@/data/collections";

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
    blurb = "A living field guide to Frederick County. What's open, what's on, and what's worth your time.";
    accent = "#E14328";
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
              {type === "place" ? "Place" : type === "event" ? "Event" : type === "municipality" ? "Town" : type === "category" ? "Category" : type === "collection" ? "Collection" : "Local discovery"}
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
