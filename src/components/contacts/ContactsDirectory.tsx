"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Phone, ExternalLink, X, AlertCircle, ChevronRight,
  Star, MessageSquare, Mail, Copy, Check, Download, Sparkles, ArrowUpRight,
  House, Trash2, PawPrint, Bus, ShieldCheck, HeartPulse, Landmark, Trees, Vote,
  type LucideIcon,
} from "lucide-react";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";
import {
  formatPhone, TOPICS, topicOf, isEssential, isOpen24_7,
  type DepartmentContact, type TopicId,
} from "@/data/departments";
import { getHomeMuni } from "@/lib/personalize";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * ContactsDirectory — the government directory as a one-SCREEN index built around
 * what a resident needs, with the depth in a bottom sheet so nothing scrolls
 * endlessly.
 *
 *   1. SEARCH — one box over departments, their "call us about" line, and tasks.
 *   2. MOST IMPORTANT NUMBERS — the essentials, numbers LISTED, with one-tap
 *      Text / Email / Copy / Add-to-Contacts for the whole set. Star any line to
 *      add it.
 *   3. WHERE YOU LIVE — if a home town is set, one line resolves the City-vs-
 *      County question (whose trash/water/police is mine).
 *   4. BROWSE BY NEED — a grid of need-tiles (Home & property, Pets, Getting
 *      around…). The whole set of needs fits on about one screen. Tapping a tile
 *      opens that need in the app's shared BottomSheet, where every office lists
 *      its number, a jurisdiction tag, a 24/7 badge where the line truly answers
 *      around the clock, tap-to-call, a star, and its site.
 *   5. Not sure who to call → hand off to Ask.
 *
 * All of it is a plain client filter over data the server already had. Phone
 * numbers and 24/7 status come only from verified data.
 */

type Task = { id: string; label: string; url: string; verbLabel: string; keywords?: string[] };

const PINNED_KEY = "fr:contacts:pinned:v1";

const TOPIC_ICONS: Record<string, LucideIcon> = {
  House, Trash2, PawPrint, Bus, ShieldCheck, HeartPulse, Landmark, Trees, Vote,
};

/** Per-jurisdiction accent (row rail) and the WHITE-on-color call chip. The
 *  Signal vermilion fails 4.5:1 under white, so the city chip uses the press
 *  variant; the rail keeps the true brand red (decorative, exempt). */
const RAIL: Record<string, string> = {
  emergency: "var(--app-danger)", city: "var(--app-brand)",
  county: "var(--app-cool)", state: "var(--app-cool)",
};
const NUM_COLOR: Record<string, string> = {
  emergency: "var(--app-danger)", city: "var(--app-brand-press)",
  county: "var(--app-cool)", state: "var(--app-cool)",
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

function buildShareText(contacts: DepartmentContact[]): string {
  const lines = contacts.filter((d) => d.phone).map((d) => `${d.name}: ${formatPhone(d.phone!)}`);
  return `Frederick County key numbers\n${lines.join("\n")}\n\nMore at frederickradius.app/contacts`;
}
function buildVCard(contacts: DepartmentContact[]): string {
  return contacts
    .filter((d) => d.phone)
    .map((d) =>
      ["BEGIN:VCARD", "VERSION:3.0", `FN:Frederick ${d.name}`, "ORG:Frederick Radius", `TEL;TYPE=VOICE:${formatPhone(d.phone!)}`, "END:VCARD"].join("\n"),
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
  const [copied, setCopied] = useState(false);
  const [openTopic, setOpenTopic] = useState<TopicId | null>(null);
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
            body: `The County lines serve the whole county, including you. If ${homeName} runs its own trash, water, or police, those are handled by the town.`,
          }
        : null
    : null;

  const deptResults = useMemo(
    () => (searching ? departments.filter((d) => deptMatches(d, q)) : []),
    [departments, q, searching],
  );
  const taskResults = useMemo(
    () => (searching ? tasks.filter((t) => taskMatches(t, q)) : []),
    [tasks, q, searching],
  );
  const total = deptResults.length + taskResults.length;

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

  const openGroup = openTopic ? groups.find((g) => g.id === openTopic) ?? null : null;

  return (
    <section aria-label="Find a service" className="space-y-5">
      {/* Search — the fast path. */}
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

      {/* ── Most important numbers — numbers listed + carry tools ───────── */}
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
            <EssentialRow key={d.slug} d={d} />
          ))}
        </ul>

        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          <p className="mb-2 text-[11.5px]" style={{ color: "var(--app-ink-2)" }}>
            Send these to your phone or your family:
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={smsHref}
              className="tap-44-y inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold"
              style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)" }}
            >
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
              <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} /> Add to phone
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            Star any line to add it to this set.
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

      {/* Emergency care — the health facilities whose right number depends on the
          situation. The 911 / 988 / Poison lines live in the card above. */}
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
          <p role="status" aria-live="polite" aria-atomic="true" className="px-0.5 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
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
              <Link href="/ask" className="font-semibold underline" style={{ color: "var(--app-cool)" }}>ask in your own words</Link>.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Browse by need — a one-screen index of tiles ───────────── */}
          <div>
            <p className="mb-2 px-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              Find a service by what you need
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {groups.map((g) => {
                const Icon = TOPIC_ICONS[g.icon] ?? House;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setOpenTopic(g.id)}
                    aria-haspopup="dialog"
                    className="tactile-interactive flex flex-col items-start gap-2 rounded-[var(--app-radius-lg)] border p-3 text-left active:scale-[0.98]"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
                  >
                    <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ background: "color-mix(in srgb, var(--app-ink) 8%, transparent)" }}>
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-ink-2)" }} />
                    </span>
                    <span className="font-serif text-[15px] font-semibold leading-[1.1] tracking-tight" style={{ color: "var(--app-ink)" }}>{g.label}</span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                      {g.depts.length} {g.depts.length === 1 ? "office" : "offices"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* How do I… — the county's task links, folded behind one tap. */}
          <details className="group">
            <summary
              className="tap-44-y flex w-full cursor-pointer list-none items-center justify-between rounded-[var(--app-radius-md)] border px-3.5 py-2.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <span className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                How do I&hellip;
                <span className="ml-2 font-mono text-[11px] font-normal" style={{ color: "var(--app-ink-3)" }}>{tasks.length} tasks</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" strokeWidth={2.2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
            </summary>
            <ul className="mt-2 flex flex-wrap gap-2">
              {tasks.map((t) => (
                <TaskChip key={t.id} t={t} />
              ))}
            </ul>
          </details>

          {/* Not sure who to call → hand off to Ask. */}
          <Link
            href="/ask"
            className="flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
          >
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)" }}>
              <Sparkles className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} />
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

      {/* The need sheet — the app's shared BottomSheet, opened by a tile. */}
      <BottomSheet
        present={openTopic !== null}
        onClose={() => setOpenTopic(null)}
        ariaLabel={openGroup ? `${openGroup.label} contacts` : "Contacts"}
      >
        {(dismiss) => {
          const Icon = openGroup ? TOPIC_ICONS[openGroup.icon] ?? House : House;
          return (
            <>
              <SheetHandle onClose={dismiss} closeLabel="Close" />
              <div className="flex items-center gap-2.5 px-4 pb-3">
                <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ background: "color-mix(in srgb, var(--app-ink) 8%, transparent)" }}>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: "var(--app-ink-2)" }} />
                </span>
                <h2 className="font-serif text-[21px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                  {openGroup?.label}
                </h2>
              </div>
              <ul className="space-y-1.5 overflow-y-auto px-3 pb-6" style={{ overscrollBehavior: "contain" }}>
                {openGroup?.depts.map((d) => (
                  <DeptRow key={d.slug} d={d} pinned={pinned.has(d.slug)} onPin={togglePin} />
                ))}
              </ul>
            </>
          );
        }}
      </BottomSheet>
    </section>
  );
}

/** A compact essentials row: rail, name, the number LISTED, tap-to-call. */
function EssentialRow({ d }: { d: DepartmentContact }) {
  const j = d.jurisdiction;
  const inner = (
    <>
      <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: RAIL[j] ?? "var(--app-brand)" }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{d.name}</span>
        {d.phone ? (
          <span className="mt-0.5 block font-mono text-[12px] font-semibold tabular-nums" style={{ color: NUM_COLOR[j] ?? "var(--app-brand-press)" }}>{formatPhone(d.phone)}</span>
        ) : (
          <span className="mt-0.5 block truncate text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{d.about}</span>
        )}
      </span>
      {d.phone && <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden style={{ color: NUM_COLOR[j] ?? "var(--app-brand-press)" }} />}
    </>
  );
  const cls = "tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border py-2 pl-2.5 pr-3";
  const style = { borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" } as const;
  return (
    <li>
      {d.phone ? (
        <a href={`tel:${d.phone}`} aria-label={`Call ${d.name}: ${formatPhone(d.phone)}`} className={cls} style={style}>{inner}</a>
      ) : (
        <a href={d.website} target={d.website.startsWith("/") ? undefined : "_blank"} rel={d.website.startsWith("/") ? undefined : "noopener noreferrer"} aria-label={`${d.name}: more`} className={cls} style={style}>{inner}</a>
      )}
    </li>
  );
}

/** A dense department row with the number LISTED: rail, name + tags, the
 *  formatted number as the tap-to-call action, the "about", a star, and site. */
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
  const show247 = isOpen24_7(d.slug) && !emg;
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
            <span className="shrink-0 rounded-[5px] px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.05em]" style={{ color: NUM_COLOR[j], background: `color-mix(in srgb, ${rail} 13%, transparent)` }}>
              {TAG_LABEL[j]}
            </span>
          )}
          {show247 && (
            <span className="shrink-0 rounded-[5px] px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--app-positive)", background: "color-mix(in srgb, var(--app-positive) 15%, transparent)" }}>
              24/7
            </span>
          )}
        </p>
        {d.phone ? (
          <a href={`tel:${d.phone}`} aria-label={`Call ${d.name}: ${formatPhone(d.phone)}`} className="tap-44-y mt-0.5 inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold tabular-nums" style={{ color: NUM_COLOR[j] ?? "var(--app-brand-press)" }}>
            <Phone className="h-3 w-3" strokeWidth={2.6} aria-hidden />
            {formatPhone(d.phone)}
          </a>
        ) : null}
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
