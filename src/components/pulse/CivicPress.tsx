import { Siren, ArrowUpRight } from "lucide-react";
import type { CivicPressItem } from "@/lib/integrations/civic-press";

/**
 * The City + County press desk, two ways:
 *
 *   <PoliceBreakingStrip> — the latest police / public-safety release,
 *     given prominent "breaking" treatment at the top of /pulse. Vermilion,
 *     a live dot, the headline in serif, posted-when in mono. This is the
 *     thing a resident most wants to know fast. Absent when there's nothing.
 *
 *   <PoliceBlotter> — the standing list of recent police releases for the
 *     Police section lower on the page (the running blotter), excluding the
 *     one already featured up top so the page never says it twice.
 *
 * Both link out to the official .gov release. We never republish the body —
 * headline + canonical link + when, then you read it at the source.
 */

function since(now: number, iso: string): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Small mono tag for the publisher ("City" / "County"). */
function SourceTag({ item }: { item: CivicPressItem }) {
  return (
    <span
      className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
      style={{ color: "var(--app-ink-3)" }}
    >
      {item.source}
    </span>
  );
}

export function PoliceBreakingStrip({ item, now }: { item: CivicPressItem; now: number }) {
  const ms = now - new Date(item.publishedAt).getTime();
  const fresh = Number.isFinite(ms) && ms >= 0 && ms < 24 * 3600 * 1000;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${fresh ? "Breaking" : "Latest"} from ${item.source} police: ${item.title}`}
      className="tactile-interactive group block overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
        borderTopColor: "var(--app-border)",
        borderRightColor: "var(--app-border)",
        borderBottomColor: "var(--app-border)",
        borderLeftWidth: 3,
        borderLeftColor: "var(--app-brand)",
        background: "color-mix(in srgb, var(--app-brand) 5%, var(--app-bg-elevated))",
      }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)", color: "var(--app-brand-press)" }}
        >
          <Siren className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
            <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-brand)" }} />
            {fresh ? "Breaking · Police & safety" : "Latest · Police & safety"}
          </p>
          <p className="mt-1 font-serif text-[16px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
            {item.title}
          </p>
          <p className="mt-1.5 flex items-center gap-2 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            <SourceTag item={item} />
            <span aria-hidden>·</span>
            <span>{since(now, item.publishedAt)}</span>
          </p>
        </div>
        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
      </div>
    </a>
  );
}

export function PoliceBlotter({ items, now }: { items: CivicPressItem[]; now: number }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
      {items.map((item) => (
        <li key={item.url}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="tactile-interactive group flex items-start gap-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium leading-snug" style={{ color: "var(--app-ink)" }}>
                {item.title}
              </p>
              <p className="mt-1 flex items-center gap-2 font-mono text-[10.5px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                <SourceTag item={item} />
                <span aria-hidden>·</span>
                <span>{since(now, item.publishedAt)}</span>
              </p>
            </div>
            <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          </a>
        </li>
      ))}
    </ul>
  );
}
