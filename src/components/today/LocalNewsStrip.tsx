import { Newspaper, ArrowUpRight, Tv, Radio, FileText, Landmark, Heart, Globe } from "lucide-react";
import { getLocalHeadlines } from "@/lib/integrations/news";
import { sourceMeta, LANE_META, type NewsLane, type NewsMediaType } from "@/lib/news-sources";

type Headline = Awaited<ReturnType<typeof getLocalHeadlines>>[number];
type Decorated = Headline & ReturnType<typeof sourceMeta>;

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

const MEDIA_ICON: Record<NewsMediaType, typeof Tv> = {
  civic: Landmark,
  tv: Tv,
  radio: Radio,
  print: FileText,
  wire: Newspaper,
  memorial: Heart,
  web: Globe,
};

/**
 * The "brand pip": colored circle with the outlet's monogram. This is
 * the move that turns a list into a newsroom. The eye learns the marks
 * fast, sources get visual identity instead of small grey text, and
 * the desk reads as plural — many publishers, not one feed dump.
 */
function BrandPip({ meta, size = "sm" }: { meta: ReturnType<typeof sourceMeta>; size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-9 w-9 text-[11px]" : "h-7 w-7 text-[10.5px]";
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold tracking-tight ${dim}`}
      style={{
        background: meta.brandColor,
        color: "#fff",
        boxShadow: `0 1px 0 color-mix(in srgb, ${meta.brandColor} 50%, black 50%) inset, 0 1px 2px rgba(0,0,0,0.18)`,
      }}
    >
      {meta.monogram}
    </span>
  );
}

/**
 * Local newsroom: the section reads like a newsroom, not a feed dump.
 *
 * Layout, top to bottom:
 *   • Masthead: section title, source count, story count.
 *   • Lead story: the freshest non-memorial, magazine-set with the
 *     publisher's brand pip and a colored stripe.
 *   • Headline shelf: up to 8 more stories as a horizontal scroll of
 *     brand-colored cards. The full three-lane desk lives on /news.
 *
 * Every story shows the publisher's brand pip (colored circle with
 * monogram) plus a media-type icon (tv / radio / print / wire / civic),
 * so even without thumbnails the desk has visible plurality and
 * provenance. RSS carries no photos; this renders that constraint as
 * design rather than apologizing for it.
 */
export default async function LocalNewsStrip() {
  const headlines = await getLocalHeadlines();
  if (headlines.length === 0) return null;

  const decorated: Decorated[] = headlines.map((h) => ({ ...h, ...sourceMeta(h.source) }));

  const byLane: Record<NewsLane, Decorated[]> = { gov: [], press: [], community: [] };
  for (const h of decorated) byLane[h.lane].push(h);

  // Lead story = the freshest non-memorial. Memorials never lead the
  // desk because they're not "what's happening" in the civic sense and
  // it cheapens the family to use them as the magazine cover.
  const leadCandidates = decorated.filter((h) => h.mediaType !== "memorial");
  const lead = leadCandidates[0] ?? decorated[0];
  // Pull the lead out of its lane so it isn't shown twice in the column.
  const leadKey = lead?.url;
  const filteredByLane: Record<NewsLane, Decorated[]> = {
    gov: byLane.gov.filter((h) => h.url !== leadKey),
    press: byLane.press.filter((h) => h.url !== leadKey),
    community: byLane.community.filter((h) => h.url !== leadKey),
  };

  const totalStories = decorated.length;
  const uniqueSources = new Set(decorated.map((h) => h.display)).size;

  return (
    <section aria-label="Local newsroom" className="space-y-3">
      {/* Masthead — one line on every screen, source-count first because
          plurality is the whole story we're telling. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <Newspaper
            className="h-4 w-4 shrink-0"
            strokeWidth={2}
            style={{ color: "var(--app-cool)" }}
            aria-hidden
          />
          <h2
            className="font-serif text-base font-semibold tracking-tight whitespace-nowrap"
            style={{ color: "var(--app-ink)" }}
          >
            Local newsroom
          </h2>
        </div>
        <p
          className="text-[10px] uppercase tracking-[0.1em] tabular-nums whitespace-nowrap"
          style={{ color: "var(--app-ink-3)" }}
        >
          {uniqueSources} sources · {totalStories} stories · hourly
        </p>
      </div>

      {/* Lead story — full-width magazine card with brand stripe + pip.
          Shader-rim adds a slow conic-gradient stroke so the editorial
          moment reads as alive without changing height. */}
      {lead && (
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shader-rim group relative block overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.997]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ background: lead.brandColor }}
          />
          <div className="flex items-start gap-3 px-4 py-4 pl-5">
            <BrandPip meta={lead} size="md" />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                  style={{
                    background: `color-mix(in srgb, ${LANE_META[lead.lane].color} 15%, transparent)`,
                    color: LANE_META[lead.lane].color,
                  }}
                >
                  Top story
                </span>
                <span
                  className="text-[10.5px] tabular-nums"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {formatAge(lead.published_at)}
                </span>
              </div>
              <p
                className="font-serif text-[18px] font-semibold leading-snug"
                style={{ color: "var(--app-ink)" }}
              >
                {lead.title}
              </p>
              <p
                className="mt-2 flex items-center gap-1.5 text-[11px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {(() => {
                  const MediaIcon = MEDIA_ICON[lead.mediaType];
                  return <MediaIcon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />;
                })()}
                <span style={{ color: lead.brandColor, fontWeight: 600 }}>{lead.display}</span>
              </p>
            </div>
            <ArrowUpRight
              className="mt-1 h-4 w-4 shrink-0 opacity-50 transition group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </div>
        </a>
      )}

      {/* Headline shelf — the rest of the desk as a horizontal scroll
          of brand-colored cards, the same shelf pattern events and
          presets use. Reads as a designed row, not a stack of plain
          list items. Up to 8; the full 3-lane newsroom lives on /news. */}
      {(() => {
        const tail = [
          ...filteredByLane.gov,
          ...filteredByLane.press,
          ...filteredByLane.community,
        ].slice(0, 8);
        if (tail.length === 0) return null;
        return (
          <div className="-mx-4 px-4">
            <div className="shelf-rail gap-2.5 pb-1">
              {tail.map((h, i) => {
                const MediaIcon = MEDIA_ICON[h.mediaType];
                return (
                  <a
                    key={`${h.url}-${i}`}
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex w-[208px] shrink-0 flex-col gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 shadow-[var(--app-shadow-1)] transition active:scale-[0.97]"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <BrandPip meta={h} />
                      <span
                        className="min-w-0 flex-1 truncate text-[11px] font-bold"
                        style={{ color: h.brandColor }}
                      >
                        {h.display}
                      </span>
                      <MediaIcon
                        className="h-3 w-3 shrink-0"
                        strokeWidth={2.25}
                        style={{ color: "var(--app-ink-3)" }}
                        aria-hidden
                      />
                    </div>
                    <p
                      className="line-clamp-3 text-[13px] font-semibold leading-snug"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {h.title}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span
                        aria-hidden
                        className="block h-[3px] w-7 rounded-full"
                        style={{ background: h.brandColor }}
                      />
                      <span
                        className="text-[10px] tabular-nums"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {formatAge(h.published_at)}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })()}
    </section>
  );
}
