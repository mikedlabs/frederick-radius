import { ExternalLink, Car, Utensils } from "lucide-react";

/**
 * PartnerAppsRow — Frederick-specific quick-action handoffs.
 *
 * The City of Frederick has gone all-digital for street parking via
 * ParkMobile, and OpenTable is the dominant reservation system for
 * Downtown restaurants. Both are external apps with their own deep-
 * link entry points.
 *
 * v2 design: each card carries the partner's REAL brand color
 * (ParkMobile signature orange, OpenTable signature red) so the
 * handoff reads as a partnership — the user knows where they're
 * going before the tap. The earlier version used Frederick palette
 * for both cards, which made them feel like generic in-app
 * shortcuts rather than real third-party apps.
 *
 * Visual model: filled brand-color card, white icon glass-pill in
 * the top-left, partner name in white serif at the bottom-left, a
 * one-line nudge under that, ExternalLink badge top-right. Same
 * shape as the MoodTiles intent tiles so the row sits cohesively
 * in the /now spine.
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

/** Same gradient recipe as MoodTiles — lighter top-left to saturated
 *  bottom-right — so the partner cards share the visual rhythm of
 *  the /now spine even though they carry external brand colors. */
function gradientFor(color: string): string {
  return `linear-gradient(155deg, color-mix(in srgb, ${color} 80%, white) 0%, ${color} 65%, color-mix(in srgb, ${color} 88%, black) 100%)`;
}

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
                className="tactile tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-md)] border p-3 transition active:scale-[0.98]"
                style={{
                  borderColor: `color-mix(in srgb, ${h.brand} 40%, black)`,
                  background: gradientFor(h.brand),
                  boxShadow: `var(--app-elev-1), 0 4px 12px -6px color-mix(in srgb, ${h.brand} 35%, transparent)`,
                }}
              >
                {/* Soft white scatter for depth, same recipe as the
                    intent tiles. */}
                <span
                  aria-hidden
                  className="absolute -right-4 -bottom-4 h-16 w-16 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
                  }}
                />

                {/* External-link badge — quiet, white at 80% so it
                    reads on any brand color without competing. */}
                <span
                  aria-hidden
                  className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.22)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                  }}
                >
                  <ExternalLink
                    className="h-2.5 w-2.5 text-white"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </span>

                {/* Icon glass pill, same shape as MoodTiles. */}
                <span
                  aria-hidden
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.96)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    boxShadow:
                      "0 2px 6px -1px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.7)",
                  }}
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={2.25}
                    style={{ color: h.brand }}
                  />
                </span>

                <span className="mt-2 block">
                  <span
                    className="block font-serif text-[16px] font-semibold leading-tight text-white"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                  >
                    {h.label}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-[11px] font-medium text-white/90"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
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
