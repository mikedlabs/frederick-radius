"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { shouldPrefetchGlobalNavigation } from "@/lib/fair/route-policy";
import { cancelPrimaryTabResume, preparePrimaryTabResume, rememberPrimaryTab } from "@/lib/primary-tab-session";
import { isPlainPrimaryNavigation } from "./BottomNav";
import { TABS, tabIndexForPath } from "./tabs";
import styles from "./NavChrome.module.css";

/** Desktop counterpart to the mobile field-guide index strip. */
export default function SideRail() {
  const pathname = usePathname();
  const router = useRouter();
  const realIdx = tabIndexForPath(pathname);
  const allowPrefetch = shouldPrefetchGlobalNavigation(pathname);
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
        className={`${styles.rail} pointer-events-auto relative overflow-hidden rounded-[var(--app-radius-lg)]`}
      >
        <ul className="flex flex-col items-stretch gap-1 px-1 py-1">
          {TABS.map(({ href, label, icon: Icon, prefetch, fillOnActive }, idx) => {
            const isAtDestination = pathname === href || pathname.startsWith(`${href}/`);
            const isRealActive = realIdx === idx;
            const active = isRealActive || pendingIdx === idx;

            return (
              <li key={href} className="flex">
                <Link
                  href={href}
                  prefetch={allowPrefetch && pathname !== href ? prefetch : false}
                  onPointerDown={event => {
                    if (!isAtDestination && isPlainPrimaryNavigation(event.nativeEvent)) setPendingIdx(idx);
                  }}
                  onClick={(event) => {
                    if (event.defaultPrevented || !isPlainPrimaryNavigation(event.nativeEvent)) { setPendingIdx(null); return; }
                    rememberPrimaryTab(`${window.location.pathname}${window.location.search}${window.location.hash}`, window.scrollY);
                    if (pathname === href) {
                      event.preventDefault(); cancelPrimaryTabResume(); setPendingIdx(null); return;
                    }
                    const resume = preparePrimaryTabResume(href);
                    const destination = resume?.href ?? href;
                    const navigate = () => resume ? router.push(destination, { scroll: false }) : router.push(destination);
                    setPendingIdx(idx);
                    haptic("light");
                    if (typeof document !== "undefined" && "startViewTransition" in document) {
                      event.preventDefault();
                      const doc = document as Document & {
                        startViewTransition?: (callback: () => void) => unknown;
                      };
                      doc.startViewTransition?.(navigate);
                    } else if (resume) {
                      event.preventDefault(); navigate();
                    }
                  }}
                  aria-current={isAtDestination ? "page" : undefined}
                  className={`${styles.destination} relative flex h-14 w-14 flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-sm)] text-center transition`}
                  data-selected={active ? "true" : "false"}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-[2px]"
                    style={{ background: active ? "var(--app-on-brand)" : "transparent", opacity: 0.5 }}
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
