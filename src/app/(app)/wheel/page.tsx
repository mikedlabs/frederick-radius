import type { Metadata } from "next";
import FieldWheel from "@/components/nav/FieldWheel";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  // An alternate, playful presentation of the same tools the Compass index
  // holds. Kept out of search so it can never compete with /compass for the
  // wayfinding query — /compass stays the canonical, indexable hub.
  robots: { index: false },
  alternates: { canonical: "/wheel" },
  title: "The wheel",
  description: "Spin a dial to reach any Frederick Radius guide or tool.",
};

/**
 * /wheel — the Field Wheel.
 *
 * A deliberately fun, instrument-style entry into the tool registry, offered
 * alongside (not instead of) the audited /compass directory. FieldWheel holds
 * the client-side dial interaction; this shell supplies the page bloom and
 * metadata.
 */
export default function WheelPage() {
  return (
    <div className="relative">
      <PageBloom variant="warm" />
      <FieldWheel />
    </div>
  );
}
