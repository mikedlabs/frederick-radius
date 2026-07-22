"use client";

import { useMemo, useState } from "react";
import { Search, X, Navigation, Building2, Package, Mailbox, PackageOpen, Clock, type LucideIcon } from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { ShipPoint, ShipKind } from "@/lib/loaders/shipping";

/**
 * ShippingGuide — the county's mail-and-ship map as a find-first list, not a
 * scroll. You arrive knowing the job ("mail this," "drop a UPS return," "which
 * blue box gets picked up latest") so the tools match the job: a search over
 * name/town/carrier, a kind segment (Post offices / Ship & pack / Mailboxes),
 * and dense rows that each open directions in one tap.
 *
 * Pure client filter over the points the server handed down; no network on a
 * keystroke. Source is OpenStreetMap, credited in the page footer.
 */

const muniName = (slug: string) => MUNICIPALITY_BY_SLUG[slug]?.name?.replace(/^Downtown\s+/, "") ?? "Around the county";

// Icon + accent per kind. Colors are app tokens so the guide stays on-brand
// while still giving each kind a distinct, learnable tint.
const KIND_META: Record<ShipKind, { icon: LucideIcon; ink: string }> = {
  usps: { icon: Building2, ink: "var(--app-cool)" },
  ship_store: { icon: Package, ink: "var(--app-brand)" },
  parcel_locker: { icon: PackageOpen, ink: "var(--app-accent-press)" },
  mailbox: { icon: Mailbox, ink: "var(--app-cool)" },
};

const CARRIER_LABEL: Record<string, string> = {
  usps: "USPS", ups: "UPS", fedex: "FedEx", dhl: "DHL", amazon: "Amazon", other: "Independent",
};

function directionsHref(p: ShipPoint): string {
  const q = p.address ? `${p.name}, ${p.address}, Frederick County MD` : `${p.lat},${p.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

function matches(p: ShipPoint, q: string): boolean {
  return (
    p.name.toLowerCase().includes(q) ||
    (p.address ?? "").toLowerCase().includes(q) ||
    (CARRIER_LABEL[p.carrier] ?? "").toLowerCase().includes(q) ||
    muniName(p.municipality).toLowerCase().includes(q)
  );
}

export default function ShippingGuide({
  groups,
}: {
  groups: { kind: ShipKind; label: string; blurb: string; list: ShipPoint[] }[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ShipKind | null>(null);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const all = useMemo(() => groups.flatMap((g) => g.list), [groups]);

  // What renders: search wins (across everything), else the active kind, else
  // every kind in display order. Each visible group keeps its label + blurb.
  const shown = useMemo(() => {
    if (searching) {
      const hits = all.filter((p) => matches(p, q));
      return groups
        .map((g) => ({ ...g, list: hits.filter((p) => p.kind === g.kind) }))
        .filter((g) => g.list.length > 0);
    }
    if (kind) return groups.filter((g) => g.kind === kind);
    return groups;
  }, [groups, all, q, kind, searching]);

  const totalShown = shown.reduce((n, g) => n + g.list.length, 0);

  return (
    <section className="space-y-3">
      {/* Search — name, town, or carrier. */}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search post offices, ship stores, and mailboxes by name, town, or carrier"
          placeholder="Search: a town, “UPS”, “FedEx”…"
          className="w-full rounded-[var(--app-radius-md)] border py-2.5 pl-10 pr-10 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "var(--app-hi)" }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="tap-44 absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>

      {/* Kind segment — the job-based filter. Hidden while searching. */}
      {!searching && (
        <div className="-mx-4 px-4">
          <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <li className="shrink-0">
              <button
                type="button"
                onClick={() => setKind(null)}
                aria-pressed={kind === null}
                className="tap-44-y rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
                style={
                  kind === null
                    ? { borderColor: "var(--app-ink)", background: "var(--app-ink)", color: "var(--app-bg-elevated-solid)" }
                    : { borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }
                }
              >
                All <span className="font-mono text-[10.5px] opacity-70">{all.length}</span>
              </button>
            </li>
            {groups.map((g) => {
              const { ink } = KIND_META[g.kind];
              const on = kind === g.kind;
              return (
                <li key={g.kind} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setKind(on ? null : g.kind)}
                    aria-pressed={on}
                    className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
                    style={
                      on
                        ? { borderColor: ink, background: ink, color: "var(--app-on-brand, #fff)" }
                        : { borderColor: `color-mix(in srgb, ${ink} 32%, var(--app-border))`, background: "var(--app-bg-elevated)", color: "var(--app-ink)" }
                    }
                  >
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "var(--app-on-brand, #fff)" : ink }} />
                    {g.label}
                    <span className="font-mono text-[10.5px] opacity-70">{g.list.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {searching && (
        <p className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          {totalShown === 0 ? "Nothing matched" : `${totalShown} ${totalShown === 1 ? "spot" : "spots"} for “${query.trim()}”`}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>
          No location matches. Try a town name or a carrier like “UPS.”
        </p>
      ) : (
        <div className="space-y-5">
          {shown.map((g) => (
            <div key={g.kind} className="space-y-1.5">
              {/* Section header only when more than one kind is on screen. */}
              {shown.length > 1 && (
                <div className="flex items-baseline justify-between px-0.5">
                  <h2 className="font-serif text-[17px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {g.label}
                  </h2>
                  <span className="font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
                    {g.list.length}
                  </span>
                </div>
              )}
              <ul className="overflow-hidden rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
                {g.list.map((p, i) => (
                  <ShipRow key={p.id} p={p} first={i === 0} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** One shipping point as a dense row: a kind-tinted carrier badge, the name,
 *  a carrier · town · address meta line, optional hours, and a one-tap
 *  Directions affordance (the row itself opens maps). */
function ShipRow({ p, first }: { p: ShipPoint; first: boolean }) {
  const { icon: Icon, ink } = KIND_META[p.kind];
  const carrier = CARRIER_LABEL[p.carrier] ?? "";
  const meta = [carrier, muniName(p.municipality), p.address].filter(Boolean).join(" · ");
  return (
    <li style={first ? undefined : { borderTop: "1px solid color-mix(in srgb, var(--app-ink) 7%, transparent)" }}>
      <a
        href={directionsHref(p)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Get directions to ${p.name}${p.address ? ` at ${p.address}` : ` in ${muniName(p.municipality)}`}`}
        className="tactile-interactive flex min-h-[56px] items-center gap-3 px-3 py-2.5"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background: `color-mix(in srgb, ${ink} 13%, var(--app-bg-elevated))`,
            color: `color-mix(in srgb, ${ink} 82%, var(--app-ink))`,
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent)",
          }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
            {p.name}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            {meta}
          </span>
          {p.hours && (
            <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
              <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
              {p.hours}
            </span>
          )}
        </span>
        <Navigation aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: `color-mix(in srgb, ${ink} 72%, var(--app-ink))` }} />
      </a>
    </li>
  );
}
