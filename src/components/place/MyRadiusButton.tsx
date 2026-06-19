"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Heart, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
import { useMounted } from "@/hooks/useSaved";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

/**
 * MyRadiusButton — the prominent follow CTA on place detail pages.
 *
 * It adapts to WHAT the place is, because the same underlying follow (one
 * row in `follows`, mirrored to the `biz:<slug>` push topic) means two
 * different things to a person:
 *
 *   - A generic place (a park, a trail, an unclaimed listing): this is a
 *     bookmark. The CTA reads "Save" / "Saved" — literal, matching the
 *     "Saved" nav tab + page.
 *   - A CLAIMED business (a verified owner is behind it): following is a
 *     relationship — you'll get their specials, hours changes, and events
 *     via the publish side of the loop. The CTA reframes to "Follow" /
 *     "Following", carries a Heart, shows the calm follower count as social
 *     proof, and the confirmation toast tells you what you just signed up
 *     for. Same toggle, same store — only the meaning (and the words) change.
 *
 * Business context (claimed + follower count) is read client-side from
 * /api/place/<slug>/business so the server place page stays untouched and
 * ISR-cached. Until it resolves (or if the DB is unconfigured) the button
 * shows the neutral Save framing — never a flicker into the wrong words.
 *
 * Mobile UX:
 *   - No hover on touch. To unfollow/remove on mobile, the confirmation
 *     toast carries a one-tap Undo (the action-feedback pattern SaveButton
 *     uses). Big 44px tap target per iOS HIG.
 *
 * Auth flow:
 *   - Signed in: tap → optimistic DB write via useToggleFollow.
 *   - Signed out: tap → /auth/login?next=<current>?follow=<slug>, so the
 *     pending follow applies on return and the user lands where they were.
 */
type BizContext = { claimed: boolean; followers: number };

export default function MyRadiusButton({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const isFollowed = useIsFollowed(slug);
  const toggle = useToggleFollow(slug, "place_detail");
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [biz, setBiz] = useState<BizContext | null>(null);

  // Pull the public follow context (claimed? how many followers?). Best
  // effort: any failure leaves `biz` null and the neutral Save framing.
  useEffect(() => {
    let alive = true;
    fetch(`/api/place/${slug}/business`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BizContext | null) => {
        if (alive && d) setBiz(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);

  const business = !!biz?.claimed;
  const followers = biz?.followers ?? 0;

  // Pre-mount: render a placeholder pill so SSR + hydration agree.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          color: "var(--app-ink-3)",
        }}
      >
        <Bookmark className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Save
      </button>
    );
  }

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      // Detect authed-ness by checking the session. Anonymous users on this
      // prominent CTA are promoted to sign-in (cross-device persistence);
      // the icon-only SaveButton keeps the silent localStorage path.
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const auth: { user: { id: string } | null } = await r.json();
      if (!auth.user) {
        const url = new URL(window.location.href);
        url.searchParams.set("follow", slug);
        const safeNext = `${url.pathname}${url.search}`;
        router.push(`/auth/login?next=${encodeURIComponent(safeNext)}`);
        return;
      }
      const nowFollowed = await toggle();
      haptic(nowFollowed ? "medium" : "light");
      // Optimistically reflect the count in the social-proof line.
      setBiz((b) =>
        b ? { ...b, followers: Math.max(0, b.followers + (nowFollowed ? 1 : -1)) } : b,
      );
      if (business) {
        if (nowFollowed) {
          toast.success(`Following · ${name}`, {
            description: "You'll hear about their specials, hours, and events.",
            action: { label: "Undo", onClick: () => void toggle() },
          });
        } else {
          toast(`Unfollowed · ${name}`, {
            action: { label: "Undo", onClick: () => void toggle() },
          });
        }
      } else if (nowFollowed) {
        toast.success(`Saved · ${name}`, {
          action: { label: "Undo", onClick: () => void toggle() },
        });
      } else {
        toast(`Removed from Saved · ${name}`, {
          action: { label: "Undo", onClick: () => void toggle() },
        });
      }
    } finally {
      setBusy(false);
    }
  }

  // Word + icon set, by what the place is.
  const verb = business ? "Follow" : "Save";
  const doneWord = business ? "Following" : "Saved";
  const removeWord = business ? "Unfollow" : "Remove";
  const count =
    business && followers > 0 ? (
      <span className="font-mono opacity-70" aria-hidden>
        · {followers}
      </span>
    ) : null;

  // FOLLOWED / SAVED — outlined pill; hover (desktop) reveals the exit.
  if (isFollowed) {
    const showRemove = hover && !busy;
    const DoneIcon = business ? Heart : BookmarkCheck;
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        disabled={busy}
        aria-pressed={true}
        aria-label={`${doneWord} ${name}. Tap to ${removeWord.toLowerCase()}`}
        className="tactile tactile-interactive inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition active:scale-[0.96] disabled:opacity-60"
        style={{
          borderColor: showRemove ? "var(--app-danger)" : "var(--app-border)",
          background: "var(--app-bg-elevated)",
          color: showRemove ? "var(--app-danger)" : "var(--app-ink-2)",
        }}
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} aria-hidden />
            …
          </>
        ) : showRemove ? (
          <>
            <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            {removeWord}
          </>
        ) : (
          <>
            <DoneIcon
              className="h-3.5 w-3.5"
              strokeWidth={2.5}
              fill={business ? "currentColor" : "none"}
              aria-hidden
            />
            {doneWord}
            {count}
          </>
        )}
      </button>
    );
  }

  // NOT FOLLOWED — brand-filled call to action.
  const Icon = business ? Heart : Bookmark;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={false}
      aria-label={`${verb} ${name}${business ? " for updates" : ""}`}
      className="tactile tactile-interactive tactile-glow-brand inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-white transition active:scale-[0.96] disabled:opacity-60"
      style={{ background: "var(--app-brand)" }}
    >
      {busy ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} aria-hidden />
          …
        </>
      ) : (
        <>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          {verb}
          {count}
        </>
      )}
    </button>
  );
}
