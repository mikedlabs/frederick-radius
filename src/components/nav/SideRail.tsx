"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { TABS, tabIndexForPath } from "./tabs";

/** Desktop counterpart to the mobile field-guide index strip. */
export default function SideRail() {
  const pathname = usePathname();
  const router = useRouter();
  const realIdx = tabIndexForPath(pathname);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pathname completion clears the optimistic destination
    setPendingIdx(null);
  }, [pathname]);

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 top-0 hidden py-4 pl-3 lg:flex lg:items-center"
      style={{ zIndex: "var(--z-nav)" }}
    >
      <nav
        aria-label="Primary"
        className="pointer-events-auto relative overflow-hidden rounded-[var(--app-radius-lg)]"
        style={{
          background: "var(--app-bg-elevated-solid)",
          border: "1px solid var(--app-border-strong)",
          boxShadow: "var(--app-elev-2)",
        }}
      >
        <ul className="flex flex-col items-stretch gap-1 px-1 py-1">
          {TABS.map(({ href, label, icon: Icon, fillOnActive }, idx) => {
            const isAtDestination = pathname === href || pathname.startsWith(`${href}/`);
            const isRealActive = realIdx === idx;
            const active = isRealActive || pendingIdx === idx;

            return (
              <li key={href} className="flex">
                <Link
                  href={href}
                  prefetch={false}
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  onPointerDown={() => {
                    if (!isAtDestination) setPendingIdx(idx);
                  }}
                  onClick={(event) => {
                    if (isAtDestination) return;
                    setPendingIdx(idx);
                    haptic("light");
                    if (typeof document !== "undefined" && "startViewTransition" in document) {
                      event.preventDefault();
                      const doc = document as Document & {
                        startViewTransition?: (callback: () => void) => unknown;
                      };
                      doc.startViewTransition?.(() => router.push(href));
                    }
                  }}
                  aria-current={isRealActive ? "page" : undefined}
                  className="relative flex h-14 w-14 flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-sm)] text-center transition active:scale-[0.97]"
                  style={{
                    color: active ? "var(--app-brand-press)" : "var(--app-ink-3)",
                    background: active ? "var(--app-brand-tint-6)" : "transparent",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-[2px]"
                    style={{ background: active ? "var(--app-brand)" : "transparent" }}
                  />
                  <Icon
                    width={20}
                    height={20}
                    strokeWidth={active ? 2.25 : 2}
                    fill={active && fillOnActive ? "currentColor" : "none"}
                    aria-hidden
                  />
                  <span className="text-[10px] font-medium leading-tight tracking-tight">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
