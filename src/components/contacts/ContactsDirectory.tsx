"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Phone, ExternalLink, X, AlertCircle, ChevronDown, ChevronRight,
  Wrench, CircleParking, FileText, Receipt, PawPrint, HeartHandshake,
  Users, Trash2, Car, type LucideIcon,
} from "lucide-react";
import { formatPhone, type DepartmentContact } from "@/data/departments";

/**
 * ContactsDirectory — the government directory as a FIND surface, not a scroll.
 *
 * The old page stacked all 39 departments as full text cards under four
 * jurisdiction headings, plus a "How do I…" block: a page you scrolled forever
 * to find one phone number. This makes finding fast, top to bottom:
 *
 *   1. SEARCH first — one box over everything (department names, their "call
 *      us about" line, AND the civic tasks with their keywords), so "dog",
 *      "permit", "vote", "trash" jump straight to the answer.
 *   2. EMERGENCY pinned right under it, always visible.
 *   3. COMMON REQUESTS — the nine most-asked, one tap to the right number.
 *   4. The rest as a jurisdiction SEGMENT (City · County · State) of dense
 *      one-line rows, with the task links folded behind one disclosure.
 *
 * Typing takes over: the common grid and the browse lens give way to a flat,
 * counted result list. All of it is a plain client filter over data the server
 * already had — no fetch on a keystroke.
 */

type Task = { id: string; label: string; url: string; verbLabel: string; keywords?: string[] };

type Jur = "city" | "county" | "state";
const JURS: { id: Jur; label: string }[] = [
  { id: "city", label: "City" },
  { id: "county", label: "County" },
  { id: "state", label: "State" },
];

const ACCENT: Record<string, string> = {
  emergency: "var(--app-danger)",
  city: "var(--app-brand)",
  county: "var(--app-cool)",
  state: "var(--app-brand-2)",
};

/** The nine most-common asks, each routed to a verified department slug. */
type Intent = { label: string; iconName: string; accent: string; slug: string; hint: string };
const INTENTS: Intent[] = [
  { label: "Pothole or sidewalk", iconName: "Wrench", accent: "var(--app-brand)", slug: "city-public-works", hint: "Streets, signs, signals, street trees" },
  { label: "Parking ticket or tow", iconName: "CircleParking", accent: "var(--app-cool)", slug: "city-parking", hint: "Tickets, permits, where your car went" },
  { label: "Building permit", iconName: "FileText", accent: "var(--app-brand-2)", slug: "city-building-permits", hint: "Permits, inspections, occupancy" },
  { label: "Water bill", iconName: "Receipt", accent: "var(--app-accent)", slug: "city-utility-billing", hint: "Pay, dispute, start, or stop service" },
  { label: "Animal complaint", iconName: "PawPrint", accent: "var(--app-warning)", slug: "county-animal-control", hint: "Loose dog, lost pet, welfare" },
  { label: "Rental or heating help", iconName: "HeartHandshake", accent: "var(--app-positive)", slug: "city-housing-human-services", hint: "Rental, heating, low-income programs" },
  { label: "City councilmember", iconName: "Users", accent: "var(--app-brand)", slug: "city-public-affairs", hint: "Your district rep, or a meeting" },
  { label: "Trash or recycling", iconName: "Trash2", accent: "var(--app-ink-2)", slug: "county-solid-waste", hint: "Pickup, large item, recycling" },
  { label: "License or REAL ID", iconName: "Car", accent: "var(--app-cool)", slug: "state-mva", hint: "License, registration, REAL ID (MVA)" },
];
const ICONS: Record<string, LucideIcon> = {
  Wrench, CircleParking, FileText, Receipt, PawPrint, HeartHandshake, Users, Trash2, Car,
};

function deptMatches(d: DepartmentContact, q: string): boolean {
  return d.name.toLowerCase().includes(q) || d.about.toLowerCase().includes(q);
}
function taskMatches(t: Task, q: string): boolean {
  return (
    t.label.toLowerCase().includes(q) ||
    t.verbLabel.toLowerCase().includes(q) ||
    (t.keywords ?? []).some((k) => k.toLowerCase().includes(q))
  );
}

export default function ContactsDirectory({
  departments,
  tasks,
}: {
  departments: readonly DepartmentContact[];
  tasks: readonly Task[];
}) {
  const [query, setQuery] = useState("");
  const [jur, setJur] = useState<Jur>("city");
  const [tasksOpen, setTasksOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const bySlug = useMemo(() => new Map(departments.map((d) => [d.slug, d] as const)), [departments]);
  const emergency = useMemo(() => departments.filter((d) => d.jurisdiction === "emergency"), [departments]);

  // Search is global (every jurisdiction + the tasks); off search we show the
  // selected jurisdiction. Emergency stays pinned either way, so it's out of
  // the segmented lens and its own filter.
  const deptResults = useMemo(() => {
    if (searching) return departments.filter((d) => deptMatches(d, q));
    return departments.filter((d) => d.jurisdiction === jur);
  }, [departments, q, jur, searching]);
  const taskResults = useMemo(
    () => (searching ? tasks.filter((t) => taskMatches(t, q)) : []),
    [tasks, q, searching],
  );
  const total = deptResults.length + taskResults.length;

  return (
    <section aria-label="Find a service" className="space-y-4">
      {/* Search — the fast path, first thing on the page. */}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search services, departments, and tasks"
          placeholder="Search: trash, permit, dog, vote, taxes…"
          className="w-full rounded-[var(--app-radius-md)] border py-3 pl-10 pr-10 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
          style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)", boxShadow: "var(--app-hi)" }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="tap-44 absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full" style={{ color: "var(--app-ink-3)" }}>
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>

      {/* Emergency — always visible, never behind a filter or a search. */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 px-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-danger)" }}>
          <AlertCircle className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          Emergency &amp; health
        </p>
        <ul className="space-y-1.5">
          {emergency.map((d) => (
            <DeptRow key={d.slug} d={d} />
          ))}
        </ul>
      </div>

      {searching ? (
        /* ── Search results — departments then tasks, flat and counted ── */
        <div className="space-y-2.5">
          <p className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            {total === 0 ? "No matches" : `${total} ${total === 1 ? "result" : "results"} for “${query.trim()}”`}
          </p>
          {deptResults.length > 0 && (
            <ul className="space-y-1.5">
              {deptResults.map((d) => (
                <DeptRow key={d.slug} d={d} />
              ))}
            </ul>
          )}
          {taskResults.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-0.5">
              {taskResults.map((t) => (
                <TaskChip key={t.id} t={t} />
              ))}
            </ul>
          )}
          {total === 0 && (
            <p className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>
              Nothing matched. Try a plainer word (like “water” or “court”), the
              emergency lines above, or{" "}
              <Link href="/guide" className="underline" style={{ color: "var(--app-cool)" }}>ask in your own words</Link>.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Common requests — the nine most-asked, one tap to the number. */}
          <div>
            <p className="mb-1.5 px-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              Common requests
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INTENTS.map((intent) => {
                const dept = bySlug.get(intent.slug);
                if (!dept) return null;
                const Icon = ICONS[intent.iconName] ?? Wrench;
                const href = dept.phone ? `tel:${dept.phone}` : dept.website;
                const external = !dept.phone;
                return (
                  <li key={intent.slug}>
                    <a
                      href={href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      aria-label={`${intent.label}: ${intent.hint}${dept.phone ? ` · call ${formatPhone(dept.phone)}` : " · website"}`}
                      className="hover-lift flex h-full items-start gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5 transition"
                      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
                    >
                      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${intent.accent} 14%, transparent)` }}>
                        <Icon className="h-4 w-4" strokeWidth={2} style={{ color: intent.accent }} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                          {intent.label}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                          {intent.hint}
                        </span>
                        {dept.phone && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold tabular-nums" style={{ color: intent.accent }}>
                            <Phone className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                            {formatPhone(dept.phone)}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Browse — one jurisdiction at a time, dense rows. */}
          <div className="space-y-2.5">
            <div className="flex flex-1 gap-1 rounded-full border p-1" role="tablist" aria-label="Jurisdiction" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
              {JURS.map((j) => {
                const on = jur === j.id;
                const n = departments.filter((d) => d.jurisdiction === j.id).length;
                return (
                  <button
                    key={j.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setJur(j.id)}
                    className="tap-44-y flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition"
                    style={{ background: on ? "var(--app-bg-elevated-solid)" : "transparent", color: on ? "var(--app-ink)" : "var(--app-ink-3)", boxShadow: on ? "var(--app-elev-1), var(--app-hi)" : "none" }}
                  >
                    {j.label}
                    <span className="ml-1.5 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{n}</span>
                  </button>
                );
              })}
            </div>
            <ul className="space-y-1.5">
              {deptResults.map((d) => (
                <DeptRow key={d.slug} d={d} />
              ))}
            </ul>

            {/* How do I… — the county's task links, folded behind one tap. */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setTasksOpen((v) => !v)}
                aria-expanded={tasksOpen}
                className="tap-44-y flex w-full items-center justify-between rounded-[var(--app-radius-md)] border px-3.5 py-2.5 text-left"
                style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
              >
                <span className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  How do I&hellip;
                  <span className="ml-2 font-mono text-[11px] font-normal" style={{ color: "var(--app-ink-3)" }}>{tasks.length} tasks</span>
                </span>
                {tasksOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                )}
              </button>
              {tasksOpen && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {tasks.map((t) => (
                    <TaskChip key={t.id} t={t} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** A dense one-line department row: accent bar, name, one-line "about", and
 *  the two actions (tap-to-call + site) inline on the right. */
function DeptRow({ d }: { d: DepartmentContact }) {
  const accent = ACCENT[d.jurisdiction] ?? "var(--app-brand)";
  const isGuide = d.website.startsWith("/");
  return (
    <li
      className="relative flex items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] border py-2 pl-3.5 pr-2"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{d.name}</p>
        <p className="truncate text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{d.about}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {d.phone && (
          <a
            href={`tel:${d.phone}`}
            aria-label={`Call ${d.name}: ${formatPhone(d.phone)}`}
            className="tactile-interactive inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white active:scale-[0.97]"
            style={{ background: accent }}
          >
            <Phone className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Call
          </a>
        )}
        {isGuide ? (
          <Link href={d.website} aria-label={`${d.name}: open the guide`} className="tap-44 grid h-9 w-9 place-items-center rounded-full border" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </Link>
        ) : (
          <a href={d.website} target="_blank" rel="noopener noreferrer" aria-label={`${d.name}: website`} className="tap-44 grid h-9 w-9 place-items-center rounded-full border" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

/** A civic task as a compact link chip. */
function TaskChip({ t }: { t: Task }) {
  return (
    <li>
      <a
        href={t.url}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>{t.verbLabel}</span>
        {t.label}
        <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
      </a>
    </li>
  );
}
