import type { Metadata } from "next";
import { DEPARTMENTS } from "@/data/departments";
import { CIVIC_ACTIONS, CIVIC_VERB_LABEL } from "@/data/civic-actions";
import ContactsDirectory from "@/components/contacts/ContactsDirectory";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/contacts" },
  title: "County & city services",
  description:
    "Frederick County and City services in one place: who to call and how to do it, from 311, permits, trash, and taxes to voting, plus every department and the emergency lines.",
};

export const revalidate = 86_400;

/**
 * /contacts — the government directory as a FIND surface.
 *
 * It used to stack all 39 departments as full text cards under four
 * jurisdiction headings plus a "How do I…" block, so finding one number
 * meant scrolling forever. Now the whole directory is one search box
 * (over department names, their "call us about" line, and the civic
 * tasks) with emergency pinned, the nine common requests one tap away,
 * and the rest behind a jurisdiction lens as dense one-line rows. The
 * interaction lives in ContactsDirectory; this shell is just the header,
 * the directory, and the sourcing note.
 *
 * Sourcing honesty: phone numbers are populated only where confirmed from
 * an official .gov page. Unverified phones are omitted, never guessed.
 */
export default function ContactsPage() {
  // Flatten the civic "How do I…" corpus into the shape the directory's
  // search indexes (label + verb + keywords), so one search box covers both
  // departments and tasks.
  const tasks = CIVIC_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    url: a.url,
    verbLabel: CIVIC_VERB_LABEL[a.verb],
    keywords: a.keywords,
  }));

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          County &amp; city services
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          What do you need?
        </h1>
        <p
          className="text-[15px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Search for a service, or tap a common request. Emergency lines are
          pinned at the top.
        </p>
      </header>

      <ContactsDirectory departments={DEPARTMENTS} tasks={tasks} />

      <footer
        className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Department names and URLs verified against the City of Frederick
        and Frederick County department index pages. Phone numbers are
        added as they&rsquo;re confirmed. Spotted a wrong or missing number?{" "}
        <a
          href="mailto:hello@frederickradius.app?subject=Frederick%20Radius%20contacts%20fix"
          className="underline"
          style={{ color: "var(--app-cool)" }}
        >
          Send a correction.
        </a>
      </footer>
    </div>
  );
}
