import Link from "next/link";
import { COLLECTION_BY_SLUG } from "@/data/collections";

// The Pride flag is a real-world symbol, so it keeps its canonical 6-stripe
// colors (a justified exception to the tokens-only rule: recoloring a Pride flag
// to the brand palette would be wrong). Rendered small, slightly softened, with
// a hairline so it reads as a quiet printed flag on the cream paper, not a loud
// banner.
const PRIDE_STRIPES = ["#E40303", "#FF8C00", "#FFED00", "#008026", "#004DFF", "#750787"];

function PrideFlag() {
  return (
    <svg
      viewBox="0 0 18 12"
      aria-hidden
      className="h-3 w-[18px] shrink-0 rounded-[2px] opacity-90 ring-1 ring-inset ring-black/10"
    >
      {PRIDE_STRIPES.map((c, i) => (
        <rect key={c} x="0" y={i * 2} width="18" height="2" fill={c} />
      ))}
    </svg>
  );
}

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
      <PrideFlag />
      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>Pride Month.</span>
      <Link href="/collections/lgbtq-frederick" className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
        Explore LGBTQ+ Frederick →
      </Link>
    </p>
  );
}
