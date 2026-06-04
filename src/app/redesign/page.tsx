import type { Metadata } from "next";
import HomeMock from "@/components/redesign/HomeMock";
import DiscoverMock from "@/components/redesign/DiscoverMock";
import PlaceMock from "@/components/redesign/PlaceMock";
import EventsMock from "@/components/redesign/EventsMock";
import PlanMock from "@/components/redesign/PlanMock";
import SavedMock from "@/components/redesign/SavedMock";

/**
 * /redesign — gallery of the parallel design-agent page reimaginings.
 * Each mock is a full mobile screen; a thin label sits above each.
 * Outside (app), full-bleed, noindex. Not linked anywhere.
 */
export const metadata: Metadata = {
  title: "Redesign gallery",
  robots: { index: false, follow: false },
};

const SCREENS: { key: string; label: string; C: () => React.ReactNode }[] = [
  { key: "home", label: "HOME · Cover Fold", C: HomeMock },
  { key: "discover", label: "DISCOVER · The Field Guide", C: DiscoverMock },
  { key: "place", label: "PLACE · The Creek, From Above", C: PlaceMock },
  { key: "events", label: "EVENTS · By the Hour", C: EventsMock },
  { key: "plan", label: "PLAN · A Slow Creek-Side Morning", C: PlanMock },
  { key: "saved", label: "SAVED · Field Guide", C: SavedMock },
];

export default function RedesignPage() {
  return (
    <div style={{ background: "#1a1a1a" }}>
      {SCREENS.map(({ key, label, C }) => (
        <div key={key}>
          <div
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70"
            style={{ background: "#1a1a1a" }}
          >
            {label}
          </div>
          {/* transform creates a containing block so each mock's
              position:fixed bars stay scoped to its own frame */}
          <div
            id={key}
            className="relative mx-auto min-h-screen w-full max-w-[440px] overflow-hidden"
            style={{ transform: "translateZ(0)" }}
          >
            <C />
          </div>
        </div>
      ))}
    </div>
  );
}
