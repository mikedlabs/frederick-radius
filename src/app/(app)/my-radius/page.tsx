import type { Metadata } from "next";
import Link from "next/link";
import { Settings, Mail } from "lucide-react";
import SavedList from "@/components/saved/SavedList";
import NotificationsNudge from "@/components/pwa/NotificationsNudge";
import PageBloom from "@/components/ui/PageBloom";
import { getServerUser } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false },
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
      {/* Compact header — the coordinate line in mono caps gives it a quiet
          field-guide character without a decorative plate. */}
      <header className="relative flex items-center justify-between gap-3 pt-0.5">
        <div className="relative min-w-0">
          <h1 className="font-serif text-[23px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            Your field guide
          </h1>
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            39.41°N 77.41°W · {user ? (user.email ?? "you") : "on this device"}
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

      {/* SavedList renders its own "Recently viewed" trail at the bottom
          (off the same useRecentPlaces), so the page no longer also mounts
          a standalone RecentlyViewedRail here — that double-rendered the
          section, with two headers and two Clear buttons on every visit. */}
      <SavedList />

      {/* Anonymous-only sign-in CTA, demoted BELOW the saved content
          (June-9 review §15: a Saved page must open on saved value, not
          account plumbing — sync is a means, not the point). */}
      {!user && (
        <Link
          href="/auth/login?next=/my-radius"
          className="tactile tactile-interactive group flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md"
          style={{
            background: "color-mix(in srgb, var(--app-bg-elevated) 66%, transparent)",
            boxShadow: "var(--app-edge), var(--app-hi)",
          }}
        >
          <Mail className="h-[15px] w-[15px] shrink-0" strokeWidth={2.25} style={{ color: "var(--app-brand)" }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: "var(--app-ink-2)" }}>
            Sync across devices
          </span>
          <span className="shrink-0 text-[12px] font-semibold transition-transform group-hover:translate-x-0.5" style={{ color: "var(--app-brand-press)" }}>
            Magic link →
          </span>
        </Link>
      )}

      {/* Discreet doorway to /settings/notifications. The component
          self-hides on browsers without PushManager, on already-
          subscribed users, on blocked-permission users, and after
          this session's dismissal. */}
      <NotificationsNudge />
    </div>
  );
}
