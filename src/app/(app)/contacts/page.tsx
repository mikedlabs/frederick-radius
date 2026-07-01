import type { Metadata } from "next";
import {
  AlertCircle,
  Phone,
  ExternalLink,
  Shield,
  Landmark,
  Wrench,
  CircleParking,
  FileText,
  Receipt,
  PawPrint,
  HeartHandshake,
  Users,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { DEPARTMENTS, formatPhone, type DepartmentContact } from "@/data/departments";
import { CIVIC_ACTIONS_BY_VERB, CIVIC_VERB_LABEL, type CivicVerb } from "@/data/civic-actions";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/contacts" },
  title: "County & city services",
  description:
    "Frederick County and City services in one place: who to call and how to do it, from 311, permits, trash, and taxes to voting, plus every department and the emergency lines.",
};

export const revalidate = 86_400;

/**
 * /contacts — government directory reorganized BY INTENT, not by
 * department.
 *
 * The page used to lead with a jurisdiction split (emergency / city /
 * county) — accurate but useless to someone who has a specific
 * question. "I need to report a pothole" doesn't map to a
 * jurisdiction; it maps to a department most people don't know the
 * name of.
 *
 * New top section: "What do you need?" — an intent-led grid that
 * answers the most common asks (pothole, ticket, permit, water bill,
 * animal complaint, etc.) by routing directly to the right
 * department. Below that, the original jurisdiction directory stays
 * as the comprehensive fallback for anyone who knows what they're
 * looking for.
 *
 * Sourcing honesty: phone numbers are populated only where confirmed
 * from an official .gov page. Unverified phones are omitted rather
 * than guessed.
 */

type Intent = {
  label: string;
  icon: LucideIcon;
  accent: string;
  /** Department slug this intent routes to. */
  slug: string;
  /** Short clarifier shown under the label. */
  hint: string;
};

const INTENTS: Intent[] = [
  {
    label: "Pothole or sidewalk",
    icon: Wrench,
    accent: "var(--app-brand)",
    slug: "city-public-works",
    hint: "Streets, signs, signals, street trees",
  },
  {
    label: "Parking ticket or tow",
    icon: CircleParking,
    accent: "var(--app-cool)",
    slug: "city-parking",
    hint: "Tickets, monthly permits, where your car went",
  },
  {
    label: "Building permit",
    icon: FileText,
    accent: "var(--app-brand-2)",
    slug: "city-building-permits",
    hint: "Permits, inspections, certificates of occupancy",
  },
  {
    label: "Water bill",
    icon: Receipt,
    accent: "var(--app-accent)",
    slug: "city-utility-billing",
    hint: "Pay, dispute, start, or stop service",
  },
  {
    label: "Animal complaint",
    icon: PawPrint,
    accent: "var(--app-warning)",
    slug: "county-animal-control",
    hint: "Loose dog, lost pet, animal welfare",
  },
  {
    label: "Rental or heating help",
    icon: HeartHandshake,
    accent: "var(--app-positive)",
    slug: "city-housing-human-services",
    hint: "Rental assistance, heating, low-income programs",
  },
  {
    label: "City councilmember",
    icon: Users,
    accent: "var(--app-brand)",
    slug: "city-public-affairs",
    hint: "Talk to your district rep or attend a meeting",
  },
  {
    label: "Trash or recycling",
    icon: Trash2,
    accent: "var(--app-ink-2)",
    slug: "county-solid-waste",
    hint: "Pickup schedule, large item, recycling rules",
  },
];
export default function ContactsPage() {
  const emergency = DEPARTMENTS.filter((d) => d.jurisdiction === "emergency");
  const city = DEPARTMENTS.filter((d) => d.jurisdiction === "city");
  const county = DEPARTMENTS.filter((d) => d.jurisdiction === "county");
  const bySlug = new Map(DEPARTMENTS.map((d) => [d.slug, d] as const));

  return (
    <div className="relative space-y-6">
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
          The right department to call, organized by what you&rsquo;re
          trying to do. Emergency lines are at the top. The full
          directory by jurisdiction is below.
        </p>
      </header>

      {/* Intent grid — leads with what people ACTUALLY want to do,
          not which jurisdiction owns it. Each tile resolves to one
          of the verified DEPARTMENTS entries; the resolved card is
          rendered with the same Row treatment used in the directory
          below, just promoted to the top. */}
      <section
        aria-labelledby="contacts-intent-heading"
        className="space-y-2.5"
      >
        <h2
          id="contacts-intent-heading"
          className="eyebrow px-1"
          style={{ color: "var(--app-ink-3)" }}
        >
          Common requests
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {INTENTS.map((intent) => {
            const dept = bySlug.get(intent.slug);
            if (!dept) return null;
            const Icon = intent.icon;
            const href = dept.phone ? `tel:${dept.phone}` : dept.website;
            const external = !dept.phone;
            return (
              <li key={intent.slug}>
                <a
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  aria-label={`${intent.label}: ${intent.hint}${dept.phone ? ` · call ${formatPhone(dept.phone)}` : " · website"}`}
                  className="hover-lift flex h-full flex-col items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
                  style={{
                    borderColor: "var(--app-border)",
                    boxShadow:
                      "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  }}
                >
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `color-mix(in srgb, ${intent.accent} 14%, transparent)`,
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      strokeWidth={2}
                      style={{ color: intent.accent }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block text-[13px] font-semibold leading-tight"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {intent.label}
                    </span>
                    <span
                      className="mt-0.5 block text-[11px] leading-snug"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {intent.hint}
                    </span>
                    {dept.phone && (
                      <span
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
                        style={{ color: intent.accent }}
                      >
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
      </section>

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

      {/* How do I… — the county's resident-intent tasks, browsable.
          (Also answerable in natural language via the Ask concierge.) */}
      <section aria-labelledby="howdoi-heading" className="space-y-2.5">
        <header className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-positive) 14%, transparent)", color: "var(--app-positive)" }}
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <h2 id="howdoi-heading" className="font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            How do I&hellip;
          </h2>
        </header>
        {(Object.keys(CIVIC_VERB_LABEL) as CivicVerb[]).map((verb) => {
          const acts = CIVIC_ACTIONS_BY_VERB(verb);
          if (acts.length === 0) return null;
          return (
            <div key={verb}>
              <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>{CIVIC_VERB_LABEL[verb]}</p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {acts.map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium"
                      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
                    >
                      {a.label}
                      <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <footer
        className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] p-3 text-[11px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        Department names and URLs verified against the City of Frederick
        and Frederick County department index pages. Phone numbers are
        added as they&rsquo;re confirmed. Spotted a wrong or missing number?{" "}
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
            className="text-[13px] leading-snug text-pretty"
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
