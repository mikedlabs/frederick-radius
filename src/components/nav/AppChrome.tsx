"use client";

import { usePathname } from "next/navigation";

import { shouldShowGlobalAppChrome } from "@/lib/fair/route-policy";
import BottomNav from "./BottomNav";
import SideRail from "./SideRail";
import TopBar from "./TopBar";

/**
 * Route-aware site chrome.
 *
 * The Fair is a focused, event-day workspace with its own navigation. Keeping
 * the normal header and primary nav around it creates two competing app shells,
 * so both Fair entrances omit those controls while every other app route keeps
 * the established Frederick Radius chrome.
 */
export default function AppChrome({
  region,
}: {
  region: "header" | "primary-navigation";
}) {
  const pathname = usePathname();

  if (!shouldShowGlobalAppChrome(pathname)) return null;

  if (region === "header") return <TopBar />;

  return (
    <>
      <BottomNav />
      <SideRail />
    </>
  );
}
