import type { Metadata } from "next";
import Link from "next/link";
import { List } from "lucide-react";
import { getMonthEvents } from "@/lib/loaders/calendar";
import MonthGrid from "@/components/event/MonthGrid";

export const metadata: Metadata = {
  title: "Events Calendar",
  description: "Every Frederick County event — municipal, live feeds, and curated — on one calendar.",
};

export const revalidate = 1800;

function currentNyMonth(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return p.slice(0, 7); // YYYY-MM
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : currentNyMonth();
  const [y, mo] = month.split("-").map(Number);
  const { byDay, total } = await getMonthEvents(new Date(y, mo - 1, 1));

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
              Everything in one place
            </p>
            <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              Events Calendar
            </h1>
          </div>
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
          >
            <List className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> List view
          </Link>
        </div>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          Municipal calendars, live partner feeds, and curated picks — combined. Tap any day.
        </p>
      </header>

      <MonthGrid month={month} byDay={byDay} total={total} />
    </div>
  );
}
