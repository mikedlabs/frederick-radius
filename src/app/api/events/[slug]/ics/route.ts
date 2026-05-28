import { NextResponse } from "next/server";
import { EVENT_BY_SLUG } from "@/data/events";
import { getLiveCardEventBySlug } from "@/lib/loaders/liveEvents";
import { buildIcs } from "@/lib/ics";

// Seed slugs are pre-rendered via generateStaticParams; live-prefixed
// slugs render on demand. Dropped force-static so a crawler / share
// link to a live event resolves to a real ICS file instead of 404.
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const seed = EVENT_BY_SLUG[slug];
  const event = seed ?? (await getLiveCardEventBySlug(slug));
  if (!event) return new NextResponse("Not found", { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://frederickradius.app";
  const ics = buildIcs({
    uid: event.slug,
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    description: event.description,
    venue_name: event.venue_name,
    address: event.address,
    url: `${baseUrl}/events/${event.slug}`,
    all_day: event.is_all_day,
  });

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
