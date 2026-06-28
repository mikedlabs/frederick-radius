import Link from "next/link";
import { Heart } from "lucide-react";
import { COLLECTION_BY_SLUG } from "@/data/collections";

/**
 * A quiet Pride Month beat (June only, Eastern). Points to the curated LGBTQ+
 * Frederick collection — the community hub + verified welcoming spaces. Honest:
 * it surfaces a real curated list, never auto-guessed venues, and self-hides the
 * other eleven months. Pride events themselves flow through the normal events
 * feed / What's On.
 */
export default function PrideBeat({ now }: { now: Date }) {
  const month = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" }).format(now),
  );
  if (month !== 6) return null;
  if (!COLLECTION_BY_SLUG["lgbtq-frederick"]) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
      <Heart className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>Pride Month.</span>
      <Link href="/collections/lgbtq-frederick" className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
        Explore LGBTQ+ Frederick →
      </Link>
    </p>
  );
}
