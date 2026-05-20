import { Newspaper, ArrowUpRight, Landmark, Heart, FileText } from "lucide-react";
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

type Topic = "gov" | "obit" | "press";

/**
 * Classify each headline so the desk reads as ORGANIZED, not a dump
 * of every Google News result. Obituaries get their own section so
 * actionable civic news doesn't compete with funeral notices. .gov
 * sources get a Government badge so residents can see official news
 * at a glance.
 */
function classify(h: { source: string; title: string }): Topic {
  const s = h.source.toLowerCase();
  const t = h.title.toLowerCase();
  if (/obit|memorial|funeral|legacy\.com|tribute/i.test(`${s} ${t}`)) return "obit";
  if (/\.gov|city of frederick|frederick county government|fcps|fcpl/i.test(s)) return "gov";
  return "press";
}

const TOPIC: Record<
  Topic,
  { label: string; color: string; icon: typeof Newspaper }
> = {
  gov: { label: "Government", color: "#2A5D8F", icon: Landmark },
  press: { label: "Press", color: "#C4451C", icon: FileText },
  obit: { label: "Community", color: "#8A8884", icon: Heart },
};

/**
 * Local news desk — organized so the page doesn't feel like a feed dump.
 *
 * Layout:
 *   • Lead story: the freshest non-obit, magazine-set with a topic chip.
 *   • Press + Government: the working civic news, scannable column.
 *   • Community memorials: collapsed by default — present so families
 *     can find them, but not competing with "what's happening today".
 *
 * Vertical, multi-source, refreshed hourly. RSS carries no images,
 * so per-source color + topic icon carry the visual variety. Never a
 * fabricated thumbnail.
 */
export default async function LocalNewsStrip() {
  const headlines = await getLocalHeadlines();
  if (headlines.length === 0) return null;

  const typed = headlines.map((h) => ({ ...h, topic: classify(h) }));
  const obits = typed.filter((h) => h.topic === "obit");
  const news = typed.filter((h) => h.topic !== "obit");

  if (news.length === 0 && obits.length === 0) return null;

  const [lead, ...rest] = news.length > 0 ? news : typed; // graceful fallback
  const peek = rest.slice(0, 3);
  const overflow = rest.slice(3, 11);

  const sources = new Set(typed.map((h) => h.source)).size;
  const leadTopic = TOPIC[("topic" in lead ? lead.topic : classify(lead)) as Topic];

  const renderRow = (
    h: (typeof typed)[number],
    i: number,
    withTopBorder: boolean,
  ) => {
    const meta = TOPIC[h.topic];
    const Icon = meta.icon;
    return (
      <li
        key={`${h.url}-${i}`}
        className={withTopBorder ? "border-t" : ""}
        style={{ borderColor: "var(--app-border)" }}
      >
        <a
          href={h.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--app-bg-sunken)]"
        >
          <span
            aria-hidden
            className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)`, color: meta.color }}
          >
            <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="line-clamp-2 text-[14px] font-semibold leading-snug"
              style={{ color: "var(--app-ink)" }}
            >
              {h.title}
            </span>
            <span
              className="mt-0.5 block text-[11px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <span style={{ color: meta.color }}>{h.source}</span> ·{" "}
              {formatAge(h.published_at)}
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
  };

  return (
    <section aria-label="Local news" className="space-y-2.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Newspaper
            className="h-4 w-4"
            strokeWidth={2}
            style={{ color: "var(--app-cool)" }}
            aria-hidden
          />
          <h2
            className="font-serif text-base font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Local news
          </h2>
        </div>
        <p
          className="text-[10px] uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {news.length} stories · {sources} sources · hourly
        </p>
      </div>

      <div
        className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* Lead story — magazine-set, topic-chipped */}
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block px-4 py-3.5 transition active:bg-[var(--app-bg-sunken)]"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1"
            style={{ background: leadTopic.color }}
          />
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{
                background: `color-mix(in srgb, ${leadTopic.color} 16%, transparent)`,
                color: leadTopic.color,
              }}
            >
              <leadTopic.icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              {leadTopic.label}
            </span>
            <span
              className="shrink-0 text-[10px]"
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
            className="mt-1.5 text-[11px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {lead.source}
          </p>
        </a>

        {/* The first three follow-ups — always visible */}
        {peek.length > 0 && (
          <ul
            className="border-t"
            style={{ borderColor: "var(--app-border)" }}
          >
            {peek.map((h, i) => renderRow(h, i, i > 0))}
          </ul>
        )}

        {/* Overflow — tucked into a native <details>. */}
        {overflow.length > 0 && (
          <details
            className="group border-t"
            style={{ borderColor: "var(--app-border)" }}
          >
            <summary
              className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-[12px] font-semibold select-none [&::-webkit-details-marker]:hidden"
              style={{ color: "var(--app-cool)" }}
            >
              <span>Show {overflow.length} more</span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
                strokeWidth={2.25}
                aria-hidden
              />
            </summary>
            <ul
              className="border-t"
              style={{ borderColor: "var(--app-border)" }}
            >
              {overflow.map((h, i) => renderRow(h, i + 3, i > 0))}
            </ul>
          </details>
        )}
      </div>

      {/* Community memorials — separate card, collapsed by default.
          They're present so families can find them; they no longer
          compete with civic news in the main flow. */}
      {obits.length > 0 && (
        <details
          className="group overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <summary
            className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[12px] font-semibold select-none [&::-webkit-details-marker]:hidden"
            style={{ color: "var(--app-ink-2)" }}
          >
            <Heart
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              style={{ color: TOPIC.obit.color }}
              aria-hidden
            />
            <span>Community memorials</span>
            <span
              className="rounded-full px-1.5 text-[10px] font-bold tabular-nums"
              style={{
                background: `color-mix(in srgb, ${TOPIC.obit.color} 18%, transparent)`,
                color: TOPIC.obit.color,
              }}
            >
              {obits.length}
            </span>
            <ArrowUpRight
              className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
              strokeWidth={2.25}
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
          </summary>
          <ul
            className="border-t"
            style={{ borderColor: "var(--app-border)" }}
          >
            {obits.slice(0, 10).map((h, i) => renderRow(h, i, i > 0))}
          </ul>
        </details>
      )}
    </section>
  );
}
