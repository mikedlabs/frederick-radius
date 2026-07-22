import type { Metadata } from "next";
import { DEPARTMENTS } from "@/data/departments";
import { CIVIC_ACTIONS, CIVIC_VERB_LABEL } from "@/data/civic-actions";
import ContactsDirectory from "@/components/contacts/ContactsDirectory";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/contacts" },
  title: "Contacts: county & city services",
  description:
    "Frederick County and City services in one place: who to call and how to do it, from 311, permits, trash, and taxes to voting, plus every department and the emergency lines.",
};

export const revalidate = 86_400;

/**
 * /contacts — the government directory as a FIND surface, organized by NEED.
 *
 * One search box over department names, their "call us about" line, and the
 * civic tasks. Under it: a "Most important numbers" card you can text, email,
 * copy, or add to your phone's contacts in one tap; a home-town line that
 * resolves the City-vs-County question for services like trash and water; and
 * the rest of the directory grouped by what you need (Home & property, Pets,
 * Getting around, and so on) rather than by which office owns it, with a small
 * jurisdiction tag kept on each row. The interaction lives in ContactsDirectory.
 *
 * Sourcing honesty: phone numbers are populated only where confirmed from an
 * official .gov page, and the 24/7 badge only where the official page says the
 * line answers around the clock. Unverified details are omitted, never guessed.
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
          Contacts
        </h1>
        <p
          className="text-[15px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Search for a service, or scan by what you need. Keep the most important
          numbers on your phone, and reach an emergency line right from the top.
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
          className="inline-flex min-h-11 items-center align-middle underline"
          style={{ color: "var(--app-cool)" }}
        >
          Send a correction.
        </a>
      </footer>
    </div>
  );
}
