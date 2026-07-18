"use client";

/**
 * ShareTodayButton — one quiet control that hands /today to the system
 * share sheet. The link's preview is the daily almanac card
 * (/api/og?type=almanac&day=…, wired in the page's generateMetadata), so
 * every share drops an engraved sunrise/sunset/moon/events plate into the
 * group chat. navigator.share where it exists (the phones this is for);
 * clipboard + toast fallback on desktop. The render itself touches no
 * browser API, so SSR and hydration agree without a mount gate.
 */
import { toast } from "sonner";
import { Share } from "lucide-react";
import { track } from "@/lib/track";

const SHARE_URL = "https://frederickradius.app/today";

export default function ShareTodayButton() {
  async function share() {
    const data = {
      title: "Today in Frederick County",
      text: "Use current conditions and posted listings to decide what to do in Frederick County today.",
      url: SHARE_URL,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        track("share_today", { method: "sheet" });
        return;
      }
    } catch {
      // User closed the sheet; fall through to nothing — not an error.
      return;
    }
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      toast("Today's almanac link is copied.");
      track("share_today", { method: "clipboard" });
    } catch {
      toast("Copy this link: frederickradius.app/today");
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="tap-44 inline-flex items-center gap-1.5 text-[12px] font-medium"
      style={{ color: "var(--app-ink-3)" }}
      aria-label="Share today's almanac"
    >
      <Share className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      Share today
    </button>
  );
}
