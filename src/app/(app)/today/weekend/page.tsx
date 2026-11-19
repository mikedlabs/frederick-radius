import type { Metadata } from "next";
import LocalOutingGuide from "@/components/today/LocalOutingGuide";
import { loadWeekendEventSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { weekendGuide } from "@/lib/today/local-outing-guides";

export const metadata: Metadata = {
  title: "This Weekend in Frederick County",
  description: "Find a few things worth doing this weekend in Frederick County, with times, places, and official event details.",
  alternates: { canonical: "/today/weekend" },
};

export const revalidate = 300;

export default async function WeekendGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const now = new Date();
  const [{ returnTo }, snapshot] = await Promise.all([searchParams, loadWeekendEventSnapshot(now)]);

  return <LocalOutingGuide guide={weekendGuide(now, snapshot.unified)} returnTo={returnTo} />;
}
