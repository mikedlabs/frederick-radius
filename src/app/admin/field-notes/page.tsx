import type { Metadata } from "next";
import Link from "next/link";
import { Trash2, ArchiveX } from "lucide-react";
import { getDbFieldNotes } from "@/lib/loaders/fieldNotesDb";
import { addFieldNote, expireFieldNote, deleteFieldNote } from "./actions";

export const metadata: Metadata = { title: "Field notes editor" };
export const dynamic = "force-dynamic";

const KINDS = ["deal", "parking", "insider", "happy_hour"] as const;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const CONF = ["high", "medium", "low"] as const;

const field = "w-full rounded-[var(--app-radius-sm)] border px-2.5 py-2 text-[13px]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" };
const label = "block text-[11px] font-medium uppercase tracking-wide";
const labelStyle = { color: "var(--app-ink-3)" };

export default async function FieldNotesAdminPage() {
  const notes = await getDbFieldNotes();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const isExpired = (n: (typeof notes)[number]) => n.expires_at !== null && n.expires_at < today;

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="tap-44 inline-block text-xs" style={{ color: "var(--app-cool)" }}>
        ← Admin
      </Link>
      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          The living layer
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Field notes &amp; deals
        </h1>
        <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
          Add a deal, parking tip, or insider note to a place, from anywhere. Deals show on Today
          on their day; these rows are read alongside the committed field notes, and win.
        </p>
      </header>

      {/* Add form */}
      <form action={addFieldNote} className="mt-6 space-y-3 rounded-[var(--app-radius-lg)] border p-4" style={{ borderColor: "var(--app-border)" }}>
        <div>
          <label className={label} style={labelStyle} htmlFor="place_slug">Place slug</label>
          <input id="place_slug" name="place_slug" required placeholder="averys-maryland-grille-frederick"
            className={`${field} mt-1 font-mono`} style={fieldStyle} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} style={labelStyle} htmlFor="kind">Kind</label>
            <select id="kind" name="kind" className={`${field} mt-1`} style={fieldStyle} defaultValue="deal">
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className={label} style={labelStyle} htmlFor="day_of_week">Day (deals)</label>
            <select id="day_of_week" name="day_of_week" className={`${field} mt-1`} style={fieldStyle} defaultValue="">
              <option value="">Every day</option>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={label} style={labelStyle} htmlFor="text">Text</label>
          <textarea id="text" name="text" required rows={2} placeholder="$1 oysters, 4 to 6 PM"
            className={`${field} mt-1`} style={fieldStyle} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} style={labelStyle} htmlFor="hours">Hours (optional)</label>
            <input id="hours" name="hours" placeholder="4-6 PM" className={`${field} mt-1`} style={fieldStyle} />
          </div>
          <div>
            <label className={label} style={labelStyle} htmlFor="confidence">Confidence</label>
            <select id="confidence" name="confidence" className={`${field} mt-1`} style={fieldStyle} defaultValue="medium">
              {CONF.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} style={labelStyle} htmlFor="last_verified">Verified on</label>
            <input id="last_verified" name="last_verified" type="date" defaultValue={today} className={`${field} mt-1`} style={fieldStyle} />
          </div>
          <div>
            <label className={label} style={labelStyle} htmlFor="expires_at">Expires (optional)</label>
            <input id="expires_at" name="expires_at" type="date" className={`${field} mt-1`} style={fieldStyle} />
          </div>
        </div>
        <div>
          <label className={label} style={labelStyle} htmlFor="source_url">Source URL (optional)</label>
          <input id="source_url" name="source_url" type="url" placeholder="https://…" className={`${field} mt-1`} style={fieldStyle} />
        </div>
        <button type="submit" className="tap-44 w-full rounded-[var(--app-radius-md)] px-4 py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--app-brand-2)", color: "var(--app-on-brand, #fff)" }}>
          Add note
        </button>
      </form>

      {/* Existing notes */}
      <section className="mt-8">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          On the books · {notes.length}
        </h2>
        {notes.length === 0 ? (
          <p className="mt-3 rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-sm"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
            No owner-added field notes yet. Add one above.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-[var(--app-radius-md)] border p-3" style={{ borderColor: "var(--app-border)", opacity: isExpired(n) ? 0.55 : 1 }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--app-brand-2)" }}>
                    {n.kind}{n.day_of_week ? ` · ${n.day_of_week}` : ""}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                    {isExpired(n) ? "expired" : n.expires_at ? `until ${n.expires_at}` : "evergreen"}
                  </span>
                </div>
                <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink)" }}>{n.text}</p>
                <p className="mt-0.5 truncate font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>{n.place_slug}</p>
                <div className="mt-2 flex items-center gap-2">
                  {!isExpired(n) ? (
                    <form action={expireFieldNote}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="tap-44 inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--app-ink-2)" }}>
                        <ArchiveX className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Expire
                      </button>
                    </form>
                  ) : null}
                  <form action={deleteFieldNote}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="tap-44 inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--app-brand-press)" }}>
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
