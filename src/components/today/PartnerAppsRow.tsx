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
      {/* Compact pill row — was a 2-col stack of tall cards that
          punched above its weight relative to the section's purpose
          (these are just shortcuts, not destinations). Switching to
          short horizontal pills keeps the partner-color hairline
          identity but cuts the section's vertical real estate in
          about half. */}
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
                className="tactile-interactive relative flex items-center gap-2.5 overflow-hidden rounded-[var(--app-radius-md)] border px-3 py-2 transition active:scale-[0.98]"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                  boxShadow: `inset 3px 0 0 ${h.brand}`,
                }}
              >
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
                <ExternalLink
                  className="h-3 w-3 shrink-0"
                  strokeWidth={2.5}
                  style={{ color: "var(--app-ink-3)" }}
                  aria-hidden
                />
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
