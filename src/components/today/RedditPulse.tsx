import Link from "next/link";
import { ArrowUpRight, Flame } from "lucide-react";
import { getFrederickRedditPulse, type RedditPost } from "@/lib/integrations/reddit";

// Each `color` is used both as the badge text AND (mixed into the elevated
// ground) as its tint background, so it must be a TEXT-SAFE token: the warm
// signals use their darker -press variants (the plain brand/accent/warning
// fail AA at this 10px size), and vent darkens its warning toward ink.
const CATEGORY_STYLE: Record<RedditPost["category"], { label: string; color: string }> = {
  news: { label: "News", color: "var(--app-danger)" },
  question: { label: "Question", color: "var(--app-cool)" },
  recommendation: { label: "Rec", color: "var(--app-positive)" },
  event: { label: "Event", color: "var(--app-brand-press)" },
  vent: { label: "Vent", color: "color-mix(in srgb, var(--app-warning), var(--app-ink) 30%)" },
  humor: { label: "Humor", color: "var(--app-accent-press)" },
  discussion: { label: "Discussion", color: "var(--app-ink-2)" },
  other: { label: "Post", color: "var(--app-ink-3)" },
};

function ageString(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function RedditPulse() {
  const posts = await getFrederickRedditPulse({ sort: "top", timeRange: "week", limit: 6, minScore: 8 });
  if (posts.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="What Frederick is talking about on Reddit (r/FrederickMD)"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5"
              style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
          <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            What Frederick&apos;s talking about
          </p>
        </div>
        <Link
          href="https://www.reddit.com/r/FrederickMD/top/?t=week"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium"
          style={{ color: "var(--app-ink-3)" }}
        >
          r/FrederickMD →
        </Link>
      </header>
      <ul>
        {posts.map((p, i) => {
          const cat = CATEGORY_STYLE[p.category];
          return (
            <li key={p.id} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--app-border)" }}>
              <a
                href={p.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--app-bg-sunken)]"
              >
                <span
                  aria-hidden
                  className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: `color-mix(in srgb, ${cat.color} 14%, var(--app-bg-elevated))`, color: cat.color }}
                >
                  {cat.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                    {p.title}
                  </p>
                  {p.selftext_preview && (
                    <p className="mt-0.5 line-clamp-1 text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                      {p.selftext_preview}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                    <span>{ageString(p.created_at)} ago</span>
                    <span>· u/{p.author}</span>
                    {p.flair && <span>· {p.flair}</span>}
                  </p>
                </div>
                <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
              </a>
            </li>
          );
        })}
      </ul>
      <footer
        className="border-t px-4 py-2 text-[10px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Surfaced from r/FrederickMD · top posts this week, filtered for noise · refreshed every 15 min · not moderated by us
      </footer>
    </section>
  );
}
