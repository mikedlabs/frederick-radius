import { Landmark } from "lucide-react";
import IconStamp from "@/components/ui/IconStamp";
import CivicCard from "./CivicCard";
import TownLinks from "./TownLinks";
import { TOWN_WEBSITE_BY_SLUG } from "@/data/town-websites";
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
  if (!hasCivic && !hasLinks) return null;

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
            Town hall, services &amp; official links
          </h2>
        </div>
      </div>

      {/* The two underlying surfaces keep their own self-hiding logic; the
          merged heading above replaces each component's separate header. */}
      <div className="space-y-3">
        <CivicCard rec={civic} hideHeading />
        <TownLinks slug={slug} />
      </div>

      <p className="px-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        Civic answers for {townName}, sourced from the town, with freshness shown.
      </p>
    </section>
  );
}
