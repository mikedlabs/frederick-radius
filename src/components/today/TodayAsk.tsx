"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPin, Search, Route, Building2 } from "lucide-react";
import { requestFind } from "@/lib/findBridge";
import { haptic } from "@/lib/haptics";
import BrowsePlacesDisclosure from "./BrowsePlacesDisclosure";
import { useSyncExternalStore, type ReactNode } from "react";
import { getScope, scopeToParam, subscribeScopeChange } from "@/lib/scope";
import styles from "./TodayAsk.module.css";

const subscribeReady = () => () => {};

/**
 * Today has one doorway for a named place, a category, or a full question.
 * The global Find surface decides whether the request belongs in deterministic
 * search or the reasoning workspace. People never have to choose the tool.
 *
 * The full category index and practical shortcuts can be composed separately
 * without creating a second request doorway.
 */
export default function TodayAsk({
  children,
  embedded = false,
  showQuickNeeds = true,
  density = "standard",
}: {
  children?: ReactNode;
  embedded?: boolean;
  showQuickNeeds?: boolean;
  density?: "standard" | "arrival";
}) {
  const findInteractionReady = useSyncExternalStore(subscribeReady, () => true, () => false);
  return (
    <section
      id="find-radius"
      aria-labelledby="today-find-heading"
      data-surface-row={embedded ? "find" : undefined}
      data-find-density={density}
      className={`${styles.find} ${embedded ? "" : styles.standalone} ${density === "arrival" ? styles.arrival : ""}`}
    >
      <h2 id="today-find-heading" className="sr-only">
        Find what you need
      </h2>

      <Link
        href="/search"
        prefetch={false}
        data-find-interaction-ready={findInteractionReady ? "true" : "false"}
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
          <Search width={24} height={24} strokeWidth={1.8} />
        </span>
        <span className={styles.promptWrap}>
          <span className={styles.prompt} data-find-prompt>
            <span className={styles.promptFull}>Find what you need</span>
            <span className={styles.promptShort}>Search</span>
          </span>
          {density === "standard" && <span className={styles.hint}>
            Search a name, a need, or a question.
          </span>}
        </span>
        <ArrowRight
          className={styles.launcherArrow}
          width={16}
          height={16}
          strokeWidth={2.25}
          aria-hidden
        />
      </Link>

      {showQuickNeeds ? <TodayQuickNeeds>{children}</TodayQuickNeeds> : null}
    </section>
  );
}

/** The same utility doors can lead discovery without repeating below it. */
export function TodayQuickNeeds({
  children,
  showShortcuts = true,
}: {
  children?: ReactNode;
  showShortcuts?: boolean;
}) {
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, () => null);
  const planHref = `/ask?q=${encodeURIComponent("Plan the next two hours")}${scope ? `&in=${scopeToParam(scope)}` : ""}`;
  return (
    <div data-today-quick-needs className={styles.find}>
      {showShortcuts ? <div
        className={styles.shortcuts}
        role="group"
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
          <span>Plan a few hours</span>
        </Link>
        <Link href="/contacts" prefetch={false} className={styles.shortcut}>
          <Building2 strokeWidth={1.8} aria-hidden />
          <span>Local services</span>
        </Link>
      </div> : null}

      {children ? (
        <BrowsePlacesDisclosure embedded>{children}</BrowsePlacesDisclosure>
      ) : null}
    </div>
  );
}
