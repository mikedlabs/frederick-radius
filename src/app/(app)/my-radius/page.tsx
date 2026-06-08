import type { Metadata } from "next";
import Link from "next/link";
import { Settings, Mail } from "lucide-react";
import SavedList from "@/components/saved/SavedList";
import RecentlyViewedRail from "@/components/saved/RecentlyViewedRail";
import NotificationsNudge from "@/components/pwa/NotificationsNudge";
import PageBloom from "@/components/ui/PageBloom";
import IconStamp from "@/components/ui/IconStamp";
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
    <div className="relative space-y-4">
      <PageBloom variant="warm-cool" />
      {/* Compact header — a tight title + one meta line + an icon button,
          not a display-1 hero with a two-line paragraph. The mobile screen
          opens on content, not on chrome. */}
      <header className="flex items-center justify-between gap-3 pt-0.5">
        <div className="min-w-0">
          <h1 className="font-serif text-[23px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            Your field guide
          </h1>
          <p className="truncate text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
            {user ? `Signed in as ${user.email ?? "you"}` : "Saved on this device"}
          </p>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="tactile tactile-interactive grid h-9 w-9 shrink-0 place-items-center rounded-full border"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            color: "var(--app-ink-2)",
          }}
        >
          <Settings className="h-4 w-4" strokeWidth={2.25} aria-hidden />
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
          <IconStamp accent="var(--app-brand)" size="md">
            <Mail aria-hidden />
          </IconStamp>
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
