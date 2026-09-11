import type { Metadata } from "next";
import SharedRadiusView from "@/components/saved/SharedRadiusView";

/**
 * /radius/shared — a read-only "here's my Frederick" list someone shared.
 *
 * The Saved page (/my-radius) builds a link encoding the owner's saved PLACE
 * slugs into `?p=slug1,slug2,…`; this page resolves them and shows a clean,
 * recipient-facing field-guide list with a doorway to start your own. Saves are
 * device-local, so the slugs ride in the URL (no account, no server store) —
 * that keeps sharing zero-infrastructure and works for signed-out users.
 *
 * noindex: a personal, URL-scoped list is not a canonical page to crawl.
 */
export const metadata: Metadata = {
  robots: { index: false },
  title: "A shared Frederick radius",
  description: "This shared list contains Frederick County places that someone saved.",
};

export default async function SharedRadiusPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const slugs = (p ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  return <SharedRadiusView slugs={slugs} />;
}
