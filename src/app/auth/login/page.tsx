import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { getServerUser } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Frederick Radius to keep your saved places synced across your devices.",
  robots: { index: false, follow: false },
};

/**
 * /auth/login — magic-link sign-in.
 *
 * No passwords by design. Type your email, click the link in the
 * inbox, you're in. Returning users skip the form: if a session is
 * already present, we bounce straight to the `?next` param (or
 * /my-radius as the default landing).
 *
 * The `?next=` param preserves intent across the auth round-trip —
 * a logged-out user who taps Follow on a place gets sent here with
 * ?next=/places/<slug>, signs in, and lands back on the place page
 * with the follow already applied (Phase 1d wires the apply step).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email_sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const safeNext = safeRedirectPath(sp.next, "/my-radius");
  const user = await getServerUser();
  if (user) {
    redirect(safeNext);
  }
  // Surface a callback error instead of swallowing it: an expired/incomplete
  // magic link bounces here with ?error=…, and a pristine form with no
  // explanation reads as "nothing happened."
  const errorMessage =
    sp.error === "expired"
      ? "That sign-in link expired. Enter your email for a fresh one."
      : sp.error === "missing_code"
        ? "That sign-in link was incomplete. Enter your email to try again."
        : sp.error
          ? "Something went wrong with that link. Enter your email to try again."
          : null;

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <span
          aria-hidden
          className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--app-brand) 16%, transparent)",
            color: "var(--app-brand)",
          }}
        >
          <Bookmark className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <h1
          className="font-serif text-[28px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Sign in to sync your saves
        </h1>
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Your followed places stay in sync across your devices. We&apos;ll
          email you a magic link. No password to remember.
        </p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[var(--app-radius-md)] px-4 py-3 text-center text-[13px] font-medium"
          style={{
            background: "color-mix(in srgb, var(--app-danger) 12%, transparent)",
            color: "var(--app-danger)",
          }}
        >
          {errorMessage}
        </div>
      )}

      <LoginForm
        next={safeNext}
        initialSentTo={sp.email_sent ?? null}
      />

      <p
        className="text-center text-[12px] leading-relaxed"
        style={{ color: "var(--app-ink-3)" }}
      >
        Frederick Radius works without an account too,{" "}
        <Link href="/my-radius" className="font-semibold underline-offset-2 hover:underline">
          keep browsing
        </Link>{" "}
        and your list will live on this device.
      </p>
    </div>
  );
}
