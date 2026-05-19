import type { Metadata } from "next";
import { Compass, Sun, Map } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The 404 inside the app shell (TopBar + BottomNav come from the
 * (app) layout). Composed per VISUAL.md, not a bare system page: a
 * soft identity mark, a complete-sentence explanation, and three
 * real ways back. No "Oops", no dead end. STYLE.md voice.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 py-12 text-center">
      <span
        aria-hidden
        className="grid h-16 w-16 place-items-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
          color: "var(--app-brand)",
        }}
      >
        <Compass className="h-7 w-7" strokeWidth={1.75} aria-hidden />
      </span>

      <div className="space-y-2">
        <p className="eyebrow">Page not found</p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          We can&apos;t find that page.
        </h1>
        <p
          className="mx-auto max-w-sm text-pretty text-[15px] leading-relaxed"
          style={{ color: "var(--app-ink-3)" }}
        >
          The link may be old, or a place may have moved or closed. Here is
          the way back into Frederick County.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2.5">
        <Button href="/explore" variant="primary" size="lg" iconLeft={<Compass className="h-4 w-4" aria-hidden />}>
          Explore the county
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          <Button href="/today" variant="secondary" size="md" iconLeft={<Sun className="h-4 w-4" aria-hidden />}>
            Today
          </Button>
          <Button href="/map" variant="secondary" size="md" iconLeft={<Map className="h-4 w-4" aria-hidden />}>
            Map
          </Button>
        </div>
      </div>
    </div>
  );
}
