import type { Metadata } from "next";
import AerialTimeMachineClient from "@/components/from-above/AerialTimeMachineClient";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Aerial Time Machine",
  description:
    "An experimental historical-imagery view, available only when public-display permission is confirmed.",
};

export default function AerialTimeMachinePage() {
  return <AerialTimeMachineClient />;
}
