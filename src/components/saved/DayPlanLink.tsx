"use client";

import Link from "next/link";
import { Calendar, ArrowRight } from "lucide-react";
import { useItineraryList } from "@/hooks/useItinerary";

/** Day Plan keeps its existing independent collection on this device. */
export default function DayPlanLink() {
  const items = useItineraryList();
  return (
    <Link href="/itinerary" prefetch={false} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--app-ink)]">
      <Calendar className="h-4 w-4" aria-hidden />
      <span>Day Plan{items.length > 0 ? ` · ${items.length} saved` : ""}</span>
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
