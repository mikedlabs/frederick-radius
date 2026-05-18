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
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--app-border)] bg-[var(--app-bg-elevated)]/85 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-screen-md grid-cols-6">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium tracking-tight transition-transform active:scale-[0.94]"
                aria-current={active ? "page" : undefined}
                style={{ color: active ? "var(--app-brand)" : "var(--app-ink-3)" }}
              >
                <span
                  className="grid h-7 w-12 place-items-center rounded-full transition-colors"
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--app-brand) 14%, transparent)"
                      : "transparent",
                  }}
                  aria-hidden
                >
                  <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.25 : 2} />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
