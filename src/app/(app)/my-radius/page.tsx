import type { Metadata } from "next";
import SavedList from "@/components/saved/SavedList";
import PageBloom from "@/components/ui/PageBloom";
import { getServerUser } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false },
  // Titled "Saved" to match the bottom-nav tab that opens this page —
  // the tab label and the page title now agree (no "My Radius" eyebrow
  // pointing at a tab called "Saved"). Route stays /my-radius.
  title: "Saved",
  description:
    "Frederick Radius keeps your saved places, events, and routes together.",
};

/**
 * /my-radius — the user's personal corner of the field guide.
 *
 * Saved-page redesign (owner-approved, 2026-07-08): the page is one client
 * composition. SavedList owns the masthead (title + mono standfirst with the
 * counts + settings gear), the On-now running line, the wallet deck, and the
 * almanac colophon footer — where the old standalone modules (Radius Points
 * card, sign-in CTA strip, NotificationsNudge) are demoted to single ruled
 * lines. The server's only jobs here are metadata and handing down the
 * signed-in email for the standfirst/colophon framing.
 */
export default async function MyRadiusPage() {
  const user = await getServerUser();
  return (
    <div className="relative">
      <PageBloom variant="warm-cool" />
      <SavedList userEmail={user?.email ?? null} />
    </div>
  );
}
