"use client";

import { useState, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Search,
  UtensilsCrossed,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export type NativeMenuPrice =
  | {
      kind: "amount";
      /** Integer minor units. For USD, 1295 renders as $12.95. */
      amountCents: number;
      currency?: string;
    }
  | {
      kind: "text";
      /** Exact restaurant wording, such as "Market price". */
      label: string;
    };

export type NativeMenuDietaryLabel = {
  label: string;
  /** Labels must come from the restaurant or its official menu, never inference. */
  source: "restaurant" | "official_menu";
};

export type NativeMenuAvailability = {
  status: "available" | "sold_out" | "unavailable";
  /** Required evidence time. The UI never turns a menu listing into availability. */
  checkedAt: string;
  /** Human-readable official source, such as "Toast" or "The restaurant". */
  sourceLabel: string;
};

export type NativeMenuItem = {
  id: string;
  name: string;
  description?: string;
  price?: NativeMenuPrice;
  dietaryLabels?: readonly NativeMenuDietaryLabel[];
  availability?: NativeMenuAvailability;
};

export type NativeMenuSection = {
  id: string;
  name: string;
  items: readonly NativeMenuItem[];
};

export type NativeMenuSource = {
  kind: "owner" | "pos" | "official_menu";
  /** Human-readable source, such as "Toast" or "the restaurant website". */
  label: string;
  url?: string;
  checkedAt?: string;
};

export type NativeMenuLink = {
  label: string;
  url: string;
  checkedAt?: string;
};

/**
 * Plain serializable props. A Server Component can pass the result of a menu
 * loader directly without callbacks, Date objects, or client-side fetching.
 */
export type NativeMenuProps = {
  title?: string;
  sections?: readonly NativeMenuSection[];
  source?: NativeMenuSource | null;
  officialMenuLinks?: readonly NativeMenuLink[];
  /** A server-provided deep-link query. `?menu=` is also read after hydration. */
  initialQuery?: string;
};

const EMPTY_SECTIONS: readonly NativeMenuSection[] = [];
const EMPTY_MENU_LINKS: readonly NativeMenuLink[] = [];

const subscribeToLocation = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};

const getMenuQueryFromLocation = () =>
  new URLSearchParams(window.location.search).get("menu")?.trim() ?? "";

const getServerMenuQuery = () => "";

export function normalizeMenuText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemSearchText(item: NativeMenuItem, sectionName: string): string {
  return normalizeMenuText(
    [
      sectionName,
      item.name,
      item.description,
      ...(item.dietaryLabels ?? []).map((label) => label.label),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function filterNativeMenuSections(
  sections: readonly NativeMenuSection[],
  query: string,
  activeSectionId = "all",
): NativeMenuSection[] {
  const needle = normalizeMenuText(query);
  const filtered: NativeMenuSection[] = [];

  for (const section of sections) {
    if (activeSectionId !== "all" && section.id !== activeSectionId) continue;
    const items = needle
      ? section.items.filter((item) =>
          itemSearchText(item, section.name).includes(needle),
        )
      : [...section.items];
    if (items.length > 0) filtered.push({ ...section, items });
  }

  return filtered;
}

function formatMenuTimestamp(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const includesTime = /T\d{2}:\d{2}/.test(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includesTime
      ? { hour: "numeric", minute: "2-digit" }
      : {}),
    timeZone: dateOnly ? "UTC" : "America/New_York",
  }).format(date);
}

function formatPrice(price: NativeMenuPrice | undefined): string | null {
  if (!price) return null;
  if (price.kind === "text") return price.label.trim() || null;
  if (!Number.isInteger(price.amountCents) || price.amountCents < 0) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency || "USD",
      minimumFractionDigits: price.amountCents % 100 === 0 ? 0 : 2,
    }).format(price.amountCents / 100);
  } catch {
    return `$${(price.amountCents / 100).toFixed(2)}`;
  }
}

function sourceLine(source: NativeMenuSource): string {
  const prefix =
    source.kind === "owner"
      ? `Menu supplied by ${source.label}`
      : source.kind === "pos"
        ? `Menu synced from ${source.label}`
        : `Menu from ${source.label}`;
  const checked = formatMenuTimestamp(source.checkedAt);
  return checked ? `${prefix} · Updated ${checked}` : prefix;
}

function availabilityMeta(availability: NativeMenuAvailability): {
  label: string;
  color: string;
  Icon: typeof CheckCircle2;
  title: string;
} {
  const checked = formatMenuTimestamp(availability.checkedAt);
  const at = checked ? ` at ${checked}` : "";
  if (availability.status === "available") {
    return {
      label: "Available at last update",
      color: "var(--app-positive)",
      Icon: CheckCircle2,
      title: `${availability.sourceLabel} reported this item available${at}.`,
    };
  }
  return {
    label:
      availability.status === "sold_out"
        ? "Sold out at last update"
        : "Unavailable at last update",
    color: "var(--app-danger)",
    Icon: XCircle,
    title: `${availability.sourceLabel} reported this item ${
      availability.status === "sold_out" ? "sold out" : "unavailable"
    }${at}.`,
  };
}

function safeDomId(value: string): string {
  return (
    normalizeMenuText(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

function MenuSourceLine({ source }: { source: NativeMenuSource }) {
  const content = (
    <>
      {sourceLine(source)}
      {source.url ? (
        <ExternalLink className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
      ) : null}
    </>
  );

  return source.url ? (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 text-[11px] font-medium underline decoration-transparent underline-offset-2 transition hover:decoration-current"
      style={{ color: "var(--app-ink-3)" }}
      aria-label={`${sourceLine(source)}. Open menu source.`}
    >
      {content}
    </a>
  ) : (
    <p className="text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
      {content}
    </p>
  );
}

function OfficialMenuLinks({
  links,
  compact = false,
}: {
  links: readonly NativeMenuLink[];
  compact?: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <div className={compact ? "flex flex-wrap gap-1.5" : "mt-3 flex flex-wrap gap-2"}>
      {links.map((link, index) => (
        <Button
          key={`${link.url}-${index}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          variant={index === 0 && !compact ? "primary" : "secondary"}
          size="sm"
          className="rounded-full"
          iconRight={<ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />}
        >
          {link.label || "Official menu"}
        </Button>
      ))}
    </div>
  );
}

function NativeMenuFallback({
  title,
  links,
}: {
  title: string;
  links: readonly NativeMenuLink[];
}) {
  if (links.length === 0) return null;
  const newestCheck = links.find((link) => formatMenuTimestamp(link.checkedAt));

  return (
    <section
      id="menu"
      aria-labelledby="native-menu-heading"
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="p-4">
        <div className="flex items-center gap-2">
          <UtensilsCrossed
            className="h-4 w-4"
            strokeWidth={2}
            aria-hidden
            style={{ color: "var(--app-brand)" }}
          />
          <h2
            id="native-menu-heading"
            className="font-display text-xl leading-none"
            style={{ color: "var(--app-ink)" }}
          >
            {title}
          </h2>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          This menu is not available inside Radius. Check the restaurant&apos;s
          official menu for its posted items and prices.
        </p>
        <OfficialMenuLinks links={links} />
        {newestCheck ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            Link checked {formatMenuTimestamp(newestCheck.checkedAt)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function NativeMenu({
  title = "Menu",
  sections = EMPTY_SECTIONS,
  source = null,
  officialMenuLinks = EMPTY_MENU_LINKS,
  initialQuery,
}: NativeMenuProps) {
  const menuSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.id.trim() && item.name.trim(),
      ),
    }))
    .filter(
      (section) =>
        section.id.trim() && section.name.trim() && section.items.length > 0,
    );

  const urlQuery = useSyncExternalStore(
    subscribeToLocation,
    getMenuQueryFromLocation,
    getServerMenuQuery,
  );
  const [typedQuery, setTypedQuery] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState("all");
  const [openSectionIds, setOpenSectionIds] = useState<ReadonlySet<string>>(
    () => new Set(menuSections[0] ? [menuSections[0].id] : []),
  );
  const query = typedQuery ?? initialQuery?.trim() ?? urlQuery;
  const normalizedQuery = normalizeMenuText(query);
  const searching = normalizedQuery.length > 0;

  const visibleSections = filterNativeMenuSections(
    menuSections,
    query,
    activeSectionId,
  );
  const visibleItemCount = visibleSections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const totalItemCount = menuSections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );

  if (totalItemCount === 0) {
    return <NativeMenuFallback title={title} links={officialMenuLinks} />;
  }
  if (!source) {
    return <NativeMenuFallback title={title} links={officialMenuLinks} />;
  }

  const chooseSection = (sectionId: string) => {
    setTypedQuery("");
    setActiveSectionId(sectionId);
    if (sectionId !== "all") {
      setOpenSectionIds((current) => new Set([...current, sectionId]));
    }
  };

  const changeQuery = (value: string) => {
    setTypedQuery(value);
    setActiveSectionId("all");
  };

  const toggleSection = (sectionId: string) => {
    setOpenSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <section
      id="menu"
      aria-labelledby="native-menu-heading"
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <header className="p-4 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UtensilsCrossed
                className="h-4 w-4 shrink-0"
                strokeWidth={2}
                aria-hidden
                style={{ color: "var(--app-brand)" }}
              />
              <h2
                id="native-menu-heading"
                className="font-display text-xl leading-none"
                style={{ color: "var(--app-ink)" }}
              >
                {title}
              </h2>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              {totalItemCount} {totalItemCount === 1 ? "item" : "items"} across{" "}
              {menuSections.length} {menuSections.length === 1 ? "section" : "sections"}
            </p>
          </div>
          <OfficialMenuLinks links={officialMenuLinks} compact />
        </div>

        <form
          role="search"
          className="relative mt-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="native-menu-search" className="sr-only">
            Search this menu
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            strokeWidth={2}
            aria-hidden
            style={{ color: "var(--app-ink-3)" }}
          />
          <input
            id="native-menu-search"
            name="menu"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(event) => changeQuery(event.currentTarget.value)}
            placeholder="Search items or dietary labels"
            className="h-11 w-full rounded-full border bg-[var(--app-bg)] pl-9 pr-10 text-[14px] outline-none transition placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand)] focus:ring-2 focus:ring-[color:var(--app-brand)]/20"
            style={{ borderColor: "var(--app-border-strong)", color: "var(--app-ink)" }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => changeQuery("")}
              className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
              aria-label="Clear menu search"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </form>

        {menuSections.length > 1 ? (
          <nav
            aria-label="Menu sections"
            className="-mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {[
              { id: "all", name: "All" },
              ...menuSections.map(({ id, name }) => ({ id, name })),
            ].map((section) => {
              const active =
                activeSectionId === section.id &&
                (!searching || section.id === "all");
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseSection(section.id)}
                  className="min-h-11 shrink-0 rounded-full border px-3 text-[12px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
                  style={{
                    borderColor: active ? "var(--app-brand)" : "var(--app-border)",
                    background: active
                      ? "color-mix(in srgb, var(--app-brand) 10%, var(--app-bg-elevated))"
                      : "var(--app-bg-elevated)",
                    color: active ? "var(--app-brand-press)" : "var(--app-ink-2)",
                  }}
                >
                  {section.name}
                </button>
              );
            })}
          </nav>
        ) : null}

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {searching
            ? `${visibleItemCount} menu ${
                visibleItemCount === 1 ? "item matches" : "items match"
              } your search.`
            : `${visibleItemCount} menu ${
                visibleItemCount === 1 ? "item is" : "items are"
              } shown.`}
        </p>
      </header>

      <div id="native-menu-sections" className="border-t" style={{ borderColor: "var(--app-border)" }}>
        {visibleSections.length > 0 ? (
          visibleSections.map((section) => {
            const sectionDomId = `native-menu-section-${safeDomId(section.id)}`;
            const isOpen = searching || openSectionIds.has(section.id);
            return (
              <section
                key={section.id}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
              >
                {searching ? (
                  <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
                    <h3 className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                      {section.name}
                    </h3>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      {section.items.length}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={sectionDomId}
                    onClick={() => toggleSection(section.id)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand)]"
                  >
                    <h3 className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                      {section.name}
                    </h3>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                        {section.items.length}
                      </span>
                      <ChevronDown
                        className="h-4 w-4 transition-transform"
                        strokeWidth={2}
                        aria-hidden
                        style={{
                          color: "var(--app-ink-3)",
                          transform: isOpen ? "rotate(180deg)" : "none",
                        }}
                      />
                    </span>
                  </button>
                )}

                <div id={sectionDomId} hidden={!isOpen}>
                  {isOpen ? (
                    <ul
                      aria-label={`${section.name} menu items`}
                      className="divide-y px-4 pb-1"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                    {section.items.map((item) => {
                      const price = formatPrice(item.price);
                      const availability = item.availability
                        ? availabilityMeta(item.availability)
                        : null;
                      const isQueryMatch =
                        searching &&
                        normalizeMenuText(item.name).includes(normalizedQuery);
                      return (
                        <li
                          key={item.id}
                          id={`menu-item-${safeDomId(item.id)}`}
                          data-menu-match={isQueryMatch ? "true" : undefined}
                          className="relative py-3 first:pt-2.5"
                          style={
                            isQueryMatch
                              ? {
                                  background:
                                    "linear-gradient(90deg, color-mix(in srgb, var(--app-brand) 8%, transparent), transparent 70%)",
                                }
                              : undefined
                          }
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <h4
                              className="min-w-0 text-[14px] font-semibold leading-snug"
                              style={{ color: "var(--app-ink)" }}
                            >
                              {item.name}
                            </h4>
                            {price ? (
                              <span
                                className="shrink-0 text-[13px] font-semibold tabular-nums"
                                style={{ color: "var(--app-ink)" }}
                                aria-label={`Price ${price}`}
                              >
                                {price}
                              </span>
                            ) : null}
                          </div>
                          {item.description ? (
                            <p
                              className="mt-1 max-w-prose text-[12px] leading-relaxed"
                              style={{ color: "var(--app-ink-2)" }}
                            >
                              {item.description}
                            </p>
                          ) : null}
                          {item.dietaryLabels?.length || availability ? (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {item.dietaryLabels?.map((dietary, index) => (
                                <span
                                  key={`${dietary.label}-${index}`}
                                  className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                                  style={{
                                    borderColor: "var(--app-border)",
                                    background: "var(--app-bg-sunken)",
                                    color: "var(--app-ink-2)",
                                  }}
                                  title={
                                    dietary.source === "restaurant"
                                      ? "Label supplied by the restaurant."
                                      : "Label printed on the official menu."
                                  }
                                  aria-label={`${dietary.label}. ${
                                    dietary.source === "restaurant"
                                      ? "Label supplied by the restaurant."
                                      : "Label printed on the official menu."
                                  }`}
                                >
                                  {dietary.label}
                                </span>
                              ))}
                              {availability ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[10.5px] font-semibold"
                                  style={{ color: availability.color }}
                                  title={availability.title}
                                  aria-label={availability.title}
                                >
                                  <availability.Icon
                                    className="h-3 w-3"
                                    strokeWidth={2.25}
                                    aria-hidden
                                  />
                                  {availability.label}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                    </ul>
                  ) : null}
                </div>
              </section>
            );
          })
        ) : (
          <div className="px-4 py-7 text-center">
            <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              No menu items match “{query.trim()}”.
            </p>
            <button
              type="button"
              onClick={() => changeQuery("")}
              className="mt-1 min-h-11 text-[12px] font-semibold underline underline-offset-2"
              style={{ color: "var(--app-brand-press)" }}
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      <footer
        className="space-y-1.5 border-t bg-[var(--app-bg-sunken)] px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <MenuSourceLine source={source} />
        <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          A menu listing does not confirm current availability. Availability
          appears only when the restaurant or its ordering system sends a status.
        </p>
        <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          Dietary labels reflect the restaurant&apos;s own wording. Ask the
          restaurant about allergens and shared preparation areas.
        </p>
      </footer>
    </section>
  );
}
