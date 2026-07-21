"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Phone, ExternalLink, X, AlertCircle, ChevronDown, ChevronRight,
  Star, MessageSquare, Mail, Copy, Check, Download, Sparkles, ArrowUpRight,
  House, Trash2, PawPrint, Bus, ShieldCheck, HeartPulse, Landmark, Trees, Vote,
  type LucideIcon,
} from "lucide-react";
import {
  formatPhone, TOPICS, topicOf, isEssential, isOpen24_7,
  type DepartmentContact, type TopicId,
} from "@/data/departments";
import { getHomeMuni } from "@/lib/personalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * ContactsDirectory — the government directory as a FIND surface built around
 * what a resident actually needs, not which office owns it.
 *
 * Top to bottom:
 *   1. SEARCH — one box over departments, their "call us about" line, and the
 *      civic tasks.
 *   2. MOST IMPORTANT NUMBERS — the pinned essentials (plus anything you star),
 *      with one-tap tools to TEXT, EMAIL, COPY, or add the whole set to your
 *      phone's contacts. This is the "carry these with me" card.
 *   3. WHERE YOU LIVE — if a home town is set, a line that resolves the single
 *      biggest confusion (is my trash/water/police City or County?) for you.
 *   4. BROWSE BY NEED — Home & property, Trash & water, Pets, Getting around,
 *      and so on. Each line keeps a small jurisdiction tag, a 24/7 badge where
 *      the number truly answers around the clock, a star to pin it, tap-to-call,
 *      and its site. The old City / County / State toggle is gone.
 *   5. Not sure who to call → hand off to Ask.
 *
 * All of it is a plain client filter over data the server already had; no fetch
 * on a keystroke. Phone/verification honesty is inherited from the data: a line
 * shows a number only where one is confirmed, and the 24/7 badge only where the
 * official page says so.
 */

type Task = { id: string; label: string; url: string; verbLabel: string; keywords?: string[] };

const PINNED_KEY = "fr:contacts:pinned:v1";

/** lucide component for a topic's icon name. */
const TOPIC_ICONS: Record<string, LucideIcon> = {
  House, Trash2, PawPrint, Bus, ShieldCheck, HeartPulse, Landmark, Trees, Vote,
};

/** Per-jurisdiction accent (row rail) and the WHITE-on-color call pill. The
 *  Signal vermilion fails 4.5:1 under white text, so the city pill uses the
 *  press variant; the rail keeps the true brand red (decorative, exempt). */
const RAIL: Record<string, string> = {
  emergency: "var(--app-danger)", city: "var(--app-brand)",
  county: "var(--app-cool)", state: "var(--app-brand-2)",
};
const PILL_BG: Record<string, string> = {
  emergency: "var(--app-danger)", city: "var(--app-brand-press)",
  county: "var(--app-cool)", state: "var(--app-brand-2)",
};
const TAG_LABEL: Record<string, string> = {
  emergency: "24/7", city: "City", county: "County", state: "State",
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

/** Read/persist the device-local set of starred department slugs. */
function readPinned(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PINNED_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writePinned(set: Set<string>): void {
  try {
    window.localStorage.setItem(PINNED_KEY, JSON.stringify([...set]));
  } catch {
    /* storage disabled — the stars just won't persist this session */
  }
}

/** The device-local slice read once on mount (starred lines + home town). */
type DeviceState = { pinned: Set<string>; homeMuni: string | null };
function readDevice(): DeviceState {
  return { pinned: readPinned(), homeMuni: getHomeMuni() };
}

/** One shareable text line per department that has a number. */
function contactLine(d: DepartmentContact): string {
  return d.phone ? `${d.name}: ${formatPhone(d.phone)}` : d.name;
}

/** The plain-text block the Text / Email / Copy tools send. */
function buildShareText(contacts: DepartmentContact[]): string {
  const lines = contacts.filter((d) => d.phone).map(contactLine);
  return `Frederick County key numbers\n${lines.join("\n")}\n\nMore at frederickradius.app/contacts`;
}

/** A multi-entry vCard so the whole set drops into the phone's address book. */
function buildVCard(contacts: DepartmentContact[]): string {
  return contacts
    .filter((d) => d.phone)
    .map((d) =>
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:Frederick ${d.name}`,
        "ORG:Frederick Radius",
        `TEL;TYPE=VOICE:${formatPhone(d.phone!)}`,
        "END:VCARD",
      ].join("\n"),
    )
    .join("\n");
}

export default function ContactsDirectory({
  departments,
  tasks,
}: {
  departments: readonly DepartmentContact[];
  tasks: readonly Task[];
}) {
  const [query, setQuery] = useState("");
  const [tasksOpen, setTasksOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Both device-local reads (starred lines + home town) live in ONE state so
  // the mount effect makes a single setState — SSR and first paint stay empty,
  // then hydrate together.
  const [device, setDevice] = useState<DeviceState>({ pinned: new Set(), homeMuni: null });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount hydration of localStorage preferences (starred lines + home town); SSR can't read localStorage
    setDevice(readDevice());
  }, []);
  const { pinned, homeMuni } = device;

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const bySlug = useMemo(() => new Map(departments.map((d) => [d.slug, d] as const)), [departments]);
  const emergency = useMemo(() => departments.filter((d) => d.jurisdiction === "emergency"), [departments]);
  // The emergency lines NOT already in the essentials card (the hospital + the
  // tiered pet ERs) — shown once, below the card, never duplicating 911/988.
  const emergencyCare = useMemo(() => emergency.filter((d) => !isEssential(d.slug)), [emergency]);

  function togglePin(slug: string) {
    setDevice((prev) => {
      const next = new Set(prev.pinned);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      writePinned(next);
      return { ...prev, pinned: next };
    });
  }

  // The "most important numbers": the curated essentials, then anything the
  // user has starred, de-duped and in a stable order (essentials keep their
  // curated order; pins follow).
  const importantContacts = useMemo(() => {
    const seen = new Set<string>();
    const out: DepartmentContact[] = [];
    for (const d of departments) {
      if (isEssential(d.slug) && !seen.has(d.slug)) { seen.add(d.slug); out.push(d); }
    }
    for (const slug of pinned) {
      const d = bySlug.get(slug);
      if (d && !seen.has(slug)) { seen.add(slug); out.push(d); }
    }
    return out;
  }, [departments, pinned, bySlug]);

  const shareText = useMemo(() => buildShareText(importantContacts), [importantContacts]);
  const smsHref = `sms:?&body=${encodeURIComponent(shareText)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent("Frederick County key numbers")}&body=${encodeURIComponent(shareText)}`;

  async function copyList() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — Text and Email still work */
    }
  }
  function downloadVCard() {
    try {
      const blob = new Blob([buildVCard(importantContacts)], { type: "text/vcard" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "frederick-key-numbers.vcf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* download blocked — the other tools still carry the list */
    }
  }

  // Home-town resolver: name the ambiguous services (trash/water/police) for a
  // City resident, and reassure everyone else that the County lines serve them.
  const homeName = homeMuni ? MUNICIPALITY_BY_SLUG[homeMuni]?.name ?? null : null;
  const resolver: { title: string; body: string } | null = homeMuni
    ? homeMuni === "frederick"
      ? {
          title: "You're in the City of Frederick.",
          body: "Your trash, water bill, and police are City services. The County lines cover courts, health, transit, and licenses for everyone.",
        }
      : homeName
        ? {
            title: `You're in ${homeName}.`,
            body: `The County lines below serve the whole county, including you. If ${homeName} runs its own trash, water, or police, those are handled by the town.`,
          }
        : null
    : null;

  // Search: departments then tasks. Off search: the topic groups.
  const deptResults = useMemo(
    () => (searching ? departments.filter((d) => deptMatches(d, q)) : []),
    [departments, q, searching],
  );
  const taskResults = useMemo(
    () => (searching ? tasks.filter((t) => taskMatches(t, q)) : []),
    [tasks, q, searching],
  );
  const total = deptResults.length + taskResults.length;

  // Non-emergency departments grouped by life-area topic, in TOPICS order.
  const groups = useMemo(() => {
    const byTopic = new Map<TopicId, DepartmentContact[]>();
    for (const d of departments) {
      const t = topicOf(d.slug);
      if (!t) continue;
      const list = byTopic.get(t) ?? [];
      list.push(d);
      byTopic.set(t, list);
    }
    return TOPICS.map((t) => ({ ...t, depts: byTopic.get(t.id) ?? [] })).filter((g) => g.depts.length > 0);
  }, [departments]);

  return (
    <section aria-label="Find a service" className="space-y-5">
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

      {/* ── Most important numbers ─────────────────────────────────────── */}
      <div
        className="rounded-[var(--app-radius-lg)] border p-3.5"
        style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
      >
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-danger)" }}>
            <AlertCircle className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Most important numbers
          </p>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
            Save or share the set
          </span>
        </div>

        <ul className="grid gap-1.5 sm:grid-cols-2">
          {importantContacts.map((d) => (
            <ImportantRow key={d.slug} d={d} />
          ))}
        </ul>

        {/* Text / Email / Copy / Add to contacts — the carry-it-with-you tools. */}
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          <p className="mb-2 text-[11.5px]" style={{ color: "var(--app-ink-2)" }}>
            Send these to your phone or your family:
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={smsHref} className="tap-44-y inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: "var(--app-brand)" }}>
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden /> Text these
            </a>
            <a href={mailHref} className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold" style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}>
              <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} /> Email
            </a>
            <button type="button" onClick={() => void copyList()} className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold" style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}>
              {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden style={{ color: "var(--app-positive)" }} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={downloadVCard} className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold" style={{ borderColor: "var(--app-border-strong)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}>
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} /> Add to contacts
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Star any line below to add it to this set.
          </p>
        </div>
      </div>

      {/* ── Where you live ─────────────────────────────────────────────── */}
      {resolver && (
        <div className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3.5 py-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
          <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)" }}>
            <House className="h-3 w-3" strokeWidth={2.2} style={{ color: "var(--app-brand-press)" }} />
          </span>
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{resolver.title}</span>{" "}
            {resolver.body}
          </p>
        </div>
      )}

      {/* Emergency care — the health facilities whose right number depends on
          the situation (the hospital, the tiered pet ERs), so they link to
          guidance instead of a single line. The 911 / 988 / Poison numbers live
          in the card above, not duplicated here. */}
      {emergencyCare.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 px-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-danger)" }}>
            <AlertCircle className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Emergency care
          </p>
          <ul className="space-y-1.5">
            {emergencyCare.map((d) => (
              <DeptRow key={d.slug} d={d} pinned={pinned.has(d.slug)} onPin={togglePin} />
            ))}
          </ul>
        </div>
      )}

      {searching ? (
        /* ── Search results — departments then tasks, flat and counted ── */
        <div className="space-y-2.5">
          <p className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            {total === 0 ? "No matches" : `${total} ${total === 1 ? "result" : "results"} for “${query.trim()}”`}
          </p>
          {deptResults.length > 0 && (
            <ul className="space-y-1.5">
              {deptResults.map((d) => (
                <DeptRow key={d.slug} d={d} pinned={pinned.has(d.slug)} onPin={togglePin} />
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
            <div className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px] leading-relaxed" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}>
              No contact matches. Try a broader term, or{" "}
              <Link href="/guide" className="font-semibold underline" style={{ color: "var(--app-cool)" }}>ask in your own words</Link>.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Browse by need ─────────────────────────────────────────── */}
          {groups.map((g) => {
            const Icon = TOPIC_ICONS[g.icon] ?? House;
            return (
              <div key={g.id}>
                <p className="mb-2 flex items-center gap-2 px-0.5">
                  <span aria-hidden className="grid h-6 w-6 place-items-center rounded-[7px]" style={{ background: "color-mix(in srgb, var(--app-ink) 8%, transparent)" }}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "var(--app-ink-2)" }} />
                  </span>
                  <span className="font-serif text-[16px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>{g.label}</span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{g.depts.length}</span>
                </p>
                <ul className="space-y-1.5">
                  {g.depts.map((d) => (
                    <DeptRow key={d.slug} d={d} pinned={pinned.has(d.slug)} onPin={togglePin} />
                  ))}
                </ul>
              </div>
            );
          })}

          {/* How do I… — the county's task links, folded behind one tap. */}
          <div>
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
              {tasksOpen
                ? <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                : <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />}
            </button>
            {tasksOpen && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {tasks.map((t) => (
                  <TaskChip key={t.id} t={t} />
                ))}
              </ul>
            )}
          </div>

          {/* Not sure who to call → hand off to Ask. */}
          <Link
            href="/guide"
            className="flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          >
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-brand-2) 14%, transparent)" }}>
              <Sparkles className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>Not sure who to call?</span>
              <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>Say what happened and we&rsquo;ll point you to the right office.</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          </Link>

          <p className="px-0.5 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Most City and County offices are open weekdays, roughly 8am to 4:30pm. Lines marked 24/7 answer any time. Deaf or hard of hearing? Dial 711 for Maryland Relay.
          </p>
        </>
      )}
    </section>
  );
}

/** A compact essentials row inside the "Most important numbers" card. */
function ImportantRow({ d }: { d: DepartmentContact }) {
  const j = d.jurisdiction;
  return (
    <li className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] border py-2 pl-2.5 pr-2" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
      <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: RAIL[j] ?? "var(--app-brand)" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{d.name}</p>
        <p className="truncate text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{d.about}</p>
      </div>
      {d.phone && (
        <a
          href={`tel:${d.phone}`}
          aria-label={`Call ${d.name}: ${formatPhone(d.phone)}`}
          className="tactile-interactive inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white tabular-nums active:scale-[0.97]"
          style={{ background: PILL_BG[j] ?? "var(--app-brand-press)" }}
        >
          <Phone className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          {d.phone.length <= 3 ? d.phone : "Call"}
        </a>
      )}
    </li>
  );
}

/** A dense one-line department row: rail, name + tags, one-line "about", and
 *  the actions (star, tap-to-call, site) inline on the right. */
function DeptRow({
  d, pinned, onPin,
}: {
  d: DepartmentContact;
  pinned: boolean;
  onPin: (slug: string) => void;
}) {
  const j = d.jurisdiction;
  const rail = RAIL[j] ?? "var(--app-brand)";
  const isGuide = d.website.startsWith("/");
  const emg = j === "emergency";
  const show247 = isOpen24_7(d.slug) && !emg; // emergency rows are 24/7 by nature
  return (
    <li
      className="relative flex items-center gap-2.5 overflow-hidden rounded-[var(--app-radius-md)] border py-2 pl-3.5 pr-2"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: rail }} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{d.name}</span>
          {!emg && (
            <span className="shrink-0 rounded-[5px] px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.05em]" style={{ color: PILL_BG[j], background: `color-mix(in srgb, ${rail} 13%, transparent)` }}>
              {TAG_LABEL[j]}
            </span>
          )}
          {show247 && (
            <span className="shrink-0 rounded-[5px] px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--app-positive)", background: "color-mix(in srgb, var(--app-positive) 15%, transparent)" }}>
              24/7
            </span>
          )}
        </p>
        <p className="truncate text-[11.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{d.about}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onPin(d.slug)}
          aria-pressed={pinned}
          aria-label={pinned ? `Unstar ${d.name}` : `Star ${d.name} to save it to your numbers`}
          className="tap-44 grid h-9 w-9 place-items-center rounded-full"
          style={{ color: pinned ? "var(--app-warning)" : "var(--app-ink-3)" }}
        >
          <Star className="h-4 w-4" strokeWidth={2} fill={pinned ? "currentColor" : "none"} aria-hidden />
        </button>
        {d.phone && (
          <a
            href={`tel:${d.phone}`}
            aria-label={`Call ${d.name}: ${formatPhone(d.phone)}`}
            className="tactile-interactive inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white active:scale-[0.97]"
            style={{ background: PILL_BG[j] ?? "var(--app-brand-press)" }}
          >
            <Phone className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {d.phone.length <= 3 ? d.phone : "Call"}
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
