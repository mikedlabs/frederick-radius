import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BusFront,
  CalendarDays,
  ExternalLink,
  Landmark,
  MessageSquareText,
  School,
  Users,
} from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  title: "Communication access",
  description:
    "Find Deaf-community places, communication-access event details, text-based emergency help, transit assistance, and official accessibility information in Frederick County.",
  alternates: { canonical: "/access" },
};

const COMMUNITY_LINKS = [
  {
    href: "/events?access=true",
    title: "Events with communication access",
    detail:
      "See Deaf-community events and listings whose publishers mention ASL, captions, assistive listening, or an interpreter request.",
    Icon: CalendarDays,
  },
  {
    href: "/places/maryland-deaf-center",
    title: "Maryland Deaf Community Center",
    detail: "Open the local place record, including its written contact route.",
    Icon: Users,
  },
  {
    href: "/places/maryland-school-for-the-deaf",
    title: "Maryland School for the Deaf",
    detail: "Open the Frederick campus record and official website.",
    Icon: School,
  },
] as const;

const PRACTICAL_LINKS = [
  {
    href: "/emergency",
    title: "Emergency and crisis help",
    detail: "Call or text 911 in an emergency. The page also includes 988 chat and text options.",
    Icon: MessageSquareText,
  },
  {
    href: "/transit",
    title: "Transit communication help",
    detail: "Find Frederick County TransIT information and Maryland Relay 711 guidance.",
    Icon: BusFront,
  },
  {
    href: "/contacts",
    title: "City and county contacts",
    detail: "Find the public office that handles a local service or request.",
    Icon: Landmark,
  },
] as const;

const OFFICIAL_LINKS = [
  {
    href: "https://www.cityoffrederickmd.gov/1022/Accessibility-and-Closed-Captioning",
    title: "City of Frederick accessibility and captions",
  },
  {
    href: "https://www.frederickcountymd.gov/3703/ADA-Information",
    title: "Frederick County ADA information",
  },
] as const;

function LinkRow({
  href,
  title,
  detail,
  Icon,
}: {
  href: string;
  title: string;
  detail: string;
  Icon: typeof CalendarDays;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex min-h-[76px] items-center gap-3 border-b px-3.5 py-3 last:border-b-0 active:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
        style={{
          color: "var(--app-civic)",
          background: "color-mix(in srgb, var(--app-civic) 10%, var(--app-bg-elevated))",
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block text-[14px] font-semibold leading-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
        </span>
        <span
          className="mt-1 block text-[12.5px] leading-snug"
          style={{ color: "var(--app-ink-2)" }}
        >
          {detail}
        </span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5"
        strokeWidth={2.25}
        aria-hidden
      />
    </Link>
  );
}

export default function CommunicationAccessPage() {
  return (
    <div className="relative mx-auto max-w-2xl space-y-6 py-5 sm:py-7">
      <PageBloom variant="warm-cool" />

      <header className="max-w-xl">
        <p className="eyebrow" style={{ color: "var(--app-civic)" }}>
          Accessibility
        </p>
        <h1
          className="mt-1.5 font-editorial text-[34px] leading-[1.02] tracking-[-0.025em] sm:text-[40px]"
          style={{ color: "var(--app-ink)" }}
        >
          Communication access
        </h1>
        <p
          className="mt-2 max-w-lg text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Find written contact routes, Deaf-community places, and event access
          details without digging through the rest of Radius.
        </p>
      </header>

      <section aria-labelledby="access-community-heading">
        <h2
          id="access-community-heading"
          className="mb-2 text-[17px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Community and events
        </h2>
        <div
          className="overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          }}
        >
          {COMMUNITY_LINKS.map((item) => (
            <LinkRow key={item.href} {...item} />
          ))}
        </div>
        <p
          className="mt-2 px-1 text-[12px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          Radius only labels a specific accommodation when the publisher or an
          official source states it.
        </p>
      </section>

      <section aria-labelledby="access-practical-heading">
        <h2
          id="access-practical-heading"
          className="mb-2 text-[17px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Practical help
        </h2>
        <div
          className="overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
          }}
        >
          {PRACTICAL_LINKS.map((item) => (
            <LinkRow key={item.href} {...item} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="access-official-heading"
        className="rounded-[var(--app-radius-lg)] border p-4"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
        }}
      >
        <h2
          id="access-official-heading"
          className="text-[15px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Official accessibility information
        </h2>
        <div className="mt-2 divide-y" style={{ borderColor: "var(--app-border)" }}>
          {OFFICIAL_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44-y flex min-h-11 items-center justify-between gap-3 py-2 text-[13px] font-semibold"
              style={{ color: "var(--app-civic)" }}
            >
              {item.title}
              <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
