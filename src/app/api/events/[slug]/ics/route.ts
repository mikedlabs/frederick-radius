import { NextResponse } from "next/server";
import { EVENT_BY_SLUG } from "@/data/events";

export const dynamic = "force-static";
export const revalidate = 3600;

function formatIcsDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escape(s: string): string {
  return s.replace(/[\\,;]/g, "\\$&").replace(/\n/g, "\\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = EVENT_BY_SLUG[slug];
  if (!event) return new NextResponse("Not found", { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";
  const url = `${baseUrl}/events/${event.slug}`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Frederick Radius//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.slug}@frederickradius.app`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(event.starts_at)}`,
    `DTEND:${formatIcsDate(event.ends_at)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.description)}\\n\\n${escape(url)}`,
    `LOCATION:${escape(event.venue_name + ", " + event.address)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${event.slug}.ics"`,
    },
  });
}

export async function generateStaticParams() {
  return Object.keys(EVENT_BY_SLUG).map((slug) => ({ slug }));
}
