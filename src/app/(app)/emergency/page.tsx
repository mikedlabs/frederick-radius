import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  MessageSquareText,
  Navigation,
  PawPrint,
  Phone,
} from "lucide-react";
import { DEPARTMENTS, formatPhone } from "@/data/departments";

/**
 * /emergency — where to go when something goes wrong and you don't know
 * the county.
 *
 * Beta-tester safety request (Jul 2026): a reviewer asked for an
 * emergency-services button "so it is available for out of towners," and
 * to list Frederick Health Hospital. Everything here already lived in
 * departments.ts (the verified civic lines) and the places dataset (the
 * two Frederick Health urgent cares) — it was just buried in the /contacts
 * directory no visitor would open in a pinch. This is the focused surface:
 * 911 first, the county ER, urgent care for the not-life-threatening, then
 * the poison and crisis lines. Sibling to /emergency-vet for pets.
 *
 * Static. Phone lines come straight from the hand-verified departments.ts;
 * the ER and urgent-care facts are the county hospital's public address
 * and the two urgent cares already carried in the places dataset. Nothing
 * scraped or guessed — a wrong number here is the worst kind of wrong.
 */

export const metadata: Metadata = {
  title: "Emergency & urgent care",
  description:
    "Where to get emergency help around Frederick County, including calling or texting 911, the Frederick Health Hospital ER, urgent care, poison control, and the 988 crisis line.",
  alternates: { canonical: "/emergency" },
};

/** Short codes (911, 988) dial as-is; full numbers get the +1 country code. */
const telHref = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length <= 4 ? `tel:${d}` : `tel:+1${d}`;
};

const mapsHref = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const TEXT_911_INFO =
  "https://frederickcountymd.gov/8480/Texting-9-1-1-What-to-Expect";

const bySlug = (slug: string) => DEPARTMENTS.find((d) => d.slug === slug);

// The two Frederick Health urgent cares, from the places dataset (verified
// addresses + phones). Urgent care is NOT an ER — the copy says so plainly.
const URGENT_CARE = [
  { name: "Frederick Health Urgent Care", address: "501 W 7th St, Frederick", phone: "2405663300" },
  { name: "Frederick Health Primary & Urgent Care", address: "1194 Dutchmans Creek Dr, Brunswick", phone: "2405667110" },
] as const;

function LineRow({
  name,
  about,
  phone,
  website,
}: {
  name: string;
  about?: string;
  phone?: string;
  website?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <div className="min-w-0">
        <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
          {name}
        </p>
        {about ? (
          <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
            {about}
          </p>
        ) : null}
      </div>
      {phone ? (
        <a
          href={telHref(phone)}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 font-mono text-[13px] font-semibold tabular-nums"
          style={{ color: "var(--app-brand-press)" }}
          aria-label={`Call ${name}`}
        >
          <Phone className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          {formatPhone(phone)}
        </a>
      ) : website ? (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex shrink-0 items-center gap-1 text-[12px] font-medium"
          style={{ color: "var(--app-ink-3)" }}
          aria-label={`${name} website`}
        >
          Site
          <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

export default function EmergencyPage() {
  const nine11 = bySlug("emergency-911");
  const poison = bySlug("poison-control");
  const crisis = bySlug("suicide-crisis-988");
  const cityPolice = bySlug("city-frederick-police");
  const sheriff = bySlug("county-sheriff");
  const hospital = bySlug("frederick-health-hospital");

  return (
    <div className="relative mx-auto max-w-md space-y-6 py-6">
      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/contacts"
          className="tap-44-y inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Who to call
        </Link>
      </nav>

      <header>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          For visitors and locals
        </p>
        <h1
          className="mt-1 font-serif text-[30px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Emergency?{" "}
          <span className="font-serif italic font-normal" style={{ color: "var(--app-ink-3)" }}>
            Get 911 help first.
          </span>
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          New around here or just need a number fast. This is where to go for
          a real emergency, and where to go when it&rsquo;s serious but not
          life-threatening.
        </p>
      </header>

      {/* 911 — voice and text are both first-class. Frederick County supports
          Text-to-911 for someone who cannot make a voice call. */}
      {nine11 ? (
        <section
          aria-label="Get 911 help"
          className="rounded-[var(--app-radius-lg)] p-4 text-white"
          style={{
            background: "var(--app-brand-press)",
            boxShadow: "var(--app-elev-1)",
          }}
        >
          <h2 className="text-[20px] font-semibold leading-none">
            Get 911 help
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug opacity-90">
            Call if you can. If a voice call is not possible, Frederick County
            supports Text-to-911.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={telHref(nine11.phone!)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] bg-white px-3 text-[14px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Call 911
            </a>
            <a
              href="sms:911"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border border-white/45 px-3 text-[14px] font-semibold text-white"
            >
              <MessageSquareText
                className="h-4 w-4"
                strokeWidth={2.25}
                aria-hidden
              />
              Text 911
            </a>
          </div>
          <p className="mt-2 text-[11px] leading-snug opacity-85">
            In a text, send the exact location and whether you need police,
            fire, or medical help first.
          </p>
          <a
            href={TEXT_911_INFO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-1 text-[11.5px] font-semibold underline"
          >
            How Frederick County Text-to-911 works
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </section>
      ) : null}

      {/* The ER — the answer to "where's the hospital." */}
      <section aria-label="Emergency room" className="space-y-2">
        <h2 className="font-serif text-[19px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          The emergency room
        </h2>
        <div
          className="rounded-[var(--app-radius-lg)] border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--app-brand) 40%, var(--app-border))",
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          }}
        >
          <h3 className="font-serif text-[18px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            {hospital?.name ?? "Frederick Health Hospital"}
          </h3>
          <p className="mt-1 text-[12.5px] font-medium" style={{ color: "var(--app-brand-press)" }}>
            The county&rsquo;s only ER. Open around the clock.
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            On West 7th Street, Frederick
          </p>
          <div className="mt-3 flex items-center gap-2">
            <a
              href={mapsHref("Frederick Health Hospital, Frederick MD")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[var(--app-radius-md)] px-4 py-3 text-[15px] font-semibold text-white"
              style={{ background: "var(--app-brand-press)", minHeight: 44 }}
            >
              <Navigation className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Directions
            </a>
            {hospital?.website ? (
              <a
                href={hospital.website}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-44 inline-flex items-center gap-1 px-2 text-[12px] font-medium"
                style={{ color: "var(--app-ink-3)" }}
                aria-label="Frederick Health Hospital website"
              >
                Site
                <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {/* Urgent care — the not-life-threatening middle, with the honest caveat. */}
      <section aria-label="Urgent care" className="space-y-3">
        <h2 className="font-serif text-[19px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Serious, but not an emergency
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Urgent care handles sprains, cuts, fevers, and the like. It is not
          an ER. For chest pain, trouble breathing, or heavy bleeding, call
          or text 911. Check the provider&rsquo;s site or call ahead when you can.
        </p>
        {URGENT_CARE.map((u) => (
          <LineRow key={u.name} name={u.name} about={u.address} phone={u.phone} />
        ))}
      </section>

      {/* Poison + crisis — the other two lines an out-of-towner may need. */}
      <section aria-label="Poison and crisis lines" className="space-y-2">
        <h2 className="font-serif text-[19px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Other lines
        </h2>
        <div className="flex flex-col gap-2">
          {poison ? <LineRow name={poison.name} about={poison.about} phone={poison.phone} /> : null}
          {crisis ? (
            <div
              className="rounded-[var(--app-radius-md)] border px-3.5 py-3"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                {crisis.name}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                Free, confidential crisis support by call, text, or chat.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={telHref(crisis.phone!)}
                  className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  Call 988
                </a>
                <a
                  href="sms:988"
                  className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
                >
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  Text 988
                </a>
                <a
                  href="https://chat.988lifeline.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
                >
                  Chat
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </div>
            </div>
          ) : null}
          {cityPolice ? (
            <LineRow name="Frederick Police (non-emergency)" about="City police, when it isn't a 911 emergency." phone={cityPolice.phone} />
          ) : null}
          {sheriff ? (
            <LineRow name="Sheriff's Office (non-emergency)" about="County police, when it isn't a 911 emergency." phone={sheriff.phone} />
          ) : null}
        </div>
      </section>

      {/* Pets — point at the sibling guide rather than fold it in. */}
      <Link
        href="/emergency-vet"
        className="flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        <span className="inline-flex items-center gap-2.5">
          <PawPrint className="h-4 w-4 shrink-0" style={{ color: "var(--app-brand-press)" }} strokeWidth={2} aria-hidden />
          <span className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Pet emergency?
          </span>
        </span>
        <span className="text-[12px] font-medium" style={{ color: "var(--app-ink-3)" }}>
          The animal ERs &rsquo;round here
        </span>
      </Link>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Text-to-911 guidance comes from Frederick County. The hospital and
        urgent-care details are Frederick Health&rsquo;s own.{" "}
        <a
          href="mailto:hello@frederickradius.app?subject=Emergency%20page%20correction"
          className="underline"
          style={{ color: "var(--app-cool)" }}
        >
          Spot an error? Tell us immediately.
        </a>
      </p>
    </div>
  );
}
