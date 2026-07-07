import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Event-scoped 404 — rendered when a slug resolves to nothing (a feed
 * event that left its window, a mistyped link). Server-rendered under
 * the real 404 status the route's notFound() calls already guarantee;
 * this file only replaces the generic root shell with an events-aware
 * way back. NOTE: this segment still must NOT gain a loading.tsx (see
 * page.tsx) — a not-found boundary is safe, a loading boundary is not.
 */
export default function EventNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-6 py-16 text-center">
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-full tactile"
        style={{ background: "var(--app-bg-elevated)", color: "var(--app-brand)" }}
      >
        <CalendarX2 className="h-7 w-7" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Off the calendar
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          That event isn&apos;t here.
        </h1>
        <p className="text-[14px] text-pretty" style={{ color: "var(--app-ink-2)" }}>
          It may have passed, been removed by its organizer, or the link is
          old. Everything coming up is one tap away.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button href="/events" size="md">
          See what&apos;s on
        </Button>
        <Button href="/today" variant="secondary" size="md">
          Back home
        </Button>
      </div>
      <Link
        href="/submit/event"
        className="text-[12px] font-semibold"
        style={{ color: "var(--app-ink-3)" }}
      >
        Hosting something? Add your event
      </Link>
    </div>
  );
}
