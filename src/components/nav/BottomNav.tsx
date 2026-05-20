"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disc, Sun, Map, Calendar, Route, Bookmark } from "lucide-react";

// Primary destinations. Per the 2026-05-17 owner decision the app
// opens on Today (the daily landing — "/" redirects there); Radius is
// its own destination at /radius. Search stays a top-bar action.
const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/radius", label: "Radius", icon: Disc },
  { href: "/map", label: "Map", icon: Map },
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/plan", label: "Plan", icon: Route },
  { href: "/saved", label: "Saved", icon: Bookmark },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--app-border)] bg-[var(--app-bg-elevated)]/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-screen-md grid-cols-6">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                className="group relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 text-[10px] font-semibold tracking-tight transition-transform active:scale-[0.92]"
                style={{
                  color: active ? "var(--app-brand)" : "var(--app-ink-3)",
                  transitionTimingFunction: "var(--app-ease-spring)",
                  transitionDuration: "var(--app-dur-fast)",
                }}
                aria-current={active ? "page" : undefined}
              >
                {/* Icon pill — active gets a brand-tinted background with
                    the new tactile-glow-brand layered shadow + lip, so the
                    selected tab visibly lifts and catches light. Inactive
                    stays flat ink-3 and lifts on hover (desktop only). */}
                <span
                  className={`grid h-9 w-[52px] place-items-center rounded-full transition-all duration-200 ${
                    active ? "tactile tactile-lift tactile-glow-brand" : ""
                  }`}
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--app-brand) 18%, var(--app-bg-elevated))"
                      : "transparent",
                    transitionTimingFunction: "var(--app-ease-spring)",
                  }}
                  aria-hidden
                >
                  <Icon
                    className={`transition-transform duration-200 ${
                      active ? "h-[20px] w-[20px]" : "h-[19px] w-[19px] group-hover:-translate-y-[1px]"
                    }`}
                    strokeWidth={active ? 2.5 : 2}
                  />
                </span>
                <span
                  className="transition-opacity"
                  style={{ opacity: active ? 1 : 0.85 }}
                >
                  {label}
                </span>
                {/* Active indicator dot — small brand chip beneath the
                    label so the selected route reads clearly even when
                    glancing at the nav peripherally. */}
                <span
                  aria-hidden
                  className="absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full transition-opacity"
                  style={{
                    background: "var(--app-brand)",
                    opacity: active ? 1 : 0,
                  }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
