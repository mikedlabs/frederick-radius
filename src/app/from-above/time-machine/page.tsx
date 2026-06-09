import type { Metadata } from "next";
import AerialTimeMachineClient from "@/components/from-above/AerialTimeMachineClient";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Aerial Time Machine — Frederick from above, 1958–2025",
  description:
    "Scrub through 15 years of City of Frederick aerial imagery on a pannable map — your block across the decades.",
};

export default function AerialTimeMachinePage() {
  return <AerialTimeMachineClient />;
}
