import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  Phone,
  ExternalLink,
  Shield,
  Landmark,
} from "lucide-react";
import { DEPARTMENTS, formatPhone, type DepartmentContact } from "@/data/departments";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  title: "Contacts",
  description:
    "Phone numbers and direct links for City of Frederick and Frederick County government departments, plus emergency lines.",
};

export const revalidate = 86_400;

/**
 * /contacts — government department directory.
 *
 * Three groups, top to bottom:
 *   1. Emergency / health — 911, 988, Poison Control, the hospital.
 *   2. City of Frederick — verified department names + URLs, phones
 *      only where verified.
 *   3. Frederick County — same shape.
 *
 * Honest sourcing: phone numbers are populated only where confirmed
 * from an official .gov page. Unverified phones are omitted rather
 * than guessed — the user clicks through to the website for the right
 * office's number. This is the same "never fabricate" rule the places
 * loader applies to hours and ratings.
 */
export default function ContactsPage() {
  const emergency = DEPARTMENTS.filter((d) => d.jurisdiction === "emergency");
  const city = DEPARTMENTS.filter((d) => d.jurisdiction === "city");
  const county = DEPARTMENTS.filter((d) => d.jurisdiction === "county");

  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Contacts
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Who to call.
        </h1>
        <p
          className="text-[15px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          City of Frederick and Frederick County government departments
          plus the emergency lines. Phone numbers shown only when
          verified from the official source. When a department's number
          isn't here, tap the link to find it on their page.
        </p>
      </header>

      <Section
        title="Emergency and health"
        icon={AlertCircle}
        accent="var(--app-danger)"
        items={emergency}
      />

      <Section
        title="City of Frederick"
        icon={Landmark}
        accent="var(--app-brand)"
        items={city}
      />

      <Section
        title="Frederick County"
        icon={Shield}
        accent="var(--app-cool)"
        items={county}
      />

      <footer
        className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Department names and URLs verified against the City of Frederick
        and Frederick County department index pages. Phone numbers are
        added as they're confirmed. Spotted a wrong or missing number?{" "}
        <a
          href="mailto:miked@madproductions.io?subject=Frederick%20Radius%20contacts%20fix"
          className="underline"
          style={{ color: "var(--app-cool)" }}
        >
          Send a correction.
        </a>
      </footer>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  accent,
  items,
}: {
  title: string;
  icon: typeof AlertCircle;
  accent: string;
  items: readonly DepartmentContact[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-full"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <h2
          className="font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </h2>
        <span
          className="ml-auto text-[11px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {items.length}
        </span>
      </header>
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d.slug}>
            <Row contact={d} accent={accent} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  contact,
  accent,
}: {
  contact: DepartmentContact;
  accent: string;
}) {
  const hasPhone = Boolean(contact.phone);
  return (
    <article
      className="relative overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3"
      style={{
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: accent }}
      />
      <div className="ml-2 flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p
            className="text-[14px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {contact.name}
          </p>
          <p
            className="text-[12.5px] leading-snug text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            {contact.about}
          </p>
        </div>
      </div>
      {/* Action row — tap-to-call when a phone exists, plus a website
          link that lives next to it. The phone is the primary affordance
          when present; the website is always available. */}
      <div className="ml-2 mt-2.5 flex flex-wrap items-center gap-1.5">
        {hasPhone && (
          <a
            href={`tel:${contact.phone}`}
            className="tactile tactile-interactive inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition active:scale-[0.97]"
            style={{
              background: accent,
              color: "white",
            }}
          >
            <Phone className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {formatPhone(contact.phone ?? "")}
          </a>
        )}
        <a
          href={contact.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition active:scale-[0.97]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-2)",
          }}
        >
          <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Website
        </a>
      </div>
    </article>
  );
}
