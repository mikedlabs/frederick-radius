import Link from "next/link";
import { ChevronDown } from "lucide-react";

/**
 * Sitewide minimal footer (June-9 deep audit P2: "decide the rule").
 *
 * Before this, footers were inconsistent — place pages had a smart
 * contextual one, /about had socials, and /guide, /today, and town pages
 * had none. This is the ONE quiet baseline every app page now carries:
 * structural site links + a correction door, which also gives the
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
  { href: "/contacts", label: "County services" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function AppFooter() {
  return (
    <footer
      className="mt-12 border-t pt-5 pb-2"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* The full link mesh remains visible on wider screens. On a phone it is
          still present in the document, but tucked behind one native disclosure
          instead of taking several rows at the end of every page. */}
      <div className="hidden sm:block">
        <SiteLinks />
      </div>

      {/* Independence + reliance disclaimer (civic-facing app): keeps the
          product honest and prevents anyone mistaking it for an official
          government service or relying on it for emergencies. */}
      <p className="max-w-[68ch] text-[11px] leading-relaxed sm:mt-3" style={{ color: "var(--app-ink-3)" }}>
        Frederick Radius is an independent local guide. It is not affiliated with
        or endorsed by the City of Frederick, Frederick County Government, or any
        municipality. Information can change; call 911 for emergencies and use
        official sources for public-safety decisions.
      </p>

      <details className="group mt-2 sm:hidden">
        <summary
          className="tap-44 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold [&::-webkit-details-marker]:hidden"
          style={{ color: "var(--app-ink-2)" }}
        >
          About and site links
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
            strokeWidth={2.25}
            aria-hidden
          />
        </summary>
        <SiteLinks mobile />
      </details>
    </footer>
  );
}

function SiteLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav aria-label="Site">
      <ul
        className={
          mobile
            ? "grid grid-cols-2 gap-x-4 border-t text-xs"
            : "flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
        }
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch={false}
              className="tap-44 inline-flex min-h-11 items-center hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
        <li className={mobile ? "col-span-2" : undefined}>
          <a
            href="mailto:hello@frederickradius.app?subject=Frederick%20Radius%20correction"
            className="tap-44 inline-flex min-h-11 items-center hover:underline"
          >
            Suggest a correction
          </a>
        </li>
      </ul>
    </nav>
  );
}
