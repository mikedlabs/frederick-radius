import type { Metadata } from "next";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nfc_cards, nfc_members, nfc_events } from "@/lib/db/schema";
import {
  AdminShell,
  Section,
  SectionLabel,
  StatStrip,
  HairlineList,
  EmptyState,
  Callout,
  StatusPill,
} from "@/components/admin/kit";
import MintCards from "./MintCards";
import { setCardActive } from "./actions";

export const metadata: Metadata = {
  title: "NFC cards",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// The member LIST shows the most recent N; summary counts come from whole-table
// aggregates, so they stay accurate even past this cap.
const MEMBER_LIST_LIMIT = 200;

type CardRow = {
  code: string;
  label: string | null;
  batch: string | null;
  active: boolean;
  created_at: Date | null;
};
type MemberRow = {
  id: string;
  card_code: string | null;
  created_at: Date | null;
  last_seen_at: Date | null;
  name: string | null;
  opted_out: boolean;
};
type EventRow = {
  member_id: string | null;
  event: string;
  path: string | null;
  created_at: Date | null;
};

function fmt(d: Date | null): string {
  if (!d) return "-";
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A short, stable handle for an otherwise anonymous member id. */
function handle(id: string): string {
  return id.slice(0, 10);
}

export default async function NfcCardsAdmin() {
  const db = getDb();
  let cards: CardRow[] = [];
  let members: MemberRow[] = [];
  let recentEvents: EventRow[] = [];
  const membersByCard = new Map<string, number>();
  const eventsByMember = new Map<string, number>();
  const lastActiveByMember = new Map<string, Date>();
  let totalEvents = 0;
  let totalMembers = 0;
  let optedOutTotal = 0;
  let dbError = false;

  if (db) {
    try {
      cards = await db
        .select({
          code: nfc_cards.code,
          label: nfc_cards.label,
          batch: nfc_cards.batch,
          active: nfc_cards.active,
          created_at: nfc_cards.created_at,
        })
        .from(nfc_cards)
        .orderBy(desc(nfc_cards.created_at));

      members = await db
        .select({
          id: nfc_members.id,
          card_code: nfc_members.card_code,
          created_at: nfc_members.created_at,
          last_seen_at: nfc_members.last_seen_at,
          name: nfc_members.name,
          opted_out: nfc_members.opted_out,
        })
        .from(nfc_members)
        .orderBy(desc(nfc_members.created_at))
        .limit(MEMBER_LIST_LIMIT);

      // Whole-table tallies so the summary stays honest past the list cap.
      const [tally] = await db
        .select({
          total: sql<number>`count(*)::int`,
          opted_out: sql<number>`count(*) filter (where ${nfc_members.opted_out})::int`,
        })
        .from(nfc_members);
      totalMembers = tally?.total ?? members.length;
      optedOutTotal = tally?.opted_out ?? 0;

      const memberCounts = await db
        .select({ card_code: nfc_members.card_code, n: sql<number>`count(*)::int` })
        .from(nfc_members)
        .groupBy(nfc_members.card_code);
      for (const row of memberCounts) {
        if (row.card_code) membersByCard.set(row.card_code, row.n);
      }

      const eventCounts = await db
        .select({
          member_id: nfc_events.member_id,
          n: sql<number>`count(*)::int`,
          last_active: sql<Date | null>`max(${nfc_events.created_at})`,
        })
        .from(nfc_events)
        .groupBy(nfc_events.member_id);
      for (const row of eventCounts) {
        if (row.member_id) {
          eventsByMember.set(row.member_id, row.n);
          if (row.last_active) lastActiveByMember.set(row.member_id, new Date(row.last_active));
        }
        totalEvents += row.n;
      }

      recentEvents = await db
        .select({
          member_id: nfc_events.member_id,
          event: nfc_events.event,
          path: nfc_events.path,
          created_at: nfc_events.created_at,
        })
        .from(nfc_events)
        .orderBy(desc(nfc_events.created_at))
        .limit(60);
    } catch {
      dbError = true;
    }
  }

  const activeCards = cards.filter((c) => c.active).length;

  return (
    <AdminShell
      back={{ href: "/admin", label: "Back to Admin" }}
      eyebrow="Beta access"
      title="NFC cards"
      intro="Reusable tap cards. Each card holds a link that grants beta access with no typing and starts logging that device's in-app activity to an anonymous, per-card record. No name or email is collected unless a member volunteers it."
    >
      {dbError && (
        <div className="mt-4">
          <Callout tone="warning" title="NFC tables not migrated">
            Run <code>drizzle/0030_nfc_cards.sql</code> in the Supabase SQL editor, then reload.
          </Callout>
        </div>
      )}

      {/* Mint — the one primary action on the page. */}
      <Section title="Mint cards" description="Random codes you write onto the physical cards.">
        <MintCards />
      </Section>

      {/* Summary — supporting glance, hairline dividers not boxes. */}
      <section className="mt-8">
        <SectionLabel>Summary</SectionLabel>
        <StatStrip
          items={[
            { value: cards.length, label: "Cards" },
            { value: activeCards, label: "Active", tone: "positive" },
            { value: totalMembers, label: "Members" },
            { value: optedOutTotal, label: "Opted out", tone: "warning" },
            { value: totalEvents, label: "Events" },
          ]}
        />
      </section>

      {/* Cards + their member counts. */}
      <Section title="Cards">
        {cards.length === 0 ? (
          <EmptyState>No cards yet. Mint a batch above to hand out.</EmptyState>
        ) : (
          <div className="mt-3">
            <HairlineList>
              {cards.map((c, i) => (
                <li
                  key={c.code}
                  style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                >
                  <div
                    className="flex items-center gap-3 px-3 py-2.5"
                    style={{ background: "var(--app-bg-elevated)", opacity: c.active ? 1 : 0.55 }}
                  >
                    <div className="min-w-0 flex-1">
                      <code
                        className="font-mono text-[14px] font-semibold"
                        style={{ color: "var(--app-brand-press)" }}
                      >
                        {c.code}
                      </code>
                      <div
                        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {c.label && <span style={{ color: "var(--app-ink-2)" }}>{c.label}</span>}
                        {c.batch && <span className="font-mono">batch {c.batch}</span>}
                        <span className="font-mono tabular-nums">
                          {membersByCard.get(c.code) ?? 0} members
                        </span>
                        <span aria-hidden>·</span>
                        <span className="font-mono tabular-nums">minted {fmt(c.created_at)}</span>
                      </div>
                    </div>
                    {!c.active && <StatusPill tone="warning">Off</StatusPill>}
                    <form action={setCardActive} className="shrink-0">
                      <input type="hidden" name="code" value={c.code} />
                      <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                      <button
                        type="submit"
                        className="tap-44 rounded-[var(--app-radius-sm)] border px-2.5 py-1 font-mono text-[11px] font-semibold"
                        style={{
                          borderColor: "var(--app-border)",
                          color: c.active ? "var(--app-danger)" : "var(--app-positive)",
                        }}
                      >
                        {c.active ? "Turn off" : "Turn on"}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      {/* Members — anonymous handles, card attribution, activity, opt-out. */}
      <Section title="Members">
        {members.length === 0 ? (
          <EmptyState>No members yet. A card creates one the first time it is tapped.</EmptyState>
        ) : (
          <div className="mt-3">
            {totalMembers > members.length && (
              <p className="mb-2 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
                Showing the {members.length} most recent of {totalMembers} members.
              </p>
            )}
            <HairlineList>
              {members.map((m, i) => (
                <li
                  key={m.id}
                  style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                >
                  <div
                    className="flex items-center gap-3 px-3 py-2.5"
                    style={{ background: "var(--app-bg-elevated)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code
                          className="font-mono text-[13px] font-semibold"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {handle(m.id)}
                        </code>
                        {m.name && (
                          <span className="text-[12px]" style={{ color: "var(--app-ink-2)" }}>
                            {m.name}
                          </span>
                        )}
                        {m.opted_out && <StatusPill tone="warning">Opted out</StatusPill>}
                      </div>
                      <div
                        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        <span className="font-mono">{m.card_code ?? "no card"}</span>
                        <span aria-hidden>·</span>
                        <span className="font-mono tabular-nums">
                          {eventsByMember.get(m.id) ?? 0} events
                        </span>
                        <span aria-hidden>·</span>
                        <span className="font-mono tabular-nums">joined {fmt(m.created_at)}</span>
                        {(() => {
                          // Prefer the most recent LOGGED event (real activity)
                          // over last_seen_at, which only moves on a re-tap.
                          const lastActive = lastActiveByMember.get(m.id) ?? m.last_seen_at;
                          return lastActive ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-mono tabular-nums">
                                last active {fmt(lastActive)}
                              </span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      {/* Recent activity — the latest events across all members. */}
      <Section title="Recent activity">
        {recentEvents.length === 0 ? (
          <EmptyState>No activity recorded yet.</EmptyState>
        ) : (
          <div className="mt-3">
            <HairlineList>
              {recentEvents.map((e, i) => (
                <li
                  key={`${e.member_id ?? "?"}-${e.created_at?.toISOString() ?? i}-${i}`}
                  style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                >
                  <div
                    className="flex items-center gap-3 px-3 py-2 text-[12px]"
                    style={{ background: "var(--app-bg-elevated)" }}
                  >
                    <code className="font-mono" style={{ color: "var(--app-ink-3)" }}>
                      {e.member_id ? handle(e.member_id) : "?"}
                    </code>
                    <span className="font-mono font-semibold" style={{ color: "var(--app-ink)" }}>
                      {e.event}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono" style={{ color: "var(--app-ink-3)" }}>
                      {e.path ?? ""}
                    </span>
                    <span
                      className="shrink-0 font-mono tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {fmt(e.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </HairlineList>
          </div>
        )}
      </Section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Members are anonymous by default. A tapped device is assigned a signed id
        and unlocked past the beta wall the same way a per-user code is. The log
        holds page paths and simple labels, never what someone typed into search
        or Ask. Activity stops the moment a member opts out on the privacy page.
        Turn a card off below to stop it granting new access.
      </p>
    </AdminShell>
  );
}
