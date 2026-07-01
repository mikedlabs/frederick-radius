import Link from "next/link";

/**
 * Sitewide minimal footer (June-9 deep audit P2: "decide the rule").
 *
 * Before this, footers were inconsistent — place pages had a smart
 * contextual one, /about had socials, and /guide, /today, and town pages
 * had none. This is the ONE quiet baseline every app page now carries:
 * five wayfinding links + a correction door, which also gives the
 * crawler a consistent internal-link mesh across all ~1,700 URLs.
 * Page-specific footers (the place page's category + correction block)
 * render above it and stay.
 *
 * Server component, zero client JS. Deliberately whisper-quiet: hairline
 * top border, text-xs, ink-3 — the page's content keeps the stage.
 */
// STRUCTURAL wayfinding only (about / trust / browse). The moat content
// surfaces (Happy hour, Brunch, Briefing/deals) deliberately do NOT live here —
// they read as out-of-place next to "About / Towns / All places" in a sitewide
// footer, and each is already a primary tile or link on /today, so they keep
// their internal links from the home page.
const LINKS: Array<{ href: string; label: string }> = [
  { href: "/about", label: "About" },
  { href: "/trust", label: "Trust & sources" },
  { href: "/towns", label: "Towns" },
  { href: "/places", label: "All places" },
  { href: "/events", label: "Events" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function AppFooter() {
  return (
    <footer
      className="mt-12 border-t pt-5 pb-2"
      style={{ borderColor: "var(--app-border)" }}
    >
      <nav aria-label="Site">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: "var(--app-ink-3)" }}>
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-block py-2 -my-2 hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href="mailto:hello@frederickradius.app?subject=Frederick%20Radius%20correction"
              className="inline-block py-2 -my-2 hover:underline"
            >
              Suggest a correction
            </a>
          </li>
        </ul>
      </nav>
      <p className="mt-3 text-meta" style={{ color: "var(--app-ink-3)" }}>
        Frederick Radius: one guide for Frederick City and the towns around it.
      </p>
      {/* Independence + reliance disclaimer (civic-facing app): keeps the
          product honest and prevents anyone mistaking it for an official
          government service or relying on it for emergencies. */}
      <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        An independent local guide. Not affiliated with, endorsed by, or operated
        by the City of Frederick, Frederick County Government, or any
        municipality. Information may be out of date; never rely on it for
        emergencies or public-safety decisions.
      </p>
    </footer>
  );
}
