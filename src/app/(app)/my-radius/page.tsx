import type { Metadata } from "next";
import Link from "next/link";
import { Settings, ChevronRight, Mail } from "lucide-react";
import SavedList from "@/components/saved/SavedList";
import RecentlyViewedRail from "@/components/saved/RecentlyViewedRail";
import NotificationsNudge from "@/components/pwa/NotificationsNudge";
import { getServerUser } from "@/lib/auth";

export const metadata: Metadata = {
  // Titled "Saved" to match the bottom-nav tab that opens this page —
  // the tab label and the page title now agree (no "My Radius" eyebrow
  // pointing at a tab called "Saved"). Route stays /my-radius.
  title: "Saved",
  description:
    "Your saved Frederick — the places, events, and routes you're keeping an eye on.",
};

/**
 * /my-radius — the user's personal corner of the field guide.
 *
 * Renamed from /saved (Phase 0). Phase 1d adds the cross-device-sync
 * framing: a "Signed in as you@…" indicator + sign-out button when
 * authenticated, a "Sign in to sync across devices" CTA strip when
 * anonymous. The underlying SavedList still renders localStorage when
 * signed out and DB (via useFollows) when signed in — same UI, same
 * shapes, just hydrated from different sources.
 */
export default async function MyRadiusPage() {
  const user = await getServerUser();
  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            {user ? `Signed in as ${user.email ?? "you"}` : "On this device"}
          </p>
          <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
            Your field guide
          </h1>
          <p
            className="mt-1.5 text-[14px] leading-relaxed text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            Your saved Frederick starts here. Save places, events, and ideas —
            we&apos;ll group them by town, distance, and what&apos;s coming up next.
          </p>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
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

      {/* Anonymous-only sign-in CTA. Quiet, NOT a popup — the user
          can keep using /my-radius without an account; this is an
          invitation, not a wall. Disappears once signed in. */}
      {!user && (
        <Link
          href="/auth/login?next=/my-radius"
          className="tactile tactile-interactive group flex items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition active:scale-[0.99]"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 14%, transparent)",
              color: "var(--app-brand)",
            }}
          >
            <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block text-[13px] font-semibold leading-tight"
              style={{ color: "var(--app-ink)" }}
            >
              Sign in to sync My Radius across devices
            </span>
            <span
              className="block text-[11.5px]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Magic link, no password. Your current list comes with you.
            </span>
          </span>
          <span
            aria-hidden
            className="text-[11px] font-bold transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--app-ink-3)" }}
          >
            →
          </span>
        </Link>
      )}

      <SavedList />

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
