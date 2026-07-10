import { notFound } from "next/navigation";

/**
 * Production guard for the /proto design prototypes (index + today, week,
 * bigtype, folders, almanac, time-lens).
 *
 * These are throwaway direction mockups kept for reference after the brand
 * decision shipped. They were already noindexed, out of the sitemap, and
 * unlinked, but any beta tester handed the URL would see unshipped direction
 * work that reads like a second app. On the production deployment they now
 * 404; local dev and Vercel previews still render them for owner review.
 * Delete the routes outright (plus src/components/proto/*) when the owner
 * signs off — this guard just closes the exposure until then.
 */
export default function ProtoLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  return children;
}
