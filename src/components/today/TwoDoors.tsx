import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * TwoDoors — the home entry to the find-system's two jobs.
 *
 * The product's spine made tappable: "Find somewhere good" (eat/drink
 * right now) and "What's on this weekend" (going-on), side by side with
 * live counts so the doors read as alive, not static nav. Placed near
 * the top of /today so the two jobs are the first real choice a visitor
 * makes after the weather glance.
 *
 * Pure presentation — counts are computed by the server page (cached)
 * and passed in, so this stays a cheap, static-friendly render.
 */
export default function TwoDoors({
  openCount,
  weekendCount,
}: {
  openCount?: number;
  weekendCount?: number;
}) {
  return (
    <section aria-label="What are you after?" className="space-y-3">
      <Door
        href="/find"
        variant="eat"
        eyebrow="Eat & drink"
        title="Find somewhere good"
        blurb="The places locals send people to, open now and a short walk away."
        meta={openCount ? `${openCount} open now` : "Open now"}
        emoji="🍴"
      />
      <Door
        href="/weekend"
        variant="weekend"
        eyebrow="Going on"
        title="What's on this weekend"
        blurb="The can't-miss few: festivals, music and markets you'd be sad to miss."
        meta={
          weekendCount
            ? `${weekendCount} this weekend`
            : "This weekend"
        }
        emoji="📅"
      />
    </section>
  );
}

function Door({
  href,
  variant,
  eyebrow,
  title,
  blurb,
  meta,
  emoji,
}: {
  href: string;
  variant: "eat" | "weekend";
  eyebrow: string;
  title: string;
  blurb: string;
  meta: string;
  emoji: string;
}) {
  // Two distinct gradients drawn from the brand palette so the doors are
  // instantly distinguishable — warm brick→plum for eat, cool slate→
  // green for the weekend.
  const bg =
    variant === "eat"
      ? "linear-gradient(135deg, var(--app-brand), #7E2C6F)"
      : "linear-gradient(135deg, #2F5763, var(--app-brand-2))";
  return (
    <Link
      href={href}
      className="tactile tactile-interactive group relative flex min-h-[132px] flex-col justify-end overflow-hidden rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1)" }}
    >
      {/* gradient field + readability scrim */}
      <span aria-hidden className="absolute inset-0" style={{ background: bg }} />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(20,18,16,0.58), rgba(20,18,16,0.05))" }}
      />

      {/* icon chip + live meta */}
      <span
        aria-hidden
        className="absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-[13px] text-[22px]"
        style={{ background: "rgba(252,248,239,0.92)" }}
      >
        {emoji}
      </span>
      <span
        className="mono absolute right-4 top-[18px] text-right text-[10px] font-semibold uppercase leading-tight tracking-[0.08em]"
        style={{ color: "rgba(255,255,255,0.92)" }}
      >
        {meta}
      </span>

      {/* caption */}
      <span className="relative z-10 block">
        <span className="mono block text-[9px] uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.8)" }}>
          {eyebrow}
        </span>
        <span className="mt-1.5 block font-serif text-[23px] font-semibold leading-[1.05] text-white">
          {title}
        </span>
        <span className="mt-1.5 block max-w-[80%] text-[12.5px] leading-snug" style={{ color: "rgba(255,255,255,0.9)" }}>
          {blurb}
        </span>
      </span>

      <span
        aria-hidden
        className="absolute bottom-4 right-4 z-10 grid h-8 w-8 place-items-center rounded-full text-[var(--app-ink)] transition-transform group-hover:translate-x-0.5"
        style={{ background: "rgba(252,248,239,0.92)" }}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </Link>
  );
}
