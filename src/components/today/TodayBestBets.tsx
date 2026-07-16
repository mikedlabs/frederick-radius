"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

type TodayEvent = {
  slug: string;
  title: string;
  venue: string;
  municipality: string;
  time: string;
  image: string | null;
  free: boolean;
};

type TodayEventResponse = { events: TodayEvent[]; partial: boolean };

export default function TodayBestBets() {
  const [data, setData] = useState<TodayEventResponse | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => setSlow(true), 2_500);
    fetch("/api/today/events", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((next: TodayEventResponse) => setData(next))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setData({ events: [], partial: true });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section aria-labelledby="today-bets-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="today-bets-heading" className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Worth a look today</h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>Three current draws, not the whole calendar.</p>
        </div>
        <Link href="/events?lens=today" prefetch={false} className="shrink-0 text-[11.5px] font-semibold" style={{ color: "var(--app-brand-press)" }}>All events</Link>
      </div>

      {!data ? (
        <div className="mt-3 rounded-[var(--app-radius-lg)] border px-4 py-5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
          <p className="text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>{slow ? "Calendars are taking longer than usual." : "Checking today’s calendars…"}</p>
          {slow ? <Link href="/events?lens=today" className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>Open the calendar <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link> : null}
        </div>
      ) : data.events.length > 0 ? (
        <ol className="mt-3 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]" style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}>
          {data.events.map((event, index) => (
            <li key={event.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
              <Link href={`/events/${event.slug}`} prefetch={false} className="group flex min-h-[82px] items-center gap-3 p-3">
                {event.image ? (
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-[var(--app-bg-sunken)]">
                    <Image src={event.image} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[10px] bg-[var(--app-bg-sunken)]" aria-hidden>
                    <CalendarDays className="h-5 w-5" style={{ color: "var(--app-brand)" }} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-brand-press)" }}>{event.time}{event.free ? " · Free" : ""}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[14px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>{event.title}</span>
                  <span className="mt-1 block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>{event.venue}</span>
                </span>
                <span className="font-mono text-[10px] opacity-30" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                <ArrowRight className="h-4 w-4 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-3 rounded-[var(--app-radius-lg)] border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
          <p className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>No strong current draws are loaded yet.</p>
          <Link href="/events" className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>Browse the full calendar <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
        </div>
      )}
    </section>
  );
}
