import type { Metadata } from "next";
import ReportClient from "./ReportClient";

/**
 * /report — the public "Report something" flow (community layer, Phase 1).
 *
 * Anyone past the beta wall can drop a hazard / condition / tip / note on the
 * map. A trusted submitter (passcode) publishes instantly; everyone else's
 * report queues for /admin review. Mirrors /collect's focused full-screen field
 * UI; submissions go to /api/reports.
 *
 * noindex — it's an input tool, not content.
 */
export const metadata: Metadata = {
  title: "Mark a spot · Frederick Radius",
  description: "Mark a hazard, a live condition, or a local tip on the Frederick County map.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ReportPage() {
  return <ReportClient />;
}
