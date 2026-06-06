"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToggleFollow, useIsFollowed } from "@/hooks/useFollows";
import { toast } from "sonner";

/**
 * PendingFollowApplier — consumes the ?follow=<slug> param a sign-in
 * round-trip leaves behind, applies the follow exactly once, then
 * clears the param from the URL.
 *
 * Flow:
 *   1. Logged-out user taps MyRadiusButton on /places/<slug>.
 *   2. Button routes to /auth/login?next=/places/<slug>?follow=<slug>.
 *   3. After magic-link sign-in, /auth/callback bounces to the next
 *      URL, which lands the user back on the place page with the
 *      ?follow=<slug> query param intact.
 *   4. This component sees ?follow=<our slug>, asserts the user is
 *      now followed, and pops a toast confirming. The router replace
 *      clears ?follow= so a back-button doesn't re-apply.
 *
 * Renders nothing; purely a side-effect island.
 *
 * Guarded against double-apply via a ref. If the slug doesn't match
 * ours, the component no-ops — supports a different place's
 * /auth/login round-trip landing on this URL via back-navigation
 * without triggering an unrelated follow.
 */
export default function PendingFollowApplier({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const isFollowed = useIsFollowed(slug);
  const toggle = useToggleFollow(slug, "post_signin");
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    const pending = sp.get("follow");
    if (pending !== slug) return;
    appliedRef.current = true;
    void (async () => {
      // Only fire the toggle if not already followed (covers a quick
      // double-tap or a refresh after the apply already ran).
      if (!isFollowed) {
        const nowFollowed = await toggle();
        if (nowFollowed) {
          toast.success(`Saved · ${name}`);
        }
      }
      // Clean the URL so a back-button + refresh doesn't re-apply.
      const url = new URL(window.location.href);
      url.searchParams.delete("follow");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    })();
    // We intentionally do NOT include `toggle` / `isFollowed` in the
    // dep array: those change identity on every render and would
    // re-run this effect. The applied-ref guards correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, slug, name, router]);

  return null;
}
