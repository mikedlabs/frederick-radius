import type { Metadata } from "next";
import Link from "next/link";
import { Settings, ChevronRight } from "lucide-react";
import SavedList from "@/components/saved/SavedList";

export const metadata: Metadata = {
  title: "My Radius",
  description:
    "Your personal Frederick Radius — the places, events, and routes you're keeping an eye on.",
};

/**
 * /my-radius — the user's personal corner of the field guide.
 *
 * Renamed from /saved (Phase 0 of the profile/follow system). The
 * underlying list mechanic is unchanged: SavedList renders bookmarks
 * + recently-viewed + saved events from device localStorage. What
 * changed is the framing — "Your list" is generic; "My Radius" is
 * ownership. The page is the same shape the user already builds with
 * Save buttons across the app; we just gave it a name worth claiming.
 *
 * Old /saved URL is 301-redirected to /my-radius in next.config.ts so
 * existing bookmarks, iOS Share Sheet saves, and any cached search
 * results keep working.
 */
export default function MyRadiusPage() {
  return (
    <div className="space-y-5">
      {/* Header trimmed: the SavedList component carries its own
          "Your Frederick" hero block so a second outer title would
          stack two headings on top of each other. */}
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            My Radius · on this device
          </p>
          <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
            Your Frederick
          </h1>
        </div>
        {/* Settings entry point — /my-radius is the user's personal
            space, so settings naturally live one tap away from here. */}
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
      <SavedList />
    </div>
  );
}
