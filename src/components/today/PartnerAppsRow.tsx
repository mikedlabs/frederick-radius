import { ExternalLink, Car, Utensils } from "lucide-react";

/**
 * PartnerAppsRow — Frederick-specific quick-action card row.
 *
 * The City of Frederick has gone all-digital for street parking via
 * ParkMobile, and OpenTable is the dominant reservation system for
 * Downtown restaurants. Both are external apps with their own deep-
 * link entry points. Pre-launch we had a "Parking" tile in MoodTiles
 * that linked to /category/parking — useful for finding a lot, but
 * the actual JOB ("pay the meter on Patrick St right now") still
 * lives inside ParkMobile.
 *
 * Two cards, side by side:
 *   - ParkMobile  — Pay for street parking (zone-based, all digital)
 *   - OpenTable   — Reserve a table in Frederick County tonight
 *
 * Each is a small horizontal card with an icon stamp, label,
 * one-line nudge, and ExternalLink hint icon. Tap opens the
 * partner's site in a new tab (most mobile devices will hand off
 * to the installed native app via universal link).
 *
 * Server component; pure presentation, no state.
 */
export default function PartnerAppsRow() {
  return (
    <section aria-label="Partner apps" className="space-y-2">
      <h2
        className="eyebrow"
        style={{ color: "var(--app-ink-3)" }}
      >
        Quick handoffs
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        <li>
          <a
            href="https://app.parkmobile.io"
            target="_blank"
            rel="noopener noreferrer"
            className="tactile tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition active:scale-[0.98]"
            style={{
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)" }}
            >
              <Car className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                ParkMobile
              </span>
              <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                Pay for street parking
              </span>
            </span>
            <ExternalLink
              aria-hidden
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
            />
          </a>
        </li>
        <li>
          <a
            href="https://www.opentable.com/c/frederick-md-restaurants"
            target="_blank"
            rel="noopener noreferrer"
            className="tactile tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2.5 transition active:scale-[0.98]"
            style={{
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)" }}
            >
              <Utensils className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-brand)" }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                OpenTable
              </span>
              <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                Reserve a table tonight
              </span>
            </span>
            <ExternalLink
              aria-hidden
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-ink-3)" }}
            />
          </a>
        </li>
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
