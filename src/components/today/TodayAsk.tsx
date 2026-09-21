"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPin, Search, Route, Building2 } from "lucide-react";
import { requestFind } from "@/lib/findBridge";
import { haptic } from "@/lib/haptics";
import BrowsePlacesDisclosure from "./BrowsePlacesDisclosure";
import { useSyncExternalStore, type ReactNode } from "react";
import { getScope, scopeToParam, subscribeScopeChange } from "@/lib/scope";
import styles from "./TodayAsk.module.css";

/**
 * Today has one doorway for a named place, a category, or a full question.
 * The global Find surface decides whether the request belongs in deterministic
 * search or the reasoning workspace. People never have to choose the tool.
 *
 * Two urgent shortcuts stay visible. The full category index is available in
 * the attached disclosure, but it no longer occupies the page by default.
 */
export default function TodayAsk({
  children,
  embedded = false,
}: {
  children?: ReactNode;
  embedded?: boolean;
}) {
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, () => null);
  const planHref = `/ask?q=${encodeURIComponent("Plan the next two hours")}${scope ? `&in=${scopeToParam(scope)}` : ""}`;
  return (
    <section
      id="find-radius"
      aria-labelledby="today-find-heading"
      data-surface-row={embedded ? "find" : undefined}
      className={`${styles.find} ${embedded ? "" : styles.standalone}`}
    >
      <h2 id="today-find-heading" className="sr-only">
        Find what you need
      </h2>

      <Link
        href="/search"
        prefetch={false}
        onClick={(event) => {
          if (
            event.button !== 0
            || event.altKey
            || event.ctrlKey
            || event.metaKey
            || event.shiftKey
          ) return;
          event.preventDefault();
          haptic("light");
          requestFind("global");
        }}
        aria-label="Find a place, service, event, or answer"
        className={styles.launcher}
      >
        <span
          aria-hidden
          className={styles.searchIcon}
        >
          <Search className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={styles.prompt}>
            What do you need?
          </span>
          <span className={styles.hint}>
            Find a place, an event, or help with your plans.
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
          style={{ color: "var(--app-brand-press)" }}
          aria-hidden
        />
      </Link>

      <div
        className={styles.shortcuts}
        aria-label="Quick needs"
      >
        <Link
          href="/open-now"
          prefetch={false}
          className={styles.shortcut}
        >
          <Clock3 strokeWidth={1.8} aria-hidden />
          <span>
            Open now
          </span>
        </Link>
        <Link
          href="/amenities"
          prefetch={false}
          className={styles.shortcut}
        >
          <MapPin strokeWidth={1.8} aria-hidden />
          <span>
            Public essentials
          </span>
        </Link>
        <Link href={planHref} prefetch={false} className={styles.shortcut}>
          <Route strokeWidth={1.8} aria-hidden />
          Plan a few hours
        </Link>
        <Link href="/contacts" prefetch={false} className={styles.shortcut}>
          <Building2 strokeWidth={1.8} aria-hidden />
          Local services
        </Link>
      </div>

      {children ? (
        <BrowsePlacesDisclosure embedded>{children}</BrowsePlacesDisclosure>
      ) : null}
    </section>
  );
}
