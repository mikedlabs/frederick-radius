import Link from "next/link";
import {
  Coffee,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Trees,
  type LucideIcon,
} from "lucide-react";
import { CRAVINGS } from "@/data/cravings";

/**
 * CravingStrip — the fast lane on Today.
 *
 * "I want ___ right now" as a one-tap row. Each chip deep-links into /now
 * with the craving preselected, so a person standing on the sidewalk goes
 * Today → tap "Ice cream" → nearest open one, in two taps. Server component
 * (plain links) so it costs nothing and renders above the fold.
 */
const ICONS: Record<string, LucideIcon> = {
  Coffee,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Trees,
};

export default function CravingStrip() {
  return (
    <section aria-label="Right now" className="space-y-1.5">
      <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        Right now
      </p>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {CRAVINGS.map((c) => {
          const Icon = ICONS[c.icon];
          return (
            <Link
              key={c.key}
              href={`/now?c=${c.key}`}
              className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold"
              style={{ color: "var(--app-ink-2)" }}
            >
              <Icon className="h-4 w-4" strokeWidth={2} style={{ color: c.color }} aria-hidden />
              {c.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
