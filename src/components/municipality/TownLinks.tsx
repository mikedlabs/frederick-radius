import { ExternalLink, Phone } from "lucide-react";
import { TOWN_WEBSITE_BY_SLUG, type CivicLinks } from "@/data/town-websites";

/**
 * TownLinks — the official municipal website + key civic deep links for a
 * town, from src/data/town-websites.ts. Complements CivicCard (which holds
 * extracted civic answers) with the authoritative town-site links. Renders
 * nothing for towns we couldn't verify (homepage null), so it's safe on
 * every municipality page.
 */

const LINK_LABEL: Record<keyof CivicLinks, string> = {
  government: "Government",
  trashRecycling: "Trash & recycling",
  utilityBilling: "Utility billing",
  billPay: "Pay a bill",
  events: "Events calendar",
  parksRec: "Parks & rec",
  permits: "Permits & zoning",
  police: "Police",
  codes: "Town code",
  forms: "Forms",
  reportIssue: "Report a concern",
};

export default function TownLinks({
  slug,
  hideContact = false,
}: {
  slug: string;
  /** Drop the address/phone footer when a sibling CivicCard already shows the
   *  town-hall "Main office" contact — avoids repeating it on the town page. */
  hideContact?: boolean;
}) {
  const town = TOWN_WEBSITE_BY_SLUG[slug];
  if (!town || !town.homepage || !town.verified) return null;

  const links = town.links ?? {};
  const entries = (Object.keys(LINK_LABEL) as (keyof CivicLinks)[])
    .filter((k) => links[k])
    .map((k) => ({ label: LINK_LABEL[k], href: links[k]! }));

  return (
    <section
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Official town site
        </h2>
        <a
          href={town.homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          {town.homepage.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
        </a>
      </div>

      {entries.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {entries.map(({ label, href }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
              >
                {label}
                <ExternalLink className="h-3 w-3 opacity-60" strokeWidth={2} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}

      {!hideContact && town.contact && (town.contact.address || town.contact.phone) && (
        <div
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          {town.contact.address && <span>{town.contact.address}</span>}
          {town.contact.phone && (
            <a
              href={`tel:${town.contact.phone.replace(/[^0-9]/g, "")}`}
              className="inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              <Phone className="h-3 w-3" strokeWidth={2} aria-hidden />
              {town.contact.phone}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
