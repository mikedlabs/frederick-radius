import Link from "next/link";
import { Landmark } from "lucide-react";
import IconStamp from "@/components/ui/IconStamp";
import CivicCard from "./CivicCard";
import TownLinks from "./TownLinks";
import { TOWN_WEBSITE_BY_SLUG } from "@/data/town-websites";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { civicContacts, type MunicipalCivic } from "@/lib/loaders/municipalCivic";

/**
 * LivingHere — the demoted, single "resident answers" block low on the
 * town page. Merges the two civic surfaces that used to stack ABOVE the
 * "worth going for" content (CivicCard + TownLinks) under ONE heading,
 * with one IconStamp squircle instead of hand-rolled round chips.
 *
 * Self-hiding: renders nothing unless at least one of its children would
 * render (a civic record with contacts, or a verified town website).
 * This preserves the page's honest empty-state behavior — a thin town
 * never shows an empty "Living here" shell.
 */
export default function LivingHere({
  slug,
  townName,
  civic,
}: {
  slug: string;
  townName: string;
  civic: MunicipalCivic | null;
}) {
  const hasCivic = civic ? civicContacts(civic).length > 0 : false;
  const town = TOWN_WEBSITE_BY_SLUG[slug];
  const hasLinks = Boolean(town?.homepage && town?.verified);
  // Unincorporated places (Urbana) have no town hall to list — but that
  // absence is itself the resident answer, so the section still renders
  // with a one-line pointer to the county hub instead of hiding.
  const isUnincorporated = MUNICIPALITY_BY_SLUG[slug]?.type === "unincorporated";
  if (!hasCivic && !hasLinks && !isUnincorporated) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <IconStamp accent="var(--app-cool)" size="sm">
          <Landmark aria-hidden />
        </IconStamp>
        <div className="min-w-0">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Living here
          </p>
          <h2
            className="font-serif text-[18px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {isUnincorporated ? "Services & who to call" : "Town hall, services & official links"}
          </h2>
        </div>
      </div>

      {/* The two underlying surfaces keep their own self-hiding logic; the
          merged heading above replaces each component's separate header. */}
      <div className="space-y-3">
        <CivicCard rec={civic} hideHeading />
        {/* When the civic card renders its "Main office" contact, TownLinks
            drops its own address/phone footer so the town-hall contact isn't
            printed twice on the page. */}
        <TownLinks slug={slug} hideContact={hasCivic} />
      </div>

      {isUnincorporated && (
        <p className="px-0.5 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
          {townName} is unincorporated, so there is no town hall. Services here
          come from Frederick County; see{" "}
          <Link
            href="/contacts"
            className="tap-44-y font-semibold underline underline-offset-2"
            style={{ color: "var(--app-cool)" }}
          >
            county services
          </Link>{" "}
          for who to call.
        </p>
      )}

      {/* The freshness promise is only honest when a civic record with
          dated contacts actually renders above it. */}
      {hasCivic && (
        <p className="px-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Civic answers for {townName}, sourced from the town, with freshness shown.
        </p>
      )}
    </section>
  );
}
