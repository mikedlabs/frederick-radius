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

// Deterministic accent per source so the desk reads as distinct
// outlets at a glance, not one grey list.
const ACCENTS = ["#C4451C", "#2A5D8F", "#5B3A8F", "#3F7E5A", "#B07A1E", "#1E6B3A"];
function accentFor(source: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

/**
 * Local news desk — an editorial lead story + a scannable column of
 * the rest. Vertical, the way people actually read news (the old
 * horizontal text-card rail read thin). Multi-source, county-wide,
 * refreshed hourly. RSS carries no images, so type + a per-source
 * color spine carry it — never a fabricated thumbnail.
 */
export default async function LocalNewsStrip() {
  const headlines = await getLocalHeadlines();
  if (headlines.length === 0) return null;

  const [lead, ...rest] = headlines;
  const list = rest.slice(0, 11);
  const sources = new Set(headlines.map((h) => h.source)).size;
  const leadAccent = accentFor(lead.source);

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
          {headlines.length} stories · {sources} sources · hourly
        </p>
      </div>

      <div
        className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* Lead story */}
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block px-4 py-3.5 transition active:bg-[var(--app-bg-sunken)]"
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: leadAccent }} />
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: leadAccent }}>
              {lead.source}
            </span>
            <span className="shrink-0 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
              {formatAge(lead.published_at)}
            </span>
          </div>
          <p
            className="font-serif text-[18px] font-semibold leading-snug"
            style={{ color: "var(--app-ink)" }}
          >
            {lead.title}
          </p>
        </a>

        {/* The rest — tight, scannable column */}
        <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
          {list.map((h, i) => {
            const accent = accentFor(h.source);
            return (
              <li key={i} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--app-border)" }}>
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--app-bg-sunken)]"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: accent }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="line-clamp-2 text-[14px] font-semibold leading-snug"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {h.title}
                    </span>
                    <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      <span style={{ color: accent }}>{h.source}</span> · {formatAge(h.published_at)}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    strokeWidth={2}
                    style={{ color: "var(--app-ink-3)" }}
                    aria-hidden
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
