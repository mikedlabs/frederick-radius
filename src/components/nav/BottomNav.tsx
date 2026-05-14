"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Map, Calendar, Disc, Bookmark } from "lucide-react";

const TABS = [
  { href: "/app/today", label: "Today", icon: Sun },
  { href: "/app/map", label: "Map", icon: Map },
  { href: "/app/events", label: "Events", icon: Calendar },
  { href: "/app/radius", label: "Radius", icon: Disc },
  { href: "/app/saved", label: "Saved", icon: Bookmark },
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
          const active = pathname === href || pathname.startsWith(href + "/");
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
