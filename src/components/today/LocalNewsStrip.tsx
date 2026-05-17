import { Newspaper, ArrowUpRight } from "lucide-react";
import { getLocalHeadlines } from "@/lib/integrations/news";

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

// A small deterministic accent per source so the rail reads as
// distinct cards at a glance, not one grey list. Hash → palette.
const ACCENTS = ["#C4451C", "#2A5D8F", "#5B3A8F", "#3F7E5A", "#B07A1E"];
function accentFor(source: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

/**
 * Local news as a swipeable card rail (not a grey list buried in a
 * collapsible footer). News RSS carries no images, so type IS the
 * visual: a colored source spine, a serif headline, honest age. No
 * fabricated thumbnails.
 */
export default async function LocalNewsStrip() {
  const headlines = await getLocalHeadlines();
  if (headlines.length === 0) return null;

  return (
    <section aria-label="Local news">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          <h2 className="font-serif text-base font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Local news
          </h2>
        </div>
        <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Refreshed every 30 min
        </p>
      </div>

      <div className="shelf-rail flex gap-3 pb-1">
        {headlines.slice(0, 8).map((h, i) => {
          const accent = accentFor(h.source);
          return (
            <a
              key={i}
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex w-[15.5rem] shrink-0 flex-col overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)] transition active:scale-[0.99]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: accent }}
              />
              <div className="flex flex-1 flex-col gap-2 py-3 pl-4 pr-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-[10px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: accent }}
                  >
                    {h.source}
                  </span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={2}
                    style={{ color: "var(--app-ink-3)" }}
                    aria-hidden
                  />
                </div>
                <p
                  className="line-clamp-4 font-serif text-[15px] font-semibold leading-snug"
                  style={{ color: "var(--app-ink)" }}
                >
                  {h.title}
                </p>
                <p className="mt-auto text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {formatAge(h.published_at)}
                </p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
