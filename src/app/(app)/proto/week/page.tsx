import type { Metadata } from "next";
import ProtoFrame from "@/components/proto/ProtoFrame";
import WeekFolders from "@/components/proto/WeekFolders";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Prototype: peelable week" };

export default function Page() {
  return (
    <ProtoFrame title="Peelable field-folder week" blurb="Each day is a colored folder. Tap to pull it open and reveal its events, deals, and happy hours as nested record cards.">
      <WeekFolders />
    </ProtoFrame>
  );
}
