import { Newspaper, ArrowUpRight } from "lucide-react";
import { getLocalHeadlines } from "@/lib/integrations/news";

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.round(hr / 24);
  return `${d}d`;
}

export default async function LocalNewsStrip() {
  const headlines = await getLocalHeadlines();
  if (headlines.length === 0) return null;

  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5"
           style={{ borderColor: "var(--app-border)" }}>
        <Newspaper className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Local news · refreshed every 30 min
        </p>
      </div>
      <ul>
        {headlines.slice(0, 5).map((h, i) => (
          <li key={i} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--app-border)" }}>
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--app-bg-sunken)]"
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
                  {h.title}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {h.source} · {formatAge(h.published_at)} ago
                </p>
              </div>
              <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
