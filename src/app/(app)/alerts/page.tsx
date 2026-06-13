import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CivicAlerts from "@/components/today/CivicAlerts";

export const metadata: Metadata = {
  alternates: { canonical: "/alerts" },
  title: "Alerts",
  description:
    "Active alerts across Frederick County: weather, traffic, power, schools, and county services.",
};

/**
 * /alerts, stubbed in Session 1 (Decision 3: Pulse is a behavior, not
 * a page). /pulse permanently redirects here. Session 4 builds the
 * full surface: the conditional alert strip on Today plus this page
 * with every empty category collapsed to one line. Until then the
 * page stays honest by rendering the live CivicAlerts feed, which
 * shows active advisories and renders nothing when the county is
 * quiet, per operating rule 5 (empty states collapse).
 */
export default function AlertsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Alerts
        </h1>
      </header>
      <Suspense fallback={null}>
        <CivicAlerts />
      </Suspense>
      <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        Anything active across the county shows above, and quiet means
        quiet. Weather, traffic, power, schools, and county services all
        land here and on the Today page when something is happening.
      </p>
      <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
        <Link href="/" className="underline underline-offset-2">
          Back to Today
        </Link>
      </p>
    </div>
  );
}
