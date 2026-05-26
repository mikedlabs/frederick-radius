import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Compass } from "lucide-react";

/**
 * Global 404. Composed editorial state — soft sky gradient backdrop,
 * a serif headline, a quiet sentence, and two clear ways back. Lives
 * at the app root so it catches every unknown URL, including ones
 * outside the (app) route group.
 */
export default function NotFound() {
  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--app-cool) 18%, var(--app-bg)) 0%, var(--app-bg) 100%)",
        color: "var(--app-ink)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 40% at 20% 10%, color-mix(in srgb, var(--app-cool) 22%, transparent), transparent 60%), radial-gradient(50% 30% at 80% 20%, color-mix(in srgb, var(--app-accent) 22%, transparent), transparent 60%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <span
          className="inline-flex h-16 w-16 items-center justify-center rounded-full tactile"
          style={{
            background: "var(--app-bg-elevated)",
            color: "var(--app-cool)",
          }}
        >
          <Compass className="h-8 w-8" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="space-y-2">
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
            Off the map
          </p>
          <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
            That page isn&apos;t here.
          </h1>
          <p
            className="mx-auto max-w-sm text-[14px] text-pretty"
            style={{ color: "var(--app-ink-2)" }}
          >
            The link may be old, or the place or event was removed. The
            rest of Frederick is one tap away.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button href="/now" size="md">
            Back to Now
          </Button>
          <Button href="/events" variant="secondary" size="md">
            See events
          </Button>
        </div>
        <Link
          href="/radius"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Or open the radius
        </Link>
      </div>
    </main>
  );
}
