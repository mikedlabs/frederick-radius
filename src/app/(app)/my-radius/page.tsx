import type { Metadata } from "next";
import Link from "next/link";
import { Settings, ChevronRight } from "lucide-react";
import SavedList from "@/components/saved/SavedList";
import RecentlyViewedRail from "@/components/saved/RecentlyViewedRail";
import NotificationsNudge from "@/components/pwa/NotificationsNudge";
import { getServerUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "My Radius",
  description:
    "Your personal Frederick Radius — the places, events, and routes you're keeping an eye on.",
  robots: { index: false, follow: false },
};

/**
 * /my-radius — the user's personal corner of the field guide.
 *
 * Saving remains useful without an account. When signed in, place saves are
 * merged with the account-backed set; saved events, routes, preferences, and
 * recents stay device-local and keep the same UI.
 */
export default async function MyRadiusPage({
  searchParams,
}: {
  searchParams: Promise<{ signed_out?: string }>;
}) {
  const params = await searchParams;
  const user = await getServerUser();
  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            {user ? "My Radius · places synced" : "My Radius · on this device"}
          </p>
          <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
            Your Frederick
          </h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="tactile tactile-interactive inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-[12px] font-semibold"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            color: "var(--app-ink-2)",
          }}
        >
          <Settings className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Settings
          <ChevronRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        </Link>
      </header>

      {params.signed_out === "1" && (
        <div
          role="status"
          className="rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12.5px]"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            color: "var(--app-ink-2)",
          }}
        >
          Sync stopped on this device. Your saved events, routes, settings, and
          recent views are still here.
        </div>
      )}

      <SavedList isSignedIn={Boolean(user)} />

      {/* Recently viewed — device-local trail of the last 6 places
          the user opened (via PlaceSheet OR direct /places/[slug]).
          Self-hides when empty. Sits below the saved list because
          the saved list is the user's intentional shortlist;
          recents are passive context underneath. */}
      <RecentlyViewedRail />

      {/* Discreet doorway to /settings/notifications. The component
          self-hides on browsers without PushManager, on already-
          subscribed users, on blocked-permission users, and after
          this session's dismissal. */}
      <NotificationsNudge />
    </div>
  );
}
