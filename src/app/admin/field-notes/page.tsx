import type { Metadata } from "next";
import { Trash2, ArchiveX } from "lucide-react";
import { getDbFieldNotes } from "@/lib/loaders/fieldNotesDb";
import { addFieldNote, expireFieldNote, deleteFieldNote } from "./actions";
import {
  AdminShell,
  SectionLabel,
  HairlineList,
  Field,
  TextInput,
  Textarea,
  Select,
  AdminButton,
  Tag,
  StatusPill,
  EmptyState,
} from "@/components/admin/kit";

export const metadata: Metadata = { title: "Field notes editor" };
export const dynamic = "force-dynamic";

const KINDS = ["deal", "parking", "insider", "happy_hour"] as const;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const CONF = ["high", "medium", "low"] as const;

export default async function FieldNotesAdminPage() {
  const notes = await getDbFieldNotes();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const isExpired = (n: (typeof notes)[number]) => n.expires_at !== null && n.expires_at < today;

  return (
    <AdminShell
      eyebrow="The living layer"
      title="Field notes & deals"
      intro="Add a deal, parking tip, or insider note to a place, from anywhere. Deals show on Today on their day; these rows are read alongside the committed field notes, and win."
    >
      {/* Add form */}
      <section className="mt-8">
        <SectionLabel>Add a note</SectionLabel>
        <form
          action={addFieldNote}
          className="space-y-4 rounded-[var(--app-radius-lg)] border p-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <Field label="Place slug" htmlFor="place_slug">
            <TextInput
              id="place_slug"
              name="place_slug"
              required
              placeholder="averys-maryland-grille-frederick"
              className="font-mono"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue="deal">
                {KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            </Field>
            <Field label="Day (deals)" htmlFor="day_of_week">
              <Select id="day_of_week" name="day_of_week" defaultValue="">
                <option value="">Every day</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Text" htmlFor="text">
            <Textarea id="text" name="text" required rows={2} placeholder="$1 oysters, 4 to 6 PM" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours (optional)" htmlFor="hours">
              <TextInput id="hours" name="hours" placeholder="4-6 PM" />
            </Field>
            <Field label="Confidence" htmlFor="confidence">
              <Select id="confidence" name="confidence" defaultValue="medium">
                {CONF.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Verified on" htmlFor="last_verified">
              <TextInput id="last_verified" name="last_verified" type="date" defaultValue={today} />
            </Field>
            <Field label="Expires (optional)" htmlFor="expires_at">
              <TextInput id="expires_at" name="expires_at" type="date" />
            </Field>
          </div>

          <Field label="Source URL (optional)" htmlFor="source_url">
            <TextInput id="source_url" name="source_url" type="url" placeholder="https://…" />
          </Field>

          <AdminButton type="submit" variant="primary" className="w-full justify-center">
            Add note
          </AdminButton>
        </form>
      </section>

      {/* Existing notes */}
      <section className="mt-8">
        <SectionLabel>On the books · {notes.length}</SectionLabel>
        {notes.length === 0 ? (
          <EmptyState tone="muted">No owner-added field notes yet. Add one above.</EmptyState>
        ) : (
          <HairlineList>
            {notes.map((n, i) => {
              const expired = isExpired(n);
              return (
                <li key={n.id} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                  <div
                    className="bg-[var(--app-bg-elevated)] px-3 py-3"
                    style={{ opacity: expired ? 0.55 : 1 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Tag tone="brand">{n.kind}</Tag>
                        {n.day_of_week ? (
                          <span
                            className="truncate font-mono text-[10px] uppercase tracking-wide"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {n.day_of_week}
                          </span>
                        ) : null}
                      </div>
                      <StatusPill tone={expired ? "muted" : n.expires_at ? "cool" : "positive"}>
                        {expired ? "expired" : n.expires_at ? `until ${n.expires_at}` : "evergreen"}
                      </StatusPill>
                    </div>

                    <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink)" }}>
                      {n.text}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {n.place_slug}
                    </p>

                    <div className="mt-2.5 flex items-center gap-2">
                      {!expired ? (
                        <form action={expireFieldNote}>
                          <input type="hidden" name="id" value={n.id} />
                          <AdminButton type="submit" variant="ghost" icon={ArchiveX}>
                            Expire
                          </AdminButton>
                        </form>
                      ) : null}
                      <form action={deleteFieldNote}>
                        <input type="hidden" name="id" value={n.id} />
                        <AdminButton type="submit" variant="danger" icon={Trash2}>
                          Delete
                        </AdminButton>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </HairlineList>
        )}
      </section>
    </AdminShell>
  );
}
