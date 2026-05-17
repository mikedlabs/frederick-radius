import Link from "next/link";
import { MapPin, CalendarPlus } from "lucide-react";

/**
 * Persistent "add to the map" surface. Submitting was buried at the
 * bottom of /events; the county-wide data only stays current if
 * contributing is a first-class, always-present action.
 */
export default function SubmitCallout() {
  return (
    <section
      className="rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-sunken)] p-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
        Know a place or event we are missing?
      </h2>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        Add it and help keep all twelve towns current.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/submit/place"
          className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-white shadow-[var(--app-shadow-1)]"
          style={{ background: "var(--app-brand)" }}
        >
          <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden /> Submit a place
        </Link>
        <Link
          href="/submit/event"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
        >
          <CalendarPlus className="h-4 w-4" strokeWidth={2} aria-hidden /> Submit an event
        </Link>
      </div>
    </section>
  );
}
