"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disc, Calendar, Route } from "lucide-react";

// Phase 2: collapsed from five tabs to three. Radius is the home route,
// Map and Today folded into it, and Saved moved to a TopBar corner icon
// (it is not a primary destination). This stops the navigation from
// splintering the one ownable idea.
const TABS = [
  { href: "/", label: "Radius", icon: Disc },
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/plan", label: "Plan", icon: Route },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--app-border)] bg-[var(--app-bg-elevated)]/85 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-screen-md grid-cols-3">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium tracking-tight transition-colors"
                aria-current={active ? "page" : undefined}
                style={{ color: active ? "var(--app-brand)" : "var(--app-ink-3)" }}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
