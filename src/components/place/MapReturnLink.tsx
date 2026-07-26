"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { normalizeMapReturnTo } from "@/lib/map-return";

/**
 * Restores the exact map URL carried through search or a PlaceSheet.
 *
 * This stays a client island so the closed, statically generated place catalog
 * does not become dynamic merely to read a visitor-specific query parameter.
 */
export default function MapReturnLink() {
  const searchParams = useSearchParams();
  const returnTo = normalizeMapReturnTo(searchParams.get("returnTo"));
  if (!returnTo) return null;

  return (
    <Link
      href={returnTo}
      className="tap-44-y -ml-1 inline-flex items-center gap-1.5 px-1 text-[12.5px] font-semibold"
      style={{ color: "var(--app-brand-press)" }}
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      Back to map
    </Link>
  );
}
