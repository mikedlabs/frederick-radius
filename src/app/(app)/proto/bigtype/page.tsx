import type { Metadata } from "next";
import ProtoFrame from "@/components/proto/ProtoFrame";
import BigType from "@/components/proto/BigType";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Prototype: big type" };

export default function Page() {
  return (
    <ProtoFrame title="Big type + color blocks" blurb="Type carries the page. A giant almanac masthead, then each section a bold filing-ink color block with a huge title and a mono count.">
      <BigType />
    </ProtoFrame>
  );
}
