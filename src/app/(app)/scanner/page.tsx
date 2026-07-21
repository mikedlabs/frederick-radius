import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { getScannerIncidents, type ScannerIncident } from "@/lib/integrations/scannerIncidents";
import { getScannerPatterns } from "@/lib/scanner/scannerPatterns";
import ScannerBoard from "@/components/scanner/ScannerBoard";
import ScannerPatterns from "@/components/scanner/ScannerPatterns";
import PageBloom from "@/components/ui/PageBloom";

/**
 * /scanner — the county's public dispatch feed, made legible.
 *
 * Reads the FredScanner #incidents CAD stream through the same server-side
 * allowlist as the map layer, so ONLY public, non-medical, non-personal
 * calls ever reach the page (every medical/BLS/odor-inside/welfare call is
 * dropped upstream). Plain-language, block-level, credited to FrederickScanner.
 * Empty and honest until the feed is configured — a scanner APP shows the raw
 * firehose; this shows only what a resident can safely understand.
 */

export const revalidate = 60;

export const metadata: Metadata = {
  title: "County scanner",
  description:
    "Recent public dispatch calls around Frederick County in plain language: crashes, wires down, fires, rescues. Medical and personal calls are never listed.",
  alternates: { canonical: "/scanner" },
};

export default async function ScannerPage() {
  const [incidents, patterns] = await Promise.all([
    getScannerIncidents().catch(() => [] as ScannerIncident[]),
    getScannerPatterns().catch(() => null),
  ]);

  return (
    <div className="relative mx-auto max-w-md space-y-6 py-6">
      <PageBloom variant="cool" />

      <header>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Recent public safety
        </p>
        <h1
          className="mt-1 font-serif text-[30px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          The county scanner
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The last several hours of public dispatch calls around Frederick
          County, in plain language, with the newest at the top. Only public
          calls are listed. Medical and personal calls are never shown.
        </p>
      </header>

      <ScannerBoard initial={incidents} />

      <Link
        href="/map"
        className="tactile-interactive group flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <span className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
          See public incidents on the map
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-70"
          strokeWidth={2.25}
          aria-hidden
        />
      </Link>

      {patterns && <ScannerPatterns patterns={patterns} />}

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Public safety calls only, block-level, credited to FrederickScanner.
        Calls are preliminary and clear quickly. For live audio, visit{" "}
        <a
          href="https://www.frederickscanner.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline"
          style={{ color: "var(--app-cool)" }}
        >
          FrederickScanner.com
          <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </a>
        .
      </p>
    </div>
  );
}
