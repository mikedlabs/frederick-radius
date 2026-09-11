"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMounted } from "@/hooks/useSaved";

/**
 * NonprofitList — the org list with a name search and a folded long tail.
 *
 * The cause chips (server links) narrow to a bucket; a big bucket used to dump
 * every row in one scroll with no way to look up a name. This adds:
 *   - a SEARCH box over the loaded list (name or town), so a big cause is a
 *     name lookup, not a scroll;
 *   - a long-tail COLLAPSE: the first 15 rows show, the rest fold behind one
 *     "show all N" tap (searching reveals every match).
 *
 * Rows arrive display-ready from the server (label + revenue already
 * formatted), so this is a pure client filter — no loader in the bundle.
 */

export type OrgRowData = {
  ein: string;
  name: string;
  sub: string;
  city: string;
  ruling: string | number | null;
  rev: string;
};

const INITIAL_CAP = 15;

export default function NonprofitList({ orgs }: { orgs: readonly OrgRowData[] }) {
  const interactionReady = useMounted();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () => (q ? orgs.filter((o) => o.name.toLowerCase().includes(q) || o.city.toLowerCase().includes(q)) : orgs),
    [orgs, q],
  );
  const shown = q || expanded ? filtered : filtered.slice(0, INITIAL_CAP);
  const hidden = filtered.length - shown.length;

  return (
    <div
      className="space-y-2"
      data-nonprofit-interaction-ready={interactionReady ? "true" : "false"}
    >
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search these nonprofits by name or town"
          placeholder="Search by name or town…"
          className="w-full rounded-[var(--app-radius-md)] border py-2.5 pl-10 pr-10 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-cool)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "var(--app-hi)" }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="tap-44 absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>

      {q && (
        <p className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          {filtered.length === 0 ? "No matches" : `${filtered.length} of ${orgs.length}`}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>
          No nonprofit here matches “{query.trim()}”. Try a shorter word, or pick a different cause above.
        </p>
      ) : (
        <ul>
          {shown.map((n) => (
            <li key={n.ein}>
              <Link
                href={`/nonprofits/${n.ein}`}
                className="tap-44 group flex items-baseline justify-between gap-3 border-b py-2.5"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium leading-tight group-hover:underline" style={{ color: "var(--app-ink)" }}>
                    {n.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                    {n.sub} · {n.city}
                    {n.ruling ? ` · since ${n.ruling}` : ""}
                  </span>
                </span>
                {n.rev ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-2)" }} title="Most recent reported annual revenue (IRS filing)">
                    {n.rev}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!q && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="tap-44-y w-full rounded-[var(--app-radius-md)] border py-2.5 text-[13px] font-semibold"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
        >
          Show all {filtered.length.toLocaleString()}
        </button>
      )}
    </div>
  );
}
