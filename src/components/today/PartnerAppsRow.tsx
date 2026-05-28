import Link from "next/link";
import { ExternalLink, Car, Utensils, ArrowRight } from "lucide-react";

/**
 * PartnerAppsRow — Frederick-specific quick-action handoffs.
 *
 * Parking sends to the in-app /parking guide (garages, zones, event
 * parking) rather than dumping users straight into ParkMobile. The
 * direct ParkMobile link 403s for crawlers and lands without context
 * for real users; the in-app guide is faster, friendlier, and has
 * the ParkMobile launch on it already. OpenTable stays external —
 * it's the actual reservation system, no in-app alternative.
 *
 * Visual treatment is shared: neutral card, brand color used only as
 * icon-pill tint and a thin left-border accent. Internal vs. external
 * is signalled by the trailing icon (ArrowRight vs. ExternalLink).
 *
 * Server component; pure presentation.
 */

type Handoff = {
  href: string;
  label: string;
  nudge: string;
  icon: typeof Car;
  /** Partner's REAL signature brand color (or app brand for internal). */
  brand: string;
  /** External handoffs open in a new tab and show an ExternalLink chip. */
  external: boolean;
};

const HANDOFFS: Handoff[] = [
  {
    href: "/parking",
    label: "Parking",
    nudge: "Garages, zones, event lots",
    icon: Car,
    // ParkMobile signature orange — keeps the visual association with
    // street parking even though the link now goes to the in-app guide.
    brand: "#FF6900",
    external: false,
  },
  {
    // Search endpoint centered on Downtown Frederick — the /c/ city
    // collection URL was returning 404 in crawlers as OpenTable has
    // been deprecating those slugs. The search URL is the same pattern
    // place-actions.ts uses as its "always lands correctly" fallback
    // when a restaurant has no opentable_id.
    href: "https://www.opentable.com/s?term=&covers=2&latitude=39.4143&longitude=-77.4105",
    label: "OpenTable",
    nudge: "Reserve a table tonight",
    icon: Utensils,
    // OpenTable signature red.
    brand: "#DA3743",
    external: true,
  },
];

export default function PartnerAppsRow() {
  return (
    <section aria-label="Quick handoffs" className="space-y-2">
      <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        Quick handoffs
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {HANDOFFS.map((h) => {
          const Icon = h.icon;
          const TrailingIcon = h.external ? ExternalLink : ArrowRight;
          const sharedClass =
            "tactile-interactive relative flex items-center gap-2.5 overflow-hidden rounded-[var(--app-radius-md)] border px-3 py-2 transition active:scale-[0.98]";
          const sharedStyle = {
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            boxShadow: `inset 3px 0 0 ${h.brand}`,
          } as const;
          const inner = (
            <>
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${h.brand} 14%, transparent)`,
                }}
              >
                <Icon
                  className="h-[14px] w-[14px]"
                  strokeWidth={2.25}
                  style={{ color: h.brand }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13px] font-semibold leading-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {h.label}
                </span>
                <span
                  className="mt-0.5 block truncate text-[10.5px] leading-tight"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {h.nudge}
                </span>
              </span>
              <TrailingIcon
                className="h-3 w-3 shrink-0"
                strokeWidth={2.5}
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
            </>
          );
          return (
            <li key={h.label}>
              {h.external ? (
                <a
                  href={h.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${h.label} — ${h.nudge}`}
                  className={sharedClass}
                  style={sharedStyle}
                >
                  {inner}
                </a>
              ) : (
                <Link
                  href={h.href}
                  aria-label={`${h.label} — ${h.nudge}`}
                  className={sharedClass}
                  style={sharedStyle}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p
        className="px-1 text-[10px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        Frederick has five city garages plus ParkMobile zones for street parking. OpenTable handles dinner reservations for most downtown restaurants.
      </p>
    </section>
  );
}
