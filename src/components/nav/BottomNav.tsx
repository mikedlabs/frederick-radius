"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Sun, Map, Calendar, Bookmark } from "lucide-react";

// Primary destinations. Five tabs, not six: six was cramped at 390px
// and exposed internal tools (Radius, Plan) as top-level destinations
// while the county's actual depth (towns, categories, guides, civic)
// had no entry at all. Explore is now that front door; Radius stays
// the Today primary action and lives under Explore > Tools with Plan.
// Saved moved out of the top bar so it is not duplicated. Search is a
// top-bar action.
const TABS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/map", label: "Map", icon: Map },
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/saved", label: "Saved", icon: Bookmark },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--app-border)] bg-[var(--app-bg-elevated)]/85 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-screen-md grid-cols-5">
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
