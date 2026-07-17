import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Phone, ExternalLink } from "lucide-react";
import { PET_CARE_FACILITIES, PET_POISON_LINES, type PetCareFacility } from "@/data/pet-emergency";

/**
 * /emergency-vet — the answer for the worst twenty minutes of a pet
 * owner's year.
 *
 * Beta-tester safety request (July 2026): so many practices have
 * "hospital" in the name that a panicked owner burns crisis time calling
 * clinics that cannot take emergency cases. This page is tiered the way
 * the decision actually runs: the two true 24/7 ERs first as tap-to-call
 * cards, the limited-hours and urgent-care options with their real hours
 * and call-first policies, poison hotlines, and then the one paragraph of
 * education that prevents the mistake next time.
 *
 * Every fact is hand-verified in src/data/pet-emergency.ts with a
 * verification date; nothing here is scraped or guessed. Fully static -
 * the data changes only by verified edit.
 */

export const metadata: Metadata = {
  title: "Emergency vet care",
  description:
    "The two true 24/7 animal ERs serving Frederick County, urgent care hours, and poison hotlines. Verified numbers, tiered for a crisis.",
  alternates: { canonical: "/emergency-vet" },
};

const telHref = (phone: string) => `tel:+1${phone.replace(/\D/g, "")}`;

function FacilityCard({ f, big }: { f: PetCareFacility; big?: boolean }) {
  return (
    <div
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{
        borderColor: big ? "color-mix(in srgb, var(--app-brand) 40%, var(--app-border))" : "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {big ? (
            <h2 className="font-serif text-[19px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
              {f.name}
            </h2>
          ) : (
            <h3 className="font-serif text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
              {f.name}
            </h3>
          )}
          <p className="mt-1 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
            {f.hours}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            {f.address}, {f.town}
            {f.areaNote ? ` · ${f.areaNote}` : ""}
          </p>
          {f.policy && (
            <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--app-brand-press)" }}>
              {f.policy}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={telHref(f.phone)}
          className={`inline-flex items-center gap-2 rounded-[var(--app-radius-md)] font-semibold text-white ${big ? "px-4 py-3 text-[16px]" : "px-3.5 py-2.5 text-[14px]"}`}
          style={{ background: "var(--app-brand-press)", minHeight: 44 }}
        >
          <Phone className={big ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2.25} aria-hidden />
          Call {f.phone}
        </a>
        <a
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex items-center gap-1 px-2 text-[12px] font-medium"
          style={{ color: "var(--app-ink-3)" }}
          aria-label={`${f.name} website`}
        >
          Site
          <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </a>
      </div>
    </div>
  );
}

export default function EmergencyVetPage() {
  const er24 = PET_CARE_FACILITIES.filter((f) => f.tier === "er24");
  const erHours = PET_CARE_FACILITIES.filter((f) => f.tier === "erHours");
  const urgent = PET_CARE_FACILITIES.filter((f) => f.tier === "urgent");
  const verified = PET_CARE_FACILITIES.map((f) => f.verified).sort().at(-1);

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
          Verified {verified}
        </p>
        <h1
          className="mt-1 font-serif text-[30px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Pet emergency?{" "}
          <span className="font-serif italic font-normal" style={{ color: "var(--app-ink-3)" }}>
            Call while someone drives.
          </span>
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          These are the only two animal ERs around Frederick open around the
          clock. Calling ahead lets them prep for your arrival.
        </p>
      </header>

      <section aria-label="Open 24 hours" className="space-y-3">
        {er24.map((f) => (
          <FacilityCard key={f.name} f={f} big />
        ))}
      </section>

      {erHours.length > 0 && (
        <section aria-label="Emergency rooms with limited hours" className="space-y-3">
          <h2 className="font-serif text-[19px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            ER until midnight
          </h2>
          {erHours.map((f) => (
            <FacilityCard key={f.name} f={f} />
          ))}
        </section>
      )}

      <section aria-label="Poisoning" className="space-y-2">
        <h2 className="font-serif text-[19px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Swallowed something?
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Call a poison line first, even before driving. Both are staffed
          around the clock by veterinary toxicologists; both charge a
          consultation fee, and the case number they open speeds up the ER.
        </p>
        <div className="flex flex-col gap-2">
          {PET_POISON_LINES.map((l) => (
            <a
              key={l.name}
              href={telHref(l.phone)}
              className="inline-flex items-center justify-between rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[14px] font-semibold"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink)" }}
            >
              {l.name}
              <span className="inline-flex items-center gap-1.5 font-mono text-[13px]" style={{ color: "var(--app-brand-press)" }}>
                <Phone className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                {l.phone}
              </span>
            </a>
          ))}
        </div>
      </section>

      {urgent.length > 0 && (
        <section aria-label="Urgent care" className="space-y-3">
          <h2 className="font-serif text-[19px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Sick, but stable
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Urgent care handles the in-between: vomiting, limping, wounds
            that need attention tonight but aren&rsquo;t life-threatening.
            Cheaper and usually faster than an ER, when the case fits.
          </p>
          {urgent.map((f) => (
            <FacilityCard key={f.name} f={f} />
          ))}
        </section>
      )}

      {/* The education that prevents the mistake - the tester's exact
          insight, said plainly. */}
      <section
        aria-label="Why this list is short"
        className="rounded-[var(--app-radius-md)] border p-4 text-[13px] leading-relaxed"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
      >
        <p className="font-semibold" style={{ color: "var(--app-ink)" }}>
          Why this list is short
        </p>
        <p className="mt-1">
          Around here, &ldquo;animal hospital&rdquo; in a name means a
          clinic, not an emergency room. Most see emergencies only during
          their own business hours, then refer you to the ERs above. During
          the day, your own vet is the right first call. At night, skip the
          phone tree and go straight to a real ER.
        </p>
      </section>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Numbers and hours verified against each facility&rsquo;s own site on
        the date above. Hours change; in a true crisis, calling en route is
        always right.{" "}
        <a
          href="mailto:hello@frederickradius.app?subject=Emergency%20vet%20page%20correction"
          className="underline"
          style={{ color: "var(--app-cool)" }}
        >
          Spot an error? Tell us immediately.
        </a>
      </p>
    </div>
  );
}
