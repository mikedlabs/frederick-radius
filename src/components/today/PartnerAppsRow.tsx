import { ExternalLink, Car, Utensils } from "lucide-react";

/**
 * PartnerAppsRow — Frederick-specific quick-action handoffs.
 *
 * The City of Frederick has gone all-digital for street parking via
 * ParkMobile, and OpenTable is the dominant reservation system for
 * Downtown restaurants. Both are external apps with their own deep-
 * link entry points.
 *
 * v3 design — quieted. The v2 filled-brand-color cards read too loud
 * for utility shortcuts (ParkMobile orange + OpenTable red were each
 * shouting next to the calm Frederick palette of the rest of /now).
 * Now: a neutral card with the partner's brand color used only as
 * the icon-pill tint and a thin left-border accent. The partner
 * identity still reads at a glance, but the row sits politely below
 * MoodTiles instead of competing with them.
 *
 * Server component; pure presentation.
 */

type Handoff = {
  href: string;
  label: string;
  nudge: string;
  icon: typeof Car;
  /** Partner's REAL signature brand color. */
  brand: string;
};

const HANDOFFS: Handoff[] = [
  {
    href: "https://app.parkmobile.io",
    label: "ParkMobile",
    nudge: "Pay for street parking",
    icon: Car,
    // ParkMobile signature orange.
    brand: "#FF6900",
  },
  {
    href: "https://www.opentable.com/c/frederick-md-restaurants",
    label: "OpenTable",
    nudge: "Reserve a table tonight",
    icon: Utensils,
    // OpenTable signature red.
    brand: "#DA3743",
  },
];

export default function PartnerAppsRow() {
  return (
    <section aria-label="Partner apps" className="space-y-2">
      <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        Quick handoffs
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {HANDOFFS.map((h) => {
          const Icon = h.icon;
          return (
            <li key={h.label}>
              <a
                href={h.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${h.label} — ${h.nudge}`}
                className="tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-md)] border p-3 transition active:scale-[0.98]"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                  // Thin partner-color hairline on the left edge keeps
                  // the identity readable without painting the whole
                  // card. Cheap, calm, distinctive.
                  boxShadow: `inset 3px 0 0 ${h.brand}`,
                }}
              >
                {/* External-link badge — small, ink-toned. */}
                <span
                  aria-hidden
                  className="absolute right-2 top-2 inline-flex items-center"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  <ExternalLink
                    className="h-2.5 w-2.5"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </span>

                {/* Icon tile — brand-color tint at low opacity, brand
                    icon on top. No glassmorphism / heavy shadow. */}
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${h.brand} 14%, transparent)`,
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    strokeWidth={2.25}
                    style={{ color: h.brand }}
                  />
                </span>

                <span className="mt-2 block">
                  <span
                    className="block text-[14px] font-semibold leading-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {h.label}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-[11px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {h.nudge}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <p
        className="px-1 text-[10px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        The City of Frederick uses ParkMobile for all street parking — fully digital, zone-based. OpenTable handles dinner reservations for most downtown restaurants.
      </p>
    </section>
  );
}
