import { CalendarClock, Compass, PawPrint, Ticket, Toilet } from "lucide-react";
import type { FairGroundsMapView } from "@/lib/fair/grounds-map";

export type FairMapAction = {
  id: FairGroundsMapView;
  label: string;
  icon: React.ElementType;
};

const ACTIONS: FairMapAction[] = [
  { id: "program", label: "Up Next", icon: CalendarClock },
  { id: "essentials", label: "Essentials", icon: Toilet },
  { id: "animals", label: "Animals", icon: PawPrint },
  { id: "buildings", label: "Explore", icon: Compass },
  { id: "arrival", label: "Entry", icon: Ticket },
];

export default function FairMapActionBar({
  activeFilter,
  onSelectAction,
}: {
  activeFilter: FairGroundsMapView;
  onSelectAction: (filter: FairGroundsMapView) => void;
}) {
  return (
    <div
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-0 right-0 z-10 flex w-full justify-center px-4 transition-transform duration-300 sm:bottom-6"
      style={{
        pointerEvents: "none",
      }}
    >
      <div
        className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border bg-[color-mix(in_srgb,var(--app-bg-elevated)_70%,transparent)] p-1.5 shadow-[var(--app-elev-3)] backdrop-blur-xl sm:p-2"
        style={{
          borderColor: "var(--app-control-border)",
          pointerEvents: "auto",
        }}
      >
        {ACTIONS.map((action) => {
          const isActive = activeFilter === action.id;
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onSelectAction(action.id)}
              className={`tap-44 flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors ${
                isActive
                  ? "bg-[var(--app-ink)] text-[var(--app-bg-elevated-solid)]"
                  : "bg-transparent text-[var(--app-ink)] hover:bg-[color-mix(in_srgb,var(--app-ink)_8%,transparent)]"
              }`}
              aria-pressed={isActive}
            >
              <Icon className="h-[14px] w-[14px]" aria-hidden />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
