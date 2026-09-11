import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bookmark, Cloud, LockKeyhole, MapPin } from "lucide-react";
import { getServerUser } from "@/lib/auth";
import {
  isProtectedPath,
  sanitizeRedirectPath,
} from "@/lib/auth-routing";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Keep your Radius with you",
  description:
    "Sign in to keep the places in My Radius available across your devices.",
  robots: { index: false, follow: false },
};

type LoginSearchParams = {
  next?: string;
  reason?: string;
  error?: string;
};

function destinationContext(next: string) {
  const destination = new URL(next, "https://frederickradius.app");
  const path = destination.pathname;

  if (path.startsWith("/places/")) {
    return {
      label: "the place you were viewing",
      backLabel: "Back to that place",
      backHref: next,
    };
  }
  if (path === "/settings/sync" || path.startsWith("/settings/sync/")) {
    return {
      label: "Sync & privacy",
      backLabel: "Back to Settings",
      backHref: "/settings",
    };
  }
  if (path === "/settings" || path.startsWith("/settings/")) {
    return {
      label: "Settings",
      backLabel: "Back to Settings",
      backHref: "/settings",
    };
  }
  return {
    label: "My Radius",
    backLabel: "Not now, keep saving on this device",
    backHref: "/my-radius",
  };
}

function recoveryMessage(reason?: string, legacyError?: string) {
  if (reason === "session_ended") {
    return "Your secure session ended. Nothing on this device was cleared. Send a fresh sign-in email to resume place sync.";
  }
  if (reason === "verification_unavailable") {
    return "We could not verify sync just now. Your on-device saves are safe. Try again in a moment.";
  }
  if (legacyError === "expired") {
    return "That older sign-in link has closed. Links work once, but your on-device saves are still safe. Send a fresh email below.";
  }
  if (legacyError === "missing_code") {
    return "That older sign-in link was incomplete. Send a fresh sign-in email below and we will bring you back here.";
  }
  if (legacyError) {
    return "We could not finish that sign-in, but your on-device saves are safe. Send a fresh sign-in email below.";
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const params = await searchParams;
  const next = sanitizeRedirectPath(params.next);
  const user = await getServerUser();
  if (user) redirect(next);

  const context = destinationContext(next);
  const recovery = recoveryMessage(params.reason, params.error);

  return (
    <main className="relative isolate min-h-svh overflow-hidden px-4 py-5 sm:px-6 sm:py-8">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70% 65% at 12% 10%, color-mix(in srgb, var(--app-brand) 13%, transparent), transparent 66%), radial-gradient(60% 65% at 92% 88%, color-mix(in srgb, var(--app-cool) 13%, transparent), transparent 65%), var(--app-bg)",
        }}
      />

      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full py-2 pr-3 text-[12px] font-semibold tracking-[0.08em]"
          style={{ color: "var(--app-ink-2)" }}
          aria-label="Frederick Radius home"
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white"
            style={{ background: "var(--app-brand)" }}
          >
            <MapPin className="h-4 w-4" strokeWidth={2.25} />
          </span>
          FREDERICK RADIUS
        </Link>

        <div className="mt-7 grid items-start gap-8 md:mt-14 md:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)] md:gap-14">
          <section className="space-y-6 md:pt-5">
            <div className="space-y-3">
              <p className="eyebrow" style={{ color: "var(--app-brand)" }}>
                My Radius · continuity
              </p>
              <h1
                className="max-w-xl font-serif text-[42px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-[52px]"
                style={{ color: "var(--app-ink)" }}
              >
                Keep your Frederick with you.
              </h1>
              <p
                className="max-w-lg text-[15px] leading-7 text-pretty"
                style={{ color: "var(--app-ink-2)" }}
              >
                Sign in once and the places in My Radius will be there on every
                device. After the sign-in email, we&apos;ll bring you back to {context.label}.
              </p>
            </div>

            <div
              className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex gap-3 border-b p-4" style={{ borderColor: "var(--app-border)" }}>
                <Cloud
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--app-brand)" }}
                  aria-hidden
                />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    Kept with your account
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                    Places in My Radius
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-4">
                <Bookmark
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--app-cool)" }}
                  aria-hidden
                />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    Stays on this device
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
                    Saved events and routes, settings, and recent views
                  </p>
                </div>
              </div>
            </div>

            <p className="flex max-w-lg gap-2 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              We store your email and the places you put in My Radius. No public
              profile. No location history. Signing in never subscribes you to marketing.
            </p>
          </section>

          <section
            aria-label="Sign in"
            className="rounded-[calc(var(--app-radius-lg)+4px)] border bg-[var(--app-bg-elevated)] p-4 shadow-[var(--app-elev-2)] sm:p-6"
            style={{ borderColor: "var(--app-border)" }}
          >
            {recovery && (
              <div
                role="alert"
                className="mb-5 rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[12.5px] leading-relaxed"
                style={{
                  borderColor: "color-mix(in srgb, var(--app-brand) 28%, var(--app-border))",
                  background: "color-mix(in srgb, var(--app-brand) 8%, transparent)",
                  color: "var(--app-ink-2)",
                }}
              >
                {recovery}
              </div>
            )}

            <LoginForm next={next} destinationLabel={context.label} />

            <Link
              href={isProtectedPath(next) ? context.backHref : next}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] text-[12px] font-semibold"
              style={{ color: "var(--app-ink-3)" }}
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              {context.backLabel}
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
