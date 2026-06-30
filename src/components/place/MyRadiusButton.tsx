"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
import { useMounted } from "@/hooks/useSaved";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

/**
 * MyRadiusButton — the prominent text-style follow CTA the user
 * spec'd for place detail pages.
 *
 * Three states:
 *   - default (not followed)              "Save"
 *   - followed                            "Saved"
 *   - followed + hover/long-press         "Remove"
 * (Wording is literal — "Save"/"Saved" — to match the "Saved" nav tab +
 * page. "My Radius" lingering on the button reintroduced the ambiguity the
 * nav rename removed; the brand name isn't a verb.)
 *
 * Mobile UX:
 *   - The hover state doesn't exist on touch. To remove on mobile,
 *     the user gets a confirmation toast with an Undo-style "Remove"
 *     action — same one-tap exit as the action-feedback pattern
 *     already used by SaveButton.
 *   - Big tap target (44px) per iOS HIG.
 *
 * Auth flow:
 *   - Signed in: tap → optimistic DB write via useToggleFollow.
 *   - Signed out: tap → router push to /auth/login?next=<current> so
 *     the user lands back where they started after signing in. The
 *     pending follow gets applied on return via a small ?follow=<slug>
 *     param the place page handles.
 *
 * Visual register:
 *   - Default: brand-filled pill (the call to action stands out).
 *   - Followed: subtle outlined pill with a checked bookmark icon.
 *   - Hover (desktop) on the followed state: red-tinted "Remove".
 *   - Loading: spinner in place of the icon; click is no-op.
 */
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

  // Pre-mount: render a placeholder pill so SSR + hydration agree.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="tap-44 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold"
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
      // Detect authed-ness by trying the optimistic toggle. If the
      // hook returns "anonymous", we redirect to sign-in instead of
      // committing the follow to localStorage (the localStorage path
      // is fine, but on the prominent place-detail CTA we want to
      // promote sign-in for cross-device persistence). The icon-only
      // SaveButton still uses the localStorage path silently.
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const auth: { user: { id: string } | null } = await r.json();
      if (!auth.user) {
        // Build the post-login destination with proper query handling
        // — concatenating "?follow=" would have stomped any existing
        // query string. URLSearchParams gets it right.
        const url = new URL(window.location.href);
        url.searchParams.set("follow", slug);
        const safeNext = `${url.pathname}${url.search}`;
        router.push(`/auth/login?next=${encodeURIComponent(safeNext)}`);
        return;
      }
      const nowFollowed = await toggle();
      haptic(nowFollowed ? "medium" : "light");
      if (nowFollowed) {
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

  // Visual variants
  if (isFollowed) {
    const showRemove = hover && !busy;
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        disabled={busy}
        aria-pressed={true}
        aria-label={`Saved. Tap to remove ${name}`}
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
            Remove
          </>
        ) : (
          <>
            <BookmarkCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Saved
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={false}
      aria-label={`Save ${name}`}
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
          <Bookmark className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Save
        </>
      )}
    </button>
  );
}
